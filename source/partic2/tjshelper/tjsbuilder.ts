//build tjs interface on supported platform

import { addClient, getPersistentRegistered, ServerHostWorker1RpcName } from 'partic2/pxprpcClient/registry';
import type {} from '@txikijs/types/src/index'
import { WebSocketIo } from 'pxprpc/backend';

let builtTjs:null|typeof tjs=null

export const XplatjDefaultRpcName='xplatj pxprpc 2050'

export async function buildTjs():Promise<typeof tjs>{
    if(builtTjs!=null){
        return builtTjs;
    }
    if(globalThis.tjs!=undefined){
        builtTjs=globalThis.tjs
    }else if(globalThis.process?.versions?.node!=undefined){
        let tjsonnode=await import('partic2/nodehelper/tjsadapt');
        builtTjs=await tjsonnode.tjsFrom();
    }
    if(builtTjs==null){
        try{
            let rpc=await getPersistentRegistered(ServerHostWorker1RpcName);
            if(rpc!=null){
                let {tjsFrom}=await import('./tjsonjserpc');
                let {Invoker}=await import('partic2/pxprpcBinding/JseHelper__JseIo');
                let inv=new Invoker()
                await inv.useClient(await rpc.ensureConnected());
                builtTjs=await tjsFrom(inv);
            }
        }catch(err){};
    }
    if(builtTjs==null && globalThis.location!=undefined){
        let rpc=await getPersistentRegistered(XplatjDefaultRpcName)
        if(rpc==null){
            try{
                let wsio=new WebSocketIo();
                let protocol=globalThis.location.protocol.replace(/^http/,'ws');
                let {host,port}=globalThis.location
                let url=`${protocol}//${host}/pxprpc/2050`;
                await wsio.connect(url);
                wsio.close();
                rpc=await addClient(url,XplatjDefaultRpcName)
            }catch(err){}
        }
        if(rpc!=null){
            let {tjsFrom}=await import('./tjsonjserpc');
            let {Invoker}=await import('partic2/pxprpcBinding/JseHelper__JseIo');
            let inv=new Invoker()
            await inv.useClient(await rpc.ensureConnected());
            builtTjs=await tjsFrom(inv);
        }
    }
    if(builtTjs==null){
        throw new Error('Unsupported platform');
    }
    return builtTjs
}