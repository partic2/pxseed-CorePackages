
import * as KoaRouter from 'koa-router'

import {wrapReadable} from 'partic2/nodehelper/nodeio'
import { JsonRpcError, JsonRpcRequest, JsonRpcResponse, errorCode } from './prot';

import * as Koa from 'koa'
import { error } from 'console';

const decoder=new TextDecoder();


export class KoaJsonRpc{
    constructor(){
    }
    handlers=new Map<string,(params:any,opt?:any)=>Promise<any>>();
    setHandler(method:string,handler:(params:any,opt?:any)=>Promise<any>){
        this.handlers.set(method,handler);
        return this;
    }
    protected async handleRequest(req:JsonRpcRequest,koaContext?:Koa.ParameterizedContext<any, KoaRouter.IRouterParamContext<any, {}>, any>){
        let handler=this.handlers.get(req.method);
        let resp=new JsonRpcResponse(req.id);
        if(handler==null){
            resp=new JsonRpcResponse(req.id);
            resp.setError(errorCode.methodNotFound,'Method Not Found.');
        }else{
            try{
                let result:any
                if(koaContext!=undefined){
                    result=await handler(req.params,{sourceIp:koaContext.request.ip})
                }else{
                    result=await handler(req.params);
                }
                resp.setResult(result);
            }catch(e){
                if(e instanceof JsonRpcError){
                    resp.setError(e.code as number,e.message);
                }else{
                    resp.setError(errorCode.internalError,(e as any).toString());
                }
            };
        }
        return resp;
    }
    middleware():KoaRouter.IMiddleware[]{
        return [async (ctx,next)=>{
            let r=wrapReadable(ctx.req);
            let body=await r.readAll();
            try{
                let parsedBody=JSON.parse(decoder.decode(body));
                if(parsedBody instanceof Array){
                    let jreq=new Array<JsonRpcRequest>();
                    for(let t1 of parsedBody){
                        let t2=new JsonRpcRequest().fromRaw(t1);
                        jreq.push(t2);
                    }
                    let jresp=await Promise.all(jreq.map(t1=>this.handleRequest(t1,ctx)));
                    ctx.response.body=JSON.stringify(jresp.map(v=>v.toRaw()));
                }else{
                    let jreq=new JsonRpcRequest().fromRaw(parsedBody);
                    let jresp=await this.handleRequest(jreq,ctx);
                    ctx.response.body=JSON.stringify(jresp.toRaw());
                }
                await next();
            }catch(e){
                ctx.response.status=400
            }
        }]
    }
}