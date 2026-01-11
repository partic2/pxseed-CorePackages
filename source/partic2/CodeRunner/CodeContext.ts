

import {ancestor} from 'acorn-walk'
import * as acorn from 'acorn'
import { requirejs } from 'partic2/jsutils1/base';
import * as jsutils1 from 'partic2/jsutils1/base'

import { toSerializableObject, fromSerializableObject, 
    defaultCompletionHandlers, CodeCompletionItem} from './Inspector';
import { addAsyncHook, JsSourceReplacePlan, setupAsyncHook } from './pxseedLoader';
import { OnConsoleData, TaskLocalRef } from './jsutils2';


acorn.defaultOptions.allowAwaitOutsideFunction=true;
acorn.defaultOptions.ecmaVersion='latest';
acorn.defaultOptions.allowReturnOutsideFunction=true;
acorn.defaultOptions.sourceType='module'

const __name__=requirejs.getLocalRequireModule(require);

export let TaskLocalEnv=new TaskLocalRef<any>({__noenv:true});

setupAsyncHook();

export class CodeContextEventTarget extends EventTarget{
    //Used by RemoteCodeContext, to delegate event. 
    _cachedEventQueue=new jsutils1.ArrayWrap2<{time:number,event:Event}>();
    _eventQueueExpiredTime=1000;
    dispatchEvent(event: CodeContextEvent): boolean {
        this._cachedEventQueue.queueSignalPush({time:jsutils1.GetCurrentTime().getTime(),event});
        setTimeout(()=>this._cachedEventQueue.arr().shift(),this._eventQueueExpiredTime);
        return super.dispatchEvent(event);
    }
    addEventListener(type: string, callback: ((ev:CodeContextEvent)=>void)|EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean): void{
        super.addEventListener(type,callback as any,options);
    }
    removeEventListener(type: string, callback: ((ev:CodeContextEvent)=>void)|EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean): void {
        super.removeEventListener(type,callback as any);
    }
    
}

export interface RunCodeContext{
    //resultVariable=resultVariable??'_'
    //'runCode' will process source before execute, depend on the implemention.
    // Only string result will be stored into 'stringResult', otherwise null will be stored.
    // If error occured, The "resultVariable" will store the catched object. and err=catched.toString()
    runCode(source:string,resultVariable?:string):Promise<{stringResult:string|null,err:string|null}>;

    //jsExec run code in globalThis scope, and different from runCode, never process source before execute.
    //'code' has signature like '__jsExecSample' below. Promise will be resolved. Only string result will be returned, otherwise '' will be returned.
    jsExec(code:string):Promise<string>;

    codeComplete(code:string,caret:number):Promise<CodeCompletionItem[]>;

    event:CodeContextEventTarget;

    close():void;

}
//RunCodeContext.jsExec run code like this
async function __jsExecSample(lib:typeof jsExecLib,codeContext:LocalRunCodeContext):Promise<string>{
    //Your code
    return '';
}

export class CodeContextEvent<T=any> extends Event{
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

export async function enableDebugger(){
    try{
        if(globalThis?.process?.versions?.node!=undefined){
            (await import('inspector')).open(9229);
        }
    }catch(err){};
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
        __priv_import:(module:string)=>{
            let imp=this.importHandler(module);
            return imp;
        },
        //some utils provide by codeContext
        __priv_jsExecLib:jsExecLib,
        //custom source processor for 'runCode' _ENV.__priv_processSource, run before builtin processor.
        __priv_processSource:[] as ((processContext:{source:string,_ENV:any})=>PromiseLike<void>|void)[],
        event:this.event,
        CodeContextEvent,
        Task:jsutils1.Task,
        TaskLocalRef,
        TaskLocalEnv,
        //Will be close when LocalRunCodeContext is closing.
        autoClosable:{} as Record<string,{close?:()=>void}>,
        close:()=>{
            this.close();
        }
    };
    localScopeProxy;
    protected onConsoleLogListener=(level:string,argv:any)=>{
        let outputTexts:string[]=[];
        for(let t1 of argv){
            if(typeof t1=='object'){
                outputTexts.push(JSON.stringify(toSerializableObject(t1,{})));
            }else{
                outputTexts.push(t1);
            }
        }
        let evt=new CodeContextEvent<ConsoleDataEventData>('console.data',{
            data:{
                level,
                message:outputTexts.join(' ')
            }
        });
        this.event.dispatchEvent(evt);
    }
    constructor(){
        OnConsoleData.add(this.onConsoleLogListener);
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
    close(): void {
        OnConsoleData.delete(this.onConsoleLogListener);
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
            TaskLocalEnv.set(that.localScope);
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
        }catch(e:any){
            this.localScope[resultVariable]=e;
            return {stringResult:null,err:e.toString()}
        }
    }
    async runCodeInScope(source:string){
        let withBlockBegin='with(_ENV){';
        let code=new Function('_ENV',withBlockBegin+
        'return (async ()=>{'+source+'\n})();}');
        
        let that=this;
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
    enableDebugger,
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
