import { ArrayBufferConcat, ArrayBufferToBase64, ArrayWrap2, Base64ToArrayBuffer, future, GenerateRandomString, partial, requirejs } from "partic2/jsutils1/base";
import { defaultFuncMap, RpcExtendClient1, RpcExtendClientCallable, RpcExtendClientObject, RpcExtendServerCallable } from "pxprpc/extend";

import {defaultHttpHandler, defaultRouter} from './pxseedhttpserver'
import { utf8conv } from "partic2/CodeRunner/jsutils2";
import { getRpcFunctionOn } from "partic2/pxprpcBinding/utils";
import { ExtendHttpResponse, WebSocketServerConnection } from "partic2/tjshelper/httpprot";
import { getPersistentRegistered, importRemoteModule, ServerHostRpcName } from "partic2/pxprpcClient/registry";

let __name__=requirejs.getLocalRequireModule(require);



class HttpSession{
    request:Request|null=null;
    response:Response|null=null;
    requestBody=new ArrayWrap2<Uint8Array>();
    responseBody:ReadableStreamDefaultReader<Uint8Array>|null=null;
    closed=false;
    protocol:'http'|'ws'='http';
    websocketSend=new ArrayWrap2<Uint8Array>();
    websocketRecv=new ArrayWrap2<Uint8Array>();
    websocketAccepted=false;
    async doFetch(){
        this.response=await defaultHttpHandler.onfetch(this.request!);
        this.responseBody=this.response!.body?.getReader()??null;
    }
    async doWebsocket(){
        await defaultHttpHandler.onwebsocket({
            request:this.request!,
            accept:async ()=>{
                this.websocketAccepted=true;
                return {
                    send:async (obj: Uint8Array | string | Array<Uint8Array>)=>{
                        if(this.closed)throw new Error('Websocket closed.');
                        if(obj instanceof Array){
                            obj=new Uint8Array(ArrayBufferConcat(obj));
                        }else if(typeof obj==='string'){
                            obj=utf8conv(obj);
                        }
                        this.websocketSend.queueSignalPush(obj);
                    },
                    receive:async ()=>{
                        if(this.closed)throw new Error('Websocket closed.');
                        let r1=await this.websocketRecv.queueBlockShift();
                        return r1;
                    },
                    close:()=>{
                        this.closed=true;
                        this.websocketRecv.cancelWaiting();
                        this.websocketSend.cancelWaiting();
                    }
                }
            }
        })
    }
    async close(){
        this.closed=true;
        this.websocketRecv.cancelWaiting();
        this.websocketSend.cancelWaiting();
        this.requestBody.cancelWaiting();
    }
}

defaultFuncMap[__name__+'.newHttpSession']=new RpcExtendServerCallable(async (requestInit:Uint8Array)=>{
    let {url,method,headers,protocol}=JSON.parse(utf8conv(requestInit));
    let session=new HttpSession();
    session.protocol=protocol;
    let body:ReadableStream|null=null;
    if(['POST','PUT'].includes(method)){
        body=new ReadableStream({
            pull:async (controller: ReadableStreamDefaultController)=>{
                let chunk=await session.requestBody.queueBlockShift();
                if(chunk.length>0){
                    controller.enqueue(chunk);
                }else{
                    controller.close();
                }
            }
        });
    }
    let req=new Request(url,{headers,method,body,duplex: 'half'} as RequestInit);
    session.request=req;
    return session
}).typedecl('b->o')
defaultFuncMap[__name__+'.writeHttpRequestBody']=new RpcExtendServerCallable(async (session:HttpSession,data:Uint8Array)=>{
    if(session.protocol==='http'){
        session.requestBody.queueSignalPush(data);
    }else if(session.protocol==='ws'){
        session.websocketRecv.queueSignalPush(data);
    }else{
        throw new Error('Unknown protocol:'+session.protocol)
    }
}).typedecl('ob->');
defaultFuncMap[__name__+'.fetchHttpResponse']=new RpcExtendServerCallable(async (session:HttpSession)=>{
    if(session.protocol==='http'){
        await session.doFetch();
        let headers:Record<string,string>={}
        let {status,statusText,headers:header2}=session.response!
        header2.forEach((v,k)=>{
            headers[k]=v;
        });
        return utf8conv(JSON.stringify({status,statusText,headers,hasBody:session.response?.body!=null}));
    }else if(session.protocol==='ws'){
        await session.doWebsocket();
        return utf8conv(JSON.stringify({websocketAccepted:session.websocketAccepted}));
    }else{
        throw new Error('Unknown protocol:'+session)
    }
}).typedecl('o->b');
defaultFuncMap[__name__+'.readHttpResponseBody']=new RpcExtendServerCallable(async (session:HttpSession)=>{
    if(session.protocol==='http'){
        if(session.responseBody==null){
            return new Uint8Array(0);
        }
        let readResult=await session.responseBody!.read();
        if(readResult.done){
            return new Uint8Array(0);
        }else{
            return readResult.value;
        }
    }else if(session.protocol==='ws'){
        return await session.websocketSend.queueBlockShift();
    }else{
        throw new Error('Unknown protocol:'+session.protocol)
    }
}).typedecl('o->b');

let rpcObjectFree=new FinalizationRegistry((session:RpcExtendClientObject)=>session.free())

export class HttpRequestForwardOnRpc{
    constructor(public client1:RpcExtendClient1){}
    async fetch(req:Request):Promise<Response>{
        let {url,method,headers:headers2}=req;
        let headers:Record<string,string>={};
        headers2.forEach((v,k)=>{
            headers[k]=v;
        })
        let newHttpSession=await getRpcFunctionOn(this.client1,__name__+'.newHttpSession','b->o');
        let httpSession=await newHttpSession!.call(utf8conv(JSON.stringify({url,method,headers,protocol:'http'}))) as RpcExtendClientObject;
        let abortCtl=new AbortController();
        try{
            if(req.body!=null){
                let writeHttpRequestBody=await getRpcFunctionOn(this.client1,__name__+'.writeHttpRequestBody','ob->');
                (async ()=>{
                    let reader=req.body!.getReader();
                    for(let readResult=await reader.read();!readResult.done;readResult=await reader.read()){
                        await writeHttpRequestBody!.call(httpSession,readResult.value);
                    }
                    await writeHttpRequestBody!.call(httpSession,new Uint8Array(0));
                })();
            }
            let fetchHttpResponse=await getRpcFunctionOn(this.client1,__name__+'.fetchHttpResponse','o->b');
            let readHttpResponseBody=await getRpcFunctionOn(this.client1,__name__+'.readHttpResponseBody','o->b');
            
            let {status,statusText,headers}=JSON.parse(utf8conv(await fetchHttpResponse!.call(httpSession) as Uint8Array));
            let resp2=new ExtendHttpResponse(new ReadableStream({
                pull:async (controller: ReadableStreamDefaultController)=>{
                    abortCtl.signal.throwIfAborted();
                    let chunk=await readHttpResponseBody!.call(httpSession) as Uint8Array;
                    if(chunk.length>0){
                        controller.enqueue(chunk);
                    }else{
                        controller.close();
                        httpSession.free();
                    }
                }
            }),{status,statusText,headers});
            rpcObjectFree.register(resp2,httpSession);
            return resp2;
        }catch(err){
            abortCtl.abort();
            httpSession.free();
            throw err;
        }
    }
    async websocket(ctl:{
            request:Request
            accept:()=>Promise<WebSocketServerConnection> //Only accept before 'onwebsocket' resolved.
        }):Promise<void>{
        let {url,method,headers:headers2}=ctl.request;
        let headers:Record<string,string>={};
        headers2.forEach((v,k)=>{
            headers[k]=v;
        })
        let newHttpSession=await getRpcFunctionOn(this.client1,__name__+'.newHttpSession','b->o');
        let httpSession=await newHttpSession!.call(utf8conv(JSON.stringify({url,method,headers,protocol:'ws'}))) as RpcExtendClientObject;
        let fetchHttpResponse=await getRpcFunctionOn(this.client1,__name__+'.fetchHttpResponse','o->b');
        let readHttpResponseBody=await getRpcFunctionOn(this.client1,__name__+'.readHttpResponseBody','o->b');
        let writeHttpRequestBody=await getRpcFunctionOn(this.client1,__name__+'.writeHttpRequestBody','ob->');
        let {websocketAccepted}=JSON.parse(utf8conv(await fetchHttpResponse!.call(httpSession) as Uint8Array));
        if(websocketAccepted){
            let conn=await ctl.accept();
            Promise.race([(async ()=>{
                while(true){
                    let chunk=await conn.receive();
                    await writeHttpRequestBody!.call(httpSession,chunk);
                }
            })(),(async ()=>{
                while(true){
                    let chunk=await readHttpResponseBody!.call(httpSession);
                    await conn.send(chunk);
                }
            })()]).catch((err)=>{
            }).finally(()=>{
                httpSession.free();
                conn.close();
            })
        }
    }
}

export async function __serverHostForwardHttpRequestToRpcWorker(prefix:string,rpc:string|null){
    if(rpc==null){
        defaultRouter.setHandler(prefix,null);
    }else{
        defaultRouter.setHandler(prefix,new HttpRequestForwardOnRpc(await (await getPersistentRegistered(rpc))!.ensureConnected()));
    }
}

export async function forwardHttpRequestToRpcWorker(prefix:string,rpc:string|null){
    let httpforward=await importRemoteModule(await (await getPersistentRegistered(ServerHostRpcName))!.ensureConnected(),__name__) as typeof import('./httpforward');
    httpforward.__serverHostForwardHttpRequestToRpcWorker(prefix,rpc);
}

