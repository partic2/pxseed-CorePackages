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
        widccjitFunc2026?:(...args:any[])=>any;
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
        jsutils1base.assert(this.index.get()>=0);
        let r=__pxprpc4tjs__.embedtlsSslFunc2026!(4,this.index.get(),buf);
        if(r<0)throw new Error('embedtls error:'+r);
        return r;
    }
    async readPlain(buf:Uint8Array):Promise<number>{
        jsutils1base.assert(this.index.get()>=0);
        let r=__pxprpc4tjs__.embedtlsSslFunc2026!(5,this.index.get(),buf);
        if(r<0)throw new Error('embedtls error:'+r);
        return r;
    }
    async close(){
        let index=this.index.get();
        if(index<0)return;
        this.index.set(-1);
        __pxprpc4tjs__.freeObjStore!(index);
    }
}

//Server side TLS. crtPem/keyPem are PEM encoded certificate and private key.
export class TjsTlsServer{
    index=new jsutils1base.Ref2<number>(-1);
    constructor(crtPem:string,keyPem:string){
        jsutils1base.assert(__pxprpc4tjs__.embedtlsSslFunc2026!=undefined);
        jsutils1base.assert(__pxprpc4tjs__.embedtlsSslFunc2026(0)>=12);
        this.index.set(__pxprpc4tjs__.embedtlsSslFunc2026!(6,crtPem,keyPem));
        tjstlscleanup.register(this,this.index);
    }
    //Read cipher text produced by handshake/readPlain/writePlain, should be sent to client.
    async readCipherSendBuffer(buf:Uint8Array):Promise<number>{
        jsutils1base.assert(this.index.get()>=0);
        return __pxprpc4tjs__.embedtlsSslFunc2026!(7,this.index.get(),buf);
    }
    //Write cipher text received from client.
    async writeCipherRecvBuffer(buf:Uint8Array):Promise<number>{
        jsutils1base.assert(this.index.get()>=0);
        return __pxprpc4tjs__.embedtlsSslFunc2026!(8,this.index.get(),buf);
    }
    async writePlain(buf:Uint8Array):Promise<number>{
        jsutils1base.assert(this.index.get()>=0);
        let r=__pxprpc4tjs__.embedtlsSslFunc2026!(9,this.index.get(),buf);
        if(r<0)throw new Error('embedtls error:'+r);
        return r;
    }
    async readPlain(buf:Uint8Array):Promise<number>{
        jsutils1base.assert(this.index.get()>=0);
        let r=__pxprpc4tjs__.embedtlsSslFunc2026!(10,this.index.get(),buf);
        if(r<0)throw new Error('embedtls error:'+r);
        return r;
    }
    //Returns 0 while the handshake needs more data, positive/negative result otherwise.
    async handshake():Promise<number>{
        jsutils1base.assert(this.index.get()>=0);
        return __pxprpc4tjs__.embedtlsSslFunc2026!(11,this.index.get());
    }
    async close(){
        let index=this.index.get();
        if(index<0)return;
        this.index.set(-1);
        __pxprpc4tjs__.freeObjStore!(index);
    }
}

let widccjitcleanup=new FinalizationRegistry((index:jsutils1base.Ref2<number>)=>{
    if(index.get()>=0)__pxprpc4tjs__.freeObjStore!(index.get());
});

function ensureWidccjit():((...args:any[])=>any){
    jsutils1base.assert(__pxprpc4tjs__.widccjitFunc2026!=undefined,
        'widccjit is not available on this txiki.js build.');
    return __pxprpc4tjs__.widccjitFunc2026!;
}

export type WidccArg=number|bigint;
export type WidccResult=number|bigint|undefined;

export class TjsWidccSymbol{
    index=new jsutils1base.Ref2<number>(-1);
    constructor(public name:string,index:number){
        this.index.set(index);
        widccjitcleanup.register(this,this.index);
    }
    get address():bigint{
        jsutils1base.assert(this.index.get()>=0);
        return ensureWidccjit()(11,this.index.get());
    }
    //argTypes/resultTypes use one char per value: 'i' int32, 'l' int64, 'p' pointer,
    //result type 'v' means void. Results are always returned as an array.
    call(argTypes:string,args:WidccArg[],resultTypes:string=''):WidccResult[]{
        jsutils1base.assert(this.index.get()>=0);
        return ensureWidccjit()(12,this.index.get(),argTypes,args,resultTypes);
    }
    close(){
        let index=this.index.get();
        if(index<0)return;
        this.index.set(-1);
        __pxprpc4tjs__.freeObjStore!(index);
    }
}

export class TjsWidccModule{
    index=new jsutils1base.Ref2<number>(-1);
    constructor(index:number){
        this.index.set(index);
        widccjitcleanup.register(this,this.index);
    }
    unload():boolean{
        let index=this.index.get();
        if(index<0)return false;
        return ensureWidccjit()(10,index);
    }
    close(){
        let index=this.index.get();
        if(index<0)return;
        this.index.set(-1);
        __pxprpc4tjs__.freeObjStore!(index);
    }
}

export class TjsWidccRuntime{
    index=new jsutils1base.Ref2<number>(-1);
    constructor(){
        let func=ensureWidccjit();
        jsutils1base.assert(func(0)>=15);
        this.index.set(func(1));
        widccjitcleanup.register(this,this.index);
    }
    addHostFunction(name:string,address:bigint):boolean{
        jsutils1base.assert(this.index.get()>=0);
        return ensureWidccjit()(3,this.index.get(),name,address);
    }
    addHostVariable(name:string,address:bigint):boolean{
        jsutils1base.assert(this.index.get()>=0);
        return ensureWidccjit()(4,this.index.get(),name,address);
    }
    lookup(name:string):TjsWidccSymbol|null{
        jsutils1base.assert(this.index.get()>=0);
        let id=ensureWidccjit()(5,this.index.get(),name);
        if(id===null||id===undefined)return null;
        return new TjsWidccSymbol(name,id);
    }
    listSymbols():string[]{
        jsutils1base.assert(this.index.get()>=0);
        return ensureWidccjit()(6,this.index.get());
    }
    setIncludePaths(paths:string[]):void{
        jsutils1base.assert(this.index.get()>=0);
        ensureWidccjit()(7,this.index.get(),paths);
    }
    loadCode(path:string,source:string):TjsWidccModule{
        jsutils1base.assert(this.index.get()>=0);
        return new TjsWidccModule(ensureWidccjit()(8,this.index.get(),path,source));
    }
    loadCodeFile(path:string):TjsWidccModule{
        jsutils1base.assert(this.index.get()>=0);
        return new TjsWidccModule(ensureWidccjit()(9,this.index.get(),path));
    }
    //Free the native runtime. Modules/symbols still hold their own reference to it.
    deleteRuntime(){
        let index=this.index.get();
        if(index<0)return;
        ensureWidccjit()(2,index);
    }
    close(){
        let index=this.index.get();
        if(index<0)return;
        this.index.set(-1);
        __pxprpc4tjs__.freeObjStore!(index);
    }
}

export function widccReadMemory(address:bigint,length:number):Uint8Array{
    return ensureWidccjit()(13,address,length);
}

export function widccWriteMemory(address:bigint,data:Uint8Array):void{
    ensureWidccjit()(14,address,data);
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



