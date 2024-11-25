

import {ancestor} from 'acorn-walk'
import * as acorn from 'acorn'
import { requirejs } from 'partic2/jsutils1/base';
import * as jsutils1 from 'partic2/jsutils1/base'
import { text2html } from 'partic2/pComponentUi/utils';
import { installedRequirejsResourceProvider } from './JsEnviron';
import { inspectCodeContextVariable, toSerializableObject, fromSerializableObject, CodeContextRemoteObjectFetcher, RemoteReference} from './Inspector';
import { getWWWRoot } from 'partic2/jsutils1/webutils';

acorn.defaultOptions.allowAwaitOutsideFunction=true;
acorn.defaultOptions.ecmaVersion='latest';
acorn.defaultOptions.allowReturnOutsideFunction=true;
acorn.defaultOptions.sourceType='module'



export interface CodeCompletionItem{
    type:string,
    candidate:string,
    replaceRange:[number,number]
}

export interface RunCodeContext{
    //resultVariable=resultVariable??'_'
    runCode(source:string,resultVariable?:string):Promise<{err:{message:string,stack?:string}|null}>;
    jsExec(code:string):Promise<string>;
    codeComplete(code:string,caret:number):Promise<CodeCompletionItem[]>;
    queryTooltip(code:string,caret:number):Promise<string>;
    event:EventTarget;
    close():void;
}
//RunCodeContext.jsExec like this
async function __temp1(lib:typeof jsExecLib,codeContext:LocalRunCodeContext){
    //Your code
    
}

export class ConsoleDataEvent extends Event{
    static EventType='console.data'
    data?:{level:string,message:string}
    constructor(){
        super(ConsoleDataEvent.EventType);
    }
}

let FuncCallEventType=jsutils1.GenerateRandomString();

class FuncCallEvent extends Event{
    originalFunction:Function|null=null;
    argv:any[]=[]
}

class CFuncCallProbe extends EventTarget{
    constructor(public originalFunction:Function){
        super();
    }
    hooked(){
        let that=this;
        return function(this:any,...argv:any[]){
            let e=new FuncCallEvent(FuncCallEventType);
            e.argv=argv;
            e.originalFunction=that.originalFunction;
            that.dispatchEvent(e);
            return that.originalFunction.apply(this,argv);
        };
    }
}
let CodeContextProp=Symbol('CodeContextProp');
interface ICodeContextProp{
    funcCallProbe?:CFuncCallProbe
}

function ensureFunctionProbe<T>(o:T,p:keyof T):CFuncCallProbe{
    let func=o[p] as any;
    let p2:ICodeContextProp;
    if(CodeContextProp in func){
        p2=func[CodeContextProp];
        if(p2.funcCallProbe==undefined){
            p2.funcCallProbe=new CFuncCallProbe(func);
            o[p]=p2.funcCallProbe.hooked() as any;
            (o[p] as any)[CodeContextProp]=p2;
        }
    }else{
        p2={
            funcCallProbe:new CFuncCallProbe(func)
        }
        func[CodeContextProp]=p2;
        o[p]=p2.funcCallProbe!.hooked() as any;
        (o[p] as any)[CodeContextProp]=p2;
    }
    return p2.funcCallProbe!
}


//(event:'console.data',cb:onConsoleDataCallback):void;

export class LocalRunCodeContext implements RunCodeContext{
    importHandler:(source:string)=>Promise<any>=async (source)=>{
        return requirejs.promiseRequire(source);
    };
    localScope:{[key:string]:any}={
        __priv_update:function(updated:{[key:string]:any}){
            for(let key in updated){
                this[key]=updated[key];
            }
        },
        __priv_codeContext:undefined,
        __priv_import:async function(module:string){
            let imp=this.__priv_codeContext.importHandler(module);
            return imp;
        },
        __priv_jsExecLib:jsExecLib
    };
    localScopeProxy;
    event=new EventTarget();
    protected onConsoleLogListener=(e:Event)=>{
        let e2=e as FuncCallEvent;
        let name=e2.originalFunction!.name;
        let evt=new ConsoleDataEvent();
        evt.data={
            level:name,
            message:e2.argv.map(v=>{
                if(typeof v=='object'){
                    return JSON.stringify(v)
                }else{
                    return String(v);
                }}).join()
        }
        this.event.dispatchEvent(evt);
    }
    constructor(){
        ensureFunctionProbe(console,'log').addEventListener(FuncCallEventType,this.onConsoleLogListener);
        ensureFunctionProbe(console,'debug').addEventListener(FuncCallEventType,this.onConsoleLogListener);
        ensureFunctionProbe(console,'info').addEventListener(FuncCallEventType,this.onConsoleLogListener);
        ensureFunctionProbe(console,'warn').addEventListener(FuncCallEventType,this.onConsoleLogListener);
        ensureFunctionProbe(console,'error').addEventListener(FuncCallEventType,this.onConsoleLogListener);
        this.localScope.__priv_codeContext=this;
        this.localScope._ENV=this.localScope;
        this.localScope.console={...console};
        this.localScopeProxy=new Proxy(this.localScope,{
            has:()=>true,
            get:(target,p)=>{
                if(p in target){
                    return target[p as string]
                }else{
                    return (globalThis as any)[p as string];
                }
            },
            set:(target,p,newVal,receiver)=>{
                target[p as string]=newVal;
                return true;
            }
        });
    }
    async queryTooltip(code: string, caret: number): Promise<string> {
        return '';
    }
    close(): void {
        ensureFunctionProbe(console,'log').removeEventListener(FuncCallEventType,this.onConsoleLogListener);
        ensureFunctionProbe(console,'debug').removeEventListener(FuncCallEventType,this.onConsoleLogListener);
        ensureFunctionProbe(console,'info').removeEventListener(FuncCallEventType,this.onConsoleLogListener);
        ensureFunctionProbe(console,'warn').removeEventListener(FuncCallEventType,this.onConsoleLogListener);
        ensureFunctionProbe(console,'error').removeEventListener(FuncCallEventType,this.onConsoleLogListener);
    }
    async jsExec(code:string): Promise<string> {
        let r=new Function('lib','codeContext',`return (async ()=>{${code}})();`)(jsExecLib,this)
        if(r instanceof Promise){
            r=await r;
        }
        if((typeof r)!=='string'){
            r=JSON.stringify(r);
        }
        return r;
    }
    processSource(source:string):{modifiedSource:string,declaringVariableNames:string[]}{
        let result=acorn.parse(source,{allowAwaitOutsideFunction:true,ecmaVersion:'latest',allowReturnOutsideFunction:true})
        let foundDecl=[] as string[];
        let replacePlan=[] as {start:number,end:number,newString:string}[]
        ancestor(result,{
            VariableDeclaration(node,state,ancetors){
                if(ancetors.find(v=>v.type==='FunctionExpression'))return;
                if(ancetors.find(v=>v.type==='BlockStatement')!==undefined && node.kind==='let')return;
                replacePlan.push({start:node.start,end:node.start+3,newString:' '})
                node.declarations.forEach(v=>{
                    if(v.id.type==='Identifier'){
                        foundDecl.push(v.id.name);
                    }else if(v.id.type==='ObjectPattern'){
                        foundDecl.push(...v.id.properties.map(v2=>(v2 as any).key.name))
                    }else if(v.id.type==='ArrayPattern'){
                        foundDecl.push(...v.id.elements.filter(v2=>v2!=null).map(v2=>(v2 as acorn.Identifier).name))
                    }
                });
            },
            FunctionDeclaration(node,state,ancetors){
                if(node.expression || ancetors.find(v=>v.type==='FunctionExpression')){
                    return;
                }
                if(node.id==null)return;
                foundDecl.push(node.id.name);
                let funcType1=source.substring(node.start,node.id.start);
                replacePlan.push({start:node.start,end:node.id.end,newString:node.id.name+'='+funcType1})
            },
            ImportExpression(node,state,ancetors){
                replacePlan.push({start:node.start,end:node.start+6,newString:'_ENV.__priv_import'})
            },
            ImportDeclaration(node,state,ancestor){
                if(node.specifiers.length===1 && node.specifiers[0].type==='ImportNamespaceSpecifier'){
                    let spec=node.specifiers[0];
                    replacePlan.push({start:node.start,end:node.end,newString:`${spec.local.name}=await _ENV.__priv_import('${node.source.value}');`})
                    foundDecl.push(spec.local.name)
                }else if(node.specifiers.length>0 && node.specifiers[0].type==='ImportSpecifier'){
                    let specs=node.specifiers as acorn.ImportSpecifier[];
                    let importStat=[]
                    for(let spec of specs){
                        importStat.push(`${spec.local.name}=(await _ENV.__priv_import('${node.source.value}')).${(spec.imported as acorn.Identifier).name};`)
                        foundDecl.push(spec.local.name)
                    }
                    replacePlan.push({start:node.start,end:node.end,newString:importStat.join('')});
                }else if(node.specifiers.length===1 && node.specifiers[0].type==='ImportDefaultSpecifier'){
                    let spec=node.specifiers[0];
                    replacePlan.push({start:node.start,end:node.end,newString:`${spec.local.name}=(await _ENV.__priv_import('${node.source.value}')).default;`})
                    foundDecl.push(spec.local.name)
                }else{
                    replacePlan.push({start:node.start,end:node.end,newString:``});
                }
            }
        });
        let lastStat=result.body[result.body.length-1];
        if(lastStat.type.indexOf('Expression')>=0){
            replacePlan.push({
                start:lastStat.start,
                end:lastStat.start,
                newString:' return '
            });
        }
        let modified:string[]=[];
        let start=0;
        replacePlan.sort((a,b)=>a.start-b.start)
        replacePlan.forEach(plan=>{
            modified.push(source.substring(start,plan.start));
            modified.push(plan.newString);
            start=plan.end
        });
        modified.push(source.substring(start));
        return {
            modifiedSource:modified.join(''),
            declaringVariableNames:foundDecl
        }
    }
    async runCode(source:string,resultVariable?:string){
        resultVariable=resultVariable??'_'
        let proc1=this.processSource(source);
        try{
            let result=await this.runCodeInScope(proc1.modifiedSource);
            this.localScope[resultVariable]=result;
            return {err:null}
        }catch(e){
            let {message,stack}=e as Error;
            return {err:{message,stack}}
        }
    }
    async runCodeInScope(source:string){
        //alternative 1 : object expand
        /*
        proc1.declaringVariableNames.forEach(v=>{
            this.localScope[v]=undefined;
            this.decledVar.add(v);
        });
        let varList=Array.from(this.decledVar).join(',');
        let expand='let {'+varList+'}=_ENV;';
        let restore='_ENV.__priv_update({'+varList+'});'
        let code=new Function('_ENV',"'use strict'\n"+expand+
        'return (async ()=>{'+proc1.modifiedSource+'})().then((r)=>{'+restore+'_ENV._=r;});');
        */
        //alternative 2 : with(Proxy)
        let withBlockBegin='with(_ENV){';
        let code=new Function('_ENV',withBlockBegin+
        'return (async ()=>{'+source+'\n})();}');
        //TODO: alternative 3 : transform identity access to property access,complex but consider the best way.
        let r=await code(this.localScopeProxy);
        return r;
    }
    async codeComplete(code: string, caret: number) {
        let completionItems=[] as { type: string; candidate: string; replaceRange:[number,number]}[];

        const checkIsCaretInStringLiteral=()=>{
            let t1=code.substring(0,caret).split('').reduce((prev,curr)=>{
                if(curr=='"'){prev.dquo++;}else if(curr=="'"){prev.quo++;}
                return prev;
            },{dquo:0,quo:0})
            return t1.dquo%2==1 || t1.quo%2==1;
        }

        const propertyCompletion=async ()=>{
            if(checkIsCaretInStringLiteral()){
                return;
            }
            let explist=code.substring(0,caret).match(/[0-9a-zA-Z_.\[\]'"]+$/);
            if(explist==null){
                return;
            }
            let exp1=explist[0];
            let objPart=exp1;
            let propPart='';
            let propDot=exp1.lastIndexOf('.');
            if(propDot==-1){
                propPart=exp1;
                objPart='_ENV';
            }else{
                [objPart,propPart]=[exp1.substring(0,propDot),exp1.substring(propDot+1)];
            }
            let obj1:any;
            try{
                obj1=await this.runCodeInScope(`return ${objPart};`);
            }catch(e){
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
                            if(t1.startsWith(propPart)&&!exists.has(t1)){
                                exists.add(t1);
                                completionItems.push({
                                    type:typeof obj1[t1],
                                    candidate:t1,
                                    replaceRange:[(explist.index??0)+propDot+1,caret]
                                });
                            }
                        }catch(e){}
                    }
                    protoobj=Object.getPrototypeOf(protoobj);
                }
            }
        }
        const removeLeadingSlash=(path:string)=>{
            if(path.startsWith('/')){
                return path.substring(1);
            }else{
                return path;
            }
        }
        const importNameCompletion=async (partialName:string)=>{
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

        const importCompletion=async ()=>{
            let behind=code.substring(0,caret);
            let importExpr=behind.match(/import\s*\(\s*(['"])([^'"]+)$/);
            if(importExpr!=null){
                let replaceRange:[number,number]=[(importExpr.index??0)+importExpr[0].indexOf(importExpr[1])+1,0];
                replaceRange[1]=replaceRange[0]+importExpr[2].length;
                let importName=importExpr[2];
                let t1=await importNameCompletion(importName);
                completionItems.push(...t1.map(v=>({type:'literal',candidate:v,replaceRange})))
            }
            importExpr=behind.match(/import\s.*from\s*(['"])([^'"]+)$/);
            if(importExpr!=null){
                let replaceRange:[number,number]=[(importExpr.index??0)+importExpr[0].indexOf(importExpr[1])+1,0];
                replaceRange[1]=replaceRange[0]+importExpr[2].length;
                let importName=importExpr[2];
                let t1=await importNameCompletion(importName);
                completionItems.push(...t1.map(v=>({type:'literal',candidate:v,replaceRange})))
            }
        }

        await propertyCompletion();
        await importCompletion();
        return completionItems;
    }
}

function CreateEventQueue(eventTarget:EventTarget,eventList:string[]){
    let eventBuffer=new jsutils1.ArrayWrap2<Event>();
    
    let listener=(event:Event)=>{
        eventBuffer.queueSignalPush(event);
    }
    for(let event of eventList){
        eventTarget.addEventListener(event,listener);
    }
    return {
        next:async ()=>{
            let event=await eventBuffer.queueBlockShift();
            return JSON.stringify({
                type:event.type,
                data:(event as any).data
            })
        },
        close:()=>{
            for(let event of eventList){
                eventTarget.removeEventListener(event,listener);
            }
        }
    }
}

export var jsExecLib={
    jsutils1,LocalRunCodeContext,CreateEventQueue,toSerializableObject,fromSerializableObject,
    iteratorNext:async <T>(iterator:(Iterator<T>|AsyncIterator<T>),count:number)=>{
        let arr=[];
        for(let t1=0;t1<count;t1++){
            let itr=await iterator.next()
            if(itr.done)break;
            arr.push(itr.value);
        }
        return arr;
    }
}



export class CodeContextShell{
    onConsoleData: (event: ConsoleDataEvent) => void=()=>{};
    runCodeLog:(s:string)=>void=()=>{};
    constructor(public codeContext:RunCodeContext){
    }
    async runCode(code:string):Promise<any>{
        let ctx={code};
        ({code}=ctx);
        let nextResult='__result_'+jsutils1.GenerateRandomString();
        let result=await this.codeContext.runCode(code,nextResult);
        if(result.err==null){
            try{
                let returnObject=await this.inspectObject([nextResult]);
                if(returnObject instanceof RemoteReference){
                    returnObject.accessPath=[nextResult]
                    nextResult='';
                }
                return returnObject;
            }finally{
                if(nextResult!=''){
                    await this.codeContext.runCode(`delete _ENV.${nextResult}`)
                }
            }
        }else{
            throw new Error(result.err.message+'\n'+(result.err.stack??''));
        }
    }
    async importModule<T>(mod:string,asName:string){
        let importResult=await this.codeContext.runCode(`import * as ${asName} from '${mod}' `);
        if(importResult.err!=null){
            throw new Error(importResult.err+'\n'+(importResult.err.stack??''))
        }
        let shell=this;
        let r={
            cached:{} as Partial<T>,
            getFunc<K extends keyof T>(name:K):T[K]{
                if(!(name in this.cached)){
                    this.cached[name]=shell.getRemoteFunction(`${asName}.${name as string}`) as T[K]
                }
                return this.cached[name] as T[K];
            },
            toModuleProxy():T{
                let that=this;
                return new Proxy(this.cached,{
                    get(target,p){
                        if(!(p in target)){
                            return that.getFunc(p as keyof T);
                        }
                    }
                }) as T;
            }
        }
        return r;
    }
    getRemoteFunction(functionName: string) {
        return async (...argv:any[])=>{
            let argvjs:string[]=[];
            for(let t1 of argv){
                argvjs.push('__priv_jsExecLib.fromSerializableObject('+
                    JSON.stringify(toSerializableObject(t1,{maxDepth:30,maxKeyCount:10000,enumerateMode:'for in'}))+
                ',{referenceGlobal:_ENV})');
            }
            return await this.runCode(`${functionName}(${argvjs.join(',')});`);
        };
    }
    async setVariable(variableName:string,value:any){
        let objJs='__priv_jsExecLib.fromSerializableObject('+
            JSON.stringify(toSerializableObject(value,{maxDepth:50,maxKeyCount:10000,enumerateMode:'for in'}))+
        ',{referenceGlobal:_ENV})'
        await this.runCode(`var ${variableName}=${objJs};`);
    }
    async inspectObject(accessPath: string[]): Promise<any> {
        return await inspectCodeContextVariable(new CodeContextRemoteObjectFetcher(this.codeContext),accessPath,{maxDepth:50,maxKeyCount:10000});
    }
    async init(): Promise<void> {
        this.codeContext.event.addEventListener(ConsoleDataEvent.EventType,this.onConsoleData);
    }
}

export let registry={
    contexts:{} as Record<string,RunCodeContext|null>,
    set(name:string,context:RunCodeContext|null){
        if(context==null){
            delete this.contexts[name];
        }else{
            this.contexts[name]=context;
        }
        this.__change.setResult(null);
    },
    get(name:string){
        return this.contexts[name]??null;
    },
    list():string[]{
        let t1=[];
        for(let t2 in this.contexts){
            t1.push(t2);
        }
        return t1;
    },
    __change:new jsutils1.future<null>(),
    async waitChange(){
        let fut=this.__change;
        await fut.get();
        if(fut==this.__change){
            this.__change=new jsutils1.future<null>();
        }
    }
}