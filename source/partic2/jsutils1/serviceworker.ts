import { requirejs } from "./base";
import { getWWWRoot, kvStore, GetUrlQueryVariable2, GetPersistentConfig, FunctionCallOverMessagePort } from "./webutils";


const __name__='partic2/jsutils1/serviceworker';



export const serviceWorkerServeRoot=getWWWRoot()+`/${__name__}/`;


export const ServiceWorkerId='service worker 1';

declare var __pxseedInit:any;


export let proxyMessageEventTarget=new EventTarget();

class MessageEventWithSource extends MessageEvent<any>{
    _source:any
    get source(){
        return this._source
    }
    constructor(type:string,eventInit:any){
        super(type,eventInit);
    }
}

__pxseedInit.onmessage=function(msg:MessageEvent){
    let ev=new MessageEventWithSource(msg.type,{data:msg.data});
    ev._source=msg.source;
    proxyMessageEventTarget.dispatchEvent(ev);
};

let spawnerFunctionCall=new FunctionCallOverMessagePort({
    postMessage:()=>{},
    addEventListener:proxyMessageEventTarget.addEventListener.bind(proxyMessageEventTarget) as any,
    removeEventListener:proxyMessageEventTarget.addEventListener.bind(removeEventListener) as any,
});

export async function setWorkerInfo(id:string){
    (globalThis as any).__workerId=id
    return id;
}

export let __internal__={spawnerFunctionCall}

export async function requestExit(){
    globalThis.close();
}


let swconfig:{
    startupModules?:string[]
}={};


export let onfetchHandlers=new Array<{name:string,handler:(ev:{request:Request})=>(null|Response|Promise<Response>)}>();

export async function cacheFetch(url:string):Promise<Response>{
    return await __pxseedInit.serviceWorker.cacheFetch(url);
}

export function getDefaultCache():Cache{
    return __pxseedInit.serviceWorker.cache;
}

export async function loadServiceWorkerModule(modName:string){
    try{
        let mod=await import(modName);
        if(mod!=undefined && ('__inited__' in mod)){
            await mod.__inited__;
        }
    }catch(e){
        console.error(e);
    }
}


if('__pxseedInit' in globalThis && __pxseedInit.env=='service worker'){
    //For service worker.
    (async ()=>{
        swconfig=await GetPersistentConfig(__name__)
        __pxseedInit.onfetch=(ev:{request:Request})=>{
            let resp:Promise<Response>|Response|null=null;
            for(let t1 of onfetchHandlers){
                resp=t1.handler(ev);
                if(resp!==null){
                    break;
                }
            }
            return resp;
        };
        try{
            await Promise.allSettled((swconfig.startupModules??[]).map(t1=>loadServiceWorkerModule(t1)))
        }catch(e){
            //Don't throw
            console.error(e);
        }
        __pxseedInit.serviceWorker.serviceWorkerLoaded();
    })();
}
