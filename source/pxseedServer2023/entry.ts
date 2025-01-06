
import {WebSocketServer,WebSocket } from 'ws'
import { ArrayBufferConcat, ArrayWrap2,assert,CanceledError,copy,future, requirejs, sleep } from 'partic2/jsutils1/base';
import {Io} from 'pxprpc/base'
import {Duplex, EventEmitter, Readable} from 'stream'
import { IncomingHttpHeaders, IncomingMessage, Server, ServerResponse } from 'http';
import {dirname,join as pathJoin} from 'path'
import { RpcExtendServer1,defaultFuncMap,RpcExtendServerCallable } from 'pxprpc/extend'
import { Server as PxprpcBaseServer } from 'pxprpc/base'
import Koa from 'koa'
import KoaRouter from 'koa-router'
import * as fs from 'fs/promises'
import './workerInit'
import koaFiles from 'koa-files'
import { GetUrlQueryVariable2, getWWWRoot, lifecycle } from 'partic2/jsutils1/webutils';
import { ChildProcess, spawn } from 'child_process';

export let __name__='pxseedServer2023/entry';


class NodeWsIo implements Io{
    priv__cached=new ArrayWrap2<Uint8Array>([])
    closed:boolean=false;
    constructor(public ws:WebSocket){
        ws.on('message',(data,isBin)=>{
            if(data instanceof ArrayBuffer){
                this.priv__cached.queueBlockPush(new Uint8Array(data))
            }else if(data instanceof Buffer){
                this.priv__cached.queueBlockPush(data);
            }else if(data instanceof Array){
                this.priv__cached.queueBlockPush(new Uint8Array(ArrayBufferConcat(data)));
            }else{
                throw new Error('Unknown data type')
            }
        });
        ws.on('close',(code,reason)=>{
            this.closed=true;
            this.priv__cached.cancelWaiting();
        });
    }
    async receive(): Promise<Uint8Array> {
        try{
            let wsdata=await this.priv__cached.queueBlockShift();
            return wsdata;
        }catch(e){
            if(e instanceof CanceledError && this.closed){
                this.ws.close();
                throw new Error('closed.')
            }else{
                this.ws.close();
                throw e;
            }
        }
    }
    async send(data: Uint8Array[]): Promise<void> {
        this.ws.send(ArrayBufferConcat(data));
    }
    close(): void {
        this.ws.close();
        this.closed=true;
        this.priv__cached.cancelWaiting();
    }
}

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
    router:{} as {[path:string]:(io:NodeWsIo,url:string|undefined,headers:IncomingHttpHeaders)=>void}
}


WsServer.ws.on('error',(err)=>console.log(err));

export let httpServ=new Server();
export let koaServ=new Koa();
koaServ.proxy=true;
export let koaRouter=new KoaRouter();
let pxseedFilesServer=koaFiles(dirname(dirname(__dirname)));

interface PxseedServer2023StartupConfig{
    pxseedBase?:string,
    pxprpcPath?:string,
    listenOn?:{host:string,port:number},
    initModule?:string[],
    pxprpcCheckOrigin?:string[]|false,
    //If key!==null. Client should provide url parameter 'key' to get authorization from websocket.
    //DON'T expose the config file to public, if pxprpc is accessible from public. 
    pxprpcKey?:string|null
    deamonMode?:{
        enabled:false,
        subprocessConfig:PxseedServer2023StartupConfig[]
    }
    //RegExp to block private/secret file access.
    blockFilesMatch?:string[]
    //Specify the directory serve as file server. default is ['www','source'].
    //'source' is added to enable sourceMap.
    serveDirectory?:string[]
};

export let config:PxseedServer2023StartupConfig={
    pxseedBase:'/pxseed',
    pxprpcPath:'/pxprpc/0',
    listenOn:{host:'127.0.0.1',port:8088},
    initModule:[],
    pxprpcCheckOrigin:['localhost','127.0.0.1','[::1]'],
    pxprpcKey:null,
    deamonMode:{
        enabled:false,
        subprocessConfig:[]
    },
    //pxprpcKey should be secret.
    blockFilesMatch:['^/www/pxseedServer2023/config.json$'],
    serveDirectory:['www','source']
};

let noderunJs=getWWWRoot()+'/noderun.js'
export function nodeRun(moduleName:string,args:string[]):ChildProcess{
    console.info(noderunJs,moduleName,...args)
    return spawn(process.execPath,[noderunJs,moduleName,...args],{
        stdio:'inherit'
    });
}

export let ensureInit=new future<number>();
;(async()=>{
    if(!('__workerId' in globalThis)){
        //(await import('inspector')).open(9229,'127.0.0.1',true);
        console.info('argv',process.argv);
        try{
            let configData=await fs.readFile(__dirname+'/config.json');
            console.log(`config file ${__dirname+'/config.json'} found. `);
            let rootConfig=JSON.parse(new TextDecoder().decode(configData));
            let subprocessAt=process.argv.indexOf('--subprocess');
            if(process.argv[2]==__name__ && subprocessAt>=0 ){
                //This is subprocee spawn by deamon.
                let subprocessIndex=Number(process.argv[subprocessAt+1]);
                Object.assign(config,rootConfig,rootConfig.deamonMode.subprocessConfig[subprocessIndex]);
                config.deamonMode!.enabled=false;
                config.deamonMode!.subprocessConfig=[]
            }else{
                Object.assign(config,rootConfig);
            }
        }catch(e){
            console.log(`config file not found, write to ${__dirname+'/config.json'}`)
            await fs.writeFile(__dirname+'/config.json',new TextEncoder().encode(JSON.stringify(config)))
        }
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
        WsServer.router[config.pxseedBase!+config.pxprpcPath]=(io,url,headers)=>{
            let pass=false;
            if(config.pxprpcCheckOrigin===false){
                pass=true;
            }else if(headers.origin!=undefined){
                let originUrl=new URL(headers.origin);
                for(let t1 of [config.listenOn!.host,...(config.pxprpcCheckOrigin as string[])]){
                    if(originUrl.hostname===t1){
                        pass=true;
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
        function doExit(){
            console.info('exiting...');
            lifecycle.dispatchEvent(new Event('pause'));
            lifecycle.dispatchEvent(new Event('exit'));
            setTimeout(()=>process.exit(),3000);
        }
        function doRestart(){
            console.info('TODO: restart is not implemented');
        }
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
        let accessHost=config.listenOn!.host;
        if(accessHost=='0.0.0.0'){
            accessHost='127.0.0.1';
        }
        let launcherUrl=`http://${accessHost}:${config.listenOn!.port}${config.pxseedBase}/www/index.html?__jsentry=pxseedServer2023%2fwebentry`
        if(config.pxprpcKey!=null){
            launcherUrl+='&__pxprpcKey='+encodeURIComponent(config.pxprpcKey)
        }
        console.info(launcherUrl);

        lifecycle.addEventListener('exit',()=>{
            console.info('close http server');
            httpServ.close((err)=>{
                console.info('http server closed');
            });
        })
        defaultFuncMap['pxseedServer2023.exit']=new RpcExtendServerCallable(async ()=>{
            doExit();
        }).typedecl('->');
        defaultFuncMap['pxseedServer2023.restart']=new RpcExtendServerCallable(async ()=>{
            doRestart();
        }).typedecl('->');
    }
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
        defaultFuncMap['pxseedServer2023.subprocess.restart']=new RpcExtendServerCallable(async (index:number)=>{
            if(subprocs[index].exitCode==null){
                subprocs[index].kill();
                await sleep(1000);
            }
            let subprocess=nodeRun(__name__,['--subprocess',String(index)]);
            subprocs[index]=subprocess;
        }).typedecl('i->');
    }
})();




