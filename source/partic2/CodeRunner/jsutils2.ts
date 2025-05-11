import { ArrayBufferConcat, ArrayWrap2, GenerateRandomString, Ref2, Task, assert, requirejs } from "partic2/jsutils1/base";


let __name__=requirejs.getLocalRequireModule(require);

export class TaskLocalRef<T> extends Ref2<T>{
    taskLocalVarName=__name__+'.var-'+GenerateRandomString();
    constructor(defaultVal:T){
        super(defaultVal);
        let loc=Task.locals();
        if(loc!=undefined){
            loc[this.taskLocalVarName]=defaultVal;
        }
    }
    public get(): T {
        let loc=Task.locals();
        if(loc!=undefined){
            return loc[this.taskLocalVarName]??this.__val;
        }else{
            return super.get();
        }
    }
    public set(val: T): void {
        let loc=Task.locals();
        if(loc!=undefined){
            loc[this.taskLocalVarName]=val;
        }else{
            this.__val=val;
        }
    }
}

export class ExtendStreamReader implements ReadableStreamDefaultReader<Uint8Array>{
	constructor(public wrapped:ReadableStreamDefaultReader<Uint8Array>){}
	protected readBuffers=new ArrayWrap2<Uint8Array|null>();
	async read(): Promise<ReadableStreamReadResult<Uint8Array>> {
		this.onReadRequest();
		let next=await this.readBuffers.queueBlockShift();
		if(next!=null){
			return {done:false,value:next};
		}else{
			return {done:true,value:next};
		}
	}
	protected async onReadRequest(){
		//XXX:retry on next tick?
		if(this.readBuffers.arr().length==0){
			let next=await this.wrapped.read();
			if(next.done && next.value==undefined){
				this.readBuffers.queueSignalPush(null);
			}else{
				this.readBuffers.queueSignalPush(next.value!);
			}
		}
	}
	//push buffer back, like 'ungetc'.
	unshiftBuffer(data:Uint8Array){
		if(this.readBuffers.arr().length===0){
			this.readBuffers.queueSignalPush(data);
		}else{
			this.readBuffers.arr().unshift(data);
		}
	}
	cancelWaiting(){
		this.readBuffers.cancelWaiting();
	}
	releaseLock(): void {
		this.wrapped.releaseLock();
	}
	closed: Promise<any>=this.wrapped.closed;
	cancel(reason?: any): Promise<void> {
		return this.wrapped.cancel(reason);
	}
	async readUntil(mark:Uint8Array|number){
		let datas=new Array<Uint8Array>();
		//Slow but simple
		if(mark instanceof Uint8Array){
			assert(mark.length>0);
			for(let t3=0;t3<0x7fff;t3++){
				let t4=await this.readUntil(mark.at(-1)!);
				let lastPart=datas.at(-1);
				if(lastPart!=undefined && lastPart.buffer===t4.buffer && lastPart.byteOffset+lastPart.byteLength===t4.byteOffset){
					datas[datas.length-1]=new Uint8Array(t4.buffer,lastPart.byteOffset,lastPart.byteLength+t4.byteLength);
				}else{
					datas.push(t4);
				}
				if(t4.length===0 || t4.at(-1)!==mark.at(-1)){
					break; //EOF
				}
				let allMatched=true;
				for(let t5=0;t5<mark.length;t5++){
					if(mark[t5]!==t4[t4.length-mark.length+t5]){
						allMatched=false;
						break;
					}
				}
				if(allMatched)break;
			}
		}else{
			for(let t1=0;t1<0x7fff;t1++){
				let t2=await this.read();
				if(t2.value!=undefined){
					let found=t2.value.indexOf(mark);
					if(found>=0){
						datas.push(new Uint8Array(t2.value.buffer,t2.value.byteOffset,found+1));
						if(found<t2.value.length){
							this.unshiftBuffer(new Uint8Array(
								t2.value.buffer,t2.value.byteOffset+found+1,
								t2.value.byteLength-found-1));
						}
						break;
					}else{
						datas.push(t2.value);
					}
				}else{
					//EOF
					break;
				}
			}
		}
		let concated=(datas.length===1)?datas[0]:new Uint8Array(ArrayBufferConcat(datas));
		return concated;
	}
    async readInto(buffer:Uint8Array,writePos?:Ref2<number>){
        let nextPart=await this.read();
        if(nextPart.value!=undefined){
            let writeAt=0;
            if(writePos!=undefined)writeAt=writePos.get();
            let readBytes=Math.min(buffer.byteLength-writeAt,nextPart.value.byteLength);
            if(readBytes<nextPart.value.byteLength){
                let remain=new Uint8Array(nextPart.value.buffer,nextPart.value.byteOffset+readBytes,nextPart.value.byteLength-readBytes);
                this.unshiftBuffer(remain);
            }
            buffer.set(new Uint8Array(nextPart.value.buffer,nextPart.value.byteOffset,readBytes),writeAt);
            if(writePos!=undefined)writePos.set(writeAt+readBytes);
            return readBytes;
        }
        return null
    }
}



export class Singleton<T>{
    constructor(public init:()=>Promise<T>){}
    i:T|null=null;
    async get(){
        if(this.i===null){
            this.i=await this.init()
        }
        return this.i;
    }
}

export function deepEqual(a:any, b:any) {
	if (a === b) return true;
	
	if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
	  return false;
	}
	
	const keysA = Object.keys(a);
	const keysB = Object.keys(b);
	
	if (keysA.length !== keysB.length) return false;
	
	for (const key of keysA) {
	  if (!keysB.includes(key) || !deepEqual(a[key], b[key])) {
		return false;
	  }
	}
	
	return true;
}



export function setupAsyncHook(){
	if(!('__onAwait' in Promise)){
		let asyncStack:{yielded:boolean}[]=[];
		(Promise as any).__onAsyncEnter=()=>{
			asyncStack.push({yielded:false});
		}
		(Promise as any).__onAsyncExit=async ()=>{
			let last=asyncStack.pop();
			if(last?.yielded){Task.currentTask=null;}
		}
		(Promise as any).__onAwait=async (p:PromiseLike<any>)=>{
			Task.getAbortSignal()?.throwIfAborted();
			let saved={
				task:Task.currentTask,
				lastAsync:asyncStack.pop()
			}
			if(saved.lastAsync!=undefined){
				if(saved.lastAsync.yielded){
					Task.currentTask=null;
				}else{
					saved.lastAsync.yielded=true;
				}
			}
			try{return await p;}finally{
				Task.currentTask=saved.task;
				if(saved.lastAsync)asyncStack.push(saved.lastAsync);
			}
		}
	}
}

setupAsyncHook();

const decode=TextDecoder.prototype.decode.bind(new TextDecoder());
const encode=TextEncoder.prototype.encode.bind(new TextEncoder());

export class HttpServer{
	static headerExp = /^([^: \t]+):[ \t]*((?:.*[^ \t])|)/;
	static requestExp = /^([A-Z-]+) ([^ ]+) HTTP\/[^ \t]+$/;
	onfetch:(this:HttpServer,request:Request)=>Promise<Response>=async ()=>new Response();
	controller=new AbortController();
	signal=this.controller.signal;
	async serve(stream:[ExtendStreamReader,WritableStreamDefaultWriter<Uint8Array>]){
		while(!this.signal.aborted){
			let req=await this.pParseHttpRequest(stream[0]);
			let resp=await this.onfetch(req);
			await this.pWriteResponse(stream[1],resp);
		}
	}
	async pParseHttpHeader(r:ExtendStreamReader){
		const lineSpliter='\n'.charCodeAt(0);
		let reqHdr=decode(await r.readUntil(lineSpliter));
		let matchResult=reqHdr.match(HttpServer.requestExp);
		assert(matchResult!=null);
		let method=matchResult[1];
		let pathname=matchResult[2];
		let httpVersion=matchResult[3];
		let headers=new Headers();
		for(let t1=0;t1<64*1024;t1++){
			let line=decode(await r!.readUntil(lineSpliter));
			if(line=='\r\n')break;
			let matched=line.match(HttpServer.headerExp);
			assert(matched!=null)
			headers.set(matched[1],matched[2]);
		}
		return {method,pathname,httpVersion,headers}
	}
	async pParseHttpRequest(r:ExtendStreamReader){
		let header1=await this.pParseHttpHeader(r);
		let bodySource
		if(header1.headers.get('transfer-encoding')==='chunked'){
			bodySource={
				pull:async (controller:ReadableStreamDefaultController<Uint8Array>)=>{
					let length=Number(decode(await r.readUntil('\n'.charCodeAt(0))).trim());
					if(length==0){
						let eoc=new Uint8Array(2);
						await r.readInto(eoc);
						assert(decode(eoc)=='\r\n');
						controller.close();
					}else{
						let buf=new Uint8Array(length);
						let writePos=new Ref2<number>(0);
						while(writePos.get()<length){
							await r.readInto(buf,writePos);
						}
						let eoc=new Uint8Array(2);
						await r.readInto(eoc);
						assert(decode(eoc)=='\r\n');
						controller.enqueue(buf);
					}
				}
			}
		}else if(header1.headers.has('content-length')){
			bodySource={
				pull:async (controller:ReadableStreamDefaultController<Uint8Array>)=>{
					let contentLength=Number(header1.headers.get('content-length')!.trim());
					let buf=new Uint8Array(contentLength);
					let writePos=new Ref2<number>(0);
					while(writePos.get()<length){
						await r.readInto(buf,writePos);
					}
					controller.enqueue(buf);
					controller.close();
				}
			}
		}else{
			bodySource={
				pull:async (controller:ReadableStreamDefaultController<Uint8Array>)=>{
					controller.close();
				}
			}
		}
		bodySource satisfies UnderlyingDefaultSource<Uint8Array>;
		let url=header1.pathname;
		if(!url.startsWith('http:')){
			url='http://';
			if(header1.headers.has('host')){
				url+=header1.headers.get('host')
			}else{
				url+='0.0.0.0:0';
			}
			url+=header1.pathname;
		}
		let req=new Request(url,{
			method:header1.method,
			body:['GET','HEAD'].includes(header1.method.toUpperCase())?undefined
				:new ReadableStream(bodySource),
			headers:header1.headers
		});
		return req;
	}
	async pWriteResponse(w:WritableStreamDefaultWriter<Uint8Array>,resp:Response){
		let headersString=new Array<string>();
		let chunked=resp.headers.get('transfer-encoding')=='chunked'
		resp.headers.forEach((val,key)=>{
			headersString.push(`${key}: ${val}`);
		});
		let nonChunkBody:ArrayBuffer|null=null;
		if(!chunked){
			nonChunkBody=await resp.arrayBuffer();
			headersString.push('Content-Length:' +String(nonChunkBody.byteLength));
		}
		await w.write(encode(
			[
				`HTTP/1.1 ${resp.status} ${resp.statusText}`,
				...headersString,
				'\r\n'
			].join('\r\n'))
		);
		if(resp.body!=undefined){
			if(chunked){
				await resp.body.pipeTo(new WritableStream({
					write:async (chunk: Uint8Array, controller: WritableStreamDefaultController)=>{
						await w.write(encode(String(chunk.length)+'\r\n'));
						await w.write(chunk);
					}
				}));
				await w.write(encode('0\r\n\r\n'));
			}else{
				await w.write(new Uint8Array(nonChunkBody!));			}
		}
	}
}