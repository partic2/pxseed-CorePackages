import { ArrayBufferConcat, ArrayWrap2, GenerateRandomString, future, mutex, requirejs } from "partic2/jsutils1/base";
import { GetPersistentConfig, SavePersistentConfig,IWorkerThread, CreateWorkerThread, lifecycle, GetUrlQueryVariable } from "partic2/jsutils1/webutils";
import { WebMessage, WebSocketIo } from "pxprpc/backend";
import { Client, Io, Server } from "pxprpc/base";
import { RpcExtendClient1, RpcExtendClientCallable, RpcExtendClientObject, RpcExtendServer1, RpcExtendServerCallable, defaultFuncMap } from "pxprpc/extend";



export var __name__=requirejs.getLocalRequireModule(require);

export let rpcWorkerInitModule:string[]=[];

defaultFuncMap[__name__+'.loadModule']=new RpcExtendServerCallable(async (name:string)=>{
    return {
        type:'module',
        value:await requirejs.promiseRequire(name)
    }
}).typedecl('s->o');
defaultFuncMap[__name__+'.unloadModule']=new RpcExtendServerCallable(async (name:string)=>requirejs.undef(name)).typedecl('s->');
defaultFuncMap[__name__+'.callJsonFunction']=new RpcExtendServerCallable(async (moduleName:string,functionName:string,paramsJson:string)=>{
    try{
        let param=JSON.parse(paramsJson);
        return JSON.stringify([(await (await requirejs.promiseRequire<any>(moduleName))[functionName](...param))??null]);
    }catch(err:any){
        return JSON.stringify([null,{
                message:err.message,
                stack:err.stack
            }]);
    }
}).typedecl('sss->s');
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
defaultFuncMap[__name__+'.getDefined']=new RpcExtendServerCallable(async ()=>requirejs.getDefined()).typedecl('s->o');
defaultFuncMap[__name__+'.getConnectionFromUrl']=new RpcExtendServerCallable(async (url:string)=>{
    return await getConnectionFromUrl(url)
}).typedecl('s->o');


export type OnlyAsyncFunctionProps<Mod>={
    [P in (keyof Mod & string)]:Mod[P] extends (...args:any[])=>Promise<any>?Mod[P]:never
}


export interface RemoteRegistryFunction{
    loadModule(name:string):Promise<RpcExtendClientObject>;
    //call function that param and result both can be serialized as JSON
    callJsonFunction(moduleName:string,functionName:string,params:any):Promise<any>;
    //call code that result can be serialized as JSON
    runJsonResultCode(code:string):Promise<any>;
    unloadModule(name:string):Promise<void>;
    getConnectionFromUrl(url:string):Promise<RpcExtendClientObject>;
    io_send(io:RpcExtendClientObject,data:Uint8Array):Promise<void>;
    io_receive(io:RpcExtendClientObject):Promise<Uint8Array>;
    jsExec(code:string,obj:RpcExtendClientObject|null):Promise<RpcExtendClientObject|null>;
    bufferData(obj:RpcExtendClientObject):Promise<Uint8Array>;
    anyToString(obj:RpcExtendClientObject):Promise<string>;
}

export let internalProps = Symbol(__name__+'.internalProps');

export async function getRpcFunctionOn(client:RpcExtendClient1,funcName:string,typ:string):Promise<RpcExtendClientCallable|null>{
    let attachedFunc:Record<string,RpcExtendClientCallable|null>={};
    if(internalProps in client){
        attachedFunc=(client as any)[internalProps];
    }else{
        (client as any)[internalProps]=attachedFunc;
    }
    if(!(funcName in attachedFunc)){
        let fn=await client.getFunc(funcName);
        if(fn!=null)fn.typedecl(typ);
        attachedFunc[funcName]=fn;
    }
    return attachedFunc[funcName];
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
                    workerInit.__internal__.loadRpcWorkerInitModule(${JSON.stringify(rpcWorkerInitModule)}).then(resolve,reject);
                },reject)`,true);
                this.conn= await new WebMessage.Connection().connect(this.wt!.workerId,500);
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
        return this.client.baseClient.isRunning();
    }
    async disconnect(){
        this.client?.close();
        this.client=null;
    }
    async jsServerLoadModule(name:string){
        let fn=await getAttachedRemoteRigstryFunction(this.client!);
        (await fn.loadModule(name)).free();
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

export function createIoPipe():[Io,Io]{
    let a2b=new ArrayWrap2<Uint8Array>();
    let b2a=new ArrayWrap2<Uint8Array>();
    let closed=false
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
                    s.queueSignalPush(data[0])
                }else{
                    s.queueSignalPush(new Uint8Array(ArrayBufferConcat(data)));
                }
            },
            close: ()=>{
                closed=true;
                r.cancelWaiting();
                s.cancelWaiting();
                a2b.arr().splice(0,a2b.arr().length);
                b2a.arr().splice(0,b2a.arr().length);
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

    async loadModule(name: string): Promise<RpcExtendClientObject> {
        return this.funcs[0]!.call(name);
    }
    async callJsonFunction(module: string, functionName: string, params:any[] ): Promise<any> {
        let [result,error]=JSON.parse(await this.funcs[7]!.call(module,functionName,JSON.stringify(params)));
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
    async ensureInit(){
        if(this.funcs.length==0){
            this.funcs=[
                await getRpcFunctionOn(this.client1!,__name__+'.loadModule','s->o'),
                await getRpcFunctionOn(this.client1!,__name__+'.getConnectionFromUrl','s->o'),
                await getRpcFunctionOn(this.client1!,'pxprpc_pp.io_send','ob->'),
                await getRpcFunctionOn(this.client1!,'pxprpc_pp.io_receive','o->b'),
                await getRpcFunctionOn(this.client1!,'builtin.jsExec','so->o'),
                await getRpcFunctionOn(this.client1!,'builtin.bufferData','o->b'), //[5]
                await getRpcFunctionOn(this.client1!,'builtin.anyToString','o->s'),
                await getRpcFunctionOn(this.client1!,__name__+'.callJsonFunction','sss->s'),
                await getRpcFunctionOn(this.client1!,__name__+'.unloadModule','s->'),
                await getRpcFunctionOn(this.client1!,__name__+'.runJsonResultCode','s->s'),
            ]
        }
    }
    
}

export async function getAttachedRemoteRigstryFunction(client1:RpcExtendClient1):Promise<RemoteRegistryFunction>{
    let t1=new RemoteRegistryFunctionImpl();
    t1.client1=client1;
    await t1.ensureInit();
    return t1;
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
            workerInit.loadRpcWorkerInitModule(${JSON.stringify(rpcWorkerInitModule)}).then(resolve,reject);
        },reject)`,true);
        return await new WebMessage.Connection().connect(worker!.workerId,300);
    }else if(url2.protocol=='pxseedjs:'){
        //For user custom connection factory.
        //potential security issue?
        let functionDelim=url2.pathname.lastIndexOf('.');
        let moduleName=url2.pathname.substring(0,functionDelim);
        let functionName=url2.pathname.substring(functionDelim+1);
        return (await import(moduleName))[functionName](url2.toString());
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
    return getRegistered(name);
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

export const ServerHostRpcName='server host';
export const ServerHostWorker1RpcName='server host worker 1';
export const WebWorker1RpcName='webworker 1'
export const ServiceWorker='service worker 1';


export async function addBuiltinClient(){
    if(globalThis.location!=undefined && globalThis.WebSocket !=undefined){
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
    if(globalThis.document!=undefined){
        try{
            new WebMessage.Server((conn)=>{
                //mute error
                new RpcExtendServer1(new Server(conn)).serve().catch(()=>{});
            }).listen(rpcId);
        }catch(err){};
    }
    
    WebMessage.postMessageOptions.targetOrigin='*'   
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
                return await funcs.callJsonFunction(moduleName,p as string,params);
            }
        }
    });
    return proxyModule as any;
}

export async function easyCallRemoteJsonFunction(rpc:RpcExtendClient1,moduleName:string,funcName:string,args:[]):Promise<any>{
    let funcs:RemoteRegistryFunction|null=null;
    funcs=await getAttachedRemoteRigstryFunction(rpc);
    return funcs.callJsonFunction(moduleName,funcName,args);
}