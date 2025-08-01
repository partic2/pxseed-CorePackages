
import {defaultFuncMap,RpcExtendClient1,RpcExtendClientCallable,RpcExtendClientObject,RpcExtendServerCallable} from 'pxprpc/extend'
import { CodeContextEvent, CodeContextEventTarget,  LocalRunCodeContext,  RunCodeContext,jsExecLib } from './CodeContext';


import { assert, future, GenerateRandomString, mutex, throwIfAbortError } from 'partic2/jsutils1/base';
import { fromSerializableObject, RemoteReference, toSerializableObject } from './Inspector';
import {getAttachedRemoteRigstryFunction, getPersistentRegistered, IoOverPxprpc} from 'partic2/pxprpcClient/registry'
import { Io } from 'pxprpc/base';


export let __name__='partic2/CodeRunner/RemoteCodeContext';

let pxprpcNamespace=__name__


async function jsExecFn(source:string,arg:any){
    try{
        let r=new Function('arg','lib',`return (async ()=>{${source}})()`)(arg,jsExecLib);
        if(r instanceof Promise){
            r=await r;
        }
        return r;
    }catch(e){
        throw(e)
    }
}

defaultFuncMap[pxprpcNamespace+'.jsExecObj']=new RpcExtendServerCallable(jsExecFn).typedecl('so->o');
defaultFuncMap[pxprpcNamespace+'.jsExecStr']=new RpcExtendServerCallable(jsExecFn).typedecl('so->s');
defaultFuncMap[pxprpcNamespace+'.codeContextJsExec']=new RpcExtendServerCallable(async (context:RunCodeContext,code:string)=>{
    return context.jsExec(code);
}).typedecl('os->s');

/* 
remote code call like this
*/
async function __temp1(arg:any,lib:typeof jsExecLib){
}

let attachedFunc=Symbol('attachedFunc');

export function getRemoteContext(client1:RpcExtendClient1){
    if(!(attachedFunc in client1)){
        (client1 as any)[attachedFunc]=new RemoteRunCodeContext(client1);
    }
    return (client1 as any)[attachedFunc] as RemoteRunCodeContext
}

let rpcfunctionsProps=Symbol(__name__+'/'+'/rpcfunctions')


class RemoteCodeContextFunctionImpl{
    funcs:(RpcExtendClientCallable|undefined)[]=[]
    client1?:RpcExtendClient1;
    async jsExecObj(code: string,arg:RpcExtendClientObject|null): Promise<RpcExtendClientObject|null> {
        return this.funcs[0]!.call(code,arg);
    }
    async jsExecStr(code: string,arg:RpcExtendClientObject|null): Promise<string> {
        return this.funcs[1]!.call(code,arg);
    }
    async codeContextJsExec(codeContext:RpcExtendClientObject,code:string){
        return this.funcs[2]!.call(codeContext,code);
    }
    async ensureInit(){
        if(this.funcs.length==0){
            this.funcs=[
                (await this.client1!.getFunc(__name__+'.jsExecObj'))?.typedecl('so->o'),
                (await this.client1!.getFunc(__name__+'.jsExecStr'))?.typedecl('so->s'),
                (await this.client1!.getFunc(__name__+'.codeContextJsExec'))?.typedecl('os->s')
            ]
        }
    }    
}

//Only used by remote code context to initialize environment.
export async function __priv_setupRemoteCodeContextEnv(codeContext:LocalRunCodeContext,id:string){
    let eventPipeName='__event_'+id;
    let serverSide=await codeContext.servePipe(eventPipeName);
    if(codeContext.event.onAnyEvent==undefined){
        codeContext.event.onAnyEvent=(event)=>{
            let cce=event as CodeContextEvent<any>;
            serverSide.send([new TextEncoder().encode(JSON.stringify([cce.type,cce.data]))]);
        }
    }
}

export class RemoteRunCodeContext implements RunCodeContext{
    public constructor(public client1:RpcExtendClient1){this.doInit();}
    event=new CodeContextEventTarget();
    closed=false;
    protected rpcFunctions?:RemoteCodeContextFunctionImpl;
    protected initMutex=new mutex();
    protected __contextId=GenerateRandomString();
    protected epipe?:Io
    protected async pollEpipe(){
        try{
            while(!this.closed){
                let [type,data]=JSON.parse(new TextDecoder().decode(await this.epipe!.receive()));
                this.event.dispatchEvent(new CodeContextEvent(type,{data}));
            }
        }catch(err:any){
            throwIfAbortError(err)
        }
    }
    protected async doInit(){
        await this.initMutex.lock();
        try{
            let remoteFunc1=await getAttachedRemoteRigstryFunction(this.client1);
            await remoteFunc1.loadModule(__name__)
            if(rpcfunctionsProps in this.client1){
                this.rpcFunctions=(this.client1 as any)[rpcfunctionsProps];
            }else{
                this.rpcFunctions=new RemoteCodeContextFunctionImpl();
                this.rpcFunctions.client1=this.client1;
                await this.rpcFunctions.ensureInit();
                (this.client1 as any)[rpcfunctionsProps]=this.rpcFunctions;
            }
            this._remoteContext=await this.rpcFunctions!.jsExecObj(`return new lib.LocalRunCodeContext();`,null)
            await this.rpcFunctions!.jsExecStr(`await (await lib.importModule('${__name__}')).__priv_setupRemoteCodeContextEnv(arg,'${this.__contextId}');return '';`,this._remoteContext)
            this.epipe=(await this.connectPipe('__event_'+this.__contextId))!;
            this.pollEpipe();
            this.initDone.setResult(true)
            new FinalizationRegistry(()=>this.close()).register(this,undefined);
        }finally{
            await this.initMutex.unlock()
        }
    }
    protected _remoteContext:RpcExtendClientObject|null=null;
    protected initDone=new future<boolean>();
    async runCode(source: string,resultVariable?:string): Promise<{stringResult:string|null,err:{message:string,stack?:string}|null,resultVariable?:'_'}> {
        await this.initDone.get();
        resultVariable=resultVariable??'_';
        source=JSON.stringify(source);
        let r=await this.rpcFunctions!.codeContextJsExec(this._remoteContext!,`
            let r=await codeContext.runCode(${source},'${resultVariable}');
            return JSON.stringify(r);`)
        return JSON.parse(r);
    }
    async codeComplete(code: string, caret: number) {
        await this.initDone.get();
        let source=JSON.stringify(code);
        let ret=await this.rpcFunctions!.codeContextJsExec(this._remoteContext!,
            `let r=await codeContext.codeComplete(${source},${caret});
            return JSON.stringify(r);`)
        return JSON.parse(ret);
    }
    async jsExec(source: string): Promise<string> {
        await this.initDone.get();
        return await this.rpcFunctions!.codeContextJsExec(this._remoteContext!,source)
    }
    async connectPipe(name:string):Promise<Io|null>{
        let remoteIo=await this.rpcFunctions!.jsExecObj(`return arg.connectPipe('${name}')`,this._remoteContext);
        if(remoteIo==null){
            return null;
        }else{
            return new IoOverPxprpc(remoteIo);
        }
    }
    removePipe(name: string): void {
        throw new Error('Method not implemented.');
    }
    close(): void {
        this._remoteContext?.free();
        this.closed=true;
        this.epipe?.close();
    };
}


