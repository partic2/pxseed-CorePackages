
import { WebMessage } from "pxprpc/backend";
import { Server } from "pxprpc/base";
import { RpcExtendServer1, RpcExtendServerCallable, defaultFuncMap } from "pxprpc/extend";



import {rpcWorkerInitModule}  from './registry'
import { requirejs } from "../jsutils1/base";

const __name__=requirejs.getLocalRequireModule(require);

declare var __workerId:string;
WebMessage.bind(globalThis);


new WebMessage.Server((conn)=>{
    //mute error
    new RpcExtendServer1(new Server(conn)).serve().catch(()=>{});
}).listen(__workerId);

let rpcWorkerInited=false;

let bootModules=new Set();

//Save current loaded module as boot modules, which will not be 'undef' by reloadRpcWorker.
//This function will be called automatically in loadRpcWorkerInitModule.
//Only the last savedAsBootModules valid.
export async function savedAsBootModules(){
    Object.keys(await requirejs.getDefined()).forEach(modName=>{
        bootModules.add(modName);
    });
}

export async function loadRpcWorkerInitModule(workerInitModule:string[]){
    if(!rpcWorkerInited){
        rpcWorkerInited=true;
        rpcWorkerInitModule.push(...workerInitModule);
        await Promise.allSettled(workerInitModule.map(v=>import(v)));
        await savedAsBootModules();
    }
}

export async function reloadRpcWorker(){
    //unload all modules that can be unloaded. In other words, exclude the modules in bootModules
    for(let mod in await requirejs.getDefined()){
        if(!bootModules.has(mod)){
            await requirejs.undef(mod);
        }
    }
}