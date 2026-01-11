
import {defaultFuncMap,RpcExtendClient1,RpcExtendClientCallable,RpcExtendClientObject,RpcExtendServerCallable} from 'pxprpc/extend'
import { CodeContextEvent, CodeContextEventTarget,  LocalRunCodeContext,  RunCodeContext,jsExecLib } from './CodeContext';


import { assert, future, GenerateRandomString, mutex, throwIfAbortError } from 'partic2/jsutils1/base';
import {easyCallRemoteJsonFunction, getAttachedRemoteRigstryFunction, RpcSerializeMagicMark} from 'partic2/pxprpcClient/registry'
import {getRpcFunctionOn} from 'partic2/pxprpcBinding/utils'
import { Io } from 'pxprpc/base';
import { setupAsyncHook } from './jsutils2';
import type { CodeCompletionItem } from './Inspector';

setupAsyncHook()

export let __name__='partic2/CodeRunner/RemoteCodeContext';

/* 
remote code call like this
*/
async function __temp1(arg:any,lib:typeof jsExecLib){
}

export class RunCodeContextConnector{
    [RpcSerializeMagicMark]:{}
    constructor(public value:RunCodeContext){
        this[RpcSerializeMagicMark]={}
    };
    close?:()=>void
    async pullCodeContextEvent(timeGt:number){
        let codeContext=this.value;
        let events:any[]=[];
        const checkEvent=()=>{
            events=codeContext.event._cachedEventQueue.arr().filter(t1=>t1.time>timeGt)
                .map(t1=>({type:t1.event.type,data:(t1.event as any).data,time:t1.time}));
        }
        checkEvent();
        if(events.length===0){
            await codeContext.event._cachedEventQueue.waitForQueueChange();
            checkEvent();
        }
        return events;
    }
    async runCode(source: string,resultVariable?:string): Promise<{stringResult:string|null,err:string|null}>{
        return this.value.runCode(source,resultVariable);
    }
    async codeComplete(code: string, caret: number):Promise<CodeCompletionItem[]>{
        return this.value.codeComplete(code,caret)
    }
    async jsExec(source: string): Promise<string>{
        return this.value.jsExec(source);
    }
}

export async function createConnectorWithNewRunCodeContext():Promise<RunCodeContextConnector>{
    let codeContext=new jsExecLib.LocalRunCodeContext();
    let t1=new RunCodeContextConnector(codeContext)
    t1.close=()=>codeContext.close()
    return t1;
}


export class RemoteRunCodeContext implements RunCodeContext{
    //RunCodeContextConnector here is usually a rpc object, not the real local object.
    protected _remoteContext:RunCodeContextConnector|null=null;
    public constructor(public client1:RpcExtendClient1,remoteCodeContext?:RunCodeContextConnector){
        if(remoteCodeContext!=undefined){
            this._remoteContext=remoteCodeContext;
        }
        this.doInit();
    }
    event=new CodeContextEventTarget();
    protected async pullEventLoop(){
        try{
            let lastEventTime=0;
            while(this._remoteContext!=null){
                let events=await this._remoteContext!.pullCodeContextEvent(lastEventTime)
                for(let t1 of events){
                    this.event.dispatchEvent(new CodeContextEvent(t1.type,{data:t1.data}));
                }
                if(events.length>0){
                    lastEventTime=events.at(-1)!.time;
                }
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
            await (await getAttachedRemoteRigstryFunction(this.client1)).loadModule(__name__);
            if(this._remoteContext==undefined){
                this._remoteContext=await easyCallRemoteJsonFunction(this.client1,__name__,'connectToCodeContextFromCode',[
                    `return (await lib.importModule('partic2/CodeRunner/RemoteCodeContext')).createConnectorWithNewRunCodeContext()`
                ])
            }
            this.inited.setResult(true);
            this.pullEventLoop();
            new FinalizationRegistry(()=>this.close()).register(this,undefined);
        }catch(err){
            this.inited.setException(err);
        }finally{
            await this.initMutex.unlock()
        }
    }
    async runCode(source: string,resultVariable?:string): Promise<{stringResult:string|null,err:string|null}> {
        await this.inited.get();
        return await this._remoteContext!.runCode(source,resultVariable);
    }
    async codeComplete(code: string, caret: number) {
        await this.inited.get();
        return await this._remoteContext!.codeComplete(code,caret);
    }
    async jsExec(source: string): Promise<string> {
        await this.inited.get();
        return await this._remoteContext!.jsExec(source);
    }
    close(): void {
        let t1=this._remoteContext;
        this._remoteContext=null;
        if(t1!=null){
            (async ()=>{
                await t1.runCode(`event.dispatchEvent(new Event('remote-disconnected'))`).catch();
                await t1.close?.()
            })()
        }
    };
}


export async function connectToCodeContextFromCode(connectCode:string){
    let r=await (new Function('lib',`return (async ()=>{${connectCode}})()`)(jsExecLib));
    return r
}
/*
    client1:The pxprpc client.
    connectCode: The remote code to get the RunCodeContexConnector. eg: `return (await lib.importModule('partic2/CodeRunner/RemoteCodeContext')).createConnectorWithNewRunCodeContext()`
*/
export async function connectToRemoteCodeContext(client1:RpcExtendClient1,connectCode:string):Promise<RemoteRunCodeContext>{
    return new RemoteRunCodeContext(client1,await easyCallRemoteJsonFunction(client1,__name__,'connectToCodeContextFromCode',[connectCode]));
}