import { GenerateRandomString, GetCurrentTime, Task, assert, future, mutex, requirejs } from "partic2/jsutils1/base";
import { RpcExtendClient1 } from "pxprpc/extend";
import type { PxseedServer2023StartupConfig } from "./pxseedhttpserver";
import { Client, Io, Serializer } from "pxprpc/base";
import { WebSocketIo } from "pxprpc/backend";
import { importRemoteModule, ServerHostRpc } from 'partic2/pxprpcClient/registry'

export class PxseedServer2023Function{
    client1?: RpcExtendClient1|future<RpcExtendClient1>;
    remoteModule?:typeof import('./pxseedhttpserver')
    initMutex=new mutex();
    async init(client1?:RpcExtendClient1|future<RpcExtendClient1>){
        return this.initMutex.exec(async ()=>{
            if(this.remoteModule!=undefined){
                return this;
            }
            this.client1=client1??ServerHostRpc;
            this.remoteModule=await importRemoteModule(this.client1,'pxseedServer2023/pxseedhttpserver');
            return this;
        })
    }
    async exit(){
        await this.serverCommand('exit');
    }
    async subprocessWaitExitCode(index:number){
        return this.serverCommand('subprocessWaitExitCode',index)
    }
    async subprocessRestart(index:number){
        return this.serverCommand('subprocessRestart',index)
    }
    async serverCommand(cmd:string,param?:any){
        return this.remoteModule!.serverCommand(cmd,param);
    }
    async buildEnviron(){
        return this.serverCommand('buildEnviron');
    }
    async buildPackages(){
        return this.serverCommand('buildPackages');
    }
    async rebuildPackages(){
        return this.serverCommand('rebuildPackages');
    }
    async getConfig(){
        return await this.serverCommand('getConfig') as PxseedServer2023StartupConfig
    }
    async saveConfig(cfg:PxseedServer2023StartupConfig){
        return await this.serverCommand('saveConfig',cfg);
    }
    async setServerInformation(info:string[]){
        return this.remoteModule!.__serverHostSetServerInformation(info);
    }
    async getServerInformation(){
        return this.remoteModule!.__serverHostGetServerInformation();
    }
    async broadcastToQueryServerInformation(waitSecond?:number){
        return this.remoteModule!.__serverHostBroadcastToQueryServerInformation(waitSecond);
    }
}

export let defaultPxseedServer2023Invoker=new PxseedServer2023Function();

export async function setServerInformation(info:string[]){
    await defaultPxseedServer2023Invoker.init()
    return await defaultPxseedServer2023Invoker.setServerInformation(info)
}
export async function getServerInformation(){
    await defaultPxseedServer2023Invoker.init()
    return await defaultPxseedServer2023Invoker.getServerInformation()
}
export async function broadcastToQueryServerInformation(waitSecond?:number){
    return await defaultPxseedServer2023Invoker.broadcastToQueryServerInformation(waitSecond);
}
