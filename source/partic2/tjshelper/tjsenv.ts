//import this module to Initialize pxseed environment on txiki.js platform.

import { ArrayBufferConcat, DateDiff, future, GetCurrentTime, requirejs, WaitUntil} from 'partic2/jsutils1/base';
import * as jsutils1base from 'partic2/jsutils1/base';
import type {} from 'partic2/tjshelper/txikijs'
import { Io, Serializer } from 'pxprpc/base';

var __name__=requirejs.getLocalRequireModule(require);

import { GenerateRandomString } from 'partic2/jsutils1/base';

import {BasicMessagePort, getWWWRoot, setWorkerThreadImplementation, WebWorkerThread} from 'partic2/jsutils1/webutils'
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


class TjsDefaultWebWorkerThread extends WebWorkerThread{
    protected async _createWorker(): Promise<BasicMessagePort> {
        return new Worker(workerEntryUrl);
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
class PRtbWorkerThread extends WebWorkerThread{
    static thisPipeServerId='/pxprpc/txikijs/worker/'+GenerateRandomString();
    static pipeServer:RpcExtendClientObject|null=null;
    static childrenWorkerConnected:Record<string,((io:Io)=>void)|Io|undefined>={};
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
    conn?:Io
    running=true;
    protected async _createWorker(): Promise<BasicMessagePort> {
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
            (async ()=>{
                while(this.running){
                    let msg=await this.conn!.receive();
                    let data=tjs.engine.deserialize(msg);
                    (this.port as any as PRtbWorkerMessagePort).dispatchEvent(
                        new MessageEvent('message',{data})
                    )
                }
            })();
            return new PRtbWorkerMessagePort(this) as any;
        }else{
            throw new Error('Worker with same name is created.');
        }
    }
}


export async function setupImpl(){
    kvdbInit();
    if(globalThis.__pxprpc4tjs__==undefined){
        setWorkerThreadImplementation(TjsDefaultWebWorkerThread)
    }else{
        setWorkerThreadImplementation(PRtbWorkerThread)
    }
    if(globalThis.close==undefined){
        globalThis.close=()=>{
            (globalThis as any)[Symbol.for('tjs.internal.core')]?.tjsClose?.();
        }
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
    let {polyfill}=await import('partic2/tjshelper/tjsutil');
    globalThis.fetch=polyfill.fetch;
    globalThis.WebSocket=polyfill.WebSocket;
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

export let __inited__=(async()=>{
    if(globalThis.tjs==undefined){
        console.warn('This module is only used to initialize pxseed environment on txiki.js,'+
            ' and has no effect on other platform.'+
            'Also avoid to import this module on other platform.')
    }else{
        await setupImpl();
    }
})();



