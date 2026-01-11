import { Io } from "pxprpc/base";
import { RpcExtendClient1, RpcExtendClientCallable, RpcExtendClientObject } from "pxprpc/extend";



let rpcInternalProp=Symbol('partic2/pxprpcBinding/utils.rpcInternalProp')

export function getRpcLocalVariable(client:RpcExtendClient1,name:string){
    let ip:Record<string,any>={};
    if((client as any)[rpcInternalProp]!=undefined){
        ip=(client as any)[rpcInternalProp];
    }else{
        (client as any)[rpcInternalProp]=ip;
    }
    return ip['v:'+name];
}
export function setRpcLocalVariable(client:RpcExtendClient1,name:string,v:any){
    let ip:Record<string,any>={};
    if((client as any)[rpcInternalProp]!=undefined){
        ip=(client as any)[rpcInternalProp];
    }else{
        (client as any)[rpcInternalProp]=ip;
    }
    ip['v:'+name]=v;
}

export async function getRpcFunctionOn(client:RpcExtendClient1,funcName:string,typ:string):Promise<RpcExtendClientCallable|null>{
    let ip:Record<string,any>={};
    if((client as any)[rpcInternalProp]!=undefined){
        ip=(client as any)[rpcInternalProp];
    }else{
        (client as any)[rpcInternalProp]=ip;
    }
    if(ip['f:'+funcName]===undefined){
        let fn=await client.getFunc(funcName);
        if(fn!=null)fn.typedecl(typ);
        ip['f:'+funcName]=fn;
    }
    return ip['f:'+funcName];
}
