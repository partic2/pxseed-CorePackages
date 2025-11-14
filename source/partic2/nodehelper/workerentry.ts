

import { parentPort } from "worker_threads";
import './env';
import {MessagePortForNodeWorker,setupImpl} from './worker';

declare var require:any

(function(){
    setupImpl();
    const WorkerThreadMessageMark='__messageMark_WorkerThread';
    let compa=new MessagePortForNodeWorker(parentPort!);
    /* possible break the future eventTarget code. need better solution. */
    (global as any).postMessage=compa.postMessage.bind(compa);
    (global as any).addEventListener=compa.addEventListener.bind(compa);
    (global as any).removeEventListener=compa.removeEventListener.bind(compa);
    
    //exit worker_thread
    (global as any).close=()=>process.exit();

    globalThis.addEventListener('message',function(msg){
        if(typeof msg.data==='object' && msg.data[WorkerThreadMessageMark]){
            let type=msg.data.type;
            let scriptId=msg.data.scriptId;
            switch(type){
                case 'run':
                    new Function('resolve','reject',msg.data.script)((result:any)=>{
                        globalThis.postMessage({[WorkerThreadMessageMark]:true,type:'onScriptResolve',result,scriptId});
                    },(reason:any)=>{
                        globalThis.postMessage({[WorkerThreadMessageMark]:true,type:'onScriptRejecte',reason,scriptId});
                    });
                    break;
            }
        }
    });
    if('close' in globalThis){
        let workerClose=globalThis.close.bind(globalThis);
        globalThis.close=function(){
            require(['partic2/jsutils1/webutils'],function(webutils:typeof import('partic2/jsutils1/webutils')){
                webutils.lifecycle.dispatchEvent(new Event('exit'));
                globalThis.postMessage({[WorkerThreadMessageMark]:true,type:'closing'});
                workerClose();
            },function(){
                globalThis.postMessage({[WorkerThreadMessageMark]:true,type:'closing'});
                workerClose();
            })
        }
    }
    globalThis.postMessage({[WorkerThreadMessageMark]:true,type:'ready'});
})()



