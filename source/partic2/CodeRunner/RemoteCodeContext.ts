
import {defaultFuncMap,RpcExtendClient1,RpcExtendClientCallable,RpcExtendClientObject,RpcExtendServerCallable} from 'pxprpc/extend'
import { CodeContextEvent, CodeContextEventTarget,  LocalRunCodeContext,  RunCodeContext } from './CodeContext';


import { assert, future, GenerateRandomString, mutex, throwIfAbortError } from 'partic2/jsutils1/base';
import {easyCallRemoteJsonFunction, getAttachedRemoteRigstryFunction, RpcSerializeMagicMark} from 'partic2/pxprpcClient/registry'
import {getRpcFunctionOn} from 'partic2/pxprpcBinding/utils'
import { Io } from 'pxprpc/base';
import { setupAsyncHook } from './jsutils2';

setupAsyncHook()

export let __name__='partic2/CodeRunner/RemoteCodeContext';

interface IRunCodeContextConnector{
    [RpcSerializeMagicMark]:Record<string,any>
    pullCodeContextEvent():Promise<any[]>
    pushCodeContextEvent(event:{type:string,data:any}):Promise<void>
    runCode(source: string,resultVariable?:string): Promise<{stringResult:string|null,err:string|null}>
    callFunction(name:string,args:any[]):Promise<any>
    close?:()=>void
}

export class RunCodeContextConnector implements IRunCodeContextConnector{
    [RpcSerializeMagicMark]={}
    connectorId=GenerateRandomString();
    constructor(public value:RunCodeContext){
    };
    close?:()=>void
    async pullCodeContextEvent(){
        let codeContext=this.value;
        return (await codeContext.event._buffer.take(this.connectorId)).map(e=>e.event);
    }
    async pushCodeContextEvent(event:{type:string,data:any}){
        this.value.event._dispatchEventOnEventTarget(new CodeContextEvent(event.type,{data:event.data}));
    }
    async runCode(source: string,resultVariable?:string): Promise<{stringResult:string|null,err:string|null}>{
        return this.value.runCode(source,resultVariable);
    }
    async callFunction(name:string,args:any[]){
        return this.value.callFunction(name,args)
    }
}

export async function createConnectorWithNewRunCodeContext():Promise<RunCodeContextConnector>{
    let codeContext=new LocalRunCodeContext();
    let t1=new RunCodeContextConnector(codeContext)
    t1.close=()=>codeContext.close()
    return t1;
}

class RemoteCodeContextEventTarget extends CodeContextEventTarget{
    constructor(public rcc:RemoteRunCodeContext){
        super();
    }
    dispatchEvent(event: CodeContextEvent): boolean {
        this.rcc._remoteContext?.pushCodeContextEvent({type:event.type,data:event.data});
        return super.dispatchEvent(event);
    }
}

export class RemoteRunCodeContext implements RunCodeContext{
    //RunCodeContextConnector here is usually a rpc object, not the real local object.
    _remoteContext:IRunCodeContextConnector|null=null;
    public constructor(public client1:RpcExtendClient1,remoteCodeContext?:IRunCodeContextConnector){
        if(remoteCodeContext!=undefined){
            this._remoteContext=remoteCodeContext;
        }
        this.doInit();
    }
    
    event=new RemoteCodeContextEventTarget(this);
    protected async pullEventLoop(){
        try{
            while(this._remoteContext!=null){
                let events=await this._remoteContext!.pullCodeContextEvent()
                for(let t1 of events){
                    this.event._dispatchEventOnEventTarget(new CodeContextEvent(t1.type,{data:t1.data}));
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
                this._remoteContext=await easyCallRemoteJsonFunction(this.client1,__name__,
                    'createConnectorWithNewRunCodeContext',[])
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
    async callFunction(name: string, args: any[]): Promise<any> {
        await this.inited.get();
        return await this._remoteContext!.callFunction(name,args);
    }
    close(): void {
        let t1=this._remoteContext;
        this._remoteContext=null;
        if(t1!=null){
            (async ()=>{
                this.event.dispatchEvent(new CodeContextEvent('remote-disconnected'))
                t1.close?.()
            })().catch(()=>{})
        }
    };
}
