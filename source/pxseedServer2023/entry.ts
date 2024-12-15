
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
import { getWWWRoot, lifecycle } from 'partic2/jsutils1/webutils';
import { spawn } from 'child_process';
import { Socket } from 'net';
import { ClientInfo } from 'partic2/pxprpcClient/registry';
import { wrapReadable } from 'partic2/nodehelper/nodeio';


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

export let config={
    pxseedBase:'/pxseed',
    pxprpcPath:'/pxprpc/0',
    listenOn:{host:'127.0.0.1',port:8088},
    initModule:[],
    pxprpcCheckOrigin:['localhost','127.0.0.1','[::1]'] as string[]|false
};

export let ensureInit=new future<number>();
;(async()=>{
    if(!('__workerId' in globalThis)){
        //(await import('inspector')).open(9229,'127.0.0.1',true);
        console.info('argv',process.argv);
        try{
            let configData=await fs.readFile(__dirname+'/config.json');
            console.log(`config file ${__dirname+'/config.json'} found. `);
            copy(JSON.parse(new TextDecoder().decode(configData)),config,1);
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
            httpServ.listen(config.listenOn.port,config.listenOn.host,8,()=>{
                httpServ.off('error',cb);
                p.setResult(null)
            });
            return p.get();
        }
        let listenSucc=false;
        let maxListenPort=config.listenOn.port+4;
        for(;config.listenOn.port<maxListenPort;config.listenOn.port++){
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
        WsServer.router[config.pxseedBase+config.pxprpcPath]=(io,url,headers)=>{
            let pass=false;
            if(config.pxprpcCheckOrigin===false){
                pass=true;
            }
            if(!pass && headers.origin!=undefined){
                let originUrl=new URL(headers.origin);
                for(let t1 of [config.listenOn.host,...(config.pxprpcCheckOrigin as string[])]){
                    if(originUrl.hostname===t1){
                        pass=true;
                    };
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
        let lockFuture=[new future<string>()];
        function doExit(){
            console.info('exiting...');
            lifecycle.dispatchEvent(new Event('pause'));
            lifecycle.dispatchEvent(new Event('exit'));
            setTimeout(()=>process.exit(),3000);
        }
        function doRestart(){
            console.info('TODO: restart is not implemented');
        }
        koaRouter.get(config.pxseedBase+'/www/:filepath(.+)',async (ctx,next)=>{
            let filepath=ctx.params.filepath as string;
            let savedPath=ctx.path;
            ctx.path=`/www/${filepath}`;
            await next();
            ctx.path=savedPath
            if(filepath==='pxseedInit.js'){
                ctx.set('Cache-Control','no-cache');
            }
        },pxseedFilesServer);
        //for sourcemap, optional.
        koaRouter.get(config.pxseedBase+'/source/:filepath(.+)',async (ctx,next)=>{
            let filepath=ctx.params.filepath as string;
            let savedPath=ctx.path;
            ctx.path=`/source/${filepath}`;
            await next();
            ctx.path=savedPath
        },pxseedFilesServer);
        
        ensureInit.setResult(0);
        
        console.info(`package manager url:`)
        console.info(`http://${config.listenOn.host}:${config.listenOn.port}${config.pxseedBase}/www/index.html?__jsentry=partic2%2fpackageManager%2fwebui`);

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
    Promise.all(config.initModule.map(mod=>requirejs.promiseRequire(mod)));
})();




