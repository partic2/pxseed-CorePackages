

import {ancestor} from 'acorn-walk'
import * as acorn from 'acorn'
import { requirejs } from 'partic2/jsutils1/base';
import * as jsutils1 from 'partic2/jsutils1/base'

import { inspectCodeContextVariable, toSerializableObject, fromSerializableObject, CodeContextRemoteObjectFetcher, 
    RemoteReference, defaultCompletionHandlers, CodeCompletionItem, getRemoteReference} from './Inspector';
import { Io } from 'pxprpc/base';
import { createIoPipe } from 'partic2/pxprpcClient/registry';
import { addAsyncHook, JsSourceReplacePlan, setupAsyncHook } from './pxseedLoader';
import { TaskLocalRef } from './jsutils2';


acorn.defaultOptions.allowAwaitOutsideFunction=true;
acorn.defaultOptions.ecmaVersion='latest';
acorn.defaultOptions.allowReturnOutsideFunction=true;
acorn.defaultOptions.sourceType='module'

const __name__=requirejs.getLocalRequireModule(require);

export let TaskLocalEnv=new TaskLocalRef<any>({__noenv:true});

setupAsyncHook();

export class CodeContextEventTarget extends EventTarget{
    //Used by RemoteCodeContext, to delegate event. 
    onAnyEvent?:(event:Event)=>void;
    dispatchEvent(event: Event): boolean {
        this.onAnyEvent?.(event);
        return super.dispatchEvent(event);
    }
}

export interface RunCodeContext{
    //resultVariable=resultVariable??'_'
    //'runCode' will process source before execute, depend on the implemention.
    // Only string result will be stored into 'stringResult', otherwise null will be stored.
    runCode(source:string,resultVariable?:string):Promise<{stringResult:string|null,err:{message:string,stack?:string}|null}>;

    //jsExec run code in globalThis scope, and different from runCode, never process source before execute.
    //'code' has signature like '__jsExecSample' below. Promise will be resolved. Only string result will be returned, otherwise '' will be returned.
    jsExec(code:string):Promise<string>;

    codeComplete(code:string,caret:number):Promise<CodeCompletionItem[]>;

    event:CodeContextEventTarget;

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

export async function enableDebugger(){
    try{
        if(globalThis?.process?.versions?.node!=undefined){
            (await import('inspector')).open(9229);
        }
    }catch(err){};
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
    event=new CodeContextEventTarget();
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
        //custom source processor for 'runCode' _ENV.__priv_processSource, run before builtin processor.
        __priv_processSource:[] as ((processContext:{source:string,_ENV:any})=>PromiseLike<void>|void)[],
        servePipe:this.servePipe.bind(this),
        event:this.event,
        //Will be close when LocalRunCodeContext is closing.
        autoClosable:{} as Record<string,{close?:()=>void}>,
        enableDebugger
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
        let replacePlan=new JsSourceReplacePlan(source);
        let result=acorn.parse(source,{allowAwaitOutsideFunction:true,ecmaVersion:'latest',allowReturnOutsideFunction:true});
        replacePlan.parsedAst=result
        let foundDecl=[] as string[];

        function parseDeclStat(decl:acorn.VariableDeclarator[]){
            let declNames:string[]=[];
            decl.forEach(v=>{
                if(v.id.type==='Identifier'){
                    declNames.push(v.id.name);
                }else if(v.id.type==='ObjectPattern'){
                    declNames.push(...v.id.properties.map(v2=>(v2 as any).value.name))
                }else if(v.id.type==='ArrayPattern'){
                    declNames.push(...v.id.elements.filter(v2=>v2!=null).map(v2=>(v2 as acorn.Identifier).name))
                }
            });
            return {declNames};
        }
        ancestor(result,{
            VariableDeclaration(node,state,ancestors){
                //Performance issue.
                if(ancestors.find(v=>v.type.endsWith('FunctionExpression')))return;
                if(ancestors.find(v=>['BlockStatement'].includes(v.type))!==undefined && node.kind!=='var')return;
                if((['ForStatement','ForOfStatement'].includes(ancestors.at(-2)?.type??''))){
                    if(node.kind=='var'){
                        let {declNames}=parseDeclStat(node.declarations);
                        foundDecl.push(...declNames)
                        let declaratorStart=node.declarations[0].start;
                        replacePlan.plan.push({start:node.start,end:declaratorStart,newString:''});
                        return;
                    }else{
                        return;
                    }
                }
                let {declNames}=parseDeclStat(node.declarations);
                foundDecl.push(...declNames)
                let declaratorStart=node.declarations[0].start;
                let declaratorEnd=node.declarations.at(-1)!.end;
                replacePlan.plan.push({start:node.start,end:declaratorStart,newString:'('});
                replacePlan.plan.push({start:declaratorEnd,end:declaratorEnd,newString:')'})
            },
            FunctionDeclaration(node,state,ancestors){
                if(node.expression || 
                    ancestors.find(v=>v.type==='FunctionExpression')!=undefined){
                    return;
                }
                if(node.id==null)return;
                foundDecl.push(node.id.name);
                let funcType1=source.substring(node.start,node.id.start);
                replacePlan.plan.push({start:node.start,end:node.id.end,newString:node.id.name+'='+funcType1});
            },
            ClassDeclaration(node,state,ancestors){
                if(ancestors.find(v=>v.type==='FunctionExpression')!=undefined){
                    return;
                }
                if(node.id==null)return;
                foundDecl.push(node.id.name);
                let clsType1=source.substring(node.start,node.id.start);
                replacePlan.plan.push({start:node.start,end:node.id.end,newString:node.id.name+'='+clsType1});
            },
            ImportExpression(node,state,ancestors){
                replacePlan.plan.push({start:node.start,end:node.start+6,newString:'_ENV.__priv_import'})
            },
            ImportDeclaration(node,state,ancestor){
                if(node.specifiers.length===1 && node.specifiers[0].type==='ImportNamespaceSpecifier'){
                    let spec=node.specifiers[0];
                    replacePlan.plan.push({start:node.start,end:node.end,newString:`${spec.local.name}=await _ENV.__priv_import('${node.source.value}');`})
                    foundDecl.push(spec.local.name)
                }else if(node.specifiers.length>0 && node.specifiers[0].type==='ImportSpecifier'){
                    let specs=node.specifiers as acorn.ImportSpecifier[];
                    let importStat=[`{let __timp=(await _ENV.__priv_import('${node.source.value}'));`]
                    for(let spec of specs){
                        importStat.push(`_ENV.${spec.local.name}=__timp.${(spec.imported as acorn.Identifier).name};`)
                        foundDecl.push(spec.local.name)
                    }
                    importStat.push('}')
                    replacePlan.plan.push({start:node.start,end:node.end,newString:importStat.join('')});
                }else if(node.specifiers.length===1 && node.specifiers[0].type==='ImportDefaultSpecifier'){
                    let spec=node.specifiers[0];
                    replacePlan.plan.push({start:node.start,end:node.end,newString:`${spec.local.name}=(await _ENV.__priv_import('${node.source.value}')).default;`})
                    foundDecl.push(spec.local.name)
                }else{
                    replacePlan.plan.push({start:node.start,end:node.end,newString:``});
                }
            }
        });
        let lastStat=result.body.at(-1);
        addAsyncHook(replacePlan);
        if(lastStat!=undefined){
            if(lastStat.type.includes('Expression')){
                replacePlan.plan.push({
                    start:lastStat.start,
                    end:lastStat.start,
                    newString:' return '
                });
            }
        }
        let modifiedSource=replacePlan.apply();
        return {
            declaringVariableNames:foundDecl,
            modifiedSource
        }
    }
    async runCode(source:string,resultVariable?:string){
        resultVariable=resultVariable??'_'
        let that=this;
        let processContext={_ENV:this.localScope,source}
        await jsutils1.Task.fork(function*(){
            for(let processor of that.localScope.__priv_processSource){
                let isAsync=processor(processContext);
                if(isAsync!=undefined && 'then' in isAsync){
                    yield isAsync;
                }
            }
        }).run();
        source=processContext.source;
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
        
        let that=this;
        //TODO: Custom await scheduler and stack tracer, to avoid Task context missing after "await"
        let r=jsutils1.Task.fork(function*(){
            TaskLocalEnv.set(that.localScope);
            return (yield code(that.localScopeProxy)) as any;
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

export var jsExecLib={
    jsutils1,LocalRunCodeContext,toSerializableObject,fromSerializableObject,importModule:(name:string)=>import(name),
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