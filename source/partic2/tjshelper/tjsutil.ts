/*jshint node:true */

import { ArrayBufferConcat, ArrayWrap2, DateDiff, GetCurrentTime, assert, logger, requirejs } from "partic2/jsutils1/base";
import { Io, Serializer } from "pxprpc/base";
import { RpcExtendClient1, RpcExtendClientCallable, RpcExtendClientObject } from "pxprpc/extend";
import { getRpcFunctionOn } from "partic2/pxprpcBinding/utils";



let __name__=requirejs.getLocalRequireModule(require);
let log=logger.getLogger(__name__);
export class TjsReaderDataSource implements UnderlyingDefaultSource<Uint8Array>{
	constructor(public tjsReader:tjs.Reader){}
	async pull(controller: ReadableStreamDefaultController<any>): Promise<void>{
		let buf=new Uint8Array(1024);
		let count=await this.tjsReader.read(buf);
		if(count==null){
			controller.close();
		}else{
			controller.enqueue(new Uint8Array(buf.buffer,0,count));
		}
	}
}

export class TjsWriterDataSink implements UnderlyingSink<Uint8Array>{
	constructor(public tjsWriter:tjs.Writer&{close?:()=>void}){}
	async write(chunk: Uint8Array, controller: WritableStreamDefaultController): Promise<void>{
		await this.tjsWriter.write(chunk)
	}
	close(){
		if(this.tjsWriter.close!=undefined){
			this.tjsWriter.close();
		}
	}
}


export class PxprpcIoFromTjsStream implements Io{
	constructor(public r:tjs.Reader,public w:tjs.Writer,public c:{close:()=>void}){}
	async receive(): Promise<Uint8Array> {
		let buf1=new Uint8Array(4);
		await this.r!.read(buf1);
		let size=new DataView(buf1.buffer).getInt32(0,true);
		buf1=new Uint8Array(size);
		let readCount=0;
		while(readCount<size){
			let nread=await this.r!.read(new Uint8Array(buf1.buffer,readCount,size-readCount));
			if(nread===null || nread===0){
				throw new Error("packet truncated.");
			}
			readCount+=nread;
		}
		return buf1;
	}
	async send(data: Uint8Array[]): Promise<void> {
		let size=data.reduce((prev,curr)=>prev+curr.byteLength,0);
        let buf1=new Uint8Array(4);
		new DataView(buf1.buffer).setInt32(0,size,true);
		//XXX:Should I take care about the result of write?
		if(size<1024){
			await this.w!.write(new Uint8Array(ArrayBufferConcat([buf1,...data])));
		}else{
			await this.w!.write(buf1);
			for(let t1 of data){
				await this.w!.write(t1);
			}
		}
	}
	close(): void {
		this.c.close();
	}
	
}

class CTxikijsPxprpcBinding{
    rpc!:RpcExtendClient1;
    protected remoteSslClientPopCipherSend:RpcExtendClientCallable|null=null;
    protected remoteSslClientPushCipherRecv:RpcExtendClientCallable|null=null;
    protected remoteSslClientWritePlain:RpcExtendClientCallable|null=null;
    protected remoteSslClientReadPlain:RpcExtendClientCallable|null=null;
	//Safe to call multitimes.
	async init(){
		if(this.rpc==undefined){
			let {getRpc4RuntimeBridge0}=await import("partic2/pxprpcBinding/rpcregistry");
			this.rpc=await getRpc4RuntimeBridge0();
		}
	}
    async NewSslClientContext(hostname:string){
        return (await getRpcFunctionOn(this.rpc,'pxprpc_txikijs.NewSslClientContext','s->o'))!.call(hostname);        
    }
    async SslClientPopCipherSend(sslCtx:RpcExtendClientObject){
        if(this.remoteSslClientPopCipherSend==null){
            this.remoteSslClientPopCipherSend=await getRpcFunctionOn(this.rpc,'pxprpc_txikijs.SslClientPopCipherSend','o->b')
        }
        return await this.remoteSslClientPopCipherSend!.call(sslCtx) as Uint8Array;
    }
    async SslClientPushCipherRecv(sslCtx:RpcExtendClientObject,data:Uint8Array){
        if(this.remoteSslClientPushCipherRecv==null){
            this.remoteSslClientPushCipherRecv=await getRpcFunctionOn(this.rpc,'pxprpc_txikijs.SslClientPushCipherRecv','ob->')
        }
        return await this.remoteSslClientPushCipherRecv!.call(sslCtx,data);
    }
    async SslClientWritePlain(sslCtx:RpcExtendClientObject,data:Uint8Array){
        if(this.remoteSslClientWritePlain==null){
            this.remoteSslClientWritePlain=await getRpcFunctionOn(this.rpc,'pxprpc_txikijs.SslClientWritePlain','ob->i')
        }
        return await this.remoteSslClientWritePlain!.call(sslCtx,data) as number;
    }
    async SslClientReadPlain(sslCtx:RpcExtendClientObject){
        if(this.remoteSslClientReadPlain==null){
            this.remoteSslClientReadPlain=await getRpcFunctionOn(this.rpc,'pxprpc_txikijs.SslClientReadPlain','o->b')
        }
        return await this.remoteSslClientReadPlain!.call() as Uint8Array;
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

export let txikijsPxprpc=new CTxikijsPxprpcBinding();