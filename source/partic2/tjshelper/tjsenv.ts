//import this module to Initialize pxseed environment on txiki.js platform.

import { ArrayBufferConcat, DateDiff, future, GetCurrentTime, requirejs} from 'partic2/jsutils1/base';
import type {} from 'partic2/tjshelper/txikijs'
import { Io } from 'pxprpc/base';

var __name__=requirejs.getLocalRequireModule(require);

import { GenerateRandomString } from 'partic2/jsutils1/base';

import {BasicMessagePort, getWWWRoot, IKeyValueDb, IWorkerThread, lifecycle, path, setKvStoreBackend, setWorkerThreadImplementation} from 'partic2/jsutils1/webutils'
import {__name__ as webutilsName} from 'partic2/jsutils1/webutils'

import {setupImpl as kvdbInit} from 'partic2/nodehelper/kvdb'

//txiki.js has bugly eventTarget, patch it before upstream fix it.
Object.defineProperty(Event.prototype,'target',{get:function(){return this.currentTarget}})


let workerEntryUrl=function(){
    try{
        return getWWWRoot()+'/txikirun.js'
    }catch(e){};
    return '';
}()
const WorkerThreadMessageMark='__messageMark_WorkerThread'


class WebWorkerThread implements IWorkerThread{
    port?:BasicMessagePort
    workerId='';
    waitReady=new future<number>();
    tjsWorker?:Worker
    onExit?:()=>void;
    constructor(workerId?:string){
        this.workerId=workerId??GenerateRandomString();
    };
    exitListener=()=>{
        this.runScript(`require(['${webutilsName}'],function(webutils){
            webutils.lifecycle.dispatchEvent(new Event('exit'));
        })`);
    };
    async start(){
        this.tjsWorker=new Worker(workerEntryUrl);
        this.port=this.tjsWorker;
        this.port!.addEventListener('message',(msg:MessageEvent)=>{
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
                    case 'closing':
                        lifecycle.removeEventListener('exit',this.exitListener);
                        this.onExit?.();
                        break;
                    case 'tjs-close':
                        this.tjsWorker?.terminate();
                        break;
                }
            }
        });
        await this.waitReady.get();
        await this.runScript(`this.__workerId='${this.workerId}'`);
        lifecycle.addEventListener('exit',this.exitListener);
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

export function setupImpl(){
    kvdbInit();
    setWorkerThreadImplementation(WebWorkerThread)
    if(globalThis.open==undefined){
        globalThis.open=(async (url:string,target?:string)=>{
            let jscode:string='';
            if(url.startsWith('http://') || url.startsWith('https://')){
                let resp=await fetch(url);
                if(resp.ok){
                    jscode=await resp.text();
                }else{
                    throw new Error(await resp.text())
                }
            }else if(url.startsWith('file://')){
                let path=url.substring(7);
                if(tjs.system.platform=='windows'){
                    path=path.substring(1);
                }
                jscode=new TextDecoder().decode(await tjs.readFile(path));
            }
            new Function(jscode)();
        }) as any
    }
}

declare global {
    var __pxprpc4tjs__:{
        pipeConnect(pipeServer:string):BigInt;
        ioSend(pipe:BigInt,buf:ArrayBuffer):string|undefined;
        ioReceive(pipe:BigInt,cb:(result:ArrayBuffer|string)=>void):void;
        ioClose(pipe:BigInt):void;
        accessMemory(base:BigInt,len:number):SharedArrayBuffer;
    }
}

export class PxprpcRtbIo implements Io{
    static async connect(pipeServer:string):Promise<PxprpcRtbIo|null>{
        let conn=__pxprpc4tjs__.pipeConnect(pipeServer);
        if(conn===0n){
            return null;
        }else{
            return new PxprpcRtbIo(conn);
        }
    }
    constructor(public pipeAddr:BigInt){};
    receive(): Promise<Uint8Array> {
        if(this.pipeAddr===0n)throw new Error('Not connected');
        return new Promise((resolve,reject)=>{
            __pxprpc4tjs__.ioReceive(this.pipeAddr,(buf)=>{
                if(typeof buf==='string'){
                    reject(new Error(buf));
                }else{
                    resolve(new Uint8Array(buf));
                }
            })
        })
    }
    async send(data: Uint8Array[]): Promise<void> {
        let res
        if(this.pipeAddr===0n)throw new Error('Not connected');
        if(data.length==1 && data[0].byteOffset==0 && data[0].length==data[0].buffer.byteLength){
            res=__pxprpc4tjs__.ioSend(this.pipeAddr,data[0].buffer);
        }else{
            res=__pxprpc4tjs__.ioSend(this.pipeAddr,ArrayBufferConcat(data));
        }
        if(res!=undefined){
            throw new Error(res);
        }
    }
    close(): void {
        if(this.pipeAddr!==0n){
            __pxprpc4tjs__.ioClose(this.pipeAddr);
            this.pipeAddr=0n;
        }
    }
}


if(globalThis.tjs==undefined){
    console.warn('This module is only used to initialize pxseed environment on txiki.js,'+
        ' and has no effect on other platform.'+
        'Also avoid to import this module on other platform.')
}else{
    setupImpl();
}

