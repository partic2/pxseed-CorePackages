import { ArrayBufferConcat, ArrayWrap2, GenerateRandomString, Ref2, Task, assert, future, requirejs, throwIfAbortError ,TaskLocalRef } from "partic2/jsutils1/base";
import { getPersistentRegistered, importRemoteModule } from "partic2/pxprpcClient/registry";


let __name__=requirejs.getLocalRequireModule(require);

export {TaskLocalRef};

let utf8decoder=new TextDecoder();
let utf8encoder=new TextEncoder();
export function utf8conv(s:string):Uint8Array;
export function utf8conv(u8:Uint8Array):string;
export function utf8conv(input:string|Uint8Array):Uint8Array|string{
    if(typeof input==='string'){
        return utf8encoder.encode(input);
    }else{
        return utf8decoder.decode(input);
    }
}

export function u8hexconv(s:string):Uint8Array;
export function u8hexconv(u8:Uint8Array):string;
export function u8hexconv(input:string|Uint8Array):Uint8Array|string{
	if(typeof input==='string'){
		let hex=input;
		hex=hex.replace(/[^0-9a-fA-F]/g,'');
		let bytes=new Uint8Array(hex.length>>1);
		for(let t1=0;t1<hex.length;t1+=2){
			bytes[t1>>1]=parseInt(hex.substring(t1,t1+2),16);
		}
		return bytes;
	}else{
		let b=input;
		let hex='';
		for(let t1 of b){
			let ch=t1.toString(16);
			hex+=ch.length==2?ch:'0'+ch;
		}
		return hex; 
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
	async readUntil(mark:Uint8Array|number):Promise<Uint8Array>{
		if(typeof mark==='number'){
			mark=new Uint8Array([mark]);
		}
		//Slow but simple
		let concated:Uint8Array|null=null;
		for(let t1=0;t1<0x7fffff;t1++){
			let chunk=await this.read();
			if(!chunk.done){
				if(concated==null){
					concated=chunk.value;
				}else{
					concated=new Uint8Array(ArrayBufferConcat([concated,chunk.value]));
				}
				let markMatched=false;
				let t2=0;
				let t3=concated.length-mark.length
				for(t2=0;t2<=t3;t2++){
					markMatched=true;
					for(let t3=0;t3<mark.length;t3++){
						if(concated[t2+t3]!==mark[t3]){
							markMatched=false;
							break;
						}
					}
					if(markMatched)break;
				}
				if(markMatched){
					if(t2+mark.length<concated.length){
						this.unshiftBuffer(new Uint8Array(
							concated.buffer,concated.byteOffset+t2+mark.length,concated.length-t2-mark.length));
					}
					return new Uint8Array(concated.buffer,concated.byteOffset,t2+mark.length);
				}
			}else{
				if(concated!=null)this.unshiftBuffer(concated);
				throw new Error('No mark found before EOF occured');
			}
		}
		throw new Error('Too much read try');
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
        throw new Error('stream closed')
    }
}


//also useful for string template
export type RecursiveIteratable<T>=Iterable<T|RecursiveIteratable<T>|Promise<T>>;
export async function FlattenArray<T>(source:RecursiveIteratable<T>){
    let parts=[] as T[];
    for(let t1 of source){
        if(t1 instanceof Promise){
            parts.push(await t1);
        }else if(t1==null){
        }else if(typeof(t1)==='object' && (Symbol.iterator in t1)){
            parts.push(...await FlattenArray(t1));
        }else{
            parts.push(t1);
        }
    }
    return parts;
}
//Promise will be ignored
export function FlattenArraySync<T>(source:RecursiveIteratable<T>){
    let parts=[] as T[];
    for(let t1 of source){
        if(t1 instanceof Promise){
        }else if(t1==null){
        }else if(typeof(t1)==='object' && (Symbol.iterator in t1)){
            parts.push(...FlattenArraySync(t1));
        }else{
            parts.push(t1);
        }
    }
    return parts;
}

export class Singleton<T> extends future<T>{
    constructor(public init:()=>Promise<T>){super()}
    i:T|null=null;
    async get(){
		if(!this.done){
			this.init().then((result)=>{
				this.setResult(result);
			},(err)=>{
				this.setException(err);
			})
		}
        return super.get();
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
			let task=Task.currentTask;
			let lastAsync=asyncStack.pop();
			if(lastAsync!=undefined){
				if(lastAsync.yielded){
					Task.currentTask=null;
				}else{
					lastAsync.yielded=true;
				}
			}
			try{return await p;}finally{
				Task.currentTask=task;
				if(lastAsync)asyncStack.push(lastAsync);
			}
		}
	}
}

setupAsyncHook();
