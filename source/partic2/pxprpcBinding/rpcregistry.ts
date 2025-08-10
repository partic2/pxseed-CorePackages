import { RpcExtendClient1 } from "pxprpc/extend";

import { Client } from "pxprpc/base";
import { WebSocketIo } from "pxprpc/backend";
import { assert, throwIfAbortError } from "partic2/jsutils1/base";
import { getConnectionFromUrl, getPersistentRegistered, ServerHostRpcName, ServerHostWorker1RpcName } from "partic2/pxprpcClient/registry";

let rpc4XplatjJavaServer:null|RpcExtendClient1=null;


async function getAndInitRpcForPort(port:number){
    let rpcClient:null|RpcExtendClient1=null;
    try{
        if(globalThis.process?.versions?.node!=undefined){
            let {PxprpcIoFromSocket}=await import('partic2/nodehelper/nodeio');
            let socket1=new PxprpcIoFromSocket();
            await socket1.connect({host:'127.0.0.1',port});
            rpcClient=new RpcExtendClient1(new Client(socket1));
            await rpcClient.init();
        }
    }catch(err:any){
        throwIfAbortError(err);
    }finally{
        rpc4XplatjCServer=null;
    }
    try{
        if(await getPersistentRegistered(ServerHostRpcName)!=null){
            let conn=await getConnectionFromUrl(
                `iooverpxprpc:${ServerHostRpcName}/${encodeURIComponent(
                    `pxseedjs:partic2/nodehelper/nodeio.createIoPxseedJsUrl?type=tcp&port=${port}`
                    )}`);
            assert(conn!=null);
            rpcClient=new RpcExtendClient1(new Client(conn));
            await rpcClient.init();
        }
    }catch(err:any){
        throwIfAbortError(err);
    }finally{
        rpc4XplatjCServer=null;
    }
    if(rpcClient==null){
        let wsurl=`${window.location.protocol.replace(/^http/,'ws')}://${window.location.host}'/pxprpc/${port}`
        rpcClient=new RpcExtendClient1(new Client(await new WebSocketIo().connect(wsurl)));
        await rpcClient.init();
    }
    return rpcClient;
}

export async function getRpc4XplatjJavaServer(){
    if(rpc4XplatjJavaServer==null){
        rpc4XplatjJavaServer=await getAndInitRpcForPort(2050);
    }
    return rpc4XplatjJavaServer;
}

let rpc4XplatjCServer:null|RpcExtendClient1=null;

export async function getRpc4XplatjCServer(){
    if(rpc4XplatjCServer==null){
        rpc4XplatjCServer=await getAndInitRpcForPort(2048);
    }
    return rpc4XplatjCServer
}