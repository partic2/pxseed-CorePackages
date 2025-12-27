
import {defaultFuncMap,RpcExtendClient1,RpcExtendClientCallable,RpcExtendClientObject,RpcExtendServerCallable} from 'pxprpc/extend'
import { CodeContextEvent, CodeContextEventTarget,  LocalRunCodeContext,  RunCodeContext,jsExecLib } from './CodeContext';


import { assert, future, GenerateRandomString, mutex, throwIfAbortError } from 'partic2/jsutils1/base';
import { fromSerializableObject, RemoteReference, toSerializableObject } from './Inspector';
import {getAttachedRemoteRigstryFunction, getPersistentRegistered, getRpcFunctionOn, IoOverPxprpc} from 'partic2/pxprpcClient/registry'
import { Io } from 'pxprpc/base';
import { setupAsyncHook } from './jsutils2';

setupAsyncHook()

export let __name__='partic2/CodeRunner/RemoteCodeContext';



async function remoteCall(stringParam:string,objectParam:any){
    let fnMap={
        connectCodeContext:async (source:string)=>{
            let r=await (new Function('lib',`return (async ()=>{${source}})()`)(jsExecLib));
            return ['',r];
        },
        callProp1:async (prop:string,param:any[])=>{
            return [JSON.stringify(await objectParam.value[prop](...param)),null];
        },
        pullCodeContextEvent:async (timeGt:number)=>{
            let codeContext=objectParam.value as RunCodeContext
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
            return [JSON.stringify(events),null];
        }
    }
    let {fn,param}=JSON.parse(stringParam);
    return (fnMap as any)[fn](...param);
}


defaultFuncMap[__name__+'.remoteCall']=new RpcExtendServerCallable(remoteCall).typedecl('so->so');


/* 
remote code call like this
*/
async function __temp1(arg:any,lib:typeof jsExecLib){
}


interface RunCodeContextConnector{
    value:RunCodeContext,
    close?:()=>void
}

export async function createConnectorWithNewRunCodeContext():Promise<RunCodeContextConnector>{
    let codeContext=new jsExecLib.LocalRunCodeContext();
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
    protected remoteCall?:RpcExtendClientCallable|null;
    protected async pullEventLoop(){
        try{
            let lastEventTime=0;
            while(this._remoteContext!=null){
                let t1=await this.remoteCall!.call(JSON.stringify({fn:'pullCodeContextEvent',
                    param:[lastEventTime]
                }),this._remoteContext);
                let events=JSON.parse(t1[0]) as any[];
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
            (await (await getAttachedRemoteRigstryFunction(this.client1)).loadModule(__name__)).free();
            this.remoteCall=await getRpcFunctionOn(this.client1,__name__+'.remoteCall','so->so');
            assert(this.remoteCall!=null);
            if(this._remoteContext==undefined){
                let t1=await this.remoteCall!.call(JSON.stringify({fn:'connectCodeContext',
                    param:[`return (await lib.importModule('partic2/CodeRunner/RemoteCodeContext')).createConnectorWithNewRunCodeContext()`]
                }),null)
                this._remoteContext=t1[1];
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
    async runCode(source: string,resultVariable?:string): Promise<{stringResult:string|null,err:{message:string,stack?:string}|null,resultVariable?:'_'}> {
        await this.inited.get();
        let t1=await this.remoteCall!.call(JSON.stringify({fn:'callProp1',
            param:['runCode',[source,resultVariable]]
        }),this._remoteContext)
        return JSON.parse(t1[0]);
    }
    async codeComplete(code: string, caret: number) {
        await this.inited.get();
        let t1=await this.remoteCall!.call(JSON.stringify({fn:'callProp1',
            param:['codeComplete',[code,caret]]
        }),this._remoteContext)
        return JSON.parse(t1[0]);
    }
    async jsExec(source: string): Promise<string> {
        await this.inited.get();
        let t1=await this.remoteCall!.call(JSON.stringify({fn:'callProp1',
            param:['jsExec',[source]]
        }),this._remoteContext)
        return JSON.parse(t1[0]);
    }
    close(): void {
        let t1=this._remoteContext;
        this._remoteContext=null;
        if(t1!=null){
            (async ()=>{
                await this.remoteCall!.call(JSON.stringify({fn:'callProp1',
                    param:['runCode',[`event.dispatchEvent(new Event('remote-disconnected'))`]]
                }),t1).catch();
                await t1.free()
            })()
        }
    };
}


/*
    client1:The pxprpc client.
    connectCode: The remote code to get the RunCodeContexConnector. eg: `return (await lib.importModule('partic2/CodeRunner/RemoteCodeContext')).createConnectorWithNewRunCodeContext()`
*/
export async function connectToRemoteCodeContext(client1:RpcExtendClient1,connectCode:string):Promise<RemoteRunCodeContext>{
    (await (await getAttachedRemoteRigstryFunction(client1)).loadModule(__name__)).free();
    let remoteCall=await getRpcFunctionOn(client1,__name__+'.remoteCall','so->so');
    assert(remoteCall!=null,'remote function not found.');
    let t1=await remoteCall!.call(JSON.stringify({fn:'connectCodeContext',
        param:[connectCode]
    }),null)
    assert(t1!=null,'connect code failed to return a connector.');
    return new RemoteRunCodeContext(client1,t1[1]);
}