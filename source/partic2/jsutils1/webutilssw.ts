//This module can ONLY be used in environemnt support Service worker
//(https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)

import { future, GenerateRandomString, WaitUntil, sleep } from "./base";
import { BasicMessagePort, GetPersistentConfig, IWorkerThread, SavePersistentConfig, __name__, config, getWWWRoot, kvStore } from "./webutils";


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
    waitReady=new future<number>();
    constructor(workerId?:string){
        this.workerId=workerId??GenerateRandomString();
    };
    async start(){
        let servreg=await navigator.serviceWorker.register(workerEntryUrl)
        await WaitUntil(()=>servreg.active!=null,100);
        let servworker=servreg.active!
        this.port={
            addEventListener(type:'message',cb){
                navigator.serviceWorker.addEventListener(type,cb);
            },
            removeEventListener(type:'message',cb){
                navigator.serviceWorker.removeEventListener(type,cb);
            },
            postMessage(data,opt){
                servworker.postMessage(data,opt);
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
                    case 'ready':
                        this.waitReady.setResult(0);
                        break;
                }
            }
        });
        let workerReady=false;
        for(let t1=0;t1<1000&&!workerReady;t1++){
            await Promise.race([
                this.runScript(`resolve('ok')`,true).then(()=>workerReady=true),
                sleep(200,'pending')])
        }
        await this.runScript(`this.__workerId='${this.workerId}'`);

        await this.runScript(`try{
            require(['${__name__}'],function(thismod){
                resolve(0);
            },function(err){
                reject(err);
            })}catch(e){reject(e)}`,true);

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
    dbName??=config.defaultStorePrefix+'/kv-1';
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

export async function RequestDownloadSW(buff:ArrayBuffer|string,fileName:string){
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
    swconfig=await GetPersistentConfig(serviceworkerName);
    let startupModules=new Set(swconfig.startupModules??[]);
    startupModules.add(s);
    swconfig.startupModules=Array.from(startupModules);
    await SavePersistentConfig(serviceworkerName);
}

export async function unregisterServiceWorkerStartupModule(s:string){
    swconfig=await GetPersistentConfig(serviceworkerName);
    let startupModules=new Set(swconfig.startupModules??[]);
    startupModules.delete(s);
    swconfig.startupModules=Array.from(startupModules);
    await SavePersistentConfig(serviceworkerName);
}

export async function getServiceWorkerStartupModule(){
    swconfig=await GetPersistentConfig(serviceworkerName);
    return new Set(swconfig.startupModules??[]);
}