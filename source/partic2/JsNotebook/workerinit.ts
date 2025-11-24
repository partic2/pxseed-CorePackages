import { LocalWindowSFS, defaultFileSystem, ensureDefaultFileSystem, initNotebookCodeEnv, installRequireProvider } from "partic2/CodeRunner/JsEnviron";
import { future } from "partic2/jsutils1/base";
import { ClientInfo, createIoPipe, getPersistentRegistered, rpcWorkerInitModule } from "partic2/pxprpcClient/registry";
import { LocalRunCodeContext, RunCodeContext } from "partic2/CodeRunner/CodeContext";
import { createConnectorWithNewRunCodeContext } from "partic2/CodeRunner/RemoteCodeContext";
import { utf8conv } from "partic2/CodeRunner/jsutils2";
import { RpcExtendClient1, RpcExtendServer1 } from "pxprpc/extend";
import { Client, Server } from "pxprpc/base";

export var __name__='partic2/JsNotebook/workerinit'

export let ensureInited=new future<string>();

export let __inited__=(async ()=>{
    if(typeof ((globalThis as any).importScripts)==='function' || globalThis.document!=undefined){
        await ensureDefaultFileSystem();
        await defaultFileSystem!.ensureInited();
        await installRequireProvider(defaultFileSystem!);
    }
    rpcWorkerInitModule.push(__name__);
})();

class LoopbackRpcClient extends ClientInfo{
    client:RpcExtendClient1|null=null;
    async ensureConnected():Promise<RpcExtendClient1>{
        if(!this.connected()){
            let [c2s,s2c]=createIoPipe();
            new RpcExtendServer1(new Server(s2c)).serve().catch(()=>{});
            this.client=await new RpcExtendClient1(new Client(c2s)).init();
        }
        return this.client!;
    }
}

export let __internal__={
    LoopbackRpcClient
}

export class NotebookFileData{
    cells:string|null=null;
    rpc:string|ClientInfo='local window';
    startupScript='';
    dump(){
        let rpcString='local window';
        if(this.rpc instanceof ClientInfo){
            rpcString=this.rpc.name;
        }else{
            rpcString=this.rpc;
        }
        return utf8conv(JSON.stringify({ver:1,rpc:rpcString,startupScript:this.startupScript,cells:this.cells}));
    }
    load(data:Uint8Array){
        let r=JSON.parse(utf8conv(data));
        this.rpc=r.rpc;
        this.startupScript=r.startupScript;
        this.cells=r.cells;
    }
    async getRpcClient(){
        if(this.rpc instanceof ClientInfo){
            return this.rpc;
        }else if(this.rpc=='local window'){
            return new LoopbackRpcClient('local window','loopback:local window')
        }else{
            return getPersistentRegistered(this.rpc);
        }
    }
}

export let runningRunCodeContextForNotebookFile=new Map<string,RunCodeContext>();

export async function createRunCodeContextConnectorForNotebookFile(notebookFilePath:string){
    await __inited__;
    if(!runningRunCodeContextForNotebookFile.has(notebookFilePath)){
        let connector=await createConnectorWithNewRunCodeContext();
        runningRunCodeContextForNotebookFile.set(notebookFilePath,connector.value);
        connector.value.event.addEventListener('close',()=>{
            runningRunCodeContextForNotebookFile.delete(notebookFilePath)
        });
        if(connector.value instanceof LocalRunCodeContext){
            await initNotebookCodeEnv(connector.value.localScope,{codePath:notebookFilePath});
        }
    }
    return {value:runningRunCodeContextForNotebookFile.get(notebookFilePath)!};
}