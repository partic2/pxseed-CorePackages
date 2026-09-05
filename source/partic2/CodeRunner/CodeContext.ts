

import * as acornWalk from 'acorn-walk'
import * as acorn from 'acorn'
import { requirejs } from 'partic2/jsutils1/base';
import * as jsutils1 from 'partic2/jsutils1/base'

import { addAsyncHook, addAutoAsyncAwait, JsSourceReplacePlan, setupAsyncHook } from './pxseedLoader';
import { EventBuffer, TaskLocalRef } from './jsutils2';


acorn.defaultOptions.allowAwaitOutsideFunction=true;
acorn.defaultOptions.ecmaVersion='latest';
acorn.defaultOptions.allowReturnOutsideFunction=true;
acorn.defaultOptions.sourceType='module'

const __name__=requirejs.getLocalRequireModule(require);

export let TaskLocalEnv=new TaskLocalRef<any>({__noenv:true});

setupAsyncHook();

export class CodeContextEventTarget extends EventTarget{
    //Used by RemoteCodeContext, to delegate event. 
    _buffer=new EventBuffer<{type:string,data:any}>();
    dispatchEvent(event: CodeContextEvent): boolean {
        this._buffer.push({type:event.type,data:event.data});
        return super.dispatchEvent(event);
    }
    addEventListener(type: string, callback: ((ev:CodeContextEvent)=>void)|EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean): void{
        super.addEventListener(type,callback as any,options);
    }
    removeEventListener(type: string, callback: ((ev:CodeContextEvent)=>void)|EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean): void {
        super.removeEventListener(type,callback as any);
    }
    //The original dispatchEvent on EventTarget. To trigger listener only.
    _dispatchEventOnEventTarget(event:CodeContextEvent):boolean{
        return super.dispatchEvent(event);
    }
}

export interface RunCodeContext{
    //resultVariable=resultVariable??'_'
    //'runCode' will process source before execute, depend on the implemention.
    // Only string result will be stored into 'stringResult', otherwise null will be stored.
    // If error occured, The "resultVariable" will store the catched object. and err=catched.toString()
    // if resultVariable equals '', result will not be stored.
    runCode(source:string,resultVariable?:string):Promise<{stringResult:string|null,err:string|null}>;

    //Call function this.localScope[name]. To ensure can be used in RemoteCodeContext, params and result should only include JSON-serializable Object/Uint8Array/{[RpcSerializeMagicMark]:{}}
    callFunction(name:string,args:any[]):Promise<any>

    event:CodeContextEventTarget;

    close():void;

}


export class CodeContextEvent<T=any> extends Event{
    public data:T|undefined=undefined;
    constructor(type?:string,initDict?:{data?:T}){
        super(type??__name__+'.CodeContextEvent',{});
        this.data=initDict?.data;
    }
}


async function defaultCodeTranspilingProcessor(processContext:{source:string,_ENV:any,declVars:string[]}){
    let replacePlan=new JsSourceReplacePlan(processContext.source);
    await addAutoAsyncAwait(replacePlan,processContext._ENV.__topLevelTranspileDirective??{})
    processContext.source=replacePlan.apply();
}

async function builtinCodeContextSourceProcessor(processContext:{source:string,_ENV:any,declVars:string[]}){
    let {source}=processContext;
    let replacePlan=new JsSourceReplacePlan(source);
    let result=acorn.parse(source,{allowAwaitOutsideFunction:true,ecmaVersion:'latest',allowReturnOutsideFunction:true});
    replacePlan.parsedAst=result;
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
    acornWalk.ancestor(result,{
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
            replacePlan.plan.push({start:node.start,end:declaratorStart,newString:';('});
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
            replacePlan.plan.push({start:node.start,end:node.start+6,newString:'_ENV.__codeContext.importHandler'})
        },
        ImportDeclaration(node,state,ancestor){
            if(node.specifiers.length===1 && node.specifiers[0].type==='ImportNamespaceSpecifier'){
                let spec=node.specifiers[0];
                replacePlan.plan.push({start:node.start,end:node.end,newString:`${spec.local.name}=await _ENV.__codeContext.importHandler('${node.source.value}');`})
                foundDecl.push(spec.local.name)
            }else if(node.specifiers.length>0 && node.specifiers[0].type==='ImportSpecifier'){
                let specs=node.specifiers as acorn.ImportSpecifier[];
                let importStat=[`{let __timp=(await _ENV.__codeContext.importHandler('${node.source.value}'));`]
                for(let spec of specs){
                    importStat.push(`_ENV.${spec.local.name}=__timp.${(spec.imported as acorn.Identifier).name};`)
                    foundDecl.push(spec.local.name)
                }
                importStat.push('}')
                replacePlan.plan.push({start:node.start,end:node.end,newString:importStat.join('')});
            }else if(node.specifiers.length===1 && node.specifiers[0].type==='ImportDefaultSpecifier'){
                let spec=node.specifiers[0];
                replacePlan.plan.push({start:node.start,end:node.end,newString:`${spec.local.name}=(await _ENV.__codeContext.importHandler('${node.source.value}')).default;`})
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
    processContext.source=modifiedSource;
    processContext.declVars.push(...foundDecl);
}

export let __internal__={
    defaultCodeTranspilingProcessor,builtinCodeContextSourceProcessor
}

export class LocalRunCodeContext implements RunCodeContext{
    importHandler:(source:string)=>Promise<any>=async (source)=>{
        try{
            let imp=await import(source);
            return imp;
        }catch(err){
            await Promise.all(Object.keys(await requirejs.getFailed()).map(t1=>requirejs.undef(t1)));
            throw err;
        }
    };
    sourceProcessors:Array<{name:string,process:(processContext:{source:string,_ENV:any,declVars:string[]})=>Promise<void>}>=[
        {name:__name__+'.defaultCodeTranspilingProcessor',process:defaultCodeTranspilingProcessor},
        {name:__name__+'.builtinCodeContextSourceProcessor',process:builtinCodeContextSourceProcessor}
    ]
    event=new CodeContextEventTarget();
    localScope:{[key:string]:any}={
        //this CodeContext
        __codeContext:undefined,
        //transpiler
        __topLevelTranspileDirective:{},
        __transpile__:(directive:any,source:any)=>source,
        callModuleFunction:async (module:string,func:string,args:any[])=>{
            let that=this;
            //Use Task to keep TaskLocalEnv valid.
            return jsutils1.Task.fork(function*(){
                let imp=yield that.importHandler(module);
                return yield imp[func](...args);
            }).run()
        },
        event:null,
        console:null,
        CodeContextEvent,
        Task:jsutils1.Task,
        tasks:{} as Record<string,jsutils1.Task<any>>,
        //Will be closed when LocalRunCodeContext is closing.
        autoClosable:{} as Record<string,{close?:()=>void}>,
        deleteVariables:(names:string[])=>{
            for(let n of names){
                delete this.localScope[n];
            }
        },
        close:()=>{
            this.close();
        }
    };
    localScopeProxy;
    constructor(){
        this.localScope.event=this.event;
        this.localScope.__codeContext=this;
        this.localScope._ENV=this.localScope;
        this.localScope.console=console;
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
    state:'running'|'closing'|'closed'='running'
    async close() {
        try{
            if(this.state!='running')return;
            this.contextRunCodeQueue.cancelWaiting();
            this.state='closing';
            this.event.dispatchEvent(new CodeContextEvent('close'));
            let that=this;
            await jsutils1.Task.fork(function*(){
                TaskLocalEnv.set(that.localScope);
                for(let [k1,v1] of Object.entries(that.localScope.autoClosable as Record<string,{close?:()=>void}>)){
                    if(v1.close!=undefined){
                        try{v1.close()}catch(err){};
                    }
                }
            }).run();
        }catch(err){}finally{
            this.state='closed'
        }
    }
    protected contextRunCodeQueue=new jsutils1.ArrayWrap2<{g:()=>Generator<Promise<any>,any>,r:jsutils1.future<any>,fork?:boolean}>();
    contextRunCodeTaskSpawner:jsutils1.Task<void>|null=null;
    runInContextTask(task:()=>Generator<Promise<void>,any>,opt?:{fork?:boolean}){
        if(this.contextRunCodeTaskSpawner===null){
            let codeContext=this;
            this.contextRunCodeTaskSpawner=jsutils1.Task.fork(function *(){
                while(codeContext.state=='running'){
                    //Mute log by default
                    jsutils1.TaskLocalLogHandler.set(()=>{});
                    try{
                        let next=yield* jsutils1.Task.yieldWrap(codeContext.contextRunCodeQueue.queueBlockShift());
                        function *taskMain(){
                            let taskName='task'+jsutils1.GenerateRandomString();
                            let curtask=jsutils1.Task.currentTask!;
                            curtask.name=taskName;
                            codeContext.localScope.tasks[taskName]=curtask;
                            TaskLocalEnv.set(codeContext.localScope);
                            try{
                                next.r.setResult(yield* next.g());
                            }catch(err){
                                next.r.setException(err);
                            }finally{
                                delete codeContext.localScope.tasks[taskName]
                            }
                        }
                        if(next.fork===false){
                            yield* taskMain();
                        }else{
                            jsutils1.Task.fork(taskMain).run();
                        }
                    }catch(err){};
                }
            }).run();
        };
        let r=new jsutils1.future<any>();
        this.contextRunCodeQueue.queueSignalPush({g:task,r,fork:opt?.fork});
        return r.get();
    }
    async callFunction(name: string, args: any[]): Promise<any> {
        let that=this;
        return this.runInContextTask(function *(){
            let r=that.localScope[name](...args);
            if(typeof r==='object' && r!==null && typeof r.then==='function'){
                r=yield r;
            }
            return r;
        });
    }
    async processSource(source:string){
        let that=this;
        let processContext={_ENV:this.localScope,source,declVars:new Array<string>()}
        await this.runInContextTask(function*(){
            TaskLocalEnv.set(that.localScope);
            for(let processor of that.sourceProcessors){
                let isAsync=processor.process(processContext);
                if(isAsync!=null && typeof isAsync==='object' && typeof isAsync.then==='function'){
                    yield isAsync;
                }
            }
        });
        return processContext
    }
    async runCode(source:string,resultVariable?:string){
        resultVariable=resultVariable??'_'
        let processResult=await this.processSource(source)
        source=processResult.source;
        try{
            let withBlockBegin='with(_ENV){';
            let code=new Function('_ENV',withBlockBegin+
            'return (async ()=>{Promise.__onAsyncEnter();try{\n'+source+'\n}finally{Promise.__onAsyncExit();}})();}');
            let that=this;
            let rt=this.runInContextTask(function*(){
                return (yield code(that.localScopeProxy)) as any;
            });
            let result=await rt;
            if(resultVariable!=='')this.localScope[resultVariable]=result;
            let stringResult=(typeof(result)==='string')?result:null;
            return {stringResult,err:null}
        }catch(e:any){
            if(resultVariable!=='')this.localScope[resultVariable]=e;
            return {stringResult:null,err:e.toString()}
        }
    }
}

export function JsonStringifyWithCircular(obj: any) {
    let seen = new Map();
    let path: string[] = [];
    return JSON.stringify(obj, (key, value) => {
        if (value && typeof value === 'object') {
            if (seen.has(value)) {
                return `[Circular -> ${seen.get(value).join('.')}]`;
            }
            seen.set(value, [...path, key]);
        }
        return value;
    });
}

export class BaseCodeCellListData{
    cellList=new Array<{cellInput:string,cellOutput:[any,string|null],key:string}>();
    consoleOutput:{[cellKey:string]:{content:string}}={};
    loadFrom(data:string){
        let loaded=JSON.parse(data)
        this.cellList=loaded.cellList;
        this.consoleOutput=loaded.consoleOutput;
    }
    saveTo():string{
        return JsonStringifyWithCircular({cellList:this.cellList,consoleOutput:this.consoleOutput});
    }
}

export let newCodeCellListData=new jsutils1.Ref2(()=>new BaseCodeCellListData());