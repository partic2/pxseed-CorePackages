
import * as KoaRouter from 'koa-router'
import {ExtendableContext} from 'koa'
import {wrapReadable} from 'partic2/nodehelper/nodeio'
import { JsonRpcError, JsonRpcRequest, JsonRpcResponse, errorCode } from './prot';



const decoder=new TextDecoder();



export async function handleJsonRpcRequestWithHttpInfo(handlers:Map<string,(params:any,opt?:any)=>Promise<any>>,
        req:JsonRpcRequest,
        info?:{headers:Record<string,string | string[] | undefined>,sourceIp:string,koa?:ExtendableContext}
    ){
    let handler=handlers.get(req.method);
    let resp=new JsonRpcResponse(req.id);
    if(handler==null){
        resp=new JsonRpcResponse(req.id);
        resp.setError(errorCode.methodNotFound,'Method Not Found.');
    }else{
        try{
            let result:any
            result=await handler(req.params,info);
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



export class KoaJsonRpc{
    constructor(){
    }
    handlers=new Map<string,(params:any,opt?:any)=>Promise<any>>();
    setHandler(method:string,handler:(params:any,opt?:any)=>Promise<any>){
        this.handlers.set(method,handler);
        return this;
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
                    let jresp=await Promise.all(jreq.map(t1=>handleJsonRpcRequestWithHttpInfo(this.handlers,t1,{headers:ctx.header,sourceIp:ctx.ip,koa:ctx})));
                    ctx.response.body=JSON.stringify(jresp.map(v=>v.toRaw()));
                }else{
                    let jreq=new JsonRpcRequest().fromRaw(parsedBody);
                    let jresp=await handleJsonRpcRequestWithHttpInfo(this.handlers,jreq,{headers:ctx.header,sourceIp:ctx.ip,koa:ctx})
                    ctx.response.body=JSON.stringify(jresp.toRaw());
                }
                await next();
            }catch(e){
                ctx.response.status=400
            }
        }]
    }
}


//To make request proxy easier
export class SimpleHttpJsonRpc{
    registry:Record<string,Map<string,(params:any,opt?:any)=>Promise<any>>>={}
    async handleSimpleHttp(header:string,body:Uint8Array):Promise<[string,Uint8Array]>{
        let parsedHeader=JSON.parse(header);
        if(parsedHeader.method==='POST'){
            let handlers=this.registry[parsedHeader.path];
            if(handlers!=undefined){
                let req=new JsonRpcRequest();
                req.fromRaw(JSON.parse(new TextDecoder().decode(body)))
                let resp=await handleJsonRpcRequestWithHttpInfo(handlers,req,parsedHeader)
                return [JSON.stringify({
                    status:200,
                    headers:{'content-type':'application/json; charset=utf-8'}
                }),new TextEncoder().encode(JSON.stringify(resp.toRaw()))]
            }else{
                return [JSON.stringify({
                    status:404,
                    headers:{'content-type':'text/plain; charset=utf-8'}
                }),new TextEncoder().encode("path not found")]
            }
        }else{
            return [JSON.stringify({
                status:404,
                headers:{'content-type':'text/plain; charset=utf-8'}
            }),new TextEncoder().encode("path not found")] 
        }
    }
}


export class Koa2SimpleHttp{
    simpleHttpHandler=async (header:string,body:Uint8Array):Promise<[string,Uint8Array]>=>{
        return [
            JSON.stringify({
                status:404
            }),
            new TextEncoder().encode('No handler')
        ]
    }
    middleware():KoaRouter.IMiddleware[]{
        return [async (ctx,next)=>{
            let r=wrapReadable(ctx.req);
            let body=await r.readAll();
            try{
                let [rheader,rbody]=await this.simpleHttpHandler(JSON.stringify({
                    method:ctx.method,
                    path:ctx.path,
                    sourceIp:ctx.ip,
                    headers:ctx.header
                }),new Uint8Array(body));
                let parsedHeader=JSON.parse(rheader);
                ctx.response.status=parsedHeader.status;
                if(parsedHeader.headers!=undefined){
                    for(let t1 in parsedHeader.headers){
                        if(t1.toLowerCase()=='content-type'){
                            ctx.response.type=parsedHeader.headers[t1];
                        }else{
                            ctx.response.header[t1]=parsedHeader.headers[t1];
                        }
                    }
                }
                let {Readable}=await import('stream')
                ctx.response.body=Readable.from([rbody]);
                await next();
            }catch(e){
                ctx.response.status=502
            }
        }]
    }
}