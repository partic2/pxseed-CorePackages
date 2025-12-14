
import { WebMessage } from "pxprpc/backend";
import { Client, Io, Server } from "pxprpc/base";
import { RpcExtendClient1, RpcExtendServer1, RpcExtendServerCallable, defaultFuncMap } from "pxprpc/extend";

//Avoid to static import any module other than '"pxprpc" and "partic2/jsutils1"', To avoid incorrect call before workerInitModule imported.
import { future, GenerateRandomString, requirejs, sleep } from "partic2/jsutils1/base";

const __name__=requirejs.getLocalRequireModule(require);

//Security Vulnerable?. this value can be use to communicate cross-origin.
export let rpcId=(globalThis as any).__workerId??GenerateRandomString(8);

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

if(globalThis.postMessage!=undefined && globalThis.addEventListener!=undefined){
    WebMessage.bind(globalThis)
}

let bootModules=new Set();


//Save current loaded module as boot modules, which will not be 'undef' by reloadRpcWorker.
//This function will be called automatically in loadRpcWorkerInitModule.
//Only the last savedAsBootModules valid.
async function savedAsBootModules(){
    Object.keys(await requirejs.getDefined()).forEach(modName=>{
        bootModules.add(modName);
    });
}

//Almost only used by './registry'
let rpcWorkerInited=false;
let workerParentRpcId='';
async function initRpcWorker(workerInitModule:string[],workerParentRpcIdIn?:string){
    if(!rpcWorkerInited){
        rpcWorkerInited=true;
        new WebMessage.Server((conn)=>{
            //mute error
            new RpcExtendServer1(new Server(conn)).serve().catch(()=>{});
        }).listen(rpcId);        
        await Promise.allSettled(workerInitModule.map(v=>import(v)));
        let {rpcWorkerInitModule}=await import('./registry');
        rpcWorkerInitModule.push(...workerInitModule);
        await savedAsBootModules();
    }
    if(workerParentRpcIdIn!=undefined){
        workerParentRpcId=workerParentRpcIdIn
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

export let __internal__={
    savedAsBootModules,initRpcWorker
}

export async function reloadRpcWorker(){
    //unload all modules that can be unloaded. In other words, exclude the modules in bootModules
    for(let mod in await requirejs.getDefined()){
        if(!bootModules.has(mod)){
            await requirejs.undef(mod);
        }
    }
}