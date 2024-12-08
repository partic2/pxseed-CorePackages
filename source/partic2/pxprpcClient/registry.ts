import { ArrayBufferConcat, ArrayWrap2, GenerateRandomString, assert, copy, future, requirejs } from "partic2/jsutils1/base";
import { GetPersistentConfig, SavePersistentConfig,BasicMessagePort,IWorkerThread, CreateWorkerThread, lifecycle } from "partic2/jsutils1/webutils";
import { WebMessage, WebSocketIo } from "pxprpc/backend";
import { Client, Io } from "pxprpc/base";
import { RpcExtendClient1, RpcExtendClientCallable, RpcExtendClientObject, RpcExtendError, RpcExtendServerCallable, defaultFuncMap } from "pxprpc/extend";



export var __name__=requirejs.getLocalRequireModule(require);

export let rpcWorkerInitModule=['partic2/pxprpcClient/rpcworker'];

defaultFuncMap[__name__+'.loadModule']=new RpcExtendServerCallable((name:string)=>requirejs.promiseRequire(name)).typedecl('s->o');
defaultFuncMap[__name__+'.unloadModule']=new RpcExtendServerCallable((name:string)=>requirejs.undef(name)).typedecl('s->o');
defaultFuncMap[__name__+'.getDefined']=new RpcExtendServerCallable(()=>requirejs.getDefined()).typedecl('s->o');
defaultFuncMap[__name__+'.getConnectionFromUrl']=new RpcExtendServerCallable(async (url:string)=>{
    return await getConnectionFromUrl(url)
}).typedecl('s->o');

export interface RemoteRegistryFunction{
    loadModule(name:string):Promise<RpcExtendClientObject>;
    getConnectionFromUrl(url:string):Promise<RpcExtendClientObject>;
    io_send(io:RpcExtendClientObject,data:Uint8Array):Promise<void>;
    io_receive(io:RpcExtendClientObject):Promise<Uint8Array>;
}


export class RpcWorker{
    initDone=new future<boolean>();
    client?:RpcExtendClient1;
    protected wt?:IWorkerThread;
    conn?:Io;
    workerId='';
    constructor(workerId?:string){
        this.workerId=workerId??GenerateRandomString();
    }
    async ensureConnection():Promise<Io>{
        if(this.conn===undefined){
            try{
                this.conn=await new WebMessage.Connection().connect(this.workerId,1000);
            }catch(e){
                if(e instanceof Error && e.message.match(/server not found/)){
                    //mute
                }else{
                    throw e;
                }
            };
            if(this.conn===undefined){
                this.wt=CreateWorkerThread(this.workerId);
                await this.wt!.start();
                WebMessage.bind(this.wt!.port!)
                await this.wt!.runScript(`require([${rpcWorkerInitModule.map(v=>`'${v}'`).join(',')}],function(){
                    resolve('init');
                },reject)`,true);
                this.conn= await new WebMessage.Connection().connect(this.wt!.workerId,300);
            }
        }
        return this.conn!;
    }
    async ensureClient(){
        if(this.conn==undefined){
            await this.ensureConnection();
        }
        if(this.client==undefined){
            this.client=await new RpcExtendClient1(new Client(this.conn!)).init()
        }
        return this.client;
    }

}

export class ClientInfo{
    client:RpcExtendClient1|null=null;
    constructor(public name:string,public url:string){
    }
    connected(){
        if(this.client===null)return false;
        return this.client.conn.isRunning();
    }
    async disconnect(){
        this.client?.close();
        this.client=null;
    }
    async jsServerLoadModule(name:string){
        let fn=await getAttachedRemoteRigstryFunction(this.client!);
        return fn.loadModule(name);
    }
    async ensureConnected():Promise<RpcExtendClient1>{
        if(this.client!==null && this.client.conn.isRunning()){
            return this.client
        }else{
            let io1=await getConnectionFromUrl(this.url.toString());
            if(io1==null){
                let purl=new URL(this.url);
                throw new Error('No protocol handler for '+purl.protocol);
            }
            this.client=new RpcExtendClient1(new Client(io1));
            await this.client.init();
            return this.client;
        }
    }
}

class IoOverPxprpc implements Io{
    constructor(public remoteIo:RpcExtendClientObject,public funcs:RemoteRegistryFunction){
    }
    receive(): Promise<Uint8Array> {
        return this.funcs.io_receive(this.remoteIo);
    }
    send(data: Uint8Array[]): Promise<void> {
        return this.funcs.io_send(this.remoteIo,new Uint8Array(ArrayBufferConcat(data)));
    }
    close(): void {
        this.remoteIo.free();
    }
    
}

let attachedRemoteFunction = Symbol('AttachedRemoteRigstryFunction');

class RemoteRegistryFunctionImpl implements RemoteRegistryFunction{
    funcs:(RpcExtendClientCallable|undefined)[]=[]
    client1?:RpcExtendClient1;
    async loadModule(name: string): Promise<RpcExtendClientObject> {
        return this.funcs[0]!.call(name);
    }
    async getConnectionFromUrl(url: string): Promise<RpcExtendClientObject> {
        return this.funcs[1]!.call(url);
    }
    async io_send(io: RpcExtendClientObject, data: Uint8Array): Promise<void> {
        await this.funcs[2]!.call(io,data);
        return
    }
    async io_receive(io: RpcExtendClientObject): Promise<Uint8Array> {
        return this.funcs[3]!.call(io);
    }
    async ensureInit(){
        if(this.funcs.length==0){
            this.funcs=[
                (await this.client1!.getFunc(__name__+'.loadModule'))?.typedecl('s->o'),
                (await this.client1!.getFunc(__name__+'.getConnectionFromUrl'))?.typedecl('s->o'),
                (await this.client1!.getFunc('pxprpc_pp.io_send'))?.typedecl('ob->'),
                (await this.client1!.getFunc('pxprpc_pp.io_receive'))?.typedecl('o->b'),
            ]
        }
    }
    
}

export async function getAttachedRemoteRigstryFunction(client1:RpcExtendClient1):Promise<RemoteRegistryFunction>{
    if(!(attachedRemoteFunction in client1)){
        let t1=new RemoteRegistryFunctionImpl();
        t1.client1=client1;
        await t1.ensureInit();
        (client1 as any)[attachedRemoteFunction]=t1;
    }
    return (client1 as any)[attachedRemoteFunction];
}

export async function getConnectionFromUrl(url:string):Promise<Io|null>{
    let url2=new URL(url);
    if(url2.protocol=='webworker:'){
        let workerId=url2.pathname;
        let rpcWorker=new RpcWorker(workerId);
        return await rpcWorker.ensureConnection();
    }else if(['ws:','wss:'].indexOf(url2.protocol)>=0){
        return await new WebSocketIo().connect(url);
    }else if(url2.protocol=='iooverpxprpc:'){
        let firstSlash=url2.pathname.indexOf('/');
        let firstRpcName=decodeURIComponent(url2.pathname.substring(0,firstSlash));
        let restRpcPath=url2.pathname.substring(firstSlash+1);
        let cinfo=getRegistered(firstRpcName);
        if(cinfo==null){
            cinfo=await addClient(firstRpcName,firstRpcName);
        }
        await cinfo.ensureConnected()
        let fn=await getAttachedRemoteRigstryFunction(cinfo.client!);
        if(restRpcPath.indexOf('/')>=0){
            restRpcPath='iooverpxprpc:'+restRpcPath;
        }else{
            restRpcPath=decodeURIComponent(restRpcPath);
        }
        let remoteIo=await fn.getConnectionFromUrl(restRpcPath);
        return new IoOverPxprpc(remoteIo,fn);
    }else if(url2.protocol=='serviceworker:'){
        if(url2.pathname!=='1'){
            throw new Error('Only support default service worker(serviceworker:1)')
        }
        let swu=await import('partic2/jsutils1/webutilssw');
        let worker=await swu.ensureServiceWorkerInstalled();
        WebMessage.bind(worker!.port!)
        await worker!.runScript(`require([${rpcWorkerInitModule.map(v=>`'${v}'`).join(',')}],function(){
            resolve('init');
        },reject)`,true);
        return await new WebMessage.Connection().connect(worker!.workerId,300);
    }
    return null;
}

let registered=new Map<string,ClientInfo>();



export function getRegistered(name:string):ClientInfo|undefined;
export function getRegistered(name:string){
    return registered.get(name);
}

export function listRegistered(){
    return registered.entries();
}

export async function addClient(url:string,name?:string):Promise<ClientInfo>{
    name=(name==undefined||name==='')?url.toString():name;
    let clie=registered.get(name);
    if(clie!=null){
        return clie;
    }else{
        clie=new ClientInfo(name,url);
        registered.set(name,clie);
        return clie;
    }
}

export async function dropClient(name:string){
    let clie=registered.get(name);
    if(clie!=undefined){
        clie.disconnect()
        registered.delete(name)
    }
}

export const ServerHostRpcName='server host';
export const ServerHostWorker1RpcName='server host worker 1';
export const ServiceWorker='service worker 1';


export async function addBuiltinClient(){
    if(globalThis.location!=undefined && globalThis.WebSocket !=undefined){
        if(getRegistered(ServerHostRpcName)==null){
            let url=requirejs.getConfig().baseUrl as string;
            if(url.endsWith('/'))url=url.substring(0,url.length-1);
            let slashAt=url.lastIndexOf('/');
            let pxseedBase=slashAt>=0?url.substring(0,slashAt):'';
            let pxprpcUrl=(pxseedBase+'/pxprpc/0').replace(/^http/,'ws');
            addClient(pxprpcUrl,ServerHostRpcName);
        }
        if(getRegistered(ServerHostWorker1RpcName)==null){
            addClient('iooverpxprpc:'+ServerHostRpcName+'/'+
            encodeURIComponent('webworker:'+__name__+'/worker/1'),ServerHostWorker1RpcName)
        }
        if(getRegistered(ServiceWorker)==null){
            addClient('serviceworker:1',ServiceWorker);
        }
    }else{
        if(getRegistered(ServerHostWorker1RpcName)==null){
            addClient('webworker:'+__name__+'/worker/1',ServerHostWorker1RpcName)
        }
    }
}

export let persistent={
    save:async function(){
        let config=await GetPersistentConfig(__name__);
        config.registered=Array.from(registered.entries()).map(v=>({name:v[0],url:v[1].url}));
        await SavePersistentConfig(__name__);
    },
    load:async function load() {
        let config=await GetPersistentConfig(__name__);
        await addBuiltinClient();
        if('registered' in config){
            (config.registered as {name:string,url:string}[]).forEach(item=>{
                addClient(item.url,item.name);
            })
        }
    }
}
