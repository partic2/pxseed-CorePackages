import { text2html } from "partic2/pComponentUi/utils";
import type { LocalRunCodeContext, RunCodeContext } from "./CodeContext";
import { ArrayBufferToBase64, ArrayWrap2, Base64ToArrayBuffer, GenerateRandomString, future, mutex, requirejs, sleep, throwIfAbortError } from "partic2/jsutils1/base";
import { SimpleFileSystem, installedRequirejsResourceProvider } from "./JsEnviron";
import { getWWWRoot } from "partic2/jsutils1/webutils";

const __name__=requirejs.getLocalRequireModule(require);

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
    enumerateMode:'for in' as 'for in'|'Object.getOwnPropertyNames'
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
export function toSerializableObject(v:any,opt:Partial<typeof DefaultSerializingOption>):any{
    let listProps=forInListProps;
    let TypedArray=Object.getPrototypeOf(Object.getPrototypeOf(new Uint8Array())).constructor;
    opt={...DefaultSerializingOption,...opt};
    if(opt.enumerateMode=='Object.getOwnPropertyNames'){
        listProps=Object.getOwnPropertyNames
    }
    if(v===null)return null;
    if(typeof(v)!=='object'){
        if(typeof(v)==='function'){
            return {[serializingEscapeMark]:'function',name:v.name};
        }else if(v===undefined){
            return {[serializingEscapeMark]:'undefined'}
        }else if(typeof v==='bigint'){
            return {[serializingEscapeMark]:'bigint',value:v.toString()}
        }else{
            return v
        }
    }else if(opt.maxDepth==0){
        let isArray=v instanceof Array;
        let keyCount=isArray?v.length:listProps(v).length;
        return {[serializingEscapeMark]:'unidentified',isArray,keyCount}
    }else{
        if(v instanceof Array){
            if(v.length>opt.maxKeyCount!){
                return {[serializingEscapeMark]:'unidentified',isArray:true,keyCount:v.length};
            }else{
                return v.map(v2=>toSerializableObject(v2,{...opt,maxDepth:opt.maxDepth!-1}));
            }
        }else if(v[serializingEscapeMark]!=undefined){
            let v2={...v};
            delete v2[serializingEscapeMark];
            return {[serializingEscapeMark]:'unescape',value:toSerializableObject(v2,opt),
                markValue:toSerializableObject(v[serializingEscapeMark],{...opt,maxDepth:opt.maxDepth!-1})};
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
        }else{
            let r={} as Record<string,any>;
            let keys=listProps(v);
            if(keys.length>opt.maxKeyCount!){
                return {[serializingEscapeMark]:'unidentified',isArray:false,keyCount:keys.length}
            }else{
                for(let k1 of keys){
                    try{
                        r[k1]=toSerializableObject(v[k1],{...opt,maxDepth:opt.maxDepth!-1});
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
        resp=await this.fetcher?.fetch(this.accessPath,{...opt})
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
                };
                case 'bigint':{
                    return BigInt(v.value)
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

export async function importNameCompletion(partialName:string){
    const removeLeadingSlash=(path:string)=>{
        if(path.startsWith('/')){
            return path.substring(1);
        }else{
            return path;
        }
    }
    let candidate=new Set<string>();
    let defined=await requirejs.getDefined()
    for(let t1 in defined){
        if(t1.startsWith(partialName)){
            let t2=partialName.length;
            let nextPart=t1.indexOf('/',t2);
            if(nextPart>=0){
                candidate.add(t1.substring(0,nextPart));
            }else{
                candidate.add(t1);
            }
        }
    }
    for(let customProvider of installedRequirejsResourceProvider){
        let lastDirIndex=partialName.lastIndexOf('/');
        let lastdir='';
        if(lastDirIndex>=0){
            lastdir=partialName.substring(0,lastDirIndex);
        }
        try{
            let children=await customProvider.fs.listdir(customProvider.rootPath+'/'+lastdir);
            let nameFilter=removeLeadingSlash(partialName.substring(lastdir.length));
            for(let t1 of children){
                if(t1.name.startsWith(nameFilter)){
                    if(t1.type=='file' && t1.name.endsWith('.js')){
                        let modPath=removeLeadingSlash(
                            lastdir+'/'+t1.name.substring(0,t1.name.length-3))
                        candidate.add(modPath);
                    }else if(t1.type=='dir'){
                        let modPath=removeLeadingSlash(lastdir+'/'+t1.name);
                        candidate.add(modPath);
                    }
                }
            }
        }catch(e){};
    }
    //If in node environment
    if(globalThis.process!=undefined&&globalThis.process.versions!=undefined&&globalThis.process.versions.node!=undefined){
        let fs=await import('fs/promises');
        let path=await import('path');
        let moduleDir=getWWWRoot();
        let lastDirIndex=partialName.lastIndexOf('/');
        let lastdir='';
        if(lastDirIndex>=0){
            lastdir=partialName.substring(0,lastDirIndex);
        }
        try{
            let children=await fs.readdir(path.join(moduleDir,lastdir),{withFileTypes:true});
            for(let t1 of children){
                let nameFilter=removeLeadingSlash(partialName.substring(lastdir.length));
                if(t1.name.startsWith(nameFilter)){
                    if(!t1.isDirectory() && t1.name.endsWith('.js')){
                        candidate.add(removeLeadingSlash(
                            lastdir+'/'+t1.name.substring(0,t1.name.length-3)));
                    }else if(t1.isDirectory()){
                        candidate.add(removeLeadingSlash(
                            lastdir+'/'+t1.name));
                    }
                }
            }
        }catch(e){};
    }
    return Array.from(candidate);
}

export async function filepathCompletion(partialPath:string,codeContext:LocalRunCodeContext,current?:string){
    let sfs=codeContext.localScope.fs.simple as SimpleFileSystem;
    let pathPart=partialPath.split(/[\\\/]/);
    let dirPart=pathPart.slice(0,pathPart.length-1);
    let partialName=pathPart.at(-1)??'';
    if(current!=undefined && dirPart.length>0 && dirPart[0]=='.'){
        dirPart=[...current.split(/[\\\/]/),...dirPart.slice(1)];
    }
    try{
        let children=await sfs.listdir(dirPart.join('/'));
        return {
            at:partialPath.length-partialName.length,
            children:children.filter(child=>child.name.startsWith(partialName))
        };
    }catch(e:any){
        throwIfAbortError(e);
    }
    return {
        at:partialPath.length-partialName.length,
        children:[]
    };
}

export function makeFunctionCompletionWithFilePathArg0(current:string|undefined){
    return async (context:CodeCompletionContext)=>{
        let param=context.code.substring(context.funcParamStart!,context.caret);
        let loadPath2=param.match(/\(\s*(['"])([^'"]+)$/);
        if(loadPath2!=null){
            let replaceRange:[number,number]=[context.funcParamStart!+param.lastIndexOf(loadPath2[1])+1,0];
            replaceRange[1]=replaceRange[0]+loadPath2[2].length;
            let loadPath=loadPath2[2];
            let t1=await filepathCompletion(loadPath,context.codeContext,current);
            replaceRange[0]=replaceRange[0]+t1.at;
            context.completionItems.push(...t1.children.map(v=>({type:'literal',candidate:v.name,replaceRange})))
        }
    }
}

export interface CodeCompletionItem{
    type:string,
    candidate:string,
    replaceRange:[number,number]
}

export const CustomFunctionParameterCompletionSymbol=Symbol(__name__+'.CustomFunctionParameterCompletionSymbol');
export interface CodeCompletionContext{
    [k:string]:any,
    code:string,
    caret:number,
    completionItems:Array<CodeCompletionItem>,
    codeContext:LocalRunCodeContext,
    funcParamStart?:number
}

export const defaultCompletionHandlers:Array<(context:CodeCompletionContext)=>Promise<void>>=[
    async (context)=>{
        let t1=context.code.substring(0,context.caret).split('').reduce((prev,curr)=>{
            if(curr=='"'){prev.dquo++;}else if(curr=="'"){prev.quo++;}
            return prev;
        },{dquo:0,quo:0})
        context.isCaretInStringLiteral=t1.dquo%2==1 || t1.quo%2==1;
    },
    async (context)=>{
        //propertyCompletion
        if(context.isCaretInStringLiteral){
            return;
        }
        let behind=context.code.substring(0,context.caret);
        let matched=behind.match(/[0-9a-zA-Z_.\[\]'"]+$/);
        let objExpr:string;
        let fieldStr:string;
        if(matched!=undefined){
            let dot=behind.lastIndexOf('.');
            if(dot>=0){
                objExpr=behind.substring(matched.index!,dot);
                fieldStr=behind.substring(dot+1);
            }else{
                objExpr='_ENV';
                fieldStr=behind.substring(matched.index!);
            }
        }else{
            return;
        }
        let obj1:any;
        try{
            obj1=await context.codeContext.runCodeInScope(`return ${objExpr};`);
        }catch(e:any){
            throwIfAbortError(e);
        }
        if(obj1!=undefined){
            let exists=new Set();
            let protoobj=obj1;
            let abstractTypedArray=Object.getPrototypeOf(Object.getPrototypeOf(new Uint8Array([]))).constructor;
            let objectProto=Object.getPrototypeOf({});
            for(let rp=0;rp<100;rp++){
                if(protoobj==null || protoobj==objectProto)break;
                let proto2=Object.getPrototypeOf(protoobj);
                if(typeof protoobj==='string'||(proto2!=null && proto2.constructor===Array)||protoobj instanceof abstractTypedArray){
                    protoobj=Object.getPrototypeOf(protoobj);
                    continue;
                }
                for(let t1 of Object.getOwnPropertyNames(protoobj)){
                    try{
                        if(t1.startsWith(fieldStr)&&!exists.has(t1)){
                            exists.add(t1);
                            context.completionItems.push({
                                type:typeof obj1[t1],
                                candidate:t1,
                                replaceRange:[context.caret-fieldStr.length,context.caret]
                            });
                        }
                    }catch(e){}
                }
                protoobj=Object.getPrototypeOf(protoobj);
            }
        }
    },
    async (context)=>{
        //import completion
        let behind=context.code.substring(0,context.caret);
        let importExpr=behind.match(/import\s*\(\s*(['"])([^'"]+)$/);
        if(importExpr!=null){
            let replaceRange:[number,number]=[(importExpr.index??0)+importExpr[0].indexOf(importExpr[1])+1,0];
            replaceRange[1]=replaceRange[0]+importExpr[2].length;
            let importName=importExpr[2];
            let t1=await importNameCompletion(importName);
            context.completionItems.push(...t1.map(v=>({type:'literal',candidate:v,replaceRange})))
        }
        importExpr=behind.match(/import\s.*from\s*(['"])([^'"]+)$/);
        if(importExpr!=null){
            let replaceRange:[number,number]=[(importExpr.index??0)+importExpr[0].indexOf(importExpr[1])+1,0];
            replaceRange[1]=replaceRange[0]+importExpr[2].length;
            let importName=importExpr[2];
            let t1=await importNameCompletion(importName);
            context.completionItems.push(...t1.map(v=>({type:'literal',candidate:v,replaceRange})))
        }
    },
    async (context)=>{
        //simple custom function call Completion
        let behind=context.code.substring(0,context.caret);
        let rBracketCnt=0;
        let paramStart=-1;
        for(let t1=behind.length;t1>=0;t1--){
            let ch=behind.charAt(t1);
            if(ch=='('){
                rBracketCnt--;
                if(rBracketCnt<0){
                    paramStart=t1;
                    break;
                };
            }else if(ch==')'){
                rBracketCnt++
            }
        }
        if(paramStart<0){
            return;
        }
        let funcName=behind.substring(0,paramStart).match(/[0-9a-zA-Z_.\[\]'"]+$/);
        if(funcName==null)return;
        try{
            let funcObj=await context.codeContext.runCodeInScope(`return ${funcName};`);
            if(CustomFunctionParameterCompletionSymbol in funcObj){
                let customCompletion=funcObj[CustomFunctionParameterCompletionSymbol] as (ctx:CodeCompletionContext)=>Promise<void>;
                context.funcParamStart=paramStart;
                await customCompletion(context as any);
            }
        }catch(e:any){
            throwIfAbortError(e);
        }
    },
]