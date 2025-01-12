import { ArrayBufferConcat, ArrayWrap2, GenerateRandomString, future, requirejs } from "partic2/jsutils1/base";
import { GetPersistentConfig, SavePersistentConfig,IWorkerThread, CreateWorkerThread, lifecycle, GetUrlQueryVariable } from "partic2/jsutils1/webutils";
import { WebMessage, WebSocketIo } from "pxprpc/backend";
import { Client, Io, Server } from "pxprpc/base";
import { RpcExtendClient1, RpcExtendClientCallable, RpcExtendClientObject, RpcExtendServer1, RpcExtendServerCallable, defaultFuncMap } from "pxprpc/extend";



export var __name__=requirejs.getLocalRequireModule(require);

export let rpcWorkerInitModule:string[]=[];

defaultFuncMap[__name__+'.loadModule']=new RpcExtendServerCallable(async (name:string)=>requirejs.promiseRequire(name)).typedecl('s->o');
defaultFuncMap[__name__+'.unloadModule']=new RpcExtendServerCallable(async (name:string)=>requirejs.undef(name)).typedecl('s->o');
defaultFuncMap[__name__+'.getDefined']=new RpcExtendServerCallable(async ()=>requirejs.getDefined()).typedecl('s->o');
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
                await this.wt!.runScript(`require(['partic2/pxprpcClient/rpcworker'],function(workerInit){
                    workerInit.loadRpcWorkerInitModule(${JSON.stringify(rpcWorkerInitModule)}).then(resolve,reject);
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

export class IoOverPxprpc implements Io{
    public funcs?:RemoteRegistryFunction;
    constructor(public remoteIo:RpcExtendClientObject){
    }
    async receive(): Promise<Uint8Array> {
        if(this.funcs==undefined){
            this.funcs=await getAttachedRemoteRigstryFunction(this.remoteIo.client);
        }
        return await this.funcs.io_receive(this.remoteIo);
    }
    async send(data: Uint8Array[]): Promise<void> {
        if(this.funcs==undefined){
            this.funcs=await getAttachedRemoteRigstryFunction(this.remoteIo.client);
        }
        return await this.funcs.io_send(this.remoteIo,new Uint8Array(ArrayBufferConcat(data)));
    }
    close(): void {
        this.remoteIo.free();
    }
}

export function createIoPipe():[Io,Io]{
    let a2b=new ArrayWrap2<Uint8Array>();
    let b2a=new ArrayWrap2<Uint8Array>();
    closed=false
    function oneSide(r:ArrayWrap2<Uint8Array>,s:ArrayWrap2<Uint8Array>):Io{
        return {
            receive:async():Promise<Uint8Array>=> {
                if(closed)throw new Error('closed.');
                return r.queueBlockShift();
            },
            send: async (data: Uint8Array[]): Promise<void> =>{
                if(closed)throw new Error('closed.');
                for(let t1 of data){
                    s.queueSignalPush(t1)
                }
            },
            close: ()=>{
                closed=true;
                r.cancelWaiting();
                s.cancelWaiting();
            }
        }
    }
    return [oneSide(a2b,b2a),oneSide(b2a,a2b)];
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
    if(url2.protocol=='pxpwebmessage:'){
        let conn=new WebMessage.Connection()
        await conn.connect(url2.pathname,300);
        return conn;
    }else if(url2.protocol=='webworker:'){
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
        return new IoOverPxprpc(remoteIo);
    }else if(url2.protocol=='serviceworker:'){
        if(url2.pathname!=='1'){
            throw new Error('Only support default service worker(serviceworker:1)')
        }
        let swu=await import('partic2/jsutils1/webutilssw');
        let worker=await swu.ensureServiceWorkerInstalled();
        WebMessage.bind(worker!.port!)
        await worker!.runScript(`require(['partic2/pxprpcClient/rpcworker'],function(workerInit){
            workerInit.loadRpcWorkerInitModule(${JSON.stringify(rpcWorkerInitModule)}).then(resolve,reject);
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
    let clie=new ClientInfo(name,url);
    registered.set(name,clie);
    await persistent.save();
    return clie;
}

export async function removeClient(name:string){
    let clie=registered.get(name);
    if(clie!=undefined){
        clie.disconnect()
        registered.delete(name)
    }
    await persistent.save();
}

export const ServerHostRpcName='server host';
export const ServerHostWorker1RpcName='server host worker 1';
export const WebWorker1RpcName='webworker 1'
export const ServiceWorker='service worker 1';


export async function addBuiltinClient(){
    if(globalThis.location!=undefined && globalThis.WebSocket !=undefined){
        /*
        //Moved to pxseedServer2023/webentry, because key is required sometime.
        if(getRegistered(ServerHostRpcName)==null){
            let url=requirejs.getConfig().baseUrl as string;
            if(url.endsWith('/'))url=url.substring(0,url.length-1);
            let slashAt=url.lastIndexOf('/');
            let pxseedBase=slashAt>=0?url.substring(0,slashAt):'';
            let pxprpcUrl=(pxseedBase+'/pxprpc/0').replace(/^http/,'ws');
            let wstest:WebSocketIo
            try{
                wstest=await new WebSocketIo().connect(pxprpcUrl);
                wstest.close();
                addClient(pxprpcUrl,ServerHostRpcName);
            }catch(e){}
        }
        */
        if(getRegistered(ServerHostRpcName)!=null && getRegistered(ServerHostWorker1RpcName)==null){
            addClient('iooverpxprpc:'+ServerHostRpcName+'/'+
            encodeURIComponent('webworker:'+__name__+'/worker/1'),ServerHostWorker1RpcName)
        }
        if(getRegistered(ServiceWorker)==null){
            addClient('serviceworker:1',ServiceWorker);
        }
        if(getRegistered(WebWorker1RpcName)==null){
            addClient('webworker:'+__name__+'/worker/1',WebWorker1RpcName)
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
        if('registered' in config){
            (config.registered as {name:string,url:string}[]).forEach(item=>{
                addClient(item.url,item.name);
            })
        }
        await addBuiltinClient();
    }
}
//Critical Security Risk. this value can be use to communicate cross-origin.
export let rpcId=(globalThis as any).__workerId??GenerateRandomString();

if('window' in globalThis){
    if(globalThis.window.opener!=null){
        WebMessage.bind({
            postMessage:(data,opt)=>globalThis.window.opener.postMessage(data,{targetOrigin:'*',...opt}),
            addEventListener:()=>{},
            removeEventListener:()=>{}
        })
    }
    if(globalThis.window.parent!=undefined && globalThis.window.self!=globalThis.window.parent){
        WebMessage.bind({
            postMessage:(data,opt)=>globalThis.window.parent.postMessage(data,{targetOrigin:'*',...opt}),
            addEventListener:()=>{},
            removeEventListener:()=>{}
        });
    }
    //Critical Security Risk
    new WebMessage.Server((conn)=>{
        //mute error
        new RpcExtendServer1(new Server(conn)).serve().catch(()=>{});
    }).listen(rpcId);
    WebMessage.postMessageOptions.targetOrigin='*'   
}
