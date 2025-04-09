
//To initialize node environment. For these don't want to start http server, just import this module.
import './workerInit'

import { config, loadConfig, rootConfig, saveConfig } from './workerInit';

export let __name__='pxseedServer2023/entry';

import { ArrayBufferConcat, future, requirejs, sleep, Task } from 'partic2/jsutils1/base';
import {Client, Io} from 'pxprpc/base'
import {Duplex, EventEmitter, Readable} from 'stream'
import { IncomingHttpHeaders, IncomingMessage, Server, ServerResponse } from 'http';
import {dirname,join as pathJoin} from 'path'
import { Server as PxprpcBaseServer } from 'pxprpc/base'
import Koa from 'koa'
import KoaRouter from 'koa-router'
import koaFiles from 'koa-files'
import { GetUrlQueryVariable2, getWWWRoot, lifecycle } from 'partic2/jsutils1/webutils';
import { ChildProcess, spawn } from 'child_process';
import {WebSocketServer } from 'ws'
import { NodeWsIo } from 'partic2/nodehelper/nodeio';
import { createIoPipe } from 'partic2/pxprpcClient/registry';
import { defaultFuncMap, RpcExtendClient1, RpcExtendServer1, RpcExtendServerCallable } from 'pxprpc/extend';
import { WebSocketIo } from 'pxprpc/backend';


export {config}

export let ensureInit=new future<number>();

export let WsServer={
    ws:new WebSocketServer({noServer:true}),
    handle:function(req: IncomingMessage, socket: Duplex, head: Buffer){
        let url=new URL(req.url!,`http://${req.headers.host}`);
        if(url.pathname in this.router){
            this.ws.handleUpgrade(req,socket,head,(client,req)=>{
                this.router[url.pathname](new NodeWsIo(client),req.url,req.headers);
            })
        }else{
            socket.end();
        }
        
    },
    router:{} as {[path:string]:(io:NodeWsIo,url:string|undefined,headers?:IncomingHttpHeaders)=>void}
}


WsServer.ws.on('error',(err)=>console.log(err));

export let httpServ=new Server();
export let koaServ=new Koa();
koaServ.proxy=true;
export let koaRouter=new KoaRouter();
let pxseedFilesServer=koaFiles(dirname(dirname(__dirname)));


let noderunJs=getWWWRoot()+'/noderun.js'
export function nodeRun(moduleName:string,args:string[]):ChildProcess{
    console.info(noderunJs,moduleName,...args)

    let subproc=spawn(process.execPath,[noderunJs,moduleName,...args],{
        stdio:'pipe'
    });
    subproc.stdout.on('data',function(data){
        console.info('[CHILD PROCESS OUTPUT]:\n',new TextDecoder().decode(data));
    });
    subproc.stderr.on('data',function(data){
        console.warn('[CHILD PROCESS ERROR]:',new TextDecoder().decode(data));
    });
    return subproc;
}

export function pxprpcHandler(io:NodeWsIo,url:string|undefined,headers?:IncomingHttpHeaders){
    let pass=false;
    if(config.pxprpcCheckOrigin===false || headers?.origin==undefined){
        pass=true;
    }else if(headers.origin!=undefined){
        let originUrl=new URL(headers.origin);
        for(let t1 of [config.listenOn!.host,...(config.pxprpcCheckOrigin as string[])]){
            if(originUrl.hostname===t1){
                pass=true;
                break;
            };
        }
    }
    if(!pass){
        io.close();
        return;
    }
    pass=false;
    if(config.pxprpcKey===null){
        pass=true;
    }else{
        if(decodeURIComponent(GetUrlQueryVariable2(url??'','key')??'')===config.pxprpcKey){
            pass=true;
        }else{
            pass=false;
        }
    }
    if(pass){
        let serv=new RpcExtendServer1(new PxprpcBaseServer(io));
        //mute error
        serv.serve().catch(()=>{});
    }else{
        io.close();
    }
}

export let wsPipe=new Map<string,Set<Io>>();
export async function wsPipeHandler(io:NodeWsIo,url:string|undefined,headers?:IncomingHttpHeaders){
    if(url==undefined)return;
    let id=GetUrlQueryVariable2(url,'id');
    if(id==undefined)return;
    id=decodeURIComponent(id);
    await serveWsPipe(io,id);
}

export async function serveWsPipe(io:Io,id:string){
    let pipes=wsPipe.get(id);
    if(pipes==undefined){
        pipes=new Set<Io>();
        wsPipe.set(id,pipes);
    }
    pipes.add(io);
    try{
        while(true){
            let msg=await io.receive();
            for(let t1 of pipes){
                if(t1!=io){
                    await t1.send([msg]);
                }
            }
        }
    }catch(e){
        pipes.delete(io);
        if(pipes.size==0){
            wsPipe.delete(id);
        }
    }
}

export async function createNewEntryUrlWithPxprpcKey(jsentry:string,urlarg?:string){
    let accessHost=config.listenOn!.host;
        if(accessHost=='0.0.0.0'){
            accessHost='127.0.0.1';
        }
    let launcherUrl=`http://${accessHost}:${config.listenOn!.port}${config.pxseedBase}/www/index.html?__jsentry=pxseedServer2023%2fwebentry&__redirectjsentry=${encodeURIComponent(jsentry)}`
    if(config.pxprpcKey!=null){
        launcherUrl+=`&__pxprpcKey=${encodeURIComponent(config.pxprpcKey)}`;
    }
    if(urlarg!=undefined){
        launcherUrl+='&'+urlarg;
    }
    return launcherUrl;
}

function doExit(){
    console.info('exiting...');
    lifecycle.dispatchEvent(new Event('pause'));
    lifecycle.dispatchEvent(new Event('exit'));
    setTimeout(()=>process.exit(),3000);
}
defaultFuncMap['pxseedServer2023.connectWsPipe']=new RpcExtendServerCallable(async (id:string)=>{
    let pipe1=createIoPipe();
    serveWsPipe(pipe1[0],id);
    return pipe1[1];
}).typedecl('s->o');
async function runCommand(cmd:string,cwd?:string){
    let process=spawn(cmd,{shell:true,stdio:'pipe',cwd});
    let stdoutbuffer:string[]=[];
    process.stdout.on('data',(chunk)=>{
        stdoutbuffer.push(chunk);
    });
    process.stderr.on('data',(chunk)=>{
        stdoutbuffer.push(chunk);
    });
    await new Promise((resolve=>{
        process.on('close',resolve);
    }));
    return stdoutbuffer.join('');
}

export let command={
    buildEnviron:async ()=>runCommand(`${process.execPath} ${pathJoin(getWWWRoot(),'..','script','buildEnviron.js')}`),
    buildPackages:async ()=>runCommand(`${process.execPath} ${pathJoin(getWWWRoot(),'..','script','buildPackages.js')}`),
    rebuildPackages:async ()=>{
        let t1=await runCommand(`${process.execPath} ${pathJoin(getWWWRoot(),'..','script','cleanPackages.js')}`)
        t1+=await runCommand(`${process.execPath} ${pathJoin(getWWWRoot(),'..','script','buildPackages.js')}`)
        return t1;
    },
    subprocessRestart:null as any as (index:number)=>Promise<void>
}

defaultFuncMap['pxseedServer2023.serverCommand']=new RpcExtendServerCallable(async (cmd:string)=>{
    if(cmd=='buildEnviron'){
        return runCommand(`${process.execPath} ${pathJoin(getWWWRoot(),'..','script','buildEnviron.js')}`)
    }else if(cmd=='buildPackages'){
        return await runCommand(`${process.execPath} ${pathJoin(getWWWRoot(),'..','script','buildPackages.js')}`)
    }else if(cmd=='rebuildPackages'){
        let t1=await runCommand(`${process.execPath} ${pathJoin(getWWWRoot(),'..','script','cleanPackages.js')}`)
        t1+=await runCommand(`${process.execPath} ${pathJoin(getWWWRoot(),'..','script','buildPackages.js')}`)
        return t1;
    }else if(cmd=='getConfig'){
        await loadConfig();
        return JSON.stringify(config);
    }else if(cmd.startsWith('saveConfig ')){
        let startAt=cmd.indexOf(' ')+1;
        await saveConfig(JSON.parse(cmd.substring(startAt)));
        await loadConfig();
        return 'done'
    }
    return '';
}).typedecl('s->s')

//Should move to another file?
export async function startServer(){
    //(await import('inspector')).open(9229,'127.0.0.1',true);
    console.info('argv',process.argv);
    await loadConfig()
    httpServ.on('upgrade',(req,socket,head)=>{
        WsServer.handle(req,socket,head)
    });
    httpServ.on('request',koaServ.callback());
    async function doListen(){
        let p=new future<any>();
        const cb=(err:any)=>{
            if(!p.done){
                httpServ.close(()=>p.setResult(err))
            }
        }
        httpServ.once('error',cb);
        httpServ.listen(config.listenOn!.port,config.listenOn!.host,8,()=>{
            httpServ.off('error',cb);
            p.setResult(null)
        });
        return p.get();
    }
    let listenSucc=false;
    let maxListenPort=config.listenOn!.port+4;
    for(;config.listenOn!.port<maxListenPort;config.listenOn!.port++){
        let t1=await doListen();
        if(t1==null){
            listenSucc=true;
            break;
        }
        if(t1.code!=='EADDRINUSE'){
            throw t1;
        }
    }
    if(!listenSucc)throw new Error('No available listen port.');
    
    koaServ.use(koaRouter.middleware())
    console.log(JSON.stringify(config,undefined,2));
    WsServer.router[config.pxseedBase!+config.pxprpcPath]=pxprpcHandler;
    WsServer.router[config.pxseedBase!+config.wsPipePath]=wsPipeHandler;
    
    let blockFilesMatchReg=(config.blockFilesMatch??[]).map(exp=>new RegExp(exp));
    for(let dir1 of config.serveDirectory??[]){
        koaRouter.get(config.pxseedBase+`/${dir1}/:filepath(.+)`,async (ctx,next)=>{
            let filepath=ctx.params.filepath as string;
            filepath=`/${dir1}/${filepath}`
            for(let re1 of blockFilesMatchReg){
                if(re1.test(filepath)){
                    ctx.response.status=403;
                    ctx.response.body=`File access is blocked by blockFilesMatch rule: ${re1.source}`;
                    return;
                }
            }
            let savedPath=ctx.path;
            ctx.path=filepath
            await next();
            ctx.path=savedPath
            if(filepath==='/www/pxseedInit.js'){
                ctx.set('Cache-Control','no-cache');
            }
        },pxseedFilesServer);
    }
    
    ensureInit.setResult(0);
    
    console.info(`pxseed server entry url:`)
    let launcherUrl=await createNewEntryUrlWithPxprpcKey('partic2/packageManager/webui')
    console.info(launcherUrl);

    lifecycle.addEventListener('exit',()=>{
        console.info('close http server');
        httpServ.close((err)=>{
            console.info('http server closed');
        });
    });
    
    Promise.allSettled(config.initModule!.map(mod=>requirejs.promiseRequire(mod)));
    if(config.deamonMode!.enabled){
        let subprocs:ChildProcess[]=[]
        for(let t1=0;t1<config.deamonMode!.subprocessConfig.length;t1++){
            let subprocess=nodeRun(__name__,['--subprocess',String(t1)]);
            subprocs.push(subprocess);
        }
        defaultFuncMap['pxseedServer2023.subprocess.waitExitCode']=new RpcExtendServerCallable(async (index:number)=>{
            let subp=subprocs[index];
            if(subp.exitCode!=null){
                return subp.exitCode;
            }else{
                return new Promise<number>(
                    (resolve)=>subp.once('exit',(exitCode)=>{resolve(exitCode??-1)}))
            }
        }).typedecl('i->i');
        command.subprocessRestart=async (index:number)=>{
            if(subprocs[index].exitCode==null){
                let subCfg=rootConfig.deamonMode!.subprocessConfig[index];
                let client1=new RpcExtendClient1(new Client(await new WebSocketIo().connect(
                    `ws://127.0.0.1:${subCfg.listenOn!.port}${subCfg.pxseedBase??config.pxseedBase}${subCfg.pxprpcPath??config.pxprpcPath}`)))
                await client1.init();
                let {PxseedServer2023Function}=await import('./clientFunction');
                let func=new PxseedServer2023Function();
                await func.init(client1);
                await func.exit();
                await sleep(1500);
            }
            if(subprocs[index].exitCode==null){
                subprocs[index].kill();
                await sleep(500);
            }
            let subprocess=nodeRun(__name__,['--subprocess',String(index)]);
            subprocs[index]=subprocess;
        };
        defaultFuncMap['pxseedServer2023.subprocess.restart']=new RpcExtendServerCallable(command.subprocessRestart).typedecl('i->');
    }
}

if(!('__workerId' in globalThis)){
    startServer().then(()=>ensureInit.setResult(0));
}



