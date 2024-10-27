import { GenerateRandomString, partial } from "partic2/jsutils1/base"

export class JsonRpcError extends Error{
    constructor(public code?:number,message?:string,public data?:any){
        super(message);
    }
}

export interface IJsonRpcRequest{
    jsonrpc:'2.0'
    id:string|number
    method:string
    params:any[]|{[name:string]:any}|null
}

export class JsonRpcRequest implements IJsonRpcRequest{
    jsonrpc= "2.0" as const
    id:string|number=GenerateRandomString()
    method:string = ''
    params:any
    constructor(method?:string,params?:any[]|{[name:string]:any}|null){
        if(method!==undefined){
            this.method=method;
        }
        if(params!==undefined){
            this.params=params;
        }
    }
    fromRaw(raw:any){
        for(let t1 in raw){
            (this as any)[t1]=raw[t1];
        }
        return this;
    }
    toRaw(){
        return partial(this,['jsonrpc','id','method','params']);
    }
}

export interface IJsonRpcResponse{
    jsonrpc:'2.0'
    id:string|number
    result?:any
    error?:{
        code:number
        message:string
        data?:any
    }
}


export class JsonRpcResponse implements IJsonRpcResponse{
    jsonrpc: "2.0"='2.0' as const
    id: string | number = 0
    result: any =undefined
    error?: { code: number; message: string; data?: any }=undefined
    constructor(id:string|number){
        this.id=id;
    }
    setResult(result:any){
        this.result=result;
        this.error=undefined;
    }
    setError(code:number,message:string,data?:any){
        this.error={code,message,data}
        this.result=undefined;
    }
    fromRaw(raw:any){
        for(let t1 in raw){
            (this as any)[t1]=raw[t1];
        }
        return this;
    }
    toRaw():any{
        return partial(this,['jsonrpc','id','result','error']);
    }
}

export var errorCode={
    parseError:-32700 as const,
    invalidRequest:-32600 as const,
    methodNotFound:-32601 as const,
    invalidParams:-32602 as const,
    internalError:-32603 as const,
    firstServerError:-32000 as const,
    lastServerError:-32099 as const
}