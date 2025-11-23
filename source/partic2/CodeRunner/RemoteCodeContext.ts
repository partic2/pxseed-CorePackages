
import {defaultFuncMap,RpcExtendClient1,RpcExtendClientCallable,RpcExtendClientObject,RpcExtendServerCallable} from 'pxprpc/extend'
import { CodeContextEvent, CodeContextEventTarget,  LocalRunCodeContext,  RunCodeContext,jsExecLib } from './CodeContext';


import { assert, future, GenerateRandomString, mutex, throwIfAbortError } from 'partic2/jsutils1/base';
import { fromSerializableObject, RemoteReference, toSerializableObject } from './Inspector';
import {getAttachedRemoteRigstryFunction, getPersistentRegistered, getRpcFunctionOn, IoOverPxprpc} from 'partic2/pxprpcClient/registry'
import { Io } from 'pxprpc/base';
import { setupAsyncHook } from './jsutils2';

setupAsyncHook()

export let __name__='partic2/CodeRunner/RemoteCodeContext';

let pxprpcNamespace=__name__


async function jsExecFn(source:string,arg:any){
    try{
        let r=new Function('arg','lib',`return (async ()=>{${source}})()`)(arg,jsExecLib);
        if(r instanceof Promise){
            r=await r;
        }
        if(r===undefined)r=null;
        return r;
    }catch(e){
        throw(e)
    }
}

defaultFuncMap[pxprpcNamespace+'.jsExecObj']=new RpcExtendServerCallable(jsExecFn).typedecl('so->o');
defaultFuncMap[pxprpcNamespace+'.jsExecStr']=new RpcExtendServerCallable(jsExecFn).typedecl('so->s');
defaultFuncMap[pxprpcNamespace+'.codeContextJsExec']=new RpcExtendServerCallable(async (contextWrap:{value:RunCodeContext},code:string)=>{
    return contextWrap.value.jsExec(code);
}).typedecl('os->s');

/* 
remote code call like this
*/
async function __temp1(arg:any,lib:typeof jsExecLib){
}

class RemoteCodeContextFunctionImpl{
    funcs:(RpcExtendClientCallable|undefined|null)[]=[]
    client1?:RpcExtendClient1;
    async jsExecObj(code: string,arg:RpcExtendClientObject|null): Promise<RpcExtendClientObject|null> {
        return this.funcs[0]!.call(code,arg);
    }
    async jsExecStr(code: string,arg:RpcExtendClientObject|null): Promise<string> {
        return this.funcs[1]!.call(code,arg);
    }
    async codeContextJsExec(codeContextWrap:RpcExtendClientObject,code:string){
        return this.funcs[2]!.call(codeContextWrap,code);
    }
    async ensureInit(){
        let remoteFunc1=await getAttachedRemoteRigstryFunction(this.client1!);
        await (await remoteFunc1.loadModule(__name__)).free();
        if(this.funcs.length==0){
            this.funcs=[
                await getRpcFunctionOn(this.client1!,__name__+'.jsExecObj','so->o'),
                await getRpcFunctionOn(this.client1!,__name__+'.jsExecStr','so->s'),
                await getRpcFunctionOn(this.client1!,__name__+'.codeContextJsExec','os->s')
            ]
        }
    }    
}

let remoteEventPipeMagic='__priv_RemoteCodeContextEventPipe'

interface RunCodeContextConnector{
    value:RunCodeContext,
    close?:()=>void
}

export async function createConnectorWithNewRunCodeContext():Promise<RunCodeContextConnector>{
    let codeContext=new jsExecLib.LocalRunCodeContext();
    let eventPipeName=remoteEventPipeMagic;
    let serverSide=await codeContext.servePipe(eventPipeName);
    codeContext.event.onAnyEvent.add((event,target)=>{
        let cce=event as CodeContextEvent<any>;
        serverSide.send([new TextEncoder().encode(JSON.stringify([cce.type,cce.data]))]);
    });
    return {value:codeContext,close:()=>codeContext.close()};
}

export class RemoteRunCodeContext implements RunCodeContext{
    protected _remoteContext:RpcExtendClientObject|null=null;
    public constructor(public client1:RpcExtendClient1,remoteCodeContext?:RpcExtendClientObject){
        if(remoteCodeContext!=undefined){
            this._remoteContext=remoteCodeContext;
        }
        this.doInit();
    }
    event=new CodeContextEventTarget();
    protected _newCodeContext=false;
    protected rpcFunctions?:RemoteCodeContextFunctionImpl;
    protected epipe:Io|null=null;
    protected async pollEpipe(){
        try{
            while(this._remoteContext!==null && this.epipe!=null){
                let [type,data]=JSON.parse(new TextDecoder().decode(await this.epipe!.receive()));
                this.event.dispatchEvent(new CodeContextEvent(type,{data}));
            }
        }catch(err:any){
            throwIfAbortError(err)
        }
    }
    inited=new future<boolean>();
    protected initMutex=new mutex();
    protected async doInit(){
        await this.initMutex.lock();
        try{
            this.rpcFunctions=new RemoteCodeContextFunctionImpl();
            this.rpcFunctions.client1=this.client1;
            await this.rpcFunctions.ensureInit();
            if(this._remoteContext==undefined){
                this._remoteContext=await this.rpcFunctions!.jsExecObj(`return (await lib.importModule('partic2/CodeRunner/RemoteCodeContext')).createConnectorWithNewRunCodeContext()`,null)
                this._newCodeContext=true;
            }
            this.epipe=(await this.connectPipe(remoteEventPipeMagic));
            this.pollEpipe();
            this.inited.setResult(true)
            new FinalizationRegistry(()=>this.close()).register(this,undefined);
        }catch(err){
            this.inited.setException(err);
        }finally{
            await this.initMutex.unlock()
        }
    }
    async runCode(source: string,resultVariable?:string): Promise<{stringResult:string|null,err:{message:string,stack?:string}|null,resultVariable?:'_'}> {
        await this.inited.get();
        resultVariable=resultVariable??'_';
        source=JSON.stringify(source);
        let r=await this.rpcFunctions!.codeContextJsExec(this._remoteContext!,`
            let r=await codeContext.runCode(${source},'${resultVariable}');
            return JSON.stringify(r);`)
        return JSON.parse(r);
    }
    async codeComplete(code: string, caret: number) {
        await this.inited.get();
        let source=JSON.stringify(code);
        let ret=await this.rpcFunctions!.codeContextJsExec(this._remoteContext!,
            `let r=await codeContext.codeComplete(${source},${caret});
            return JSON.stringify(r);`)
        return JSON.parse(ret);
    }
    async jsExec(source: string): Promise<string> {
        await this.inited.get();
        return await this.rpcFunctions!.codeContextJsExec(this._remoteContext!,source)
    }
    async connectPipe(name:string):Promise<Io|null>{
        let remoteIo=await this.rpcFunctions!.jsExecObj(`return arg.value.connectPipe('${name}')`,this._remoteContext);
        if(remoteIo==null){
            return null;
        }else{
            return new IoOverPxprpc(remoteIo);
        }
    }
    close(): void {
        this.epipe?.close();
        if(this._newCodeContext){
            this._remoteContext?.free();
        }
        this._remoteContext=null;
    };
}


/*
    client1:The pxprpc client.
    connectCode: The remote code to get the RunCodeContexConnector. eg: `return (await lib.importModule('partic2/CodeRunner/RemoteCodeContext')).createConnectorWithNewRunCodeContext()`
*/
export async function connectToRemoteCodeContext(client1:RpcExtendClient1,connectCode:string):Promise<RemoteRunCodeContext>{
    let func1=new RemoteCodeContextFunctionImpl();
    func1.client1=client1;
    await func1.ensureInit();
    let remote1=await func1.jsExecObj(connectCode,null);
    assert(remote1!=null,'remote object is null');
    return new RemoteRunCodeContext(client1,remote1);
}