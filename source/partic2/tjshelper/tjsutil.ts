/*jshint node:true */

import { ArrayBufferConcat, ArrayWrap2, DateDiff, GetCurrentTime, assert, future, logger, requirejs, throwIfAbortError } from "partic2/jsutils1/base";
import { Io, Serializer } from "pxprpc/base";
import {TjsTlsClient} from './tjsenv'
import type { HttpClient } from "./httpprot";
import { u8hexconv } from "partic2/CodeRunner/jsutils2";




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


export class TlsStream{
	protected plainReadBuffer!:ReadableStreamDefaultController<Uint8Array>
	protected cipherReadQueue=new Array<Uint8Array>();
	protected plainWriteQueue=new Array<Uint8Array>();
	protected cipherWriteQueue=new Array<Uint8Array>();
	protected tjstlsc:TjsTlsClient;
	protected pumpSignal=new future<number>();
	protected abortControl=new AbortController();
	
	r=new ReadableStream<Uint8Array>({
		start:(ctl)=>{this.plainReadBuffer=ctl;}
	});
	w=new WritableStream<Uint8Array>({
		write:async (chunk,ctl)=>{
			this.plainWriteQueue.push(chunk);
			this.pumpSignal.setResult(0);
		}
	});
	constructor(protected underlying:{r:ReadableStream<Uint8Array>,w:WritableStream},public servername?:string){
		this.tjstlsc=new TjsTlsClient(servername);
		this.pump()
	}
	async pump(){
		let w2=this.underlying.w.getWriter();
		let r2=this.underlying.r.getReader();
		this.abortControl.signal.addEventListener('abort',(ev)=>{
			let err=new Error();
			err.name='AbortError'
			this.pumpSignal.setException(err);
		});
		;(async ()=>{
			while(!this.abortControl.signal.aborted){
				let next=await r2.read();
				if(next.done)break;
				this.cipherWriteQueue.push(next.value);
				this.pumpSignal.setResult(0);
			}
		})().catch(()=>{}).finally(()=>{this.close()})
		try{
			while(!this.abortControl.signal.aborted){
				let shouldWaitSignal=true;
				let count=0;
				if(this.plainWriteQueue.length>0){
					let t1=this.plainWriteQueue.shift()!;
					count=await this.tjstlsc.writePlain(t1);
					if(count<t1.length){
						t1=new Uint8Array(t1.buffer,t1.byteOffset+count,t1.length-count);
						this.plainWriteQueue.unshift(t1);
					}
					if(count>0){
						shouldWaitSignal=false;
					}
				}
				let buf=new Uint8Array(4096);
				count=await this.tjstlsc.readCipherSendBuffer(buf);
				if(count>0){
					await w2.write(new Uint8Array(buf.buffer,0,count));
					shouldWaitSignal=false;
				}
				if(this.cipherWriteQueue.length>0){
					let t1=this.cipherWriteQueue.shift()!;
					count=await this.tjstlsc.writeCipherRecvBuffer(t1);
					if(count<t1.length){
						t1=new Uint8Array(t1.buffer,t1.byteOffset+count,t1.length-count);
						this.cipherWriteQueue.unshift(t1);
					}
					if(count>0){
						shouldWaitSignal=false;
					}
				}
				count=await this.tjstlsc.readPlain(buf);
				if(count>0){
					this.plainReadBuffer.enqueue(new Uint8Array(buf.buffer,0,count));
					shouldWaitSignal=false;
				}
				if(shouldWaitSignal){
					await this.pumpSignal.get();
					this.pumpSignal=new future();
				}
			}		
		}finally{
			this.close();
		}
	}
	closed=false;
	close(){
		if(!this.closed){
			this.closed=true;
			this.abortControl.abort();
			this.underlying.w.close();
			this.underlying.r.cancel()
			this.w.close();
			this.plainReadBuffer.close();
			this.tjstlsc.close();
		}
	}
}


let httpClient:HttpClient|null=null;
export let polyfill={
	fetch: async function(
		input: string | URL | globalThis.Request,
		init?: RequestInit,
	): Promise<Response>{
		if(httpClient==null){
			let { buildTjs }=await import("./tjsbuilder");
			let {HttpClient}=await import('./httpprot')
			httpClient=new HttpClient();
			httpClient.setConnectorTjs((await buildTjs()).connect);
			httpClient.makeSsl=async (underlying,servername)=>new TlsStream(underlying,servername)
		}
		return httpClient.fetch(new Request(input,init))
	}
}