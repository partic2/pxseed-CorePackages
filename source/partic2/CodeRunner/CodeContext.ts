

import {ancestor} from 'acorn-walk'
import * as acorn from 'acorn'
import { requirejs } from 'partic2/jsutils1/base';
import * as jsutils1 from 'partic2/jsutils1/base'

import { inspectCodeContextVariable, toSerializableObject, fromSerializableObject, CodeContextRemoteObjectFetcher, 
    RemoteReference, defaultCompletionHandlers, CodeCompletionItem} from './Inspector';


acorn.defaultOptions.allowAwaitOutsideFunction=true;
acorn.defaultOptions.ecmaVersion='latest';
acorn.defaultOptions.allowReturnOutsideFunction=true;
acorn.defaultOptions.sourceType='module'





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
        //this CodeContext
        __priv_codeContext:undefined,
        //import implemention
        __priv_import:async function(module:string){
            let imp=this.__priv_codeContext.importHandler(module);
            return imp;
        },
        //some utils provide by codeContext
        __priv_jsExecLib:jsExecLib,
        //custom source processor for 'runCode' _ENV.__priv_processSource, run before built in processor.
        __priv_processSource:null as null|((s:string)=>string)
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
        if(this.localScope.__priv_processSource!=null){
            source=this.localScope.__priv_processSource(source)
        }
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
    completionHandlers=[
        ...defaultCompletionHandlers
    ]
    async codeComplete(code: string, caret: number) {
        let completeContext={
            code,caret,codeContext:this,completionItems:[]
        }
        for(let t1 of this.completionHandlers){
            await t1(completeContext);
        }
        //TODO:remove duplicate completionItems
        return completeContext.completionItems;
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

type OnlyAsyncFunctionProp<Mod>={
    [P in keyof Mod]:Mod[P] extends (...args:any[])=>Promise<any>?Mod[P]:never
}

export class CodeContextShell{
    onConsoleData: (event: ConsoleDataEvent) => void=()=>{};
    runCodeLogger:(s:string,resultVariable?:string)=>void=()=>{};
    returnObjectLogger:(err:{message:string,stack?:string}|null,ret:any)=>void=()=>{};
    constructor(public codeContext:RunCodeContext){
    }
    async runCode(code:string):Promise<any>{
        let ctx={code};
        ({code}=ctx);
        let nextResult='__result_'+jsutils1.GenerateRandomString();
        this.runCodeLogger(code,nextResult);
        let result=await this.codeContext.runCode(code,nextResult);
        if(result.err==null){
            try{
                let returnObject=await this.inspectObject([nextResult]);
                if(returnObject instanceof RemoteReference){
                    returnObject.accessPath=[nextResult]
                    nextResult='';
                }
                this.returnObjectLogger(null,returnObject);
                return returnObject;
            }finally{
                if(nextResult!=''){
                    await this.codeContext.runCode(`delete _ENV.${nextResult}`)
                }
            }
        }else{
            this.returnObjectLogger(result.err,null);
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
            cached:{} as Partial<OnlyAsyncFunctionProp<T>>,
            getFunc<N extends keyof OnlyAsyncFunctionProp<T>>(name:N):T[N]{
                if(!(name in this.cached)){
                    this.cached[name]=shell.getRemoteFunction(`${asName}.${name as string}`) as OnlyAsyncFunctionProp<T>[N]
                }
                return this.cached[name]!;
            },
            toModuleProxy():OnlyAsyncFunctionProp<T>{
                let that=this;
                return new Proxy(this.cached,{
                    get(target,p){
                        if(!(p in target)){
                            return that.getFunc(p as keyof T);
                        }else{
                            return that.cached[p as keyof T];
                        }
                    }
                }) as OnlyAsyncFunctionProp<T>;
            }
        }
        return r;
    }
    getRemoteFunction(functionName: string) {
        return async (...argv:any[])=>{
            return await this.runCode(`${functionName}(...__priv_jsExecLib.fromSerializableObject(${
                JSON.stringify(toSerializableObject(argv,{maxDepth:100,maxKeyCount:10000,enumerateMode:'for in'}))
            },{referenceGlobal:_ENV}));`);
        };
    }
    async setVariable(variableName:string,value:any){
        let objJs='__priv_jsExecLib.fromSerializableObject('+
            JSON.stringify(toSerializableObject(value,{maxDepth:100,maxKeyCount:10000,enumerateMode:'for in'}))+
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