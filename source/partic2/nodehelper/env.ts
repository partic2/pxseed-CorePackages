import { setupImpl as kvdbInit } from "./kvdb";
import { setupImpl as workerInit } from "./worker";
import {setup as jseioInit} from './jseio'
import { GenerateRandomString } from "partic2/jsutils1/base";
import { getAttachedRemoteRigstryFunction, RpcWorker } from "partic2/pxprpcClient/registry";

export function setupEnv(){
    kvdbInit()
    workerInit()
    jseioInit()
    if(globalThis.open==undefined){
        globalThis.open=(async (url:string,target?:string)=>{
            let jscode:string='';
            if(url.startsWith('http://') || url.startsWith('https://')){
                let resp=await fetch(url);
                if(resp.ok){
                    jscode=await resp.text();
                }else{
                    throw new Error(await resp.text())
                }
            }else if(url.startsWith('file://')){
                let path=url.substring(7);
                let os=await import('os');
                if(os.platform()==='win32'){
                    path=path.substring(1);
                }
                let fs=await import('fs/promises')
                jscode=new TextDecoder().decode(await fs.readFile(path));
            }
            if(target=='_self'){
                new Function(jscode)();
            }else{
                if(target=='_blank' || target==undefined){
                    target=GenerateRandomString();
                }
                let worker=new RpcWorker(target)
                let workerClient=await worker.ensureClient();
                let workerFuncs=await getAttachedRemoteRigstryFunction(workerClient);
                await workerFuncs.jsExec(`new Function(${JSON.stringify(jscode)})();`,null);
            }
        }) as any
    }
}