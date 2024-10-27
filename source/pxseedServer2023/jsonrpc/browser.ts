import { HttpClient, defaultHttpClient } from "partic2/jsutils1/webutils";
import { JsonRpcError, JsonRpcRequest, JsonRpcResponse } from "./prot";

export class JsonRpcClient{
    httpClient:HttpClient
    constructor(public url:string,httpClient?:HttpClient){
        this.httpClient=httpClient??defaultHttpClient;
    }
    async request(method:string,params:any):Promise<any>{
        let req=new JsonRpcRequest(method,params);
        let httpResp=await this.httpClient.fetch(this.url,{
            method:'POST',
            body:JSON.stringify(req.toRaw())
        });
        let respText=await httpResp.text()
        let resp=new JsonRpcResponse(0).fromRaw(JSON.parse(respText));
        if(resp.error!=null){
            throw new JsonRpcError(resp.error.code,resp.error.message,resp.error.data);
        }else{
            return resp.result;
        }
    }
}


