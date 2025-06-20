//import this module to Initialize pxseed environment on txiki.js platform.

import { ArrayBufferConcat, DateDiff, future, GetCurrentTime, requirejs} from 'partic2/jsutils1/base';
import type {} from '@txikijs/types/src/index'
import { Io } from 'pxprpc/base';

var __name__=requirejs.getLocalRequireModule(require);

import { GenerateRandomString } from 'partic2/jsutils1/base';

import {BasicMessagePort, getWWWRoot, IKeyValueDb, IWorkerThread, lifecycle, path, setKvStoreBackend, setWorkerThreadImplementation} from 'partic2/jsutils1/webutils'


import {toSerializableObject,fromSerializableObject} from 'partic2/CodeRunner/Inspector'

//txiki.js has bugly eventTarget, patch it before upstream fix it.
Object.defineProperty(Event.prototype,'target',{get:function(){return this.currentTarget}})

async function writeFile(path:string,data:Uint8Array){
    let fh=await tjs.open(path,'w');
    try{
        await fh.write(data)
    }finally{
        fh.close();
    }
}

export class FsBasedKvDbV1 implements IKeyValueDb{
    baseDir:string=''
    config?:{
        fileList:{[key:string]:{fileName:string,type:'json'|'ArrayBuffer'|'Uint8Array'|'Int8Array'}},
    }
    
    async init(baseDir:string){
        this.baseDir=baseDir;
        try{
            let data=await tjs.readFile(baseDir+'/config.json');
            this.config={fileList:{},...JSON.parse(new TextDecoder().decode(data))}
        }catch(e){
            this.config={fileList:{}};
            await writeFile(baseDir+'/config.json',new TextEncoder().encode('{}'));
        }
    }
    async setItem(key: string, val: any): Promise<void> {
        if(!(key in this.config!.fileList)){
            this.config!.fileList[key]={fileName:GenerateRandomString(),type:'json'}
        }
        let {fileName}=this.config!.fileList[key];

        if(val instanceof ArrayBuffer){
            this.config!.fileList[key].type='ArrayBuffer';
            await writeFile(`${this.baseDir}/${fileName}`,new Uint8Array(val));
        }else if(val instanceof Uint8Array){
            this.config!.fileList[key].type='Uint8Array';
            await writeFile(`${this.baseDir}/${fileName}`,val);
        }else if(val instanceof Int8Array){
            this.config!.fileList[key].type='Int8Array';
            await writeFile(`${this.baseDir}/${fileName}`,new Uint8Array(val.buffer,val.byteOffset,val.length)); 
        }else{
            let data=JSON.stringify(toSerializableObject(val,{maxDepth:0x7fffffff,enumerateMode:'for in',maxKeyCount:0x7fffffff}));
            await writeFile(`${this.baseDir}/${fileName}`,new TextEncoder().encode(data));
        }
        await writeFile(this.baseDir+'/config.json',new TextEncoder().encode(JSON.stringify(this.config)))
    }
    async getItem(key: string): Promise<any> {
        if(!(key in this.config!.fileList)){
            return undefined;
        }
        let {fileName,type}=this.config!.fileList[key];
        try{
            if(type==='ArrayBuffer'){
                return (await tjs.readFile(`${this.baseDir}/${fileName}`)).buffer;
            }else if(type==='Uint8Array'){
                return new Uint8Array((await tjs.readFile(`${this.baseDir}/${fileName}`)).buffer);
            }else if(type==='Int8Array'){
                return new Int8Array((await tjs.readFile(`${this.baseDir}/${fileName}`)).buffer);
            }else if(type==='json'){
                let data=await tjs.readFile(`${this.baseDir}/${fileName}`)
                let r=fromSerializableObject(JSON.parse(new TextDecoder().decode(data)),{});
                return r;
            }
        }catch(e){
            delete this.config!.fileList[key]
            return undefined
        }
    }
    getAllKeys(onKey: (key: string | null) => { stop?: boolean | undefined }, onErr?: ((err: Error) => void) | undefined): void {
        for(let file in this.config!.fileList){
            let next=onKey(file);
            if(next.stop===true){
                break;
            }
        }
        onKey(null);
    }
    async delete(key: string): Promise<void> {
        let {fileName}=this.config!.fileList[key];
        await tjs.remove(this.baseDir+'/'+fileName);
        delete this.config!.fileList[key]
        await writeFile(this.baseDir+'/config.json',new TextEncoder().encode(JSON.stringify(this.config)))
    }
    async close(): Promise<void> {
        await writeFile(this.baseDir+'/config.json',new TextEncoder().encode(JSON.stringify(this.config)))
    }
}

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
    constructor(workerId?:string){
        this.workerId=workerId??GenerateRandomString();
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
                }
            }
        });
        await this.waitReady.get();
        await this.runScript(`this.__workerId='${this.workerId}'`);
        lifecycle.addEventListener('pause',()=>{
            this.runScript(`require(['${__name__}'],function(webutils){
                webutils.lifecycle.dispatchEvent(new Event('pause'));
            })`);
        });
        lifecycle.addEventListener('resume',()=>{
            this.runScript(`require(['${__name__}'],function(webutils){
                webutils.lifecycle.dispatchEvent(new Event('resume'));
            })`);
        });
        lifecycle.addEventListener('exit',()=>{
            this.runScript(`require(['${__name__}'],function(webutils){
                webutils.lifecycle.dispatchEvent(new Event('exit'));
            })`);
        });
        
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



let cachePath=path.join(getWWWRoot(),__name__,'..');

export function setupImpl(){
    setKvStoreBackend(async (dbname)=>{
        await tjs.makeDir(path.join(cachePath,'data'),{recursive:true});
        let dbMap:Record<string,string>={};
        let filename:string=GenerateRandomString();
        try{
            dbMap=JSON.parse(new TextDecoder().decode(await tjs.readFile(path.join(cachePath,'data','meta-dbMap'))));
        }catch(e){};
        if(dbname in dbMap){
            filename=dbMap[dbname];
        }else{
            dbMap[dbname]=filename;
        }
        await writeFile(path.join(cachePath,'data','meta-dbMap'),new TextEncoder().encode(JSON.stringify(dbMap)));
        let db=new FsBasedKvDbV1();
        await tjs.makeDir(path.join(cachePath,'data',filename),{recursive:true});
        await db.init(path.join(cachePath,'data',filename));
        return db;
    });
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
            if(target=='_self'){
                new Function(jscode)();
            }else{
                if(target=='_blank' || target==undefined){
                    target=GenerateRandomString();
                }
                let worker=new RpcWorker(target)
                let workerClient=await worker.ensureClient();
                let workerFuncs=await getAttachedRemoteRigstryFunction(workerClient);
                await workerFuncs.jsExec(`new Function(${JSON.stringify(jscode)})();`,null);
            }
        }) as any
    }
    if(!rpcWorkerInitModule.includes(__name__)){
        rpcWorkerInitModule.push(__name__);
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
        if(conn==BigInt(0)){
            return null;
        }else{
            return new PxprpcRtbIo(conn);
        }
    }
    constructor(public pipeAddr:BigInt){};
    receive(): Promise<Uint8Array> {
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
        __pxprpc4tjs__.ioClose(this.pipeAddr);
    }
}

import {getAttachedRemoteRigstryFunction, RpcWorker, rpcWorkerInitModule} from 'partic2/pxprpcClient/registry'

if(globalThis.tjs==undefined){
    console.warn('This module is only used to initialize pxseed environment on txiki.js,'+
        ' and has no effect on other platform.'+
        'Also avoid to import this module on other platform.')
}else{
    setupImpl();
}

