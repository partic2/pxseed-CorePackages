

import {setupImpl} from './tjsenv'

/*This file MUST get from the same origin to access storage api on web ,
Due to same-origin-policy.  That mean, dataurl is unavailable. */

declare var define:any
declare var require:any

declare var __pxseedInit:any

(function(){
    setupImpl();
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


