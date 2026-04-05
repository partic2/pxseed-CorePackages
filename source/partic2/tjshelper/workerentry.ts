


import { PxprpcRtbIo,__inited__ } from './tjsenv'



declare var define:any
declare var require:any

declare var __pxseedInit:any

const WorkerThreadMessageMark='__messageMark_WorkerThread';

async function afterPostMessageSetup(){
    if(!('close' in globalThis)){
        globalThis.close=()=>{throw new Error('Not implemented')};
    }
    await __inited__;
    await import('partic2/jsutils1/workerentry');
}


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
}else if(globalThis.postMessage!=undefined){
    afterPostMessageSetup();
}


