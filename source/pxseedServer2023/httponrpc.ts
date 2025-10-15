import { ArrayBufferToBase64, ArrayWrap2, Base64ToArrayBuffer, future, GenerateRandomString, partial, requirejs } from "partic2/jsutils1/base";
import { defaultFuncMap, RpcExtendServerCallable } from "pxprpc/extend";

let __name__=requirejs.getLocalRequireModule(require);

class HttpSession{
    requestHeaders:Record<string,string>={};
    responseHeaders:Record<string,string>={};
    requestBody:ArrayWrap2<Uint8Array>=new ArrayWrap2();
    responseBody:ArrayWrap2<Uint8Array>=new ArrayWrap2();
    status:future<[number,string]>=new future();
    method:string='GET';
    path:string='';
    processing=false;
    async process(){
        this.processing=true;
        let req=new Request('http://0.0.0.0'+this.path,{
            method:this.method,
            headers:this.requestHeaders,
            body:new ReadableStream({
                pull:async (controller: ReadableStreamDefaultController)=>{
                    let chunk=await this.requestBody.queueBlockShift();
                    if(chunk.length>0){
                        controller.enqueue(chunk);
                    }else{
                        controller.close();
                    }
                }
            })
        });
        let resp=await httpHandler.onfetch(req);
        resp.headers.forEach((v,k)=>{this.responseHeaders[k]=v;});
        if(resp.body==undefined){
            this.responseBody.queueSignalPush(new Uint8Array(0));
        }else{
            let reader=resp.body.getReader();
            while(this.processing){
                let result=await reader.read();
                if(result.value!=undefined && result.value.length>0){
                   this.responseBody.queueSignalPush(result.value)
                }
                if(result.done){
                    break;
                }
            }
            this.responseBody.queueSignalPush(new Uint8Array(0));
        }
    }
}

export let allHttpSessions:Record<string,HttpSession>={}

export async function httpRequest(req:{method:string,path:string,headers:Record<string,string>}){
    let s=new HttpSession();
    s.method=req.method;
    s.path=req.path
    s.requestHeaders=req.headers;
    let sid=GenerateRandomString();
    allHttpSessions[sid]=s;
    s.process();
    return sid
}
//Consider better binary transfer
export async function httpSendBodyB64(sid:string,b64body:string){
    let s=allHttpSessions[sid];
    s.requestBody.queueSignalPush(new Uint8Array(Base64ToArrayBuffer(b64body)));
}

export async function httpWaitResponse(sid:string){
    let s=allHttpSessions[sid];
    let [status,statusText]=await s.status.get();
    return {
        status,statusText,
        headers:s.responseHeaders
    };
}

export async function httpRecvBodyB64(sid:string){
    let chunk=await allHttpSessions[sid].responseBody.queueBlockShift();
    if(chunk.length==0){
        delete allHttpSessions[sid]
    }
    return ArrayBufferToBase64(chunk);
}

export let httpHandler:{
    onfetch:(request:Request)=>Promise<Response>
}={
    onfetch:async ()=>new Response()
}