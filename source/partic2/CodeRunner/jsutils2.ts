import { ArrayBufferConcat, ArrayWrap2, Ref2, Task,  future, requirejs ,TaskLocalRef, mutex, sleep, GetCurrentTime} from "partic2/jsutils1/base";


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
		let concated:Uint8Array|null=null;
		let t1=0;
		for(let readTryCount=0;readTryCount<0x10000000;readTryCount++){
			let chunk=await this.read();
			if(!chunk.done){
				if(concated==null){
					concated=chunk.value;
				}else{
					//slow but simple
					concated=new Uint8Array(ArrayBufferConcat([concated,chunk.value]));
				}
				let markMatched=false;
				let t2=0;
				let t3=concated.length-mark.length
				for(t2=t1;t2<=t3;t2++){
					t2=concated.indexOf(mark[0],t2);
					if(t2<0)break;
					markMatched=true;
					for(let t4=1;t4<mark.length;t4++){
						if(concated[t2+t4]!==mark[t4]){
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
				}else{
					t1=t3+1;
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
	async readForNBytes(count:number){
		let b=new Uint8Array(count);
		let pos=new Ref2<number>(0);
		for(let t1=0;t1<0x7fffff;t1++){
			await this.readInto(b,pos);
			if(pos.get()==b.byteLength)break;
		}
		return b;
	}
	async readAll(){
		let chunks=new Array<Uint8Array>();
		for(let t1=0;t1<0x7fffff;t1++){
			let chunk=await this.read();
			if(!chunk.done){
				chunks.push(chunk.value);
			}else{
				break;
			}
		}
		return new Uint8Array(ArrayBufferConcat(chunks));
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
    constructor(protected init:()=>Promise<T>){super()}
	protected initing=false;
    async get(){
		if(!this.done && !this.initing){
			this.initing=true;
			this.init().then((result)=>{
				this.setResult(result);
				this.initing=false;
			},(err)=>{
				this.setException(err);
				this.initing=false;
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

export class DebounceCall<T extends (...args: any) => any>{
    protected callId:number=1;
    protected result=new future<ReturnType<T>|undefined>();
    protected mut=new mutex();
	protected canceled=false;
    constructor(public fn:T,public delayMs:number){}
    async call(...args:Parameters<T>):Promise<undefined|ReturnType<T>>{
        if(this.callId==-1){
            //waiting fn return
            return await this.result.get();
        }
        this.callId++;
        let thisCallId=this.callId;
        await sleep(this.delayMs);
		if(this.canceled)return
        if(thisCallId==this.callId){
        try{
            this.callId=-1;
            let r=await this.fn(...args);
            this.result.setResult(r);
        }catch(e){
            this.result.setException(e);
        }finally{
            this.callId=1;
            let r2=this.result;
            this.result=new future();
            return r2.get();
        }}else{
            return await this.result.get();
        }
    }
	cancel(){
		this.result.setResult(undefined);
		this.callId=1;
		this.result=new future();
	}
}

export class ThrottleCall<T extends (...args: any) => any>{
	constructor(public fn:T,public minIntervalMs:number){}
	protected lastCallTime:number=0;
	protected nextCallArgs:Parameters<T>|null=null;
	protected result:future<ReturnType<T>>|null=null;
	async call(...args:Parameters<T>):Promise<undefined|ReturnType<T>>{
		this.nextCallArgs=args;
		if(this.result!=null){
			return await this.result.get();
		}
		this.result=new future();
		let res=this.result;
		let now=GetCurrentTime().getTime();
		if(now<this.lastCallTime+this.minIntervalMs){
			await sleep(this.lastCallTime+this.minIntervalMs-now);
		}
		try{
			let r=await this.fn(...this.nextCallArgs);
			res.setResult(r);
		}catch(e){
			res.setException(e);
		}finally{
			now=GetCurrentTime().getTime();
			this.lastCallTime=now;
			this.nextCallArgs=null;
			this.result=null;
		}
		return await res.get();
    }
}

export function setupAsyncHook(){
	if(!('__onAwait' in Promise)){
		let asyncStackDepth=0;
		let depth0Task:Task<any>|null=null;
		(Promise as any).__onAsyncEnter=()=>{
			if(asyncStackDepth===0)depth0Task=Task.currentTask
			asyncStackDepth++;
		}
		(Promise as any).__onAsyncExit=()=>{
			asyncStackDepth--;
			if(asyncStackDepth===0){Task.currentTask=depth0Task;}
		}
		//Only call ONCE for each 'await'
		(Promise as any).__onAwait=async (p:PromiseLike<any>)=>{
			Task.getAbortSignal()?.throwIfAborted();
			let task=Task.currentTask;
			asyncStackDepth--;
			if(asyncStackDepth===0){Task.currentTask=depth0Task;}
			try{return await p;}finally{
				if(asyncStackDepth===0)depth0Task=Task.currentTask
				asyncStackDepth++;
				Task.currentTask=task;
			}
		}
	}
}

interface ArrayWrap3IteratorCallbackInput<T>{
	value:T,
	index:number,
	break2:()=>void,
	iterating:boolean
}
export class ArrayWrap3<T> extends ArrayWrap2<T>{
	async forEach2(cb:(input:ArrayWrap3IteratorCallbackInput<T>)=>(Promise<void>|void)){
		let arr=this.arr();
		let input={index:0,break2(){this.iterating=false},iterating:true} as ArrayWrap3IteratorCallbackInput<T>;
		for(let t1=0;t1<arr.length && input.iterating;t1++){
			input.index=t1;
			input.value=arr[t1];
			await cb(input)
		}
	}
	async map<T2>(cb:(value:T,index:number,arr:this)=>(Promise<T2>|T2)):Promise<ArrayWrap3<T2>>{
		let arr=this.arr();
		let r=new Array<T2>();
		for(let t1=0;t1<arr.length;t1++){
			r.push(await cb(arr[t1],t1,this));
		}
		return new (this.constructor as any)(r);
	}
	async forEach(cb:(value:T,index:number,arr:this)=>(Promise<void>|void)){
		this.forEach2(async ({value,index})=>{
			await cb(value,index,this);
		})
	}
	async filter(cb:(value:T,index:number,arr:this)=>(Promise<boolean>|boolean)):Promise<ArrayWrap3<T>>{
		let result=await this.findElements2(({value,index})=>cb(value,index,this))
		return new (this.constructor as any)(result.found);
	}
	async reduce<U>(cb: (prev: U, curr: T, idx: number, arr: this) => Promise<U>|U, initialValue: U): Promise<U>{
		let r=initialValue;
		await this.forEach2(async ({value,index})=>{
			r=await cb(r,value,index,this);
		});
		return r;
	}
	async findIndexs(condition:(input:ArrayWrap3IteratorCallbackInput<T>,found:Array<number>)=>(Promise<boolean>|boolean)){
		let found=new Array<number>();
		this.forEach2(async (i)=>{
			let b=await condition(i,found);
			if(b && i.iterating){found.push(i.index);}
		})
		return found;
	}
	//indexs must be unique
	deleteByIndexs(indexs:Array<number>){
		let indexs2=[...indexs].sort();
		let arr=this.arr();
		indexs2.forEach((v,i)=>{arr.splice(v-i,1);})
	}
	insertBefore(indexs:Array<number>,e:T){
		let indexs2=[...indexs].sort();
		let arr=this.arr();
		indexs2.forEach((v,i)=>{arr.splice(v+i,0,e);})
	}
	insertAfter(indexs:Array<number>,e:T){
		let indexs2=[...indexs].sort();
		let arr=this.arr();
		indexs2.forEach((v,i)=>{arr.splice(v+i+1,0,e);})
	}
	pickByIndexs(indexs:Array<number>){
		let arr=this.arr();
		return indexs.map((v)=>arr[v])
	}
	async findElements2(condition:(input:ArrayWrap3IteratorCallbackInput<T>)=>(Promise<boolean>|boolean),opt?:{maxCount?:number}){
		let indexs=await this.findIndexs(async (c,f)=>{
			if(opt?.maxCount!=undefined && f.length>=opt.maxCount){
				c.break2();
				return false;
			}
			return condition(c);
		});
		return {
			indexs,
			found:this.pickByIndexs(indexs),
			delete:()=>this.deleteByIndexs(indexs),
			insertBefore:(e:T)=>this.insertBefore(indexs,e),
			insertAfter:(e:T)=>this.insertAfter(indexs,e),
		}
	}
	async groupBy2(cb:(input:ArrayWrap3IteratorCallbackInput<T>)=>(Promise<string>|string)):Promise<Record<string,ArrayWrap3<T>>>{
		let r:Record<string,ArrayWrap3<T>>={};
		this.forEach2(async (input)=>{
			let id=await cb(input);
			if(input.iterating){
				if(r[id]==undefined){
					r[id]=new (this.constructor as any)([]);
				}
				r[id].arr().push(input.value);
			}
		});
		return r;
	}
}

export class CFuncCallProbe{
	name?:string
	beforeFunctionEnter=new Set<(argv:any[],probe:CFuncCallProbe,hookedThis:any)=>void>();
	constructor(public originalFunction:Function){}
	hooked(){
		let that=this;
		return function(this:any,...argv:any[]){
			for(let t1 of that.beforeFunctionEnter){
				try{t1(argv,that as any,this);}catch(err){};
			}
			return that.originalFunction.apply(this,argv);
		};
	}
}
let funcProbeProp=Symbol('funcProbeProp');
export function ensureFunctionProbe<T>(o:T,p:keyof T):CFuncCallProbe{
	let func=o[p] as any;
	let p2:any;
	if(funcProbeProp in func){
		p2=func[funcProbeProp];
		if(p2.funcCallProbe==undefined){
			p2.funcCallProbe=new CFuncCallProbe(func);
			p2.funcCallProbe.name=p.toString();
			o[p]=p2.funcCallProbe.hooked() as any;
			(o[p] as any)[funcProbeProp]=p2;
		}
	}else{
		p2={
			funcCallProbe:new CFuncCallProbe(func)
		}
		p2.funcCallProbe!.name=p.toString();
		func[funcProbeProp]=p2;
		o[p]=p2.funcCallProbe!.hooked() as any;
		(o[p] as any)[funcProbeProp]=p2;
	}
	return p2.funcCallProbe!
}

export let OnConsoleData=new Set<(logLevel:'log'|'debug'|'info'|'warn'|'error',argv:any[])=>void>();

ensureFunctionProbe(console,'log').beforeFunctionEnter.add((argv)=>OnConsoleData.forEach(t1=>t1('log',argv)));
ensureFunctionProbe(console,'debug').beforeFunctionEnter.add((argv)=>OnConsoleData.forEach(t1=>t1('debug',argv)));
ensureFunctionProbe(console,'info').beforeFunctionEnter.add((argv)=>OnConsoleData.forEach(t1=>t1('info',argv)));
ensureFunctionProbe(console,'warn').beforeFunctionEnter.add((argv)=>OnConsoleData.forEach(t1=>t1('warn',argv)));
ensureFunctionProbe(console,'error').beforeFunctionEnter.add((argv)=>OnConsoleData.forEach(t1=>t1('error',argv)));

setupAsyncHook();
