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

