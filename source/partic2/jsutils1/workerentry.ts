
import {FunctionCallOverMessagePort, lifecycle, WorkerThreadMessageMark} from 'partic2/jsutils1/webutils'


export let spawnerCall:((module:string,func:string,args:any[])=>Promise<any>)|null=null;


if('postMessage' in globalThis){
    if('close' in globalThis){
        let workerClose=globalThis.close.bind(globalThis);
        globalThis.close=function(){
            lifecycle.dispatchEvent(new Event('exit'));
            globalThis.postMessage({[WorkerThreadMessageMark]:'closing'});
            workerClose();
        }
    }
    let spawnerFunctionCall=new FunctionCallOverMessagePort(globalThis);
    spawnerCall=(module:string,func:string,args:any[])=>{
        return spawnerFunctionCall.call(module,func,args);
    }
    globalThis.postMessage({[WorkerThreadMessageMark]:'ready'});
}


export async function setWorkerInfo(id:string){
    (globalThis as any).__workerId=id
    return id;
}

export async function dispatchWorkerLifecycle(ev:string){
    lifecycle.dispatchEvent(new Event(ev));
}

export async function requestExit(){
    globalThis.close();
}
