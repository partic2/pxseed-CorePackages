import { requirejs } from "./base";
import { getWWWRoot, kvStore, GetUrlQueryVariable2, GetPersistentConfig } from "./webutils";


const __name__='partic2/jsutils1/serviceworker';



export const serviceWorkerServeRoot=getWWWRoot()+`/${__name__}/`;


export const ServiceWorkerId='service worker 1';


(function(){
    const WorkerThreadMessageMark='__messageMark_WorkerThread';
    (self as any).globalThis=self;
    addEventListener('message',function(msg){
        if(typeof msg.data==='object' && msg.data[WorkerThreadMessageMark]){
            let type=msg.data.type;
            let scriptId=msg.data.scriptId;
            switch(type){
                case 'run':
                    new Function('resolve','reject',msg.data.script)((result:any)=>{
                        (msg.source??globalThis).postMessage({[WorkerThreadMessageMark]:true,type:'onScriptResolve',result,scriptId});
                    },(reason:any)=>{
                        (msg.source??globalThis).postMessage({[WorkerThreadMessageMark]:true,type:'onScriptRejecte',reason,scriptId});
                    });
                    break;
            }
        }
    });

    if('postMessage' in globalThis){
        globalThis.postMessage({[WorkerThreadMessageMark]:true,type:'ready'});
    }
    
})()


async function kvStoreOnFetch(dbName:string,varName:string,queryStat?:string){
    let db=await kvStore(dbName);
    let data=await db.getItem(varName);
    if(data==undefined){
        return new Response('Not found',{
            status:404
        });
    }else{
        let contentType='';
        if(queryStat!=undefined){
            contentType=decodeURIComponent(GetUrlQueryVariable2(queryStat,'content-type')??'');
        }
        let headers={} as Record<string,string>;
        if(contentType!=''){
            headers['content-type']=contentType
        }
        return new Response(data,{
            headers
        })
    }
    
}
declare var __pxseedInit:any;

let swconfig:{
    startupModules?:string[]
}={};

export let onfetchHandlers=new Array<(ev:{request:Request})=>(null|Response|Promise<Response>)>();

if('__pxseedInit' in globalThis && __pxseedInit.env=='service worker'){
    //For service worker.
    (async ()=>{
        __pxseedInit.onfetch=(ev:{request:Request})=>{
            let resp:Promise<Response>|Response|null=null;
            for(let t1 of onfetchHandlers){
                resp=t1(ev);
                if(resp!==null){
                    break;
                }
            }
            return resp;
        };
        onfetchHandlers.push((fetchEv)=>{
            let req=fetchEv.request;
            if(req.url.startsWith(serviceWorkerServeRoot)){
                let subpath=req.url.substring(serviceWorkerServeRoot.length);
                let matched=subpath.match(/^kvStore\/(.+?)\/(.+?)(\?.*)?$/)
                if(matched!=null){
                    return kvStoreOnFetch(decodeURIComponent(matched[1]),matched[2],matched[3]);
                }
            }
            return null;
        });
        swconfig=await GetPersistentConfig(__name__);
        for(let t1 of swconfig.startupModules??[]){
            try{
                let mod=await requirejs.promiseRequire<any>(t1);
                if(mod!=undefined && ('asyncInit' in mod)){
                    await mod.asyncInit();
                }
            }catch(e){
                console.error(e);
                //Don't throw here.
            }
            
        }
        __pxseedInit.serviceWorker.serviceWorkerLoaded();
    })();
}
