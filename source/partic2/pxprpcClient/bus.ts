import { defaultFuncMap, RpcExtendClient1, RpcExtendClientCallable, RpcExtendClientObject, RpcExtendServerCallable, TableSerializer } from "pxprpc/extend";
import { ArrayWrap2, assert, future, Ref2, requirejs } from "partic2/jsutils1/base";
import { createIoPipe, getAttachedRemoteRigstryFunction, getPersistentRegistered, IoOverPxprpc, ServerHostRpcName } from "./registry";
import { Io } from "pxprpc/base";
import { getRpcFunctionOn } from 'partic2/pxprpcBinding/utils';
import { GetUrlQueryVariable2 } from "partic2/jsutils1/webutils";

let __name__=requirejs.getLocalRequireModule(require);


export let BusHostServer=new Ref2(ServerHostRpcName);

export class PxseedJsIoServer{
    static serving:Record<string,PxseedJsIoServer>={}
    static servingChangeEvent=new future<0>();
    pendingAccept=new ArrayWrap2<Io>();
    closed=false;
    constructor(public name:string){
        this.pendingAccept.queueSizeLimit=5;
        if(PxseedJsIoServer.serving[name]!=undefined){
            PxseedJsIoServer.serving[name].close();
        }
        PxseedJsIoServer.serving[name]=this;
        PxseedJsIoServer.servingChangeEvent.setResult(0);
        PxseedJsIoServer.servingChangeEvent=new future();
    }
    close(){
        this.pendingAccept.cancelWaiting();
        this.closed=true;
        this.pendingAccept.arr().length=0;
        delete PxseedJsIoServer.serving[this.name];
        PxseedJsIoServer.servingChangeEvent.setResult(0);
        PxseedJsIoServer.servingChangeEvent=new future();
    }
    async accept(){
        if(this.closed)throw new Error('closed.');
        return await this.pendingAccept.queueBlockShift();
    }
    async connect(){
        if(this.closed)throw new Error('closed.');
        let [a,b]=createIoPipe();
        await this.pendingAccept.queueBlockPush(b);
        return a;
    }
    static async connect(name:string){
        if(this.serving[name]!=undefined){
            return this.serving[name].connect();
        }else{
            return null;
        }
    }
}

defaultFuncMap[__name__+'.newPxseedJsIoServer']=new RpcExtendServerCallable(async (name:string)=>new PxseedJsIoServer(name)).typedecl('s->o');
defaultFuncMap[__name__+'.PxseedJsIoServerAccept']=new RpcExtendServerCallable(async (server:PxseedJsIoServer)=>{
    return await server.accept();
}).typedecl('o->o');
defaultFuncMap[__name__+'.PxseedJsIoServerConnect']=new RpcExtendServerCallable(async (name:string)=>{
    return await PxseedJsIoServer.connect(name);
}).typedecl('s->o');
defaultFuncMap[__name__+'.PxseedJsIoServerPrefixQuery']=new RpcExtendServerCallable(async (prefix:string)=>{
    return new TableSerializer().fromArray(Object.keys(PxseedJsIoServer.serving).filter(t1=>t1.startsWith(prefix))).build()
}).typedecl('s->b');
defaultFuncMap[__name__+'.PxseedJsIoServerWaitServingChange']=new RpcExtendServerCallable(async ()=>{
    await PxseedJsIoServer.servingChangeEvent.get();
}).typedecl('->');


export let RemotePxseedJsIoServer={
    connect:async (name:string,client1?:RpcExtendClient1):Promise<Io>=>{
        if(client1==undefined){
            client1=await (await getPersistentRegistered(BusHostServer.get()))!.ensureConnected();
        }
        await (await getAttachedRemoteRigstryFunction(client1)).loadModule(__name__)
        let fn=await getRpcFunctionOn(client1,__name__+'.PxseedJsIoServerConnect','s->o');
        return new IoOverPxprpc(await fn!.call(name));
    },
    serve:async (name:string,cb:{
        onConnect:(newConn:Io)=>void,
        onError?:(err:Error)=>void
    },client1?:RpcExtendClient1):Promise<{close:()=>void}>=>{
        if(client1==undefined){
            client1=await (await getPersistentRegistered(BusHostServer.get()))!.ensureConnected();
        }
        await (await getAttachedRemoteRigstryFunction(client1)).loadModule(__name__)
        let fn=await getRpcFunctionOn(client1,__name__+'.newPxseedJsIoServer','s->o');
        let remoteServer=await fn!.call(name) as RpcExtendClientObject;
        fn=await getRpcFunctionOn(client1,__name__+'.PxseedJsIoServerAccept','o->o');
        fn!.poll((err,result)=>{
            if(err!=null){
                remoteServer.free();
                cb.onError?.(err);
            }else{
                cb.onConnect(new IoOverPxprpc(result));
            }
        },remoteServer);
        return {close:()=>remoteServer.free()}
    },
    prefixQuery:async (prefix:string,client1?:RpcExtendClient1)=>{
        if(client1==undefined){
            client1=await (await getPersistentRegistered(BusHostServer.get()))!.ensureConnected();
        }
        await (await getAttachedRemoteRigstryFunction(client1)).loadModule(__name__)
        let fn=await getRpcFunctionOn(client1,__name__+'.PxseedJsIoServerPrefixQuery','s->b');
        return new TableSerializer().load(await fn!.call(prefix) as Uint8Array).toArray() as string[];
    },
    waitServingChange:async (client1?:RpcExtendClient1)=>{
        if(client1==undefined){
            client1=await (await getPersistentRegistered(BusHostServer.get()))!.ensureConnected();
        }
        await (await getAttachedRemoteRigstryFunction(client1)).loadModule(__name__)
        let fn=await getRpcFunctionOn(client1,__name__+'.PxseedJsIoServerWaitServingChange','->');
        await fn!.call();
    }
}

import { ExtendStreamReader } from 'partic2/CodeRunner/jsutils2'
import { WebSocketIo } from "pxprpc/backend";

export class PxprpcIoFromRawStream implements Io{
	r:ExtendStreamReader;
	w:WritableStreamDefaultWriter;
	constructor(public stream:[ReadableStream<Uint8Array>,WritableStream<Uint8Array>]){
		this.r=new ExtendStreamReader(stream[0].getReader());
		this.w=stream[1].getWriter();
	}
    async receive(): Promise<Uint8Array> {
		let buf1=await this.r.readForNBytes(4);
        let size=new DataView(buf1.buffer).getInt32(0,true);
        return await this.r.readForNBytes(size);
    }
    async send(data: Uint8Array[]): Promise<void> {
        let size=data.reduce((prev,curr)=>prev+curr.byteLength,0);
        let buf1=new Uint8Array(4);
        new DataView(buf1.buffer).setInt32(0,size,true);
        this.w.write(buf1);
        data.forEach((buf2)=>{
            this.w.write(buf2);
        });
    }
    close(): void {
        this.w.close().catch(()=>{});
		this.stream[1].close().catch(()=>{});
		this.stream[0].cancel().catch(()=>{});
    }
}

export async function createIoPxseedJsUrl(url:string):Promise<Io>{
    let type=GetUrlQueryVariable2(url,'type')??'tcp';
    let {buildTjs}=await import('partic2/tjshelper/tjsbuilder')
    let {TjsReaderDataSource,TjsWriterDataSink} = await import('partic2/tjshelper/tjsutil')
    if(type==='tcp'){
        let host=GetUrlQueryVariable2(url,'host')??'127.0.0.1';
        let port=Number(GetUrlQueryVariable2(url,'port')!);
		let tjs=await buildTjs();
		let conn=await tjs.connect('tcp',host,port) as tjs.Connection
        return new PxprpcIoFromRawStream([
			new ReadableStream(new TjsReaderDataSource(conn)),
			new WritableStream(new TjsWriterDataSink(conn))
		]);
    }else if(type=='pipe'){
        let path=GetUrlQueryVariable2(url,'pipe');
		assert(path!=null);
		let tjs=await buildTjs();
		let conn=await tjs.connect('pipe',path) as tjs.Connection
        return new PxprpcIoFromRawStream([
			new ReadableStream(new TjsReaderDataSource(conn)),
			new WritableStream(new TjsWriterDataSink(conn))
		]);
    }else if(type=='ws'){
        let target=GetUrlQueryVariable2(url,'target');
        assert(target!=null);
        let io=await new WebSocketIo().connect(decodeURIComponent(target));
        return io;
    }
    throw new Error(`Unsupported type ${type}`)
}

