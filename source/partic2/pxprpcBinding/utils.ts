import { Client, Io, PxpRequest, Server } from "pxprpc/base";
import { RpcExtendClient1, RpcExtendClientCallable, RpcExtendClientObject, RpcExtendServer1, RpcExtendServerCallable } from "pxprpc/extend";



let rpcInternalProp=Symbol('partic2/pxprpcBinding/utils.rpcInternalProp')

export function getRpcLocalVariable(rpcObj:RpcExtendClient1|RpcExtendServer1|Server|Client,name:string){
    let ip:Record<string,any>={};
    if((rpcObj as any)[rpcInternalProp]!=undefined){
        ip=(rpcObj as any)[rpcInternalProp];
    }else{
        (rpcObj as any)[rpcInternalProp]=ip;
    }
    return ip['v:'+name];
}
export function setRpcLocalVariable(rpcObj:RpcExtendClient1|RpcExtendServer1|Server|Client,name:string,v:any){
    let ip:Record<string,any>={};
    if((rpcObj as any)[rpcInternalProp]!=undefined){
        ip=(rpcObj as any)[rpcInternalProp];
    }else{
        (rpcObj as any)[rpcInternalProp]=ip;
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

export class RpcExtendServerCallableWithServerContext extends RpcExtendServerCallable{
    protected _sessionServer:Server|null=null;
    protected _sessionServerTaked:{p?:Promise<void>,r?:()=>void}|null=null;
    constructor(wrapped2:(server:Server|null,...args:any)=>Promise<any>){
        super(async (...args)=>{
            let server=this._sessionServer;
            this._sessionServerTaked!.r!();
            this._sessionServerTaked=null;
            return wrapped2(server,...args);
        });
    }
    public async call(req: PxpRequest): Promise<any> {
        if(this._sessionServerTaked!=null){
            await this._sessionServerTaked.p;
        }
        this._sessionServerTaked={}
        this._sessionServerTaked.p=new Promise<void>((r)=>{this._sessionServerTaked!.r=r;});
        this._sessionServer=req.context;
        return super.call(req);
    }
}