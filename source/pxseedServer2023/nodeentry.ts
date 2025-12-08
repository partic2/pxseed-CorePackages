//To initialize node environment. For these don't want to start http server, just import this module.
import 'partic2/nodehelper/env'

import { config, defaultRouter, loadConfig, rootConfig, saveConfig, serverCommand, serverCommandRegistry, setupHttpServerHandler, subprocessMagic } from './pxseedhttpserver';

export let __name__='pxseedServer2023/nodeentry';

import { ArrayBufferConcat, ArrayWrap2, future, Ref2, requirejs, sleep, Task } from 'partic2/jsutils1/base';
import {Client, Io} from 'pxprpc/base'
import {Duplex, EventEmitter, Readable} from 'stream'
import { IncomingHttpHeaders, IncomingMessage, OutgoingMessage, Server, ServerResponse } from 'http';
import {dirname,join as pathJoin} from 'path'
import { Server as PxprpcBaseServer } from 'pxprpc/base'
import { GetUrlQueryVariable2, getWWWRoot, lifecycle } from 'partic2/jsutils1/webutils';
import { ChildProcess, spawn } from 'child_process';
import {WebSocketServer } from 'ws'
import { NodeReadableDataSource, NodeWsConnectionAdapter2 } from 'partic2/nodehelper/nodeio';
import { createIoPipe } from 'partic2/pxprpcClient/registry';
import { RpcExtendClient1 } from 'pxprpc/extend';
import { WebSocketIo } from 'pxprpc/backend';


export {config}

export let ensureInit=new future<number>();


export let WsServer={
    ws:new WebSocketServer({noServer:true}),
    handle:function(req: IncomingMessage, socket: Duplex, head: Buffer){
        let url=new URL(req.url!,`http://${req.headers.host}`);
        let request=new Request(url,{
            method:req.method,
            headers:Object.entries(req.headers).map(t1=>{
                if(typeof t1[1]!=='string'){
                    return [t1[0],(t1[1]??'').toString()] as [string,string]
                }else{
                    return t1 as [string,string];
                }
            })
        });
        let accepted=false;
        defaultHttpHandler.onwebsocket({
            request,
            accept:async ()=>{
                accepted=true;
                return new Promise((resolve)=>this.ws.handleUpgrade(req,socket,head,(client)=>{
                    resolve(new NodeWsConnectionAdapter2(client))
                }));
            }
        });
        if(!accepted){
            if(url.pathname in this.router){
                this.ws.handleUpgrade(req,socket,head,(client,req)=>{
                    this.router[url.pathname](new NodeWsConnectionAdapter2(client) as any,req.url,req.headers);
                })
            }else{
                socket.end();
            }
        }        
    },
    //compatibility ONLY
    router:{} as {[path:string]:(io:Io,url:string|undefined,headers?:IncomingHttpHeaders)=>void}
}


WsServer.ws.on('error',(err)=>console.log(err));

export let httpServ=new Server();
//To keep compatibility with old Koa server, koa server can override it and deligate request to default handler.
export let httpOnRequest=new Ref2(async (nodereq:IncomingMessage,noderes: ServerResponse)=>{
    let url=new URL(nodereq.url!,`http://${nodereq.headers.host}`);
    let req=new Request(url,{
        method:nodereq.method,
        headers:Object.entries(nodereq.headers).map(t1=>{
            if(typeof t1[1]!=='string'){
                return [t1[0],(t1[1]??'').toString()] as [string,string]
            }else{
                return t1 as [string,string];
            }
        }),
        body:['GET','HEAD'].includes(nodereq.method??'')?undefined:new ReadableStream(new NodeReadableDataSource(nodereq)),
        duplex:'half'
    } as RequestInit);
    let resp=await defaultHttpHandler.onfetch(req);
    resp.headers.forEach((v,k)=>{
        noderes.setHeader(k,v);
    });
    noderes.statusCode=resp.status;
    if(resp.body!=null){
        Readable.fromWeb(resp.body as any).pipe(noderes,{end:true});
    }else{
        noderes.end();
    }
});

import { defaultHttpHandler } from './pxseedhttpserver';


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

export async function startServer(){
    //(await import('inspector')).open(9229,'127.0.0.1',true);
    console.info('argv',process.argv);
    await loadConfig()
    httpServ.on('upgrade',(req,socket,head)=>{
        WsServer.handle(req,socket,head)
    });
    httpServ.on('request',(req,res)=>{
        httpOnRequest.get()(req,res);
    });
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
    
    console.log(JSON.stringify(config,undefined,2));
    
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
            let subprocess=nodeRun(__name__,[subprocessMagic,String(t1)]);
            subprocs.push(subprocess);
        }
        serverCommandRegistry.subprocessWaitExitCode=async (index:number)=>{
            let subp=subprocs[index];
            if(subp.exitCode!=null){
                return subp.exitCode;
            }else{
                return new Promise<number>(
                    (resolve)=>subp.once('exit',(exitCode)=>{resolve(exitCode??-1)}))
            }
        };
        serverCommandRegistry.subprocessRestart=async (index:number)=>{
            if(subprocs[index].exitCode==null){
                let subCfg=rootConfig.deamonMode!.subprocessConfig[index];
                let client1=new RpcExtendClient1(new Client(await new WebSocketIo().connect(
                    `ws://127.0.0.1:${subCfg.listenOn!.port}${subCfg.pxseedBase??config.pxseedBase}/pxprpc/0?key=${encodeURIComponent(subCfg.pxprpcKey??config.pxprpcKey??'')}`)))
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
            let subprocess=nodeRun(__name__,[subprocessMagic,String(index)]);
            subprocs[index]=subprocess;
        };
    }
}

export let __inited__=(async ()=>{
    if(!('__workerId' in globalThis)){
        await startServer();
        ensureInit.setResult(0);
    }
    serverCommandRegistry.buildEnviron=async ()=>{
        return runCommand(`${process.execPath} ${pathJoin(getWWWRoot(),'..','script','buildEnviron.js')}`)
    }
    serverCommandRegistry.exit=async ()=>{
        return doExit();
    }
    await setupHttpServerHandler()
})();





