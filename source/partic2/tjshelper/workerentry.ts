

import { RpcExtendServer1 } from 'pxprpc/extend'
import './tjsenv'
import { PxprpcRtbIo } from './tjsenv'
import { Server } from 'pxprpc/base'


declare var define:any
declare var require:any

declare var __pxseedInit:any

const WorkerThreadMessageMark='__messageMark_WorkerThread';

function afterPostMessageSetup(){
    let workerClose:()=>void;
    if('close' in globalThis){
        workerClose=globalThis.close.bind(globalThis);
    }else{
        workerClose=()=>globalThis.postMessage({[WorkerThreadMessageMark]:true,type:'tjs-close'});
    }
    globalThis.close=function(){
        require(['partic2/jsutils1/webutils'],function(webutils:typeof import('partic2/jsutils1/webutils')){
            webutils.lifecycle.dispatchEvent(new Event('exit'));
            globalThis.postMessage({[WorkerThreadMessageMark]:true,type:'closing'});
            workerClose();
        },function(){
            globalThis.postMessage({[WorkerThreadMessageMark]:true,type:'closing'});;
            workerClose();
        })
    }
    globalThis.postMessage({[WorkerThreadMessageMark]:true,type:'ready'});
}
(function(){
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
        afterPostMessageSetup();
    }
})()

if((globalThis as any).__PRTBParentPipeServerId!=undefined){
    let parentPipeId=(globalThis as any).__PRTBParentPipeServerId;
    delete (globalThis as any).__PRTBParentPipeServerId;
    (async ()=>{
        try{
            let conn=await PxprpcRtbIo.connect(parentPipeId)
            await conn!.send([new TextEncoder().encode((globalThis as any).__workerId)])
            globalThis.postMessage=function(msg:any){
                let bin=tjs.engine.serialize(msg);
                conn!.send([bin]);
            }
            afterPostMessageSetup();
            try{
                while(true){
                    let msg=await conn!.receive();
                    let data=tjs.engine.deserialize(msg)
                    globalThis.dispatchEvent(new MessageEvent('message',{data}));
                }
            }catch(err){
                conn=null;
            }
        }catch(err:any){
        }
    })()
}


