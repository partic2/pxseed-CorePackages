import { RpcExtendClient1, RpcExtendClientCallable } from "pxprpc/extend";

import { Client, Io } from "pxprpc/base";
import { WebSocketIo } from "pxprpc/backend";
import { assert, throwIfAbortError } from "partic2/jsutils1/base";
import { buildTjs } from "partic2/tjshelper/tjsbuilder";
import { PxprpcIoFromTjsStream, TjsReaderDataSource } from "partic2/tjshelper/tjsutil";




let pxseedLoaderRuntimeBridge0Client:RpcExtendClient1|null=null;

export async function getRpc4RuntimeBridge0(){
    if(pxseedLoaderRuntimeBridge0Client==null || !pxseedLoaderRuntimeBridge0Client.baseClient.isRunning()){
        if((globalThis as any).__pxprpc4tjs__!=undefined){
            let {PxprpcRtbIo}=await import('partic2/tjshelper/tjsenv');
            let io1=await PxprpcRtbIo.connect('/pxprpc/runtime_bridge/0');
            assert(io1!=null,'pxprpc runtimebridge connect failed.');
            pxseedLoaderRuntimeBridge0Client=await new RpcExtendClient1(new Client(io1)).init();
        }else{
            let tjs=await buildTjs();
            let conn=await tjs.connect('tcp','127.0.0.1',2048) as tjs.Connection;
            let io1=new PxprpcIoFromTjsStream(conn,conn,conn);
            pxseedLoaderRuntimeBridge0Client=await new RpcExtendClient1(new Client(io1)).init();
        }
    }
    return pxseedLoaderRuntimeBridge0Client!;
}

let pxseedLoaderRuntimeBridgeJava0Client:RpcExtendClient1|null=null;
export async function getRpc4RuntimeBridgeJava0(){
    if(pxseedLoaderRuntimeBridgeJava0Client==null || !pxseedLoaderRuntimeBridgeJava0Client.baseClient.isRunning()){
        if((globalThis as any).__pxprpc4tjs__!=undefined){
            let {PxprpcRtbIo}=await import('partic2/tjshelper/tjsenv');
            let io1=await PxprpcRtbIo.connect('/pxprpc/runtime_bridge/java/0');
            assert(io1!=null,'pxprpc runtimebridge connect failed.');
            pxseedLoaderRuntimeBridgeJava0Client=await new RpcExtendClient1(new Client(io1)).init();
        }else{
            let tjs=await buildTjs();
            let conn=await tjs.connect('tcp','127.0.0.1',2050) as tjs.Connection;
            let io1=new PxprpcIoFromTjsStream(conn,conn,conn);
            pxseedLoaderRuntimeBridgeJava0Client=await new RpcExtendClient1(new Client(io1)).init();
        }
    }
    return pxseedLoaderRuntimeBridgeJava0Client!;
}

