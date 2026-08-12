//This module can ONLY be used in environemnt support Service worker
//(https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)

import { future, GenerateRandomString, WaitUntil, sleep, requirejs, throwIfAbortError, mutex } from "./base";
import { BasicMessagePort, GetPersistentConfig, IWorkerThread, SavePersistentConfig, config as utilsconfig, getWWWRoot, kvStore, FunctionCallOverMessagePort } from "./webutils";

const __name__=requirejs.getLocalRequireModule(require);

/*workerentry.js MUST put into the same origin to access storage api on web ,
Due to same-origin-policy. That mean, dataurl is unavailable.
Worker can be override, So do NOT abort this module init(throw error).*/
let workerEntryUrl=function(){
    try{
        return getWWWRoot()+'/pxseedInit.js?__jsentry='+encodeURIComponent('partic2/jsutils1/serviceworker')
    }catch(e){};
    return '';
}()

export const serviceWorkerServeRoot=getWWWRoot()+'/partic2/jsutils1/serviceworker/';


export const ServiceWorkerId='service worker 1';

//WorkerThread feature require a custom AMD loader https://github.com/partic2/partic2-iamdee
const WorkerThreadMessageMark='__messageMark_WorkerThread'


class ServiceWorkerThread implements IWorkerThread{
    //XXX:Chrome for android don't support SharedWorker.
    port?:BasicMessagePort;
    workerId='';
    protected waitReady=new future<number>();
    protected funcCall?:FunctionCallOverMessagePort;
    onExit=new Set<()=>void>()
    constructor(workerId?:string){
        this.workerId=workerId??GenerateRandomString();
    };
    protected _forwardLifecycle=(msg:Event)=>{
        this.call('partic2/jsutils1/workerentry','dispatchWorkerLifecycle',[msg.type]);
    }
    async start(){
        let serviceWorker:ServiceWorker;
        if(navigator.serviceWorker.controller!=undefined){
            serviceWorker=navigator.serviceWorker.controller;
        }else{
            let servreg=await navigator.serviceWorker.register(workerEntryUrl)
            await WaitUntil(()=>servreg.active!=null,100,10000);
            serviceWorker=servreg.active!
        }
        this.port={
            addEventListener(type:'message',cb){
                navigator.serviceWorker.addEventListener(type,cb);
            },
            removeEventListener(type:'message',cb){
                navigator.serviceWorker.removeEventListener(type,cb);
            },
            postMessage(data,opt){
                serviceWorker.postMessage(data,opt);
            }
        }
        let cb=(msg:MessageEvent)=>{
            if(typeof msg.data==='object'){
                if(msg.data[WorkerThreadMessageMark]==='closing'){
                    this.onExit.forEach(cb=>cb());
                }
            }
        };
        this.port.addEventListener('message',cb);
        this.funcCall=new FunctionCallOverMessagePort(this.port);
        for(let t1=0;t1<50&&!this.waitReady.done;t1++){
            this.call('partic2/jsutils1/serviceworker','setWorkerInfo',[this.workerId]).then(()=>this.waitReady.setResult(0));
            await Promise.race([this.waitReady.get(),sleep(200)]);
        }
        if(!this.waitReady.done)throw new Error('Timeout waiting for service worker ready.')
    }
    async call(module:string,funcName:string,args:any[]):Promise<any>{
        return await this.funcCall!.call(module,funcName,args)
    }
    requestExit(){
        this.call('partic2/jsutils1/serviceworker','requestExit',[]);
    }
}


let serviceWorkerThread1:ServiceWorkerThread|null;


export async function ensureServiceWorkerInstalled(){
    if(serviceWorkerThread1==null){
        serviceWorkerThread1=new ServiceWorkerThread(ServiceWorkerId);
        await serviceWorkerThread1.start();
    };
    return serviceWorkerThread1;
}

let swconfig:{
    startupModules?:string[]
}={};

const serviceworkerName='partic2/jsutils1/serviceworker';

//service worker startup module may export asyncInit to do initialize asynchronously.
//startup module can push/unshift interceptor to "onfetchHandlers" in './serviceworker'.
export async function registerServiceWorkerStartupModule(s:string){
    let worker=await ensureServiceWorkerInstalled();
    swconfig=await GetPersistentConfig(serviceworkerName);
    let startupModules=new Set(swconfig.startupModules??[]);
    startupModules.add(s);
    swconfig.startupModules=Array.from(startupModules);
    await SavePersistentConfig(serviceworkerName,swconfig);
    worker.call(serviceworkerName,'loadServiceWorkerModule',[s])
}



export async function unregisterServiceWorkerStartupModule(s:string){
    swconfig=await GetPersistentConfig(serviceworkerName);
    let startupModules=new Set(swconfig.startupModules??[]);
    startupModules.delete(s);
    swconfig.startupModules=Array.from(startupModules);
    await SavePersistentConfig(serviceworkerName,swconfig);
}

export async function reloadServiceWorkerAndCache(){
    //Maybe we should call function in service worker instead?
    fetch(`${getWWWRoot()}/pxseedInit.js/reload`)
}

export async function getServiceWorkerStartupModule(){
    swconfig=await GetPersistentConfig(serviceworkerName);
    return new Set(swconfig.startupModules??[]);
}

/*
not handle:passthrough to other handle(default behaviour).
fetch only:always fetch from remote host.
fetch first:fetch first, use cache if failed, update cache if successed.
cache first:use cache first, if missed, try fetch and update cache.
NOTE:"cache first" will prevent js updated from host before cache is clear. Use it carefuly.
*/
export type SimpleGETCachePolicy='not handle'|'fetch only'|'fetch first'|'cache first'



const cacheName=getWWWRoot()+'/'+__name__;


let config:{
    simpleGETCache?:{
        policy:SimpleGETCachePolicy
    }
}={}

class SimpleGETCacheFetchHandler{
    cache?:Cache
    constructor(){}
    async fetchOnlyHandler(request:Request){
        return await fetch(request);
    }
    async updateWithConfig(){
        if(this.cache==undefined){
            this.cache=await caches.open(cacheName);
        }
    }
    async fetchFirstHandler(request:Request){
        try{
            let resp=await fetch(request.url);
            let respClone=resp.clone();
            await this.cache!.put(request.url,resp);
            return respClone;
        }catch(err:any){
            throwIfAbortError(err);
            let matchResult=await this.cache!.match(request.url);
            if(matchResult==undefined){
                return new Response(null,{status:404});
            }else{
                return matchResult;
            }
        }
    }
    async cacheFirstHandler(request:Request){
        let matchResult=await this.cache!.match(request.url);
        if(matchResult==undefined){
            let resp=await fetch(request.url);
            let respClone=resp.clone();
            await this.cache!.put(request.url,resp);
            return respClone;
        }else{
            return matchResult;
        }
    }
    fetch=(ev:{request:Request}):(null|Response|Promise<Response>)=>{
        if(ev.request.method!='GET'){
            return null;
        }
        let policy:SimpleGETCachePolicy=config.simpleGETCache?.policy??'not handle';
        switch(policy){
            case 'not handle':
                return null;
            case 'fetch only':
                return this.fetchOnlyHandler(ev.request);
            case 'fetch first':
                return this.fetchFirstHandler(ev.request);
            case 'cache first':
                return this.cacheFirstHandler(ev.request);
            default:
                return null;
        }
    }
}

//internal use
export let usingSimpleGETCacheFetchHandler:SimpleGETCacheFetchHandler|null=null;
declare let __pxseedInit:any;


export let __inited__=(async()=>{
    if('__pxseedInit' in globalThis && __pxseedInit.env=='service worker' ){
        config=await GetPersistentConfig(__name__);
        let {onfetchHandlers}=await import('./serviceworker');
        usingSimpleGETCacheFetchHandler=new SimpleGETCacheFetchHandler();
        await usingSimpleGETCacheFetchHandler.updateWithConfig();
        onfetchHandlers.push({name:__name__+'.SimpleGETCache',handler:usingSimpleGETCacheFetchHandler.fetch});
    }
})();

export async function installThisModule(){
    await registerServiceWorkerStartupModule(__name__);
}

export async function uninstallThisModule(){
    await unregisterServiceWorkerStartupModule(__name__);
}

//Simple "GET Request Cache Manager" for Service Worker 
export let SimpleGETCache={
    ensurePersistentConfigLoaded:async function(){
        config=await GetPersistentConfig(__name__);
    },
    //The service worker config must reload manually after modified(ie:setCachePolicy)
    async reloadServiceWorkerConfig(){
        if('__pxseedInit' in globalThis && __pxseedInit.env=='service worker'){
            if(usingSimpleGETCacheFetchHandler!=null){
                await this.ensurePersistentConfigLoaded();
                await usingSimpleGETCacheFetchHandler.updateWithConfig();
            }
        }else{
            let sw=await ensureServiceWorkerInstalled();
            await sw.call(__name__,'SimpleGETCacheReloadConfig',[]);
        }
    },
    setCachePolicy:async function(policy:SimpleGETCachePolicy){
        await this.ensurePersistentConfigLoaded();
        config.simpleGETCache={policy:policy};
        await SavePersistentConfig(__name__,config);
    },
    getCachePolicy:async function(){
        await this.ensurePersistentConfigLoaded();
        return config.simpleGETCache?.policy
    },
    clearCache:async function(){
        await caches.delete(cacheName)
    }
}
export async function SimpleGETCacheReloadConfig(){
    return await SimpleGETCache.reloadServiceWorkerConfig()
}