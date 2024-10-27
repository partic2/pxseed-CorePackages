

import { parentPort } from "worker_threads";
import {MessagePortForNodeWorker,setupImpl} from './worker'





(function(){
    setupImpl();
    const WorkerThreadMessageMark='__messageMark_WorkerThread';
    let compa=new MessagePortForNodeWorker(parentPort!);
    /* possible break the future eventTarget code. need better solution. */
    (global as any).postMessage=compa.postMessage.bind(compa);
    (global as any).addEventListener=compa.addEventListener.bind(compa);
    (global as any).removeEventListener=compa.removeEventListener.bind(compa);

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
    globalThis.postMessage({[WorkerThreadMessageMark]:true,type:'ready'});
})()



