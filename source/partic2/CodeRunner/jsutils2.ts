import { ArrayBufferConcat, ArrayWrap2, GenerateRandomString, Ref2, Task, assert, future, requirejs, throwIfAbortError } from "partic2/jsutils1/base";
import { getPersistentRegistered, importRemoteModule } from "partic2/pxprpcClient/registry";


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
				let t2=concated.length-mark.length
				for(;t2>=0;t2--){
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
        return null
    }
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
