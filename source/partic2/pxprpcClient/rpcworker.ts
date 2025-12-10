
import { WebMessage } from "pxprpc/backend";
import { Client, Io, Server } from "pxprpc/base";
import { RpcExtendClient1, RpcExtendServer1, RpcExtendServerCallable, defaultFuncMap } from "pxprpc/extend";

//Avoid to static import any module other than '"pxprpc" and "partic2/jsutils1/base"', To avoid incorrect call before workerInitModule imported.
import { requirejs } from "partic2/jsutils1/base";
import { lifecycle } from "../jsutils1/webutils";

const __name__=requirejs.getLocalRequireModule(require);

declare var __workerId:string;

WebMessage.bind(globalThis)

let acceptedRpcConnection=new Set<Io>();

new WebMessage.Server((conn)=>{
    acceptedRpcConnection.add(conn);
    //mute error
    new RpcExtendServer1(new Server(conn)).serve().catch(()=>{}).finally(()=>acceptedRpcConnection.delete(conn));
}).listen(__workerId);

lifecycle.addEventListener('exit',()=>{
    for(let t1 of acceptedRpcConnection){
        t1.close();
    }
})


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
async function loadRpcWorkerInitModule(workerInitModule:string[],workerParentRpcIdIn?:string){
    if(!rpcWorkerInited){
        rpcWorkerInited=true;
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
    savedAsBootModules,loadRpcWorkerInitModule
}

export async function reloadRpcWorker(){
    //unload all modules that can be unloaded. In other words, exclude the modules in bootModules
    for(let mod in await requirejs.getDefined()){
        if(!bootModules.has(mod)){
            await requirejs.undef(mod);
        }
    }
}