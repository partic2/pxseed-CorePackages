import { ArrayBufferConcat, ArrayWrap2, GenerateRandomString, future, mutex, requirejs, sleep } from "partic2/jsutils1/base";
import { GetPersistentConfig, SavePersistentConfig,IWorkerThread, CreateWorkerThread, lifecycle, GetUrlQueryVariable, getWWWRoot } from "partic2/jsutils1/webutils";
import { WebMessage, WebSocketIo } from "pxprpc/backend";
import { Client, Io, Server } from "pxprpc/base";
import { RpcExtendClient1, RpcExtendClientCallable, RpcExtendClientObject, RpcExtendServer1, RpcExtendServerCallable, TableSerializer, defaultFuncMap } from "pxprpc/extend";
import { getRpcClientConnectWorkerParent, rpcId } from "./rpcworker";
import {getRpcFunctionOn,getRpcLocalVariable,setRpcLocalVariable} from 'partic2/pxprpcBinding/utils'

export var __name__=requirejs.getLocalRequireModule(require);

export const RpcSerializeMagicMark='__DUz66NYkWuMdex9k2mvwBbYN__'

export let rpcWorkerInitModule:string[]=[];

defaultFuncMap[__name__+'.loadModule']=new RpcExtendServerCallable(async (name:string)=>{await import(name)}).typedecl('s->');
defaultFuncMap[__name__+'.unloadModule']=new RpcExtendServerCallable(async (name:string)=>requirejs.undef(name)).typedecl('s->');
defaultFuncMap[__name__+'.getDefined']=new RpcExtendServerCallable(async ()=>requirejs.getDefined()).typedecl('s->o');
defaultFuncMap[__name__+'.getConnectionFromUrl']=new RpcExtendServerCallable(async (url:string)=>{
    return await getConnectionFromUrl(url)
}).typedecl('s->o');
defaultFuncMap[__name__+'.runJsonResultCode']=new RpcExtendServerCallable(async (code)=>{
    try{
        return JSON.stringify([await (new Function(code))()??null]);
    }catch(err:any){
        return JSON.stringify([null,{
                message:err.message,
                stack:err.stack
            }]);
    }
}).typedecl('s->s');

interface RpcRemoteObjectPool{
    set(id:string,obj:{[RpcSerializeMagicMark]:any}):void;
    get(id:string):{[RpcSerializeMagicMark]:any}|undefined;
    delete(id:string):void;
    keys():Iterable<string>;
    close():void
}
class RemoteObjectPoolDefaultImpl extends Map<string,{[RpcSerializeMagicMark]:any}> implements RpcRemoteObjectPool{
    delete(key: string): boolean {
        let t1=this.get(key) as any;
        if(t1!=null && typeof t1.close==='function'){
            t1.close();
        }
        return super.delete(key);
    }
    close(): void {
        for(let t1 of this.keys()){
            this.delete(t1);
        }
    }
}
defaultFuncMap[__name__+'.freeObjectInRemoteObjectPool']=new RpcExtendServerCallable(async (objectPool:RpcRemoteObjectPool,id:string)=>{
    objectPool.delete(id);
}).typedecl('os->');
defaultFuncMap[__name__+'.allocateRemoteObjectPool']=new RpcExtendServerCallable(async ()=>{
    return new RemoteObjectPoolDefaultImpl();
}).typedecl('->o');


defaultFuncMap[__name__+'.callJsonFunction']=new RpcExtendServerCallable(async (
    moduleNameOrThisObject:string,
    functionName:string,
    paramsJson:string,
    objectPool:RpcRemoteObjectPool
)=>{
    try{
        let thisObject:any={};
        if(moduleNameOrThisObject.startsWith('m:')){
            thisObject=await import(moduleNameOrThisObject.substring(2));
        }else if(moduleNameOrThisObject.startsWith('o:')){
            thisObject=objectPool.get(moduleNameOrThisObject.substring(2));
        }
        let param=JSON.parse(paramsJson,(key,value)=>{
            if(typeof value==='object' && value!==null && value[RpcSerializeMagicMark]!=undefined){
                let markProp=value[RpcSerializeMagicMark]
                if(markProp.t==='RpcRemoteObject'){
                    return objectPool.get(markProp.id);
                }
            }else{
                return value
            }
        });
        
        return JSON.stringify([(await thisObject[functionName](...param))??null],(key,value)=>{
            if(typeof value==='object' && value!==null && value[RpcSerializeMagicMark]!=undefined){
                let markProp=value[RpcSerializeMagicMark];
                if(markProp.id===undefined){
                    markProp.id=GenerateRandomString(8)
                }
                if(objectPool!=null){
                    objectPool.set(markProp.id,value)
                }
                return {[RpcSerializeMagicMark]:{t:'RpcRemoteObject',...markProp}}
            }else{
                return value;
            }
        });
    }catch(err:any){
        return JSON.stringify([null,{
                message:err.message,
                stack:err.stack
            }]);
    }
}).typedecl('ssso->s');



export type OnlyAsyncFunctionProps<Mod>={
    [P in (keyof Mod & string)]:Mod[P] extends (...args:any[])=>Promise<any>?Mod[P]:never
}


export interface RemoteRegistryFunction{
    loadModule(name:string):Promise<void>;
    //call code that result can be serialized as JSON
    runJsonResultCode(code:string):Promise<any>;
    unloadModule(name:string):Promise<void>;
    getConnectionFromUrl(url:string):Promise<RpcExtendClientObject>;
    io_send(io:RpcExtendClientObject,data:Uint8Array):Promise<void>;
    io_receive(io:RpcExtendClientObject):Promise<Uint8Array>;
    jsExec(code:string,obj:RpcExtendClientObject|null):Promise<RpcExtendClientObject|null>;
    bufferData(obj:RpcExtendClientObject):Promise<Uint8Array>;
    anyToString(obj:RpcExtendClientObject):Promise<string>;
    allocateRemoteObjectPool():Promise<RpcExtendClientObject>;
    freeObjectInRemoteObjectPool(object:{[RpcSerializeMagicMark]:any},objectPool?:RpcExtendClientObject):Promise<void>;
    //call function that param and result both can be serialized as JSON OR has [RpcSerializeMagicMark] property (To use object stored in objectPool).
    callJsonFunction(moduleNameOrThisObject:string|{[RpcSerializeMagicMark]:any},functionName:string,params:any,objectPool?:RpcExtendClientObject):Promise<any>;
}


export class RpcWorker{
    static connectingMutex:Record<string,mutex>={}
    initDone=new future<boolean>();
    client?:RpcExtendClient1;
    protected wt?:IWorkerThread;
    conn?:Io;
    workerId='';
    constructor(workerId?:string){
        this.workerId=workerId??GenerateRandomString();
    }
    async ensureConnection():Promise<Io>{
        if(RpcWorker.connectingMutex[this.workerId]==undefined){
            RpcWorker.connectingMutex[this.workerId]=new mutex();
        }
        let mtx=RpcWorker.connectingMutex[this.workerId];
        return await mtx.exec(async ()=>{
            if(this.conn===undefined){
                try{
                    this.conn=await new WebMessage.Connection().connect(this.workerId,1000);
                }catch(e){
                    if(e instanceof Error && e.message.match(/server not found/)!=null){
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
                        workerInit.__internal__.initRpcWorker(${JSON.stringify(rpcWorkerInitModule)},'${rpcId.get()}').then(resolve,reject);
                    },reject)`,true);
                    this.conn= await new WebMessage.Connection().connect(this.wt!.workerId,500);
                }
            }
            return this.conn!;
        })
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
        return this.client.baseClient.isRunning();
    }
    async disconnect(){
        this.client?.close();
        this.client=null;
    }
    async jsServerLoadModule(name:string){
        let fn=await getAttachedRemoteRigstryFunction(this.client!);
        await fn.loadModule(name)
    }
    protected connecting=new mutex();
    async ensureConnected():Promise<RpcExtendClient1>{
        try{
            await this.connecting.lock();
            if(this.connected()){
                return this.client!
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
        }finally{
            await this.connecting.unlock();
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

export function createIoPipe(opts?:{bufferQueueSize?:number}):[Io,Io]{
    opts=opts??{
        bufferQueueSize:5
    }
    let a2b=new ArrayWrap2<Uint8Array>();
    let b2a=new ArrayWrap2<Uint8Array>();
    let closed=false
    a2b.queueSizeLimit=opts.bufferQueueSize;
    b2a.queueSizeLimit=opts.bufferQueueSize;
    function oneSide(r:ArrayWrap2<Uint8Array>,s:ArrayWrap2<Uint8Array>):Io{
        let tio={
            isClosed:()=>{
                return closed;
            },
            receive:async():Promise<Uint8Array>=> {
                if(closed)throw new Error('closed.');
                return r.queueBlockShift();
            },
            send: async (data: Uint8Array[]): Promise<void> =>{
                if(closed)throw new Error('closed.');
                if(data.length==1){
                    s.queueBlockPush(data[0])
                }else{
                    s.queueBlockPush(new Uint8Array(ArrayBufferConcat(data)));
                }
            },
            close: ()=>{
                closed=true;
                r.cancelWaiting();
                s.cancelWaiting();
                a2b.arr().length=0;
                b2a.arr().length=0;
            }
        }
        return tio;
    }
    return [oneSide(a2b,b2a),oneSide(b2a,a2b)];
}

class RemoteCallFunctionError extends Error{
    remoteStack?:string
    constructor(message?:string){
        super('REMOTE:'+message);
    }
    toString(){
        return this.message+'\n'+(this.remoteStack??'');
    }
}

class RemoteRegistryFunctionImpl implements RemoteRegistryFunction{
    
    funcs:(RpcExtendClientCallable|null)[]=[]
    client1?:RpcExtendClient1;
    defaultObjectPool?:RpcExtendClientObject;

    async loadModule(name: string): Promise<void> {
        return this.funcs[0]!.call(name);
    }
    async callJsonFunction(moduleNameOrThisObject:string|{[RpcSerializeMagicMark]:any},functionName:string,params:any,objectPool?:RpcExtendClientObject):Promise<any> {
        if(typeof moduleNameOrThisObject==='object' && moduleNameOrThisObject[RpcSerializeMagicMark]!=undefined){
            moduleNameOrThisObject='o:'+moduleNameOrThisObject[RpcSerializeMagicMark].id
        }else{
            moduleNameOrThisObject='m:'+moduleNameOrThisObject;
        }
        if(objectPool==undefined){
            if(this.defaultObjectPool==undefined){
                this.defaultObjectPool=await this.allocateRemoteObjectPool();
            }
            objectPool=this.defaultObjectPool;
        }
        let [result,error]=JSON.parse(await this.funcs[7]!.call(moduleNameOrThisObject,functionName,JSON.stringify(params),objectPool))
        if(error!=null){
            let remoteError=new RemoteCallFunctionError(error.message);
            remoteError.remoteStack=error.stack;
            throw remoteError;
        }
        return result;
    }
    async runJsonResultCode(code: string): Promise<any> {
        let [result,error]=JSON.parse(await this.funcs[9]!.call(code));
        if(error!=null){
            let remoteError=new RemoteCallFunctionError(error.message);
            remoteError.remoteStack=error.stack;
            throw remoteError;
        }
        return result;
    }
    async unloadModule(name: string): Promise<void> {
        return this.funcs[8]!.call(name)
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
    async jsExec(code:string,obj:RpcExtendClientObject):Promise<RpcExtendClientObject|null>{
        return this.funcs[4]!.call(code,obj)
    }
    async bufferData(obj:RpcExtendClientObject):Promise<Uint8Array>{
        return this.funcs[5]!.call(obj);
    }
    async anyToString(obj:RpcExtendClientObject):Promise<string>{
        return this.funcs[6]!.call(obj);
    }
    async allocateRemoteObjectPool():Promise<RpcExtendClientObject>{
        return await this.funcs[10]!.call();
    }
    async freeObjectInRemoteObjectPool(object:{[RpcSerializeMagicMark]:any},objectPool?:RpcExtendClientObject):Promise<void>{
        objectPool=objectPool??this.defaultObjectPool;
        if(objectPool!=undefined){
            await this.funcs[11]!.call(objectPool??this.defaultObjectPool,object[RpcSerializeMagicMark].id);
        }
    }
    async ensureInit(){
        if(this.funcs.length==0){
            this.funcs=[
                await getRpcFunctionOn(this.client1!,__name__+'.loadModule','s->'),
                await getRpcFunctionOn(this.client1!,__name__+'.getConnectionFromUrl','s->o'),
                await getRpcFunctionOn(this.client1!,'pxprpc_pp.io_send','ob->'),
                await getRpcFunctionOn(this.client1!,'pxprpc_pp.io_receive','o->b'),
                await getRpcFunctionOn(this.client1!,'builtin.jsExec','so->o'),
                await getRpcFunctionOn(this.client1!,'builtin.bufferData','o->b'), //[5]
                await getRpcFunctionOn(this.client1!,'builtin.anyToString','o->s'),
                await getRpcFunctionOn(this.client1!,__name__+'.callJsonFunction','ssso->s'),
                await getRpcFunctionOn(this.client1!,__name__+'.unloadModule','s->'),
                await getRpcFunctionOn(this.client1!,__name__+'.runJsonResultCode','s->s'),
                await getRpcFunctionOn(this.client1!,__name__+'.allocateRemoteObjectPool','->o'), //[10]
                await getRpcFunctionOn(this.client1!,__name__+'.freeObjectInRemoteObjectPool','os->')
            ]
        }
    }
    
}

const attachedRemoteRigstryFunctionName=__name__+'.RemoteRegistryFunction'
export async function getAttachedRemoteRigstryFunction(client1:RpcExtendClient1):Promise<RemoteRegistryFunction>{
    let f=getRpcLocalVariable(client1,attachedRemoteRigstryFunctionName)
    if(f==undefined){
        f=new RemoteRegistryFunctionImpl();
        f.client1=client1;
        await f.ensureInit();
        setRpcLocalVariable(client1,attachedRemoteRigstryFunctionName,f);
    }
    return f;
}

export let __internal__={
    isPxseedWorker:false
}

export async function getConnectionFromUrl(url:string):Promise<Io|null>{
    let url2=new URL(url);
    if(url2.protocol=='pxpwebmessage:'){
        if(__internal__.isPxseedWorker){
            
        }else{
            let conn=new WebMessage.Connection();
            await conn.connect(url2.pathname,300);
            return conn;
        }
    }else if(url2.protocol=='webworker:'){
        if(__internal__.isPxseedWorker){
            let fn=await getAttachedRemoteRigstryFunction((await getRpcClientConnectWorkerParent())!);
            let remoteIo=await fn.getConnectionFromUrl(url);
            return new IoOverPxprpc(remoteIo);
        }else{
            let workerId=url2.pathname;
            let rpcWorker=new RpcWorker(workerId);
            return await rpcWorker.ensureConnection();
        }
    }else if(['ws:','wss:'].indexOf(url2.protocol)>=0){
        return await new WebSocketIo().connect(url);
    }else if(url2.protocol=='iooverpxprpc:'){
        let firstSlash=url2.pathname.indexOf('/');
        let firstRpcName=decodeURIComponent(url2.pathname.substring(0,firstSlash));
        let restRpcPath=url2.pathname.substring(firstSlash+1);
        let cinfo=await getPersistentRegistered(firstRpcName);
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
            workerInit.__internal__.initRpcWorker(${JSON.stringify(rpcWorkerInitModule)}).then(resolve,reject);
        },reject)`,true);
        return await new WebMessage.Connection().connect(worker!.workerId,300);
    }else if(url2.protocol=='pxseedjs:'){
        //For user custom connection factory.
        //potential security issue?
        if(__internal__.isPxseedWorker){
            let fn=await getAttachedRemoteRigstryFunction((await getRpcClientConnectWorkerParent())!);
            let remoteIo=await fn.getConnectionFromUrl(url);
            return new IoOverPxprpc(remoteIo);
        }else{
            let functionDelim=url2.pathname.lastIndexOf('.');
            let moduleName=url2.pathname.substring(0,functionDelim);
            let functionName=url2.pathname.substring(functionDelim+1);
            return (await import(moduleName))[functionName](url2.toString());
        }
    }
    return null;
}

let registered=new Map<string,ClientInfo>();

//Only get current cached registered client. Use "getPersistentRegistered" to get all possible registered client.
export function getRegistered(name:string){
    return registered.get(name);
}

//Only get current cached registered client. Use "listPersistentRegistered" to get all possible registered client.
export function listRegistered(){
    return registered.entries();
}

export async function getPersistentRegistered(name:string){
    await persistent.load();
    return registered.get(name);
}

export async function listPersistentRegistered(name:string){
    await persistent.load();
    return registered.entries();
}

export async function addClient(url:string,name?:string):Promise<ClientInfo>{
    name=(name==undefined||name==='')?url.toString():name;
    let clie=registered.get(name);
    if(clie==undefined){
        //Skip if existed, To avoid connection lost unexpected.
        clie=new ClientInfo(name,url);
    }
    clie.url=url;
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

//"ServerHost" usually refer to the server hosting pxseed web, and shared by all js worker in one pxeed application.
export const ServerHostRpcName='server host';

//"ServerHostWorker1" refer to the worker spawn by ServerHost to handle the most remote requests.
export const ServerHostWorker1RpcName='server host worker 1';

export const WebWorker1RpcName='webworker 1'
export const ServiceWorker='service worker 1';


async function addPxseedJsBuiltinClient(){
    if(globalThis.location!=undefined && ['http:','https:'].includes(globalThis.location.protocol) 
        && (globalThis as any).__pxseedInit!=undefined){
        if(getRegistered(ServerHostRpcName)!=null && getRegistered(ServerHostWorker1RpcName)==null){
            await addClient('iooverpxprpc:'+ServerHostRpcName+'/'+
            encodeURIComponent('webworker:'+__name__+'/worker/1'),ServerHostWorker1RpcName)
        }
        if(getRegistered(ServiceWorker)==null){
            await addClient('serviceworker:1',ServiceWorker);
        }
        if(getRegistered(WebWorker1RpcName)==null){
            await addClient('webworker:'+__name__+'/worker/1',WebWorker1RpcName)
        }
    }else{
        if(getRegistered(ServerHostWorker1RpcName)==null){
            await addClient('webworker:'+__name__+'/worker/1',ServerHostWorker1RpcName)
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
        if(config.registered != undefined){
            (config.registered as {name:string,url:string}[]).forEach(item=>{
                let {name,url}=item;
                name=(name==undefined||name==='')?url.toString():name;
                let clie=registered.get(name);
                if(clie==undefined){
                    //Skip if existed, To avoid connection lost unexpected.
                    clie=new ClientInfo(name,url);
                }
                clie.url=url;
                registered.set(name,clie);
            })
        }
        await addPxseedJsBuiltinClient();
    }
}

let remoteObjectPoolFree=globalThis.FinalizationRegistry?new FinalizationRegistry<[id:string,funcs:RemoteRegistryFunction]>((v)=>{
    v[1].freeObjectInRemoteObjectPool({[RpcSerializeMagicMark]:{id:v[0],t:'RpcRemoteObject'}})
}):null;

function replaceRpcSerializeMarkOnClientSide(obj:any,funcs:RemoteRegistryFunction){
    if(typeof obj==='object' && obj!==null){
        if(obj[RpcSerializeMagicMark]!=undefined){
            let p=new Proxy(obj,{
                get(target,p){
                    //Avoid triggle by Promise.resolve
                    if(p==='then')return undefined;
                    if(p===RpcSerializeMagicMark)return target[p];
                    if(p==='close')return async ()=>funcs.freeObjectInRemoteObjectPool(target)
                    return async (...params:any[])=>{
                        return replaceRpcSerializeMarkOnClientSide(await funcs.callJsonFunction(target,p as string,params),funcs);
                    }
                }
            });
            remoteObjectPoolFree?.register(p,[obj[RpcSerializeMagicMark].id,funcs])
            return p;
        }else{
            for(let t1 in obj){
                obj[t1]=replaceRpcSerializeMarkOnClientSide(obj[t1],funcs);
            }
            return obj;
        }
    }else{
        return obj;
    }
}

//Before typescript support syntax like <typeof import(T)>, we can only tell module type explicitly.
//Only support plain JSON parameter and return value.
export async function importRemoteModule(rpc:RpcExtendClient1,moduleName:string):Promise<any>{
    let funcs:RemoteRegistryFunction|null=null;
    funcs=await getAttachedRemoteRigstryFunction(rpc);
    let proxyModule=new Proxy({},{
        get(target,p){
            //Avoid triggle by Promise.resolve
            if(p==='then')return undefined;
            return async (...params:any[])=>{
                return replaceRpcSerializeMarkOnClientSide(await funcs.callJsonFunction(moduleName,p as string,params),funcs);
            }
        }
    });
    return proxyModule as any;
}

export async function easyCallRemoteJsonFunction(rpc:RpcExtendClient1,moduleName:string,funcName:string,args:any[]):Promise<any>{
    let funcs:RemoteRegistryFunction|null=null;
    funcs=await getAttachedRemoteRigstryFunction(rpc);
    let r=replaceRpcSerializeMarkOnClientSide(await funcs.callJsonFunction(moduleName,funcName,args),funcs);
    return r;
}