//build tjs interface on supported platform

import type {} from '@txikijs/types/src/index'

let builtTjs:null|typeof tjs=null


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
            let { getPersistentRegistered, ServerHostWorker1RpcName } = await import('partic2/pxprpcClient/registry');
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
    if(builtTjs==null){
        throw new Error('Unsupported platform');
    }
    return builtTjs
}