import { ArrayBufferConcat, ArrayWrap2, GenerateRandomString, Ref2, assert, future, mutex, requirejs, sleep } from "partic2/jsutils1/base";
import { GetPersistentConfig, SavePersistentConfig,IWorkerThread, CreateWorkerThread, lifecycle, GetUrlQueryVariable, getWWWRoot } from "partic2/jsutils1/webutils";
import { Client, Io, Serializer, Server } from "pxprpc/base";
import { RpcExtendClient1, RpcExtendClientCallable, RpcExtendClientObject, RpcExtendServer1, RpcExtendServerCallable, TableSerializer, defaultFuncMap } from "pxprpc/extend";

import { Singleton } from "partic2/CodeRunner/jsutils2";
import { easyCallRemoteJsonFunction, importRemoteModule, openConnectionFromUrl } from "./pxseedremotefuncs";

import { getRpcClientConnectWorkerParent, __internal__ as workerinternal } from "./rpcworker";

export * from './pxseedremotefuncs'

export var __name__=requirejs.getLocalRequireModule(require);

export let rpcWorkerInitModule:Array<string|{module:string,func:string}>=[];

interface UpdateClientInfoArgs{url:string,name?:string,persistent?:boolean};

export class ClientInfo{
    client:RpcExtendClient1|null=null;
    url:string='';
    name:string='';
    persistent=false;
    updateAt=0;
    update(args:UpdateClientInfoArgs){
        Object.assign(this,args);
        this.updateAt=new Date().getTime();
        return this;
    }
    constructor(){}
    connected(){
        if(this.client===null)return false;
        return this.client.baseClient.isRunning();
    }
    async disconnect(){
        this.client?.close();
        this.client=null;
    }
    protected connecting=new mutex();
    async ensureConnected():Promise<RpcExtendClient1>{
        return await this.connecting.exec(async ()=>{
            if(this.connected()){
                return this.client!
            }else{
                let io1=await openConnectionFromUrl(this.url.toString());
                if(io1==null){
                    throw new Error('No protocol handler for '+this.url);
                }
                this.client=new RpcExtendClient1(new Client(io1));
                await this.client.init();
                return this.client;
            }
        })
    }
    toJSON(){
        return {name:this.name,url:this.url,persistent:this.persistent};
    }
}



export let __internal__={
    isServingRpcName:{} as Record<string,future<boolean>>,
}

let registered=new Map<string,ClientInfo>();


//Only get current cached registered client. Use "getPersistentRegistered" to get all possible registered client.
export async function getRegistered(name:string):Promise<ClientInfo|undefined>{
    return registered.get(name);
}

//Only get current cached registered client. Use "listPersistentRegistered" to get all possible registered client.
export async function listRegistered():Promise<Array<[string,ClientInfo]>>{
    return Array.from(registered.entries());
}

export async function addClient(args:UpdateClientInfoArgs):Promise<void>{
    let {name}=args;
    name=name??args.url;
    let clie=registered.get(name);
    if(clie==undefined){
        //Skip if existed, To avoid connection lost unexpectedly.
        clie=new ClientInfo();
        clie.name=args.name??clie.url;
    }
    clie.update(args);
    registered.set(name,clie);
    
}

export async function removeClient(name:string):Promise<void>{
    let clie=registered.get(name);
    if(clie!=undefined){
        clie.disconnect().catch(()=>{})
        registered.delete(name)
    }
}

// Get client after load persistent clients.
//NOTE:this function will call addDefaultPxseedJsBuiltinRpcClient, which may connect ServerHost internal.
//     So don't use this function directly when connecting to ServerHost, use persistent.load() instead.
export async function getPersistentRegistered(name:string){
    await persistent.load();
    await addDefaultPxseedJsBuiltinRpcClient()
    return registered.get(name);
}

//See also getPersistentRegistered
export async function listPersistentRegistered(){
    await persistent.load();
    await addDefaultPxseedJsBuiltinRpcClient()
    return Array.from(registered.entries());
}

export async function setIsServingRpcName(name:string,isServing:boolean){
    let f=__internal__.isServingRpcName[name];
    if(f==undefined){
        f=new future();
        __internal__.isServingRpcName[name]=f;
    }
    f.setResult(isServing);
}

export async function getIsServingRpcName(name:string){
    if(__internal__.isServingRpcName[name]==undefined){
        __internal__.isServingRpcName[name]=new future();
    }
    try{
        await persistent.load()
        let rpc=await getRegistered(name);
        if(rpc!=undefined){
            await easyCallRemoteJsonFunction(await rpc.ensureConnected(),__name__,'setIsServingRpcName',[name,true])
        }
        if(!__internal__.isServingRpcName[name].done){
            __internal__.isServingRpcName[name].setResult(false);
        }
    }catch(err){
        __internal__.isServingRpcName[name].setResult(false);
    };
    return await __internal__.isServingRpcName[name].get();
}

export async function isServerHost(){
    return getIsServingRpcName(ServerHostRpcName);
}



//"ServerHost" usually refer to the server hosting pxseed web, and shared by all js worker in one pxeed application.
export const ServerHostRpcName='server host';

//"ServerHostWorker1" refer to the worker spawn by ServerHost to handle the most remote requests.
export const ServerHostWorker1RpcName='server host worker 1';

export const WebWorker1RpcName='webworker 1'
export const ServiceWorkerRpcName='service worker 1';



let persistent={
    save:async function(){
        let config=await GetPersistentConfig(__name__);
        config.registered=Array.from(registered.values()).filter(t1=>t1.persistent).map(t1=>t1.toJSON());
        await SavePersistentConfig(__name__,config);
    },
    load:async function() {
        let config=await GetPersistentConfig(__name__);
        if(config.registered != undefined){
            (config.registered as {name:string,url:string}[]).forEach(item=>{
                let clie=registered.get(item.name);
                if(clie==undefined){
                    //Skip if existed, To avoid connection lost unexpected.
                    clie=new ClientInfo();
                }
                clie.update(item)
                clie.persistent=true;
                registered.set(clie.name,clie);
            })
        }       
    }
}

export async function persistentClientStore(call:'save'|'load'){
    return await persistent[call]();
}

export let ServerHostRpc=new Singleton(async ()=>(await getPersistentRegistered(ServerHostRpcName))!.ensureConnected());
export let ServerHostWorker1Rpc=new Singleton(async ()=>(await getPersistentRegistered(ServerHostWorker1RpcName))!.ensureConnected());
export let WebWorker1Rpc=new Singleton(async ()=>(await getPersistentRegistered(WebWorker1RpcName))!.ensureConnected());
export let ServiceWorkerRpc=new Singleton(async ()=>(await getPersistentRegistered(ServiceWorkerRpcName))!.ensureConnected());

let addingDefaultPxseedJsBuiltinRpcClient=new mutex();
async function addDefaultPxseedJsBuiltinRpcClient(){
    await addingDefaultPxseedJsBuiltinRpcClient.exec(async ()=>{
        if(globalThis.location!=undefined && ['http:','https:'].includes(globalThis.location.protocol)){
            if(globalThis.navigator?.serviceWorker!=undefined && await getRegistered(ServiceWorkerRpcName)==null){
                await addClient({url:'serviceworker:1',name:ServiceWorkerRpcName});
            }
        }
        if(await getRegistered(WebWorker1RpcName)==null){
            await addClient({url:'webworker:'+__name__+'/worker/1',name:WebWorker1RpcName})
        }
        if(await getRegistered(ServerHostRpcName)!=null && await getRegistered(ServerHostWorker1RpcName)==null && !workerinternal.isPxseedWorker){
            await addClient({
                url:'iooverpxprpc:'+ServerHostRpcName+'/'+
            encodeURIComponent('webworker:'+__name__+'/worker/1'),
                name:ServerHostWorker1RpcName})
        }
    })
}
