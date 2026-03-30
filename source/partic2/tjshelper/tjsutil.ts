/*jshint node:true */

import { ArrayBufferConcat, ArrayWrap2, DateDiff, GetCurrentTime, assert, future, logger, requirejs, throwIfAbortError } from "partic2/jsutils1/base";
import { Io, Serializer } from "pxprpc/base";
import {TjsTlsClient} from './tjsenv'
import type { HttpClient, WebSocketClientStreamHandler } from "./httpprot";




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


let polyfillHttpClient:HttpClient|null=null;

async function ensurePolyfillHttpClient(){
	if(polyfillHttpClient==null){
		let { buildTjs }=await import("./tjsbuilder");
		let {HttpClient}=await import('./httpprot')
		polyfillHttpClient=new HttpClient();
		polyfillHttpClient.setConnectorTjs((await buildTjs()).connect);
		polyfillHttpClient.makeSsl=async (underlying,servername)=>new TlsStream(underlying,servername)
	}
}

class WebSocketPolyfill extends EventTarget {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    CONNECTING = 0;
    OPEN = 1;
    CLOSING = 2;
    CLOSED = 3;
	url:string;
	onclose:((ev:CloseEvent)=>void)|null=null;
	onerror:((ev:Event)=>void)|null=null;
	onmessage:((ev:MessageEvent)=>void)|null=null;
	onopen:((ev:Event)=>void)|null=null;
	binaryType:'blob'|'arraybuffer'='blob'
	readyState:number=this.CONNECTING;
	bufferedAmount=0;
	protected __wsh:WebSocketClientStreamHandler|null=null;
	protected async __connect(){
		await ensurePolyfillHttpClient();
		try{
			this.__wsh=await polyfillHttpClient!.websocket(new Request(this.url));
			this.readyState=this.OPEN;
			this.dispatchEvent(new Event('open',{}));
			while(this.readyState===this.OPEN){
				let msg=await this.__wsh.receive()
				if(typeof msg==='string'){
					this.dispatchEvent(new MessageEvent('message',{data:msg}))
				}else if(this.binaryType==='arraybuffer'){
					if(msg.byteOffset===0 && msg.byteLength===msg.buffer.byteLength){
						this.dispatchEvent(new MessageEvent('message',{data:msg.buffer}))
					}else{
						this.dispatchEvent(new MessageEvent('message',{data:msg.buffer.slice(msg.byteOffset,msg.byteOffset+msg.byteLength)}))
					}
				}else{
					this.dispatchEvent(new MessageEvent('message',{data:new Blob([msg])}))
				}
			}
		}catch(err:any){
			this.readyState=this.CLOSING;
			if(this.__wsh!=null){
				if(!this.__wsh.closed.done){
					this.readyState=this.CLOSING;
					await this.__wsh.close();
				}
			}
			let ev=new Event('error');
			(ev as any).cause=err;
			this.dispatchEvent(ev)
		}finally{
			this.readyState=this.CLOSED;
		}
	}
    constructor(url:string, protocols?:string|string[]) {
        super();
        let urlStr;
        try {
			let t1=new URL(url);
            if(t1.protocol=='http:'){
				t1.protocol='ws:'
			}else if(t1.protocol=='https:'){
				t1.protocol='wss:'
			}
			urlStr=t1.toString();
        } catch (_) {}
        if (!urlStr) {
            throw new Error('Invalid URL');
        }
        this.url = urlStr;

		this.addEventListener('close',(ev)=>this.onclose?.(ev as any));
		this.addEventListener('error',(ev)=>this.onerror?.(ev as any));
		this.addEventListener('message',(ev)=>this.onmessage?.(ev as any));
		this.addEventListener('open',(ev)=>this.onopen?.(ev as any));

		new Promise<void>((resolve)=>resolve()).then(()=>this.__connect());
    }
    get extensions() {return '';}
    get protocol() {return '';}
    send(data:string|ArrayBuffer|ArrayBufferView|Blob|DataView) {
        if (typeof data === 'string') {
            this.__wsh!.send(data);
        } else if (data instanceof ArrayBuffer) {
			this.__wsh!.send(new Uint8Array(data));
        } else if (ArrayBuffer.isView(data)) {
			this.__wsh!.send(new Uint8Array(data.buffer,data.byteOffset,data.byteLength));
        } else if (data instanceof Blob) {
            data.arrayBuffer().then(buf => {
                this.__wsh!.send(new Uint8Array(buf));
            });
		}
    }
    close(code = 1000, reason = '') {
		this.readyState=this.CLOSING;
		this.__wsh?.close(code,reason);
    }
}

export let polyfill={
	fetch: async function(
		input: string | URL | globalThis.Request,
		init?: RequestInit,
	): Promise<Response>{
		await ensurePolyfillHttpClient()
		return polyfillHttpClient!.fetch(new Request(input,init))
	},
	WebSocket:WebSocketPolyfill as any
}