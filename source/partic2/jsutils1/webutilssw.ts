//This module can ONLY be used in environemnt support Service worker
//(https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)

import { future, GenerateRandomString, WaitUntil, sleep, requirejs, throwIfAbortError } from "./base";
import { BasicMessagePort, GetPersistentConfig, IWorkerThread, SavePersistentConfig, config as utilsconfig, getWWWRoot, kvStore } from "./webutils";

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
    port?:BasicMessagePort;
    workerId='';
    constructor(workerId?:string){
        this.workerId=workerId??GenerateRandomString();
    };
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
        this.port.addEventListener('message',(msg:MessageEvent)=>{
            if(typeof msg.data==='object' && msg.data[WorkerThreadMessageMark]){
                let {type,scriptId}=msg.data as {type:string,scriptId?:string};
                switch(type){
                    case 'run':
                        this.onHostRunScript(msg.data.script)
                        break;
                    case 'onScriptResolve':
                        this.onScriptResult(msg.data.result,scriptId)
                        break;
                    case 'onScriptReject':
                        this.onScriptReject(msg.data.reason,scriptId);
                        break;
                }
            }
        });
        let workerReady=false;
        for(let t1=0;t1<50&&!workerReady;t1++){
            await Promise.race([
                this.runScript(`resolve('ok')`,true).then(()=>workerReady=true),
                sleep(200,'pending')])
        }
        if(!workerReady){
            throw new Error('Timeout waiting for service worker ready.')
        }
        await this.runScript(`this.__workerId='${this.workerId}'`);
    }
    onHostRunScript(script:string){
        (new Function('workerThread',script))(this);
    }
    processingScript={} as {[scriptId:string]:future<any>}
    async runScript(script:string,getResult?:boolean){
        let scriptId='';
        if(getResult===true){
            scriptId=GenerateRandomString();
            this.processingScript[scriptId]=new future<any>();
        }
            this.port?.postMessage({[WorkerThreadMessageMark]:true,type:'run',script,scriptId})
        if(getResult===true){
            return await this.processingScript[scriptId].get();            
        }
    }
    onScriptResult(result:any,scriptId?:string){
        if(scriptId!==undefined && scriptId in this.processingScript){
            let fut=this.processingScript[scriptId];
            delete this.processingScript[scriptId];
            fut.setResult(result);
        }
    }
    onScriptReject(reason:any,scriptId?:string){
        if(scriptId!==undefined && scriptId in this.processingScript){
            let fut=this.processingScript[scriptId];
            delete this.processingScript[scriptId];
            fut.setException(new Error(reason));
        }
    }
    requestExit(){
        this.runScript('globalThis.close()');
    }
}


let serviceWorkerThread1:ServiceWorkerThread|null;


export function getUrlForKvStore(dbName:string|undefined,key:string,options?:{
    contentType?:string
}){
    dbName??=utilsconfig.defaultStorePrefix+'/kv-1';
    let search:string[]=[];
    if(options?.contentType!=undefined){
        search.push('content-type='+encodeURIComponent(options.contentType));
    }
    let url=serviceWorkerServeRoot+'kvStore/'+encodeURIComponent(dbName)+'/'+key;
    if(search.length>0){
        url+='?'+search.join('&');
    }
    return url;
}

export async function RequestDownloadSW(buff:ArrayBuffer|string|Uint8Array<ArrayBuffer>,fileName:string){
    let kvs=await kvStore()
    let tempPath='__temp/'+GenerateRandomString()+'/'+fileName;
    if(typeof buff==='string'){
        buff=new TextEncoder().encode(buff);
    }
    await kvs.setItem(tempPath,buff)
    window.open(getUrlForKvStore(undefined,tempPath,{contentType:'application/octet-stream'}),'_blank')
    await sleep(3000);
    kvs.delete(tempPath);
}

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
    await SavePersistentConfig(serviceworkerName);
    worker.runScript(`require(['${serviceworkerName}'],function(sw){
        sw.loadServiceWorkerModule('${s}')
    })`)
}



export async function unregisterServiceWorkerStartupModule(s:string){
    swconfig=await GetPersistentConfig(serviceworkerName);
    let startupModules=new Set(swconfig.startupModules??[]);
    startupModules.delete(s);
    swconfig.startupModules=Array.from(startupModules);
    await SavePersistentConfig(serviceworkerName);
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

let config:{
    simpleGETCache?:Array<{
        path:string,
        policy:SimpleGETCachePolicy
    }>
}={}

const cacheName=getWWWRoot()+'/'+__name__;

class SimpleGETCacheFetchHandler{
    protected policyMap=new Map<string,SimpleGETCachePolicy>();
    protected wwwrootPathLength:number=0;
    cache?:Cache
    constructor(){}
    async initWithConfig(){
        config=await GetPersistentConfig(__name__);
        this.policyMap.clear();
        if(SimpleGETCache!=undefined){
            for(let t1 of config.simpleGETCache!){
                this.policyMap.set(t1.path,t1.policy);
            }
        }
        this.wwwrootPathLength=new URL(getWWWRoot()).pathname.length;
        this.cache=await caches.open(cacheName);
    }
    async fetchOnlyHandler(request:Request){
        return await fetch(request);
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
    handler=(ev:{request:Request}):(null|Response|Promise<Response>)=>{
        if(ev.request.method!='GET'){
            return null;
        }
        let relpath=new URL(ev.request.url).pathname.substring(this.wwwrootPathLength+1).split('/');
        let policy:SimpleGETCachePolicy='not handle';
        for(let t1=0;t1<=relpath.length;t1++){
            let curpolicy=this.policyMap.get(relpath.slice(0,t1).join('/'));
            if(curpolicy!=undefined){
                policy=curpolicy;
            }
        }
        switch(policy){
            case 'not handle':
                return null;
            case 'fetch only':
                return this.cacheFirstHandler(ev.request);
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

export async function asyncInit(){
    if('__pxseedInit' in globalThis && __pxseedInit.env=='service worker'){
        config=await GetPersistentConfig(__name__);
        let {onfetchHandlers}=await import('./serviceworker');
        usingSimpleGETCacheFetchHandler=new SimpleGETCacheFetchHandler();
        await usingSimpleGETCacheFetchHandler.initWithConfig();
        onfetchHandlers.push(usingSimpleGETCacheFetchHandler.handler)
    }
}



//Simple "GET Request Cache Manager" for Service Worker 
export let SimpleGETCache={
    enable:async function(){
        await registerServiceWorkerStartupModule(__name__);
    },
    disable:async function(){
        await unregisterServiceWorkerStartupModule(__name__);
    },
    ensurePersitentConfigLoaded:async function(){
        config=await GetPersistentConfig(__name__);
    },
    //The service worker config must reload manually after modified(ie:setCachePolicy)
    async reloadConfig(){
        if('__pxseedInit' in globalThis && __pxseedInit.env=='service worker'){
            if(usingSimpleGETCacheFetchHandler!=null){
                await this.ensurePersitentConfigLoaded();
                await usingSimpleGETCacheFetchHandler.initWithConfig();
            }
        }else{
            let sw=await ensureServiceWorkerInstalled();
            sw.runScript(`require(['${__name__}'],function(thismod){
                thismod.SimpleGETCache.reloadConfig().then(resolve)
            })`)
        }
    },
    //path is relative the wwwroot
    setCachePolicy:async function(path:string,policy:SimpleGETCachePolicy){
        this.ensurePersitentConfigLoaded();
        if(config.simpleGETCache==undefined){
            config.simpleGETCache=[];
        }
        path=path.split('/').join('/');
        let found=config.simpleGETCache.find(t1=>t1.path==path);
        if(found==undefined){
            found={path,policy};
            config.simpleGETCache.push(found);
        }else{
            found.policy=policy;
        }
        SavePersistentConfig(__name__);
    },
    getAllCachePolicy:async function(){
        await this.ensurePersitentConfigLoaded();
        return config.simpleGETCache??[]
    },
    clearCache:async function(){
        await caches.delete(cacheName)
    }
}