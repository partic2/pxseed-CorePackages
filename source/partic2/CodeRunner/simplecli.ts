import { GenerateRandomString, requirejs, throwIfAbortError } from "partic2/jsutils1/base";
import { GetPersistentConfig, SavePersistentConfig } from "partic2/jsutils1/webutils";
import { LocalRunCodeContext } from "./CodeContext";
import { CodeContextRemoteObjectFetcher, inspectCodeContextVariable, toSerializableObject } from "./Inspector";
import { getAttachedRemoteRigstryFunction, RpcWorker } from "partic2/pxprpcClient/registry";

let remoteObjectFetchConfig={maxDepth:3,maxKeyCount:50,enumerateMode:'for in' as 'for in'}

let __name__=requirejs.getLocalRequireModule(require);
interface moduleConfig{
    initScript:Record<string,string>
}


let encode=TextEncoder.prototype.encode.bind(new TextEncoder());
let decode=TextDecoder.prototype.decode.bind(new TextDecoder());

export async function simplecliDefaultInit(_ENV:any){
    try{
        if(globalThis?.process?.versions?.node!=undefined){
            _ENV.ppm=await import('partic2/packageManager/registry')
        }
    }catch(err:any){
        console.info(err.message);
        console.info(err.stack);
    };
}

export async function getConfig(){
    let config:Partial<moduleConfig>=await GetPersistentConfig(__name__);
    if(config.initScript==undefined){
        config.initScript={};
    }
    config.initScript[__name__]=`
import {simplecliDefaultInit as __t1} from '${__name__}'
await __t1(_ENV);
`
    return {
        config:config as moduleConfig,
        save:()=>SavePersistentConfig(__name__)
    }
}

export class SimpleCli{
    codeContext=new LocalRunCodeContext();
    remoteObjectFetcher=new CodeContextRemoteObjectFetcher(this.codeContext);
    constructor(public stdin:ReadableStreamDefaultReader<Uint8Array>,
                public stdout:WritableStreamDefaultWriter<Uint8Array>,
                public stderr:WritableStreamDefaultWriter<Uint8Array>){
    }
    async evalInput(jscode:string){
        try{
            let result=await this.codeContext.runCode(jscode,'_');
            if(result.err!=null){
                await this.stderr.write(encode(JSON.stringify(result,undefined,2)));
            }else if(result.stringResult!=null){
                await this.stderr.write(encode(result.stringResult));
            }else{
                let remoteObj=await inspectCodeContextVariable(this.remoteObjectFetcher,['_'],remoteObjectFetchConfig);
                await this.stderr.write(encode(JSON.stringify(remoteObj,(key,val)=>{
                    if(typeof val=='bigint'){
                        return `BigInt('${val}')`;
                    }else{
                        return val;
                    }
                },2)));
            }
        }catch(err:any){
            await this.stderr.write(encode(err.message));
            await this.stderr.write(encode(err.stack));
        }
        await this.stdout.write(encode('\n>'));
    }
    async initEnv(){
        let {config}=await getConfig();
        for(let script of Object.values(config.initScript)){
            try{
                await this.codeContext.runCode(script);
            }catch(err:any){
                throwIfAbortError(err);
                await this.stderr.write(encode(err.message));
                await this.stderr.write(encode(err.stack));
            }
        }
    }
    async repl(){
        this.stdout.write(encode('>'));
        while(true){
            let input1=await this.stdin.read();
            if(input1.value!=undefined){
                this.evalInput(decode(input1.value));
            }
            if(input1.done){
                break;
            }
        }
    }
}