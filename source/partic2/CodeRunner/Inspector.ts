import { text2html } from "partic2/pComponentUi/utils";
import type { ConsoleDataEvent, RunCodeContext } from "./CodeContext";
import { ArrayBufferToBase64, ArrayWrap2, Base64ToArrayBuffer, GenerateRandomString, future, mutex, sleep } from "partic2/jsutils1/base";


export class DelayOnceCall{
    protected callId:number=1;
    protected result=new future();
    protected mut=new mutex();
    constructor(public fn:()=>Promise<void>,public delayMs:number){}
    async call(){
        if(this.callId==-1){
            //waiting fn return
            return await this.result.get();
        }
        this.callId++;
        let thisCallId=this.callId;
        await sleep(this.delayMs);
        if(thisCallId==this.callId){
        try{
            this.callId=-1;
            let r=await this.fn();
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
}

let DefaultSerializingOption={
    maxDepth:6,
    maxKeyCount:100,
    enumerateMode:'for in' as 'for in'|'Object.getOwnPropertyNames'|undefined
}

export let serializingEscapeMark='__Zag7QaCUiZb1ABgL__';

function forInListProps(obj:any){
    let t1=[]
    for(let t2 in obj){
        t1.push(t2);
    }
    return t1;
}
//The return value should be JSON-serializable.
//using serializingEscapeMark to represent non-JSON-serializable object.
export function toSerializableObject(v:any,opt:typeof DefaultSerializingOption):any{
    let listProps=forInListProps;
    let TypedArray=Object.getPrototypeOf(Object.getPrototypeOf(new Uint8Array())).constructor;
    if(opt.enumerateMode=='Object.getOwnPropertyNames'){
        listProps=Object.getOwnPropertyNames
    }
    if(v===null)return null;
    if(typeof(v)!=='object'){
        if(typeof(v)==='function'){
            return {[serializingEscapeMark]:'function',name:v.name};
        }else if(v===undefined){
            return {[serializingEscapeMark]:'undefined'}
        }else{
            return v
        }
    }else if(opt.maxDepth==0){
        let isArray=v instanceof Array;
        let keyCount=isArray?v.length:listProps(v).length;
        return {[serializingEscapeMark]:'unidentified',isArray,keyCount}
    }else{
        if(v instanceof Array){
            if(v.length>opt.maxKeyCount){
                return {[serializingEscapeMark]:'unidentified',isArray:true,keyCount:v.length};
            }else{
                return v.map(v2=>toSerializableObject(v2,{...opt,maxDepth:opt.maxDepth-1}));
            }
        }else if(v[serializingEscapeMark]!=undefined){
            let v2={...v};
            delete v2[serializingEscapeMark];
            return {[serializingEscapeMark]:'unescape',value:toSerializableObject(v2,opt),
                markValue:toSerializableObject(v[serializingEscapeMark],{...opt,maxDepth:opt.maxDepth-1})};
        }else if(v instanceof Date){
            return {[serializingEscapeMark]:'date',time:v.getTime()};
        }else if(v instanceof TypedArray){
            let typename=v.constructor.name
            if(typename=='Buffer'){
                //For node
                typename='Uint8Array'
            }
            return {[serializingEscapeMark]:typename,
                value:ArrayBufferToBase64(new Uint8Array(v.buffer,v.byteOffset,v.length*v.BYTES_PER_ELEMENT))
            }
        }else if(v instanceof ArrayBuffer){
            return {[serializingEscapeMark]:'ArrayBuffer',
                value:ArrayBufferToBase64(v)
            }
        }else if(v instanceof RemoteReference){
            return {[serializingEscapeMark]:'RemoteReference',accessPath:v.accessPath}
        }else if(Symbol.iterator in v || Symbol.asyncIterator in v){
            return {[serializingEscapeMark]:'unidentified',isArray:true,keyCount:-1};
        }else{
            let r={} as Record<string,any>;
            let keys=listProps(v);
            if(keys.length>opt.maxKeyCount){
                return {[serializingEscapeMark]:'unidentified',isArray:false,keyCount:keys.length}
            }else{
                for(let k1 of keys){
                    try{
                        r[k1]=toSerializableObject(v[k1],{...opt,maxDepth:opt.maxDepth-1});
                    }catch(e:any){
                        r[k1]={
                            [serializingEscapeMark]:'error',
                            message:e.toString()
                        };
                    }
                }
                return r;
            }
        }
    }
}

interface RemoteObjectFetcher{
    fetch(accessPath:(string|number)[],opt:Partial<
        typeof DefaultSerializingOption
    >):Promise<any>;
    iterator(accessPath:(string|number)[],iteratorName:string):Promise<void>;
    iteratorFetch(iteratorName:string,count:number,opt: Partial<
        typeof DefaultSerializingOption
    >):Promise<any[]>;
    //free variable like iteratorName
    deleteName(name:string):Promise<void>;
}



export class CodeContextRemoteObjectFetcher implements RemoteObjectFetcher{
    constructor(public codeContext:RunCodeContext){}
    async fetch(accessPath: (string|number)[], opt: Partial<
        typeof DefaultSerializingOption
    >){
        let accessChain=accessPath.map(v=>typeof(v)==='string'?`['${v}']`:`[${v}]`).join('')
        let resp=await this.codeContext!.jsExec(`
            return JSON.stringify(
                lib.toSerializableObject(
                    codeContext.localScope${accessChain},
                    ${JSON.stringify(opt)}
                ))`);
        return JSON.parse(resp);
    }
    async iterator(accessPath:(string|number)[],iteratorName:string): Promise<void> {
        let accessChain=accessPath.map(v=>typeof(v)==='string'?`['${v}']`:`[${v}]`).join('')
        let result=await this.codeContext!.jsExec(`if(Symbol.iterator in codeContext.localScope${accessChain}){
            codeContext.localScope.${iteratorName}=codeContext.localScope${accessChain}[Symbol.iterator]()
        }else if(Symbol.asyncIterator in codeContext){
            codeContext.localScope.${iteratorName}=codeContext.localScope${accessChain}[Symbol.asyncIterator]()
        }else{
            return 'Not iteratable'
        }
        return 'ok';
        `) as string;
        if(result!='ok'){
            throw new Error(result);
        }
    }
    async iteratorFetch(iteratorName:string,count:number,opt: Partial<
        typeof DefaultSerializingOption
    >):Promise<any[]>{
        let resp=await this.codeContext!.jsExec(`
            return JSON.stringify(lib.toSerializableObject(
                    await lib.iteratorNext(
                    codeContext.localScope.${iteratorName},${count}),
                    ${JSON.stringify(opt)}))`);
        return JSON.parse(resp);
    }
    async deleteName(name: string): Promise<void> {
        await this.codeContext!.jsExec(`
            delete codeContext.localScope.${name}`)
    }
}


export class UnidentifiedObject{
    //keyCount=-1 for non array iteratable.
    keyCount:number=0;
    fetcher?:RemoteObjectFetcher;
    accessPath:(number|string)[]=[];
    constructor(){
    }
    async identify(opt:Partial<typeof DefaultSerializingOption>){
        opt={...DefaultSerializingOption,...opt};
        let resp:any;
        if(this.keyCount==-1){
            let iterName='__result_'+GenerateRandomString();
            await this.fetcher!.iterator(this.accessPath,iterName);
            try{
                resp=await this.fetcher!.iteratorFetch(iterName,0x7fffffff,{...opt,maxKeyCount:0x7fffffff});
            }finally{
                await this.fetcher?.deleteName(iterName);
            }
        }else{
            resp=await this.fetcher?.fetch(this.accessPath,{...opt})
        }
        return fromSerializableObject(resp,{fetcher:this.fetcher,accessPath:this.accessPath});
    }
    toJSON(key?:string){
        return {
            [serializingEscapeMark]:'unidentified',isArray:false,keyCount:this.keyCount
        }
    }
}
export class UnidentifiedArray extends UnidentifiedObject{
    iterTimeout=600000;
    [Symbol.asyncIterator](){
        let that=this;
        return (async function*(){
            let iterName='__result_'+GenerateRandomString();
            await that.fetcher!.iterator(that.accessPath,iterName);
            let iterBuffer=[];
            closed=false;
            let expiredWatcher=new DelayOnceCall(async()=>{
                if(!closed){
                    closed=true;
                    that.fetcher!.deleteName(iterName);
                }
                closed=true;
            },that.iterTimeout);
            while(closed){
                expiredWatcher.call()
                if(iterBuffer.length==0){
                    iterBuffer.push(...await that.fetcher!.iteratorFetch(iterName,20,{}))
                }
                if(iterBuffer.length==0)break;
                yield iterBuffer.shift();
            }
            closed=true;
            await that.fetcher!.deleteName(iterName);
        })()
    }
    toJSON(key?:string){
        let objectJson=super.toJSON(key);
        objectJson.isArray=true;
        return objectJson;
    }
}
//Usually used in client to make dereference on server side, by 'fromSerializableObject'.
export class RemoteReference{
    constructor(public accessPath:(number|string)[]){};
}


export class MiscObject{
    //"serializingError" represent the error throw during serializing, Not the real JS Error object.
    type:'serializingError'|'function'|''='';
    accessPath:(number|string)[]=[];
    fetcher?:RemoteObjectFetcher;
    errorMessage?:string;
    functionName?:string;
    toJSON(key?:string){
        if(this.type==='serializingError'){
            return {[serializingEscapeMark]:'error',message:this.errorMessage}
        }else if(this.type==='function'){
            return {[serializingEscapeMark]:'function',name:this.functionName}
        }
        return '--- unknown object ---';
    }
}
export function fromSerializableObject(v:any,opt:{
    fetcher?:RemoteObjectFetcher,
    accessPath?:(string|number)[],
    referenceGlobal?:any    // For 'RemoteReference' instance.
}):any{
    if(opt.accessPath==undefined)opt.accessPath=[];
    if((typeof(v)!=='object')||(v===null)){
        return v;
    }else{
        if(v instanceof Array){
            return v.map((v2,i2)=>fromSerializableObject(v2,{...opt,accessPath:[...opt.accessPath!,i2]}))
        }else if(v[serializingEscapeMark]!=undefined){
            let type1=v[serializingEscapeMark];
            switch(type1){
                case 'unidentified':{
                    let {isArray,keyCount}=v;
                    let t1:UnidentifiedObject;
                    if(isArray){
                        t1=new UnidentifiedArray();
                    }else{
                        t1=new UnidentifiedObject();
                    }
                    t1.fetcher=opt.fetcher;
                    t1.keyCount=keyCount;
                    t1.accessPath=opt.accessPath;
                    return t1;
                };
                case 'date':{
                    return new Date(v.time);
                };
                case 'unescape':{
                    let t1=fromSerializableObject(v.value,opt);
                    t1[serializingEscapeMark]=fromSerializableObject(v.markValue,
                        {...opt,accessPath:[...opt.accessPath!,serializingEscapeMark]});
                    return t1;
                };
                case 'function':{
                    let t1=new MiscObject();
                    t1.type='function';
                    t1.accessPath=opt.accessPath;
                    t1.fetcher=opt.fetcher;
                    t1.functionName=v.name;
                    return t1;
                };
                case 'error':{
                    let t1=new MiscObject();
                    t1.type='serializingError';
                    t1.accessPath=opt.accessPath;
                    t1.fetcher=opt.fetcher;
                    t1.errorMessage=v.message;
                    return t1;
                };
                case 'undefined':{
                    return undefined;
                };
                case 'Uint8Array':
                case 'Int8Array':
                case 'Uint16Array':
                case 'Int16Array':
                case 'Uint32Array':
                case 'Int32Array':{
                    let buffer=Base64ToArrayBuffer(v.value);
                    let typedArr=(globalThis as any)[type1];
                    return new typedArr(buffer,0,buffer.byteLength/typedArr.BYTES_PER_ELEMENT);
                };
                case 'ArrayBuffer':{
                    return Base64ToArrayBuffer(v.value);
                };
                case 'RemoteReference':{
                    let t1=opt.referenceGlobal;
                    if(t1==undefined){
                        return new RemoteReference(v.accessPath);
                    }else{
                        for(let k1 of v.accessPath as (string|number)[]){
                            if(t1==undefined)break;
                            t1=t1[k1];
                        }
                        return t1;
                    }
                }
            }
        }else{
            let r1={} as any;
            for(let k1 in v){
                r1[k1]=fromSerializableObject(v[k1],{...opt,accessPath:[...opt.accessPath!,k1]})
            }
            return r1;
        }
    }
}

export async function inspectCodeContextVariable(fetcher:RemoteObjectFetcher,
    accessPath:(string|number)[],opt?:Partial<typeof DefaultSerializingOption>):Promise<any>{
    opt={...DefaultSerializingOption,...opt};
    let t1=new UnidentifiedObject();
    t1.accessPath=accessPath;
    t1.fetcher=fetcher;
    return await t1.identify(opt);
}
