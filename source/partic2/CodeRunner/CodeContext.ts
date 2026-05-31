

import * as acornWalk from 'acorn-walk'
import * as acorn from 'acorn'
import { requirejs } from 'partic2/jsutils1/base';
import * as jsutils1 from 'partic2/jsutils1/base'

import { addAsyncHook, addAutoAsyncAwait, JsSourceReplacePlan, setupAsyncHook } from './pxseedLoader';
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
    _cachedEventQueue=new jsutils1.ArrayWrap2<{time:number,event:Event,seq:number}>();
    _eventQueueExpiredTime=1000;
    _lastSeq=0;
    dispatchEvent(event: CodeContextEvent): boolean {
        this._lastSeq++;
        this._cachedEventQueue.queueSignalPush({time:jsutils1.GetCurrentTime().getTime(),event,seq:this._lastSeq});
        setTimeout(()=>this._cachedEventQueue.arr().shift(),this._eventQueueExpiredTime);
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
    processContext.source=modifiedSource;
    processContext.declVars.push(...foundDecl);
}

export let __internal__={
    defaultCodeTranspilingProcessor,builtinCodeContextSourceProcessor
}

export class LocalRunCodeContext implements RunCodeContext{
    importHandler:(source:string)=>Promise<any>=async (source)=>{
        return import(source);
    };
    event=new CodeContextEventTarget();
    localScope:{[key:string]:any}={
        //this CodeContext
        __priv_codeContext:undefined,
        //import implemention
        __priv_import:async (module:string)=>{
            let imp=await this.importHandler(module);
            return imp;
        },
        //transpiler
        __topLevelTranspileDirective:{},
        __transpile__:(directive:any,source:any)=>source,
        //some utils provide by codeContext
        __priv_sourceProcessors:[
            {name:__name__+'.defaultCodeTranspilingProcessor',process:defaultCodeTranspilingProcessor},
            {name:__name__+'.builtinCodeContextSourceProcessor',process:builtinCodeContextSourceProcessor}
        ] satisfies {process:(processContext:{source:string,_ENV:any,declVars:string[]})=>PromiseLike<void>|void,name:string}[],
        callModuleFunction:async (module:string,func:string,args:any[])=>{
            let imp=await this.importHandler(module);
            return await imp[func](...args)
        },
        event:null,
        CodeContextEvent,
        Task:jsutils1.Task,
        tasks:{} as Record<string,jsutils1.Task<any>>,
        //Will be close when LocalRunCodeContext is closing.
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
        this.localScope.__priv_codeContext=this;
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
    async close() {
        try{
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
        }catch(err){}
    }
    async callFunction(name: string, args: any[]): Promise<any> {
        let taskName='task'+jsutils1.GenerateRandomString();
        let that=this;
        let t=jsutils1.Task.fork(function*(){
            let curtask=jsutils1.Task.currentTask!;
            curtask.name=taskName;
            that.localScope.tasks[taskName]=curtask;
            TaskLocalEnv.set(that.localScope);
            try{
                let r=that.localScope[name](...args);
                if(typeof r==='object' && r!==null && typeof r.then==='function'){
                    r=yield r;
                }
                return r;
            }finally{
                delete that.localScope.tasks[curtask.name];
            }
        }).run();
        return await t;
    }
    async processSource(source:string){
        let that=this;
        let processContext={_ENV:this.localScope,source,declVars:new Array<string>()}
        await jsutils1.Task.fork(function*(){
            TaskLocalEnv.set(that.localScope);
            for(let processor of that.localScope.__priv_sourceProcessors){
                let isAsync=processor.process(processContext);
                if(isAsync!=null && typeof isAsync==='object' && typeof isAsync.then==='function'){
                    yield isAsync;
                }
            }
        }).run();
        return processContext
    }
    async runCode(source:string,resultVariable?:string){
        resultVariable=resultVariable??'_'
        let processResult=await this.processSource(source)
        source=processResult.source;
        try{
            let result=await this.runCodeInScope(source);
            if(resultVariable!=='')this.localScope[resultVariable]=result;
            let stringResult=(typeof(result)==='string')?result:null;
            return {stringResult,err:null}
        }catch(e:any){
            if(resultVariable!=='')this.localScope[resultVariable]=e;
            return {stringResult:null,err:e.toString()}
        }
    }
    protected async runCodeInScope(source:string){
        let withBlockBegin='with(_ENV){';
        let code=new Function('_ENV',withBlockBegin+
        'return (async ()=>{Promise.__onAsyncEnter();try{\n'+source+'\n}finally{Promise.__onAsyncExit();}})();}');
        let that=this;
        let taskName='task'+jsutils1.GenerateRandomString();
        let r=jsutils1.Task.fork(function*(){
            let curtask=jsutils1.Task.currentTask!;
            curtask.name=taskName;
            that.localScope.tasks[taskName]=curtask;
            TaskLocalEnv.set(that.localScope);
            try{
                return (yield code(that.localScopeProxy)) as any;
            }finally{
                delete that.localScope.tasks[curtask.name];
            }
        }).run();
        return await r;
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