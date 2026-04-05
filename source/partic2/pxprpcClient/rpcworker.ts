
import { WebMessage } from "pxprpc/backend";
import { Client, Io, Server } from "pxprpc/base";
import { RpcExtendClient1, RpcExtendServer1, RpcExtendServerCallable, defaultFuncMap } from "pxprpc/extend";

//Avoid to static import any module other than '"pxprpc" and "partic2/jsutils1"', To avoid incorrect call before workerInitModule imported.
import { assert, future, GenerateRandomString, Ref2, requirejs, sleep } from "partic2/jsutils1/base";
import { lifecycle } from "../jsutils1/webutils";

const __name__=requirejs.getLocalRequireModule(require);
//Security Vulnerable?. this value can be use to communicate cross-origin.
export let rpcId=new Ref2<string>((globalThis as any).__workerId??GenerateRandomString(8));

//If loaded in window.
if(globalThis.window?.postMessage!=undefined){
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
    
    WebMessage.postMessageOptions.targetOrigin='*'   
}

if(globalThis.addEventListener!=undefined || globalThis.postMessage!=undefined){
    let msgport:{
        addEventListener:(type:'message',cb:(msg:MessageEvent)=>void)=>void
        removeEventListener:(type:'message',cb:(msg:MessageEvent)=>void)=>void
        postMessage:(data:any,opt?:{transfer?:Transferable[]})=>void
    }={
        addEventListener:()=>{},
        removeEventListener:()=>{},
        postMessage:()=>{}
    } 
    if(globalThis.addEventListener!=undefined){
        msgport.addEventListener=globalThis.addEventListener.bind(globalThis);
        msgport.removeEventListener=globalThis.removeEventListener.bind(globalThis);
    }
    if(globalThis.postMessage!=undefined){
        msgport.postMessage=globalThis.postMessage.bind(globalThis);
    }
    WebMessage.bind(msgport)
}

let bootModules=new Set();


//Save current loaded module as boot modules, which will not be 'undef' by reloadRpcWorker.
//Only the last savedAsBootModules valid.
async function savedAsBootModules(){
    Object.keys(await requirejs.getDefined()).forEach(modName=>{
        bootModules.add(modName);
    });
}

let servingConn=new Set<Io>();

export let __internal__={
    savedAsBootModules,
    rpcServer:new WebMessage.Server((conn)=> {
        servingConn.add(conn);
        new RpcExtendServer1(new Server(conn)).serve()
            .catch(()=>{}).finally(()=>servingConn.delete(conn))
    })
}

__internal__.rpcServer.listen(rpcId.get());

rpcId.watch((r,prev)=>{
    __internal__.rpcServer.close();
    __internal__.rpcServer.listen(rpcId.get());
})

//Almost only used by './registry'
let rpcWorkerInited=false;
let workerParentRpcId='';
export async function __internalInitRpcWorker(workerInitModule:string[],workerParentRpcIdIn?:string){
    if(workerParentRpcIdIn!=undefined){
        workerParentRpcId=workerParentRpcIdIn;
        let {__internal__}=await import('./registry');
        __internal__.isPxseedWorker=true;
    }
    if(!rpcWorkerInited){
        rpcWorkerInited=true;
        lifecycle.addEventListener('exit',()=>servingConn.forEach((io)=>io.close()));    
        await Promise.allSettled(workerInitModule.map(v=>import(v)));
        let {rpcWorkerInitModule}=await import('./registry');
        rpcWorkerInitModule.push(...workerInitModule);
        await savedAsBootModules();
        
    }
}

let workerParentRpcClient:RpcExtendClient1|null=null;

export async function getRpcClientConnectWorkerParent(opt?:{forceReconnect?:boolean}){
    if(workerParentRpcId==='')return null;
    if(opt?.forceReconnect){
        workerParentRpcClient=null;
    }
    if(workerParentRpcClient!=null)return workerParentRpcClient;
    let wm=new WebMessage.Connection();
    await wm.connect(workerParentRpcId,3000);
    workerParentRpcClient=await new RpcExtendClient1(new Client(wm)).init();
    return workerParentRpcClient;
}


export async function reloadRpcWorker(){
    //unload all modules that can be unloaded. In other words, exclude the modules in bootModules
    for(let mod in await requirejs.getDefined()){
        if(!bootModules.has(mod)){
            await requirejs.undef(mod);
        }
    }
}