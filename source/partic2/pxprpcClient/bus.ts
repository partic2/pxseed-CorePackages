import { defaultFuncMap, RpcExtendClient1, RpcExtendClientObject, RpcExtendServerCallable, TableSerializer } from "pxprpc/extend";
import { ArrayWrap2, Ref2, requirejs } from "partic2/jsutils1/base";
import { createIoPipe, getAttachedRemoteRigstryFunction, getPersistentRegistered, IoOverPxprpc, ServerHostRpcName } from "./registry";
import { Io } from "pxprpc/base";
import { getRpcFunctionOn } from 'partic2/pxprpcBinding/utils';

let __name__=requirejs.getLocalRequireModule(require);


export let BusHostServer=new Ref2(ServerHostRpcName);

export class PxseedJsIoServer{
    static serving:Record<string,PxseedJsIoServer>={}
    pendingAccept=new ArrayWrap2<Io>();
    closed=false;
    constructor(public name:string){
        this.pendingAccept.queueSizeLimit=5;
        if(PxseedJsIoServer.serving[name]!=undefined){
            PxseedJsIoServer.serving[name].close();
        }
        PxseedJsIoServer.serving[name]=this;
    }
    close(){
        this.pendingAccept.cancelWaiting();
        this.closed=true;
        this.pendingAccept.arr().length=0;
        delete PxseedJsIoServer.serving[this.name];
    }
    async accept(){
        if(this.closed)throw new Error('closed.');
        return await this.pendingAccept.queueBlockShift();
    }
    async connect(){
        if(this.closed)throw new Error('closed.');
        let [a,b]=createIoPipe();
        await this.pendingAccept.queueBlockPush(b);
        return a;
    }
    static async connect(name:string){
        if(this.serving[name]!=undefined){
            return this.serving[name].connect();
        }else{
            return null;
        }
    }
}
defaultFuncMap[__name__+'.newPxseedJsIoServer']=new RpcExtendServerCallable(async (name:string)=>new PxseedJsIoServer(name)).typedecl('s->o');
defaultFuncMap[__name__+'.PxseedJsIoServerAccept']=new RpcExtendServerCallable(async (server:PxseedJsIoServer)=>{
    return await server.accept();
}).typedecl('o->o');
defaultFuncMap[__name__+'.PxseedJsIoServerConnect']=new RpcExtendServerCallable(async (name:string)=>{
    return await PxseedJsIoServer.connect(name);
}).typedecl('s->o');
defaultFuncMap[__name__+'.PxseedJsIoServerPrefixQuery']=new RpcExtendServerCallable(async (prefix:string)=>{
    return new TableSerializer().fromArray(Object.keys(PxseedJsIoServer.serving).filter(t1=>t1.startsWith(prefix))).build()
}).typedecl('s->b');

export let RemotePxseedJsIoServer={
    connect:async (name:string,client1?:RpcExtendClient1):Promise<Io>=>{
        if(client1==undefined){
            client1=await (await getPersistentRegistered(BusHostServer.get()))!.ensureConnected();
        }
        await (await getAttachedRemoteRigstryFunction(client1)).loadModule(__name__)
        let fn=await getRpcFunctionOn(client1,__name__+'.PxseedJsIoServerConnect','s->o');
        return new IoOverPxprpc(await fn!.call(name));
    },
    serve:async (name:string,cb:{
        onConnect:(newConn:Io)=>void,
        onError?:(err:Error)=>void
    },client1?:RpcExtendClient1):Promise<{close:()=>void}>=>{
        if(client1==undefined){
            client1=await (await getPersistentRegistered(BusHostServer.get()))!.ensureConnected();
        }
        await (await getAttachedRemoteRigstryFunction(client1)).loadModule(__name__)
        let fn=await getRpcFunctionOn(client1,__name__+'.newPxseedJsIoServer','s->o');
        let remoteServer=await fn!.call(name) as RpcExtendClientObject;
        fn=await getRpcFunctionOn(client1,__name__+'.PxseedJsIoServerAccept','o->o');
        fn!.poll((err,result)=>{
            if(err!=null){
                remoteServer.free();
                cb.onError?.(err);
            }else{
                cb.onConnect(new IoOverPxprpc(result));
            }
        },remoteServer);
        return {close:()=>remoteServer.free()}
    },
    prefixQuery:async (prefix:string,client1?:RpcExtendClient1)=>{
        if(client1==undefined){
            client1=await (await getPersistentRegistered(BusHostServer.get()))!.ensureConnected();
        }
        await (await getAttachedRemoteRigstryFunction(client1)).loadModule(__name__)
        let fn=await getRpcFunctionOn(client1,__name__+'.PxseedJsIoServerPrefixQuery','s->b');
        return new TableSerializer().load(await fn!.call(prefix) as Uint8Array).toArray() as string[];
    }

}
