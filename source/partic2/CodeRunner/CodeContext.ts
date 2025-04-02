

import {ancestor} from 'acorn-walk'
import * as acorn from 'acorn'
import { requirejs } from 'partic2/jsutils1/base';
import * as jsutils1 from 'partic2/jsutils1/base'

import { inspectCodeContextVariable, toSerializableObject, fromSerializableObject, CodeContextRemoteObjectFetcher, 
    RemoteReference, defaultCompletionHandlers, CodeCompletionItem, getRemoteReference} from './Inspector';
import { Io } from 'pxprpc/base';
import { createIoPipe } from 'partic2/pxprpcClient/registry';


acorn.defaultOptions.allowAwaitOutsideFunction=true;
acorn.defaultOptions.ecmaVersion='latest';
acorn.defaultOptions.allowReturnOutsideFunction=true;
acorn.defaultOptions.sourceType='module'

const __name__=requirejs.getLocalRequireModule(require);



export interface RunCodeContext{
    //resultVariable=resultVariable??'_'
    //'runCode' will process source before execute, depend on the implemention.
    // Only string result will be stored into 'stringResult', otherwise null will be stored.
    runCode(source:string,resultVariable?:string):Promise<{stringResult:string|null,err:{message:string,stack?:string}|null}>;

    //jsExec run code in globalThis scope, and different from runCode, never process source before execute.
    //'code' has signature like '__jsExecSample' below. Promise will be resolved. Only string result will be returned, otherwise '' will be returned.
    jsExec(code:string):Promise<string>;

    codeComplete(code:string,caret:number):Promise<CodeCompletionItem[]>;

    event:EventTarget;

    close():void;

    //use pipe for faster communication, avoid code compiling.
    //return null if no such pipe.
    //Code runing in context can create pipe server by calling _ENV.servePipe in type (name:string)=>Promise<Io>
    connectPipe(name:string):Promise<Io|null>
}
//RunCodeContext.jsExec run code like this
async function __jsExecSample(lib:typeof jsExecLib,codeContext:LocalRunCodeContext):Promise<string>{
    //Your code
    return '';
}

export class CodeContextEvent<T> extends Event{
    public data:T|undefined=undefined;
    constructor(type?:string,initDict?:{data?:T}){
        super(type??__name__+'.CodeContextEvent',{});
        this.data=initDict?.data;
    }
}
//Emit on console data output.
export interface ConsoleDataEventData{
    level:string,
    message:string
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

export class LocalRunCodeContext implements RunCodeContext{
    importHandler:(source:string)=>Promise<any>=async (source)=>{
        return requirejs.promiseRequire(source);
    };
    event=new EventTarget();
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
        __priv_processSource:null as null|((s:string)=>string),
        servePipe:this.servePipe.bind(this),
        event:this.event,
        //Will be close when LocalRunCodeContext is closing.
        autoClosable:{} as Record<string,{close?:()=>void}>,
    };
    localScopeProxy;
    protected onConsoleLogListener=(e:Event)=>{
        let e2=e as FuncCallEvent;
        let name=e2.originalFunction!.name;
        let outputTexts:string[]=[];
        for(let t1 of e2.argv){
            if(typeof t1=='object'){
                outputTexts.push(JSON.stringify(toSerializableObject(t1,{})));
            }else{
                outputTexts.push(t1);
            }
        }
        let evt=new CodeContextEvent<ConsoleDataEventData>('console.data',{
            data:{
                level:name,
                message:outputTexts.join(' ')
            }
        });
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
    protected servingPipe=new Map<string,[Io,Io]>();
    async connectPipe(name:string):Promise<Io|null>{
        let pipe1=this.servingPipe.get(name);
        if(pipe1==null){
            return null;
        }else{
            this.servingPipe.delete(name);
            return pipe1[0];
        }
    }
    async servePipe(name:string):Promise<Io>{
        let pipe1=createIoPipe();
        this.servingPipe.set(name,pipe1);
        return pipe1[1];
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
        this.event.dispatchEvent(new CodeContextEvent('close'));
        for(let [k1,v1] of Object.entries(this.localScope.autoClosable as Record<string,{close?:()=>void}>)){
            if(v1.close!=undefined){
                v1.close();
            }
        }
    }
    async jsExec(code:string): Promise<string> {
        let r=new Function('lib','codeContext',`return (async ()=>{${code}})();`)(jsExecLib,this)
        if(r instanceof Promise){
            r=await r;
        }
        if((typeof r)==='string'){
            return r;
        }
        return '';
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
        let lastStat=result.body.at(-1);
        if(lastStat!=undefined){
            if(lastStat.type.includes('Expression')){
                replacePlan.push({
                    start:lastStat.start,
                    end:lastStat.start,
                    newString:' return '
                });
            }
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
            let stringResult=(typeof(result)==='string')?result:null;
            return {stringResult,err:null}
        }catch(e){
            let {message,stack}=e as Error;
            return {stringResult:null,err:{message,stack}}
        }
    }
    async runCodeInScope(source:string){
        let withBlockBegin='with(_ENV){';
        let code=new Function('_ENV',withBlockBegin+
        'return (async ()=>{'+source+'\n})();}');
        let scopeProxy=this.localScopeProxy;
        //TODO: Custom await scheduler and stack tracer, to avoid Task context missing after "await"
        let r=jsutils1.Task.fork(function*(){
            jsutils1.Task.locals()![__name__]={_ENV:scopeProxy};
            return (yield code(scopeProxy)) as any;
        }).run();
        return await r;
    }
    completionHandlers=[
        ...defaultCompletionHandlers
    ]
    async codeComplete(code: string, caret: number) {
        let completeContext={
            code,caret,codeContext:this,completionItems:[] as CodeCompletionItem[]
        }
        for(let t1 of this.completionHandlers){
            //Mute error
            try{
                await t1(completeContext);
            }catch(e:any){
                jsutils1.throwIfAbortError(e);
            }
        }
        return completeContext.completionItems;
    }
}

//Usually used by remote puller.
export class EventQueuePuller{
    protected eventBuffer=new jsutils1.ArrayWrap2<Event>();
    constructor(public event:EventTarget){};
    protected listenerCb=(event:Event)=>{
        this.eventBuffer.queueSignalPush(event);
    }
    protected listeningEventType=new Set<string>();
    addPullEventType(type:string){
        this.listeningEventType.add(type);
        this.event.addEventListener(type,this.listenerCb);
    }
    removePullEventType(type:string){
        this.listeningEventType.delete(type);
        this.event.removeEventListener(type,this.listenerCb);
    }
    //Only .data is serialized now.
    async next(){
        let event=await this.eventBuffer.queueBlockShift();
        return JSON.stringify(toSerializableObject({
            type:event.type,
            data:(event as any).data
        },{maxDepth:1000,maxKeyCount:1000000}));
    }
    async close(){
        for(let t1 of Array.from(this.listeningEventType)){
            this.removePullEventType(t1);
        }
    }
}

function CreateEventQueue(eventTarget:EventTarget,eventList?:string[]){
    let t1=new EventQueuePuller(eventTarget);
    if(eventList!=undefined){
        for(let t2 of eventList){
            t1.addPullEventType(t2);
        }
    }
    return t1;
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
    [P in (keyof Mod & string)]:Mod[P] extends (...args:any[])=>Promise<any>?Mod[P]:never
}


class RemotePipe extends RemoteReference implements Io{
    context?:RunCodeContext
    local?:Io
    receive(): Promise<Uint8Array> {
        return this.local!.receive();
    }
    send(data: Uint8Array[]): Promise<void> {
        return this.local!.send(data);
    }
    close(): void {
        this.local!.close();
        if(this.context!=undefined){
            this.context.runCode(`delete _ENV${this.accessPath.map(t1=>`['${t1}']`).join('')}`)
        }
    }
}

//TODO: remove EventListener
export class RemoteEventTarget extends EventTarget{
    protected remoteQueueName='__eventQueue_'+jsutils1.GenerateRandomString();
    closed=false;
    public codeContext?:RunCodeContext;
    public remote?:RemoteReference;
    constructor(){
        super();
    }
    async start(){
        this.pullInterval();
    }
    [getRemoteReference](){
        jsutils1.assert(this.remote!=undefined);
        return this.remote;
    }
    async useRemoteReference(remoteReference:RemoteReference){
        this.remote=remoteReference;
    }
    protected remotePrepared=new jsutils1.future<string>();
    protected async enableRemoteEvent(type:string){
        await this.remotePrepared.get();
        await this.codeContext!.jsExec(`codeContext.localScope.autoClosable['${this.remoteQueueName}'].addPullEventType('${type}')`)
    }
    protected async pullInterval(){
        await this.codeContext!.jsExec(
`codeContext.localScope.autoClosable['${this.remoteQueueName}']=lib.CreateEventQueue(codeContext.localScope${this.remote!.accessPath.map(t1=>`['${t1}']`).join('')})`)
        
        this.remotePrepared.setResult('');
        while(!closed){
            let msg=await this.codeContext!.jsExec(`return await codeContext.localScope.autoClosable['${this.remoteQueueName}'].next()`);
            let ev=fromSerializableObject(JSON.parse(msg),{});
            this.dispatchEvent(new CodeContextEvent(ev.type,{data:ev.data}));
        }
    }
    addEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions | undefined): void {
        this.enableRemoteEvent(type);
        super.addEventListener(type,callback,options);
    }
    close(){
        this.closed=true;
        this.codeContext!.jsExec(`codeContext.localScope.autoClosable['${this.remoteQueueName}'].close();
            delete codeContext.localScope.autoClosable['${this.remoteQueueName}']`)
    }
}

export class CodeContextShell{
    onConsoleData: (event: CodeContextEvent<ConsoleDataEventData>) => void=()=>{};
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
                if(result.stringResult!=null){
                    return result.stringResult;
                }
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
    async createRemotePipe(){
        let remotePipe=new RemotePipe(['autoClosable',`__pipe_${jsutils1.GenerateRandomString()}`]);
        remotePipe.context=this.codeContext
        let result=await this.codeContext.runCode(`_ENV.${remotePipe.accessPath.join('.')}=await _ENV.servePipe('${remotePipe.accessPath[1]}')`);
        if(result.err!=null){
            throw new Error(result.err.message+'\n'+(result.err.stack??''));
        };
        remotePipe.local=(await this.codeContext.connectPipe(remotePipe.accessPath[1] as string))!
        return remotePipe
    }
    async importModule<T>(mod:string,asName:string){
        let importResult=await this.codeContext.runCode(`import * as ${asName} from '${mod}' `);
        if(importResult.err!=null){
            throw new Error(importResult.err+'\n'+(importResult.err.stack??''))
        }
        let shell=this;
                  
        let r={
            asName,
            cached:{} as Record<string,any>,
            getFunc<N extends (keyof OnlyAsyncFunctionProp<T>)&string>(name:N):T[N]{
                if(!(name in this.cached)){
                    this.cached[name]=shell.getRemoteFunction(`${asName}.${name as string}`) as OnlyAsyncFunctionProp<T>[N]
                }
                return this.cached[name]!;
            },
            getRemoteReference<N extends (keyof T) & string>(name:N):RemoteReference{
                return new RemoteReference([asName,name])
            },
            async getRemmoteEventTarget<N extends (keyof T) & string>(name:N):Promise<RemoteEventTarget>{
                if(!(name in this.cached)){
                    let et=new RemoteEventTarget();
                    et.codeContext=shell.codeContext;
                    await et.useRemoteReference(this.getRemoteReference(name));
                    et.start();
                    this.cached[name]=et;
                }
                return this.cached[name];
            },
            toModuleProxy():OnlyAsyncFunctionProp<T>{
                let that=this;
                return new Proxy(this.cached,{
                    get(target,p){
                        if(typeof p==='string'){
                            return that.getFunc(p as any);
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
        this.codeContext.event.addEventListener('console.data',this.onConsoleData as any);
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