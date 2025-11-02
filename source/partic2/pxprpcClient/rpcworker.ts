
import { WebMessage } from "pxprpc/backend";
import { Io, Server } from "pxprpc/base";
import { RpcExtendServer1, RpcExtendServerCallable, defaultFuncMap } from "pxprpc/extend";

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
async function loadRpcWorkerInitModule(workerInitModule:string[]){
    if(!rpcWorkerInited){
        rpcWorkerInited=true;
        await Promise.allSettled(workerInitModule.map(v=>import(v)));
        let {rpcWorkerInitModule}=await import('./registry');
        rpcWorkerInitModule.push(...workerInitModule);
        await savedAsBootModules();
    }
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