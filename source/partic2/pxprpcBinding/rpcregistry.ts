import { RpcExtendClient1, RpcExtendClientCallable } from "pxprpc/extend";

import { Client, Io } from "pxprpc/base";
import { assert, requirejs, throwIfAbortError } from "partic2/jsutils1/base";
import { buildTjs } from "partic2/tjshelper/tjsbuilder";
import { PxprpcIoFromTjsStream, TjsReaderDataSource } from "partic2/tjshelper/tjsutil";
import { WebSocketIo } from "pxprpc/backend";

let __name__='partic2/pxprpcBinding/rpcregistry'


let connectedRpcToRuntimeBridge:Record<string,RpcExtendClient1>={};

export type RuntimeBridgeConnector={name:string,connect:(path:string)=>Promise<Io|null>};
export let runtimeBridgeConnector=new Array<RuntimeBridgeConnector>();

runtimeBridgeConnector.push({name:__name__+'.runtimeBridgeDefaultConnector',connect:async (path)=>{
    if((globalThis as any).__pxprpc4tjs__!=undefined){
        let {PxprpcRtbIo}=await import('partic2/tjshelper/tjsenv');
        return await PxprpcRtbIo.connect(path); 
    }else{
        return null;
    }
}})

runtimeBridgeConnector.push({name:__name__+'.runtimeBridgePxseedLoaderWebuiConnector',connect:async (path)=>{
    let webutils=await import('partic2/jsutils1/webutils');
    let wwwroot=webutils.getWWWRoot();
    if(wwwroot.startsWith('http:')||wwwroot.startsWith('https:')){
        let config=await webutils.GetPersistentConfig('pxseedServer2023/webentry')
        let key=config.pxprpcKey??'';
        try{
            let io1=await new WebSocketIo().connect(webutils.path.join(wwwroot,'..','pxprpc','runtime_bridge')+'?key='+key);
            try{
                await io1.send([new TextEncoder().encode(path)]);
                let result=new TextDecoder().decode(await io1.receive())
                if(result=='connected'){
                    return io1
                }
                io1.close();
            }catch(err:any){
                io1.close();
                throwIfAbortError(err);
            }
        }catch(err:any){
            throwIfAbortError(err);
        }
    }
    return null;
}})

export async function getRpcConnectedToRuntimeBridge(path:string){
    if(connectedRpcToRuntimeBridge[path]==undefined || !connectedRpcToRuntimeBridge[path].baseClient.isRunning()){
        if(connectedRpcToRuntimeBridge[path]==undefined){
            for(let t1 of runtimeBridgeConnector){
                try{
                    let io1=await t1.connect(path);
                    if(io1!=null){
                        connectedRpcToRuntimeBridge[path]=await new RpcExtendClient1(new Client(io1)).init();
                        break;
                    }
                }catch(err:any){
                    throwIfAbortError(err);
                }
            }
        }
        assert(connectedRpcToRuntimeBridge[path]!=undefined,'pxprpc runtimebridge connect failed.');
    }
    return connectedRpcToRuntimeBridge[path]!;
}

export async function getRpc4RuntimeBridge0(){
    return getRpcConnectedToRuntimeBridge('/pxprpc/runtime_bridge/0');
}

export async function getRpc4RuntimeBridgeJava0(){
    return getRpcConnectedToRuntimeBridge('/pxprpc/runtime_bridge/java/0');
}

