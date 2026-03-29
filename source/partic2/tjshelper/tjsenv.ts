//import this module to Initialize pxseed environment on txiki.js platform.

import { ArrayBufferConcat, DateDiff, future, GetCurrentTime, requirejs, WaitUntil} from 'partic2/jsutils1/base';
import * as jsutils1base from 'partic2/jsutils1/base';
import type {} from 'partic2/tjshelper/txikijs'
import { Io, Serializer } from 'pxprpc/base';

var __name__=requirejs.getLocalRequireModule(require);

import { GenerateRandomString } from 'partic2/jsutils1/base';

import {BasicMessagePort, getWWWRoot, IKeyValueDb, IWorkerThread, lifecycle, path, setKvStoreBackend, setWorkerThreadImplementation} from 'partic2/jsutils1/webutils'
import {__name__ as webutilsName} from 'partic2/jsutils1/webutils'

import {setupImpl as kvdbInit} from 'partic2/nodehelper/kvdb'
import { RpcExtendClient1, RpcExtendClientCallable, RpcExtendClientObject } from 'pxprpc/extend';
import { getRpcFunctionOn } from 'partic2/pxprpcBinding/utils';

//txiki.js has bugly eventTarget, patch it before upstream fix it.
Object.defineProperty(Event.prototype,'target',{get:function(){return this.currentTarget}})


let workerEntryUrl=function(){
    try{
        return getWWWRoot()+'/txikirun.js'
    }catch(e){};
    return '';
}()
let WorkerThreadMessageMark='__messageMark_WorkerThread'


class WebWorkerThread implements IWorkerThread{
    port?:BasicMessagePort
    workerId='';
    waitReady=new future<number>();
    tjsWorker?:Worker
    onExit?:()=>void;
    constructor(workerId?:string){
        this.workerId=workerId??GenerateRandomString();
    };
    exitListener=()=>{
        this.runScript(`require(['${webutilsName}'],function(webutils){
            webutils.lifecycle.dispatchEvent(new Event('exit'));
        })`);
    };
    async start(){
        this.tjsWorker=new Worker(workerEntryUrl);
        this.port=this.tjsWorker;
        this.port!.addEventListener('message',(msg:MessageEvent)=>{
            if(typeof msg.data==='object' && msg.data[WorkerThreadMessageMark]){
                let {type,scriptId}=msg.data as {type:string,scriptId?:string};
                switch(type){
                    case 'run':
                        this.onHostRunScript(msg.data.script)
                        break;
                    case 'onScriptResolve':
                        this.onScriptResult(msg.data.result,scriptId)
                        break;
                    case 'onScriptReject':
                        this.onScriptReject(msg.data.reason,scriptId);
                        break;
                    case 'ready':
                        this.waitReady.setResult(0);
                        break;
                    case 'closing':
                        lifecycle.removeEventListener('exit',this.exitListener);
                        this.onExit?.();
                        break;
                    case 'tjs-close':
                        this.tjsWorker?.terminate();
                        break;
                }
            }
        });
        await this.waitReady.get();
        await this.runScript(`this.__workerId='${this.workerId}'`);
        lifecycle.addEventListener('exit',this.exitListener);
    }
    onHostRunScript(script:string){
        (new Function('workerThread',script))(this);
    }
    processingScript={} as {[scriptId:string]:future<any>}
    async runScript(script:string,getResult?:boolean){
        let scriptId='';
        if(getResult===true){
            scriptId=GenerateRandomString();
            this.processingScript[scriptId]=new future<any>();
        }
            this.port?.postMessage({[WorkerThreadMessageMark]:true,type:'run',script,scriptId})
        if(getResult===true){
            return await this.processingScript[scriptId].get();            
        }
    }
    onScriptResult(result:any,scriptId?:string){
        if(scriptId!==undefined && scriptId in this.processingScript){
            let fut=this.processingScript[scriptId];
            delete this.processingScript[scriptId];
            fut.setResult(result);
        }
    }
    onScriptReject(reason:any,scriptId?:string){
        if(scriptId!==undefined && scriptId in this.processingScript){
            let fut=this.processingScript[scriptId];
            delete this.processingScript[scriptId];
            fut.setException(new Error(reason));
            
        }
    }
    requestExit(){
        this.runScript('globalThis.close()');
    }
}


class CTxikijsPxprpcBinding{
    rpc!:RpcExtendClient1;
	//Safe to call multitimes.
	async init(){
		if(this.rpc==undefined){
			let {getRpc4RuntimeBridge0}=await import("partic2/pxprpcBinding/rpcregistry");
			this.rpc=await getRpc4RuntimeBridge0();
		}
	}
    async NewRuntime(){
        let param=new Serializer().prepareSerializing(8);
        param.putInt(0);
        return await (await getRpcFunctionOn(this.rpc,'pxprpc_txikijs.NewRuntime','b->o'))!.call(param.build()) as RpcExtendClientObject;
    }
    async RunJs(rt:RpcExtendClientObject,jsCode:string){
        await (await getRpcFunctionOn(this.rpc,'pxprpc_txikijs.RunJs','os->'))!.call(rt,jsCode);
    }
}

class PRtbWorkerMessagePort extends EventTarget{
    constructor(public wt:PRtbWorkerThread){super()};
    postMessage(message:any){
        this.wt.conn!.send([tjs.engine.serialize(message)])
    }
}
//Pxprpc runtime bridge based worker
class PRtbWorkerThread implements IWorkerThread{
    static thisPipeServerId='/pxprpc/txikijs/worker/'+GenerateRandomString();
    static pipeServer:RpcExtendClientObject|null=null;
    static childrenWorkerConnected:Record<string,((io:Io)=>void)|Io|undefined>={};
    port?: BasicMessagePort | undefined;
    workerId: string='';
    conn?:Io
    constructor(workerId?:string){
        if(workerId==undefined){
            this.workerId=GenerateRandomString()
        }else{
            this.workerId=workerId;
        }
    }
    static async serveAsWorkerParent(){
        let rtb=await import('partic2/pxprpcBinding/pxprpc_rtbridge')
        await rtb.ensureDefaultInvoker();
        PRtbWorkerThread.pipeServer=await rtb.defaultInvoker!.pipe_serve(PRtbWorkerThread.thisPipeServerId);
        while(true){
            let newConn=await rtb.defaultInvoker!.pipe_accept(PRtbWorkerThread.pipeServer);
            let childWorkerId=new TextDecoder().decode(await rtb.defaultInvoker!.io_receive(newConn))
            let connIo={
                conn:newConn,
                send:async function(data:Uint8Array[]){
                    await rtb.defaultInvoker!.io_send(this.conn,new Uint8Array(ArrayBufferConcat(data)));
                },
                receive:async function(){
                    return await rtb.defaultInvoker!.io_receive(this.conn);
                },
                close:function(){
                    this.conn.free().catch(()=>{});
                }
            }
            let cb=this.childrenWorkerConnected[childWorkerId];
            if(typeof cb==='function'){
                cb(connIo);
            }else{
                connIo.close();
            }
        }
    }
    running=false;
    async start(): Promise<void> {
        if(this.running)return;
        this.running=true;
        if(PRtbWorkerThread.pipeServer===null){
            PRtbWorkerThread.serveAsWorkerParent();
            await WaitUntil(()=>PRtbWorkerThread.pipeServer!==null,16,2000);
        }
        await txikijsPxprpc.init();
        let rt1=await txikijsPxprpc.NewRuntime();
        if(PRtbWorkerThread.childrenWorkerConnected[this.workerId]==undefined){
            let childConnected=new Promise<Io>((resolve)=>{
                PRtbWorkerThread.childrenWorkerConnected[this.workerId]=resolve;
            })
            let jsCode=`(async ()=>{
                globalThis.__workerId='${this.workerId}';
                globalThis.__PRTBParentPipeServerId='${PRtbWorkerThread.thisPipeServerId}';
                let {main}=await import(String.raw\`${getWWWRoot().replace(/\\/g,'/')}/txikirun.js\`);
                main('partic2/tjshelper/workerentry')
            })()`
            txikijsPxprpc.RunJs(rt1,jsCode);
            this.conn=await childConnected;
            this.port=new PRtbWorkerMessagePort(this) as any;
            this.startStep2();
            (async ()=>{
                while(this.running){
                    let msg=await this.conn!.receive();
                    let data=tjs.engine.deserialize(msg);
                    (this.port as any as PRtbWorkerMessagePort).dispatchEvent(
                        new MessageEvent('message',{data})
                    )
                    
                }
            })();
        }else{
            throw new Error('Worker with same name is created.');
        }
        
    }
    exitListener=()=>{
        this.runScript(`require(['${webutilsName}'],function(webutils){
            webutils.lifecycle.dispatchEvent(new Event('exit'));
        })`);
    };
    waitReady=new future<number>();
    onExit?:()=>void;
    async startStep2(){
        this.port!.addEventListener('message',(msg:MessageEvent)=>{
            if(typeof msg.data==='object' && msg.data[WorkerThreadMessageMark]){
                let {type,scriptId}=msg.data as {type:string,scriptId?:string};
                switch(type){
                    case 'run':
                        this.onHostRunScript(msg.data.script)
                        break;
                    case 'onScriptResolve':
                        this.onScriptResult(msg.data.result,scriptId)
                        break;
                    case 'onScriptReject':
                        this.onScriptReject(msg.data.reason,scriptId);
                        break;
                    case 'ready':
                        this.waitReady.setResult(0);
                        break;
                    case 'closing':
                        lifecycle.removeEventListener('exit',this.exitListener);
                        this.onExit?.();
                        break;
                    case 'tjs-close':
                        break;
                }
            }
        });
        await this.waitReady.get();
        await this.runScript(`this.__workerId='${this.workerId}'`);
        lifecycle.addEventListener('exit',this.exitListener);
    }
    onHostRunScript(script:string){
        (new Function('workerThread',script))(this);
    }
    processingScript={} as {[scriptId:string]:future<any>}
    async runScript(script:string,getResult?:boolean){
        let scriptId='';
        if(getResult===true){
            scriptId=GenerateRandomString();
            this.processingScript[scriptId]=new future<any>();
        }
            this.port?.postMessage({[WorkerThreadMessageMark]:true,type:'run',script,scriptId})
        if(getResult===true){
            return await this.processingScript[scriptId].get();            
        }
    }
    onScriptResult(result:any,scriptId?:string){
        if(scriptId!==undefined && scriptId in this.processingScript){
            let fut=this.processingScript[scriptId];
            delete this.processingScript[scriptId];
            fut.setResult(result);
        }
    }
    onScriptReject(reason:any,scriptId?:string){
        if(scriptId!==undefined && scriptId in this.processingScript){
            let fut=this.processingScript[scriptId];
            delete this.processingScript[scriptId];
            fut.setException(new Error(reason));
            
        }
    }
    requestExit(){
        this.runScript('globalThis.close()');
    }
    
}

export function setupImpl(){
    kvdbInit();
    if(globalThis.__pxprpc4tjs__==undefined){
        setWorkerThreadImplementation(WebWorkerThread)
    }else{
        setWorkerThreadImplementation(PRtbWorkerThread)
    }
    if(globalThis.open==undefined){
        globalThis.open=(async (url:string,target?:string)=>{
            let jscode:string='';
            if(url.startsWith('http://') || url.startsWith('https://')){
                let resp=await fetch(url);
                if(resp.ok){
                    jscode=await resp.text();
                }else{
                    throw new Error(await resp.text())
                }
            }else if(url.startsWith('file://')){
                let path=url.substring(7);
                if(tjs.system.platform=='windows'){
                    path=path.substring(1);
                }
                jscode=new TextDecoder().decode(await tjs.readFile(path));
            }
            new Function(jscode)();
        }) as any
    }
    if((tjs.engine as any).bufferToBase64!=undefined){
        (jsutils1base as any).ArrayBufferToBase64=function(buffer: ArrayBuffer|Uint8Array): string{
            let bytes:Uint8Array;
            if(buffer instanceof ArrayBuffer){
                bytes=new Uint8Array(buffer);
            }else{
                bytes = new Uint8Array(buffer.buffer,buffer.byteOffset,buffer.byteLength);
            }
            return new TextDecoder().decode((tjs.engine as any).bufferToBase64(bytes));
        };
        (jsutils1base as any).Base64ToArrayBuffer=function(base64: string): ArrayBuffer {
            let b64buf=new TextEncoder().encode(base64);
            return (tjs.engine as any).base64ToBuffer(b64buf).buffer;
        };
    }
}

declare global {
    var __pxprpc4tjs__:{
        pipeConnect(pipeServer:string):BigInt;
        ioSend(pipe:BigInt,buf:ArrayBuffer):string|undefined;
        ioReceive(pipe:BigInt,cb:(result:ArrayBuffer|string)=>void):void;
        ioClose(pipe:BigInt):void;
        accessMemory(base:BigInt,len:number):SharedArrayBuffer;
        freeObjStore?:(index:number)=>void;
        embedtlsSslFunc2026?:(...args:any[])=>any;
    }
}

export class PxprpcRtbIo implements Io{
    static async connect(pipeServer:string):Promise<PxprpcRtbIo|null>{
        let conn=__pxprpc4tjs__.pipeConnect(pipeServer);
        if(conn===0n){
            return null;
        }else{
            return new PxprpcRtbIo(conn);
        }
    }
    constructor(public pipeAddr:BigInt){};
    receive(): Promise<Uint8Array> {
        if(this.pipeAddr===0n)throw new Error('Not connected');
        return new Promise((resolve,reject)=>{
            __pxprpc4tjs__.ioReceive(this.pipeAddr,(buf)=>{
                if(typeof buf==='string'){
                    reject(new Error(buf));
                }else{
                    resolve(new Uint8Array(buf));
                }
            })
        })
    }
    async send(data: Uint8Array[]): Promise<void> {
        let res
        if(this.pipeAddr===0n)throw new Error('Not connected');
        if(data.length==1 && data[0].byteOffset==0 && data[0].length==data[0].buffer.byteLength){
            res=__pxprpc4tjs__.ioSend(this.pipeAddr,data[0].buffer);
        }else{
            res=__pxprpc4tjs__.ioSend(this.pipeAddr,ArrayBufferConcat(data));
        }
        if(res!=undefined){
            throw new Error(res);
        }
    }
    close(): void {
        if(this.pipeAddr!==0n){
            __pxprpc4tjs__.ioClose(this.pipeAddr);
            this.pipeAddr=0n;
        }
    }
}

let tjstlscleanup=new FinalizationRegistry((index:jsutils1base.Ref2<number>)=>{
    if(index.get()>=0)__pxprpc4tjs__.freeObjStore!(index.get());
});

export let txikijsPxprpc=new CTxikijsPxprpcBinding();

export class TjsTlsClient{
    index=new jsutils1base.Ref2<number>(-1);
    constructor(servername?:string){
        jsutils1base.assert(__pxprpc4tjs__.embedtlsSslFunc2026!=undefined);
        jsutils1base.assert(__pxprpc4tjs__.embedtlsSslFunc2026(0)>=6);
        this.index.set(__pxprpc4tjs__.embedtlsSslFunc2026(1,servername??''));
        tjstlscleanup.register(this,this.index);
    }
    async readCipherSendBuffer(buf:Uint8Array):Promise<number>{
        jsutils1base.assert(this.index.get()>=0);
        let r= __pxprpc4tjs__.embedtlsSslFunc2026!(2,this.index.get(),buf);
        return r;
    }
    async writeCipherRecvBuffer(buf:Uint8Array):Promise<number>{
        jsutils1base.assert(this.index.get()>=0);
        let r=__pxprpc4tjs__.embedtlsSslFunc2026!(3,this.index.get(),buf);
        return r;
    }
    async writePlain(buf:Uint8Array):Promise<number>{
        let r=__pxprpc4tjs__.embedtlsSslFunc2026!(4,this.index.get(),buf);
        if(r<0)new Error('embedtls error:'+r); 
        return r;
    }
    async readPlain(buf:Uint8Array):Promise<number>{
        let r=__pxprpc4tjs__.embedtlsSslFunc2026!(5,this.index.get(),buf);
        if(r<0)new Error('embedtls error:'+r);
        return r;
    }
    async close(){
        let index=this.index.get();
        this.index.set(-1);
        __pxprpc4tjs__.freeObjStore!(index);
    }
}


if(globalThis.tjs==undefined){
    console.warn('This module is only used to initialize pxseed environment on txiki.js,'+
        ' and has no effect on other platform.'+
        'Also avoid to import this module on other platform.')
}else{
    setupImpl();
}

