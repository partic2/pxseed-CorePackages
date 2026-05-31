import { defaultFileSystem, ensureDefaultFileSystem, installRequireProvider, SimpleFileSystem } from "partic2/CodeRunner/JsEnviron";
import { assert, future, GenerateRandomString, logger, requirejs, sleep, Task, throwIfAbortError } from "partic2/jsutils1/base";
import { ClientInfo, createIoPipe, easyCallRemoteJsonFunction, getConnectionFromUrl, getPersistentRegistered, importRemoteModule, RpcSerializeMagicMark, rpcWorkerInitModule, ServerHostRpcName } from "partic2/pxprpcClient/registry";
import { BaseCodeCellListData, CodeContextEvent, LocalRunCodeContext, newCodeCellListData, RunCodeContext, TaskLocalEnv } from "partic2/CodeRunner/CodeContext";
import { createConnectorWithNewRunCodeContext, RemoteRunCodeContext, RunCodeContextConnector } from "partic2/CodeRunner/RemoteCodeContext";
import { utf8conv } from "partic2/CodeRunner/jsutils2";
import { RpcExtendClient1, RpcExtendServer1 } from "pxprpc/extend";
import { Client, Server } from "pxprpc/base";
import type {} from 'partic2/tjshelper/txikijs'
import { defaultHttpClient, path } from "partic2/jsutils1/webutils";

export var __name__='partic2/JsNotebook/workerinit'

export let ensureInited=new future<string>();

export let __inited__=(async ()=>{
    if(typeof ((globalThis as any).importScripts)==='function' || globalThis.document!=undefined){
        await ensureDefaultFileSystem();
        await defaultFileSystem!.ensureInited();
        await installRequireProvider(defaultFileSystem!);
    }
    rpcWorkerInitModule.push(__name__);
})();

class LoopbackRpcClient extends ClientInfo{
    client:RpcExtendClient1|null=null;
    async ensureConnected():Promise<RpcExtendClient1>{
        if(!this.connected()){
            let [c2s,s2c]=createIoPipe();
            new RpcExtendServer1(new Server(s2c)).serve().catch(()=>{});
            this.client=await new RpcExtendClient1(new Client(c2s)).init();
        }
        return this.client!;
    }
}

export let __internal__={
    LoopbackRpcClient
}

export class NotebookFileData{
    cells:string|null=null;
    rpc?:string;
    startupScript:string='';
    dump(){
        return utf8conv(JSON.stringify({ver:1,rpc:this.rpc,startupScript:this.startupScript,cells:this.cells}));
    }
    load(data:Uint8Array){
        let r=JSON.parse(utf8conv(data));
        if(r.rpc!=undefined)this.rpc=r.rpc;
        this.startupScript=r.startupScript??'';
        this.cells=r.cells??newCodeCellListData.get()().saveTo();
    }
    getCellsData(){
        let cld=newCodeCellListData.get()();
        if(this.cells!=null){
            cld.loadFrom(this.cells);
        }
        return cld;
    }
    setCellsData(ccld:BaseCodeCellListData){
        this.cells=ccld.saveTo();
    }
}


export let runningRunCodeContextForNotebookFile=new Map<string,OpenedJsNotebookFile>();

//treat both slash and back slash as sep
function dirname2(path:string){
    for(let t1=path.length-1;t1>=0;t1--){
        let ch=path.charAt(t1);
        if('\\/'.includes(ch)){
            return path.substring(0,t1);
        }
    }
    return '';
}
export async function initNotebookCodeEnv(_ENV:any,opt?:{codePath?:string,startupScript?:string}){
    if(_ENV==undefined){
        _ENV=TaskLocalEnv.get();
    }
    await ensureDefaultFileSystem();
    let fs:any={
        simple: defaultFileSystem!,
        codePath: opt?.codePath,
        loadScript:async function(path:string){
            assert(this.simple!=undefined);
            if(path.startsWith('.')){
                assert(this.codePath!=undefined )
                path=dirname2(this.codePath)+path.substring(1);
            }
            let jsbin=await this.simple.readAll(path);
            if(jsbin==null){
                throw new Error('File not existed');
            }
            let js=new TextDecoder().decode(jsbin);
            let cc=_ENV.__priv_codeContext as LocalRunCodeContext;
            let savedCodePath=this.codePath;
            this.codePath=path;
            await cc.runCode(js,'');
            this.codePath=savedCodePath;
        },
        loadNotebook:async function(path:string){
            assert(this.simple!=undefined);
            if(path.startsWith('.')){
                assert(this.codePath!=undefined )
                path=dirname2(this.codePath)+path.substring(1);
            }
            let codeContext=await runNotebook(path,'all cells') as LocalRunCodeContext;
            return codeContext.localScope;
        }
    };
    _ENV.fs=fs;
    _ENV.import2env=async (moduleName:string)=>{
        let mod=await import(moduleName);
        for(let [k1,v1] of Object.entries(mod)){
            _ENV[k1]=v1;
        }
    }
    _ENV.globalThis=globalThis;
    _ENV.fetch=defaultHttpClient.fetch.bind(defaultHttpClient)
    _ENV.restartThisWorker=async ()=>{
        _ENV.jsnotebook?.notebookViewer?.reconnectCodeContextSoon?.();
        await sleep(100);
        globalThis.close();
    }
    let callMethodAttachedOnNotebookViewer=(name:string,argv?:any[])=>{
        _ENV.event.dispatchEvent(
            new CodeContextEvent(
                `${path.join(__name__,'../notebook')}.NotebookViewer`,
                {data:{call:name,argv:argv??[]}}
            )
        )
    };
    let jsnotebook={
        callMethodAttachedOnNotebookViewer,
        callFunctionInNotebookWebui:function(...argv:any){callMethodAttachedOnNotebookViewer('callFunctionInNotebookWebui',argv)},
        notebookViewer:{
            openRpcChooser:()=>callMethodAttachedOnNotebookViewer('openRpcChooser',[]),
            updateNotebookCodeCellsData:()=>callMethodAttachedOnNotebookViewer('updateNotebookCodeCellsData',[]),
            setCodeCellsDataOnRemoteJsNotebook:()=>callMethodAttachedOnNotebookViewer('setCodeCellsDataOnRemoteJsNotebook',[]),
            reconnectCodeContextSoon:()=>callMethodAttachedOnNotebookViewer('reconnectCodeContextSoon',[])
        },
        startupScript:opt?.startupScript??'',
    };
    _ENV.jsnotebook=jsnotebook;
    if(opt?.startupScript!=undefined){
        let cc=_ENV.__priv_codeContext as LocalRunCodeContext;
        await cc.runCode(opt.startupScript,'');
    }
}

let log=logger.getLogger(__name__);

export class OpenedJsNotebookFile{
    [RpcSerializeMagicMark]={};
    connector:RunCodeContextConnector|null=null;
    notebookFileData=new NotebookFileData();
    constructor(public notebookFilePath:string,public opt?:{noRpc?:boolean}){};
    async loadFromFile(){
        await ensureDefaultFileSystem();
        try{
            let data=await defaultFileSystem!.readAll(this.notebookFilePath);
            if(data!=undefined){
                this.notebookFileData.load(data);
            }
        }catch(err:any){throwIfAbortError(err)}
    }
    async saveToFile(){
        await ensureDefaultFileSystem();
        try{
            let c1=await this.ensureRunCodeContextConnector();
            let {startupScript}=JSON.parse((await c1.runCode(`
return JSON.stringify({startupScript:jsnotebook.startupScript})
`)).stringResult??'{}');
            if(startupScript!=undefined){
                this.notebookFileData.startupScript=startupScript;
            }
            await defaultFileSystem!.writeAll(this.notebookFilePath,this.notebookFileData.dump());
        }catch(err:any){throwIfAbortError(err)}
    }
    protected codeContextclosed=new future<void>();
    async ensureRunCodeContextConnector(){
        if(this.connector==null){
            if(this.opt?.noRpc===true){
                await this.useRpc(null);
            }else{
                await this.useRpc(this.notebookFileData.rpc??null);
            }
        }
        return this.connector!;
    }
    async useRpc(name:string|null){
        if(this.connector!=null){
            let c1=this.connector;
            this.connector=null;
            this.codeContextclosed=new future();
            c1.close?.();
        }
        this.notebookFileData.rpc=name??undefined;
        if(this.notebookFileData.rpc==undefined){
            this.connector=await createConnectorWithNewRunCodeContext();
        }else{
            let client=await getPersistentRegistered(this.notebookFileData.rpc);
            if(client==undefined){
                this.notebookFileData.rpc=undefined;
                this.connector=await createConnectorWithNewRunCodeContext();
            }else{
                this.connector=await easyCallRemoteJsonFunction(await client.ensureConnected(),
                    'partic2/CodeRunner/RemoteCodeContext','createConnectorWithNewRunCodeContext',[]);
            }
        }
        let codeContextClosed=this.codeContextclosed;
        this.connector!.runCode(`
        delete _ENV.tasks[Task.currentTask.name]
        Task.currentTask.name="${__name__}.waitCloseEvent";
        _ENV.tasks[Task.currentTask.name]=Task.currentTask;
        return new Promise((resolve)=>event.addEventListener('close',()=>resolve('close')))`,'').then((r)=>{
            codeContextClosed.setResult();
        }).catch((err)=>log.warning(err.stack));
        await this.connector!.runCode(`await (await import('partic2/JsNotebook/workerinit')).initNotebookCodeEnv(_ENV,${
            JSON.stringify({codePath:this.notebookFilePath,startupScript:this.notebookFileData.startupScript})
        });`,'');
    }
    async setRawCellsData(data:string){
        this.notebookFileData.cells=data;
    }
    async getRpcName(){
        return this.notebookFileData.rpc??null;
    }
    async getRawCellsData(){
        return this.notebookFileData.cells;
    }
    async waitClose(){
        for(let t1=0;t1<1000000&&!this.codeContextclosed.done;t1++){
            await this.codeContextclosed.get();
        }
    }
}

export async function openNotebookFile(notebookFilePath:string,opt?:{noRpc?:boolean}){
    await __inited__;
    if(!runningRunCodeContextForNotebookFile.has(notebookFilePath)){
        await ensureDefaultFileSystem();
        let onbf=new OpenedJsNotebookFile(notebookFilePath,{noRpc:opt?.noRpc});
        await onbf.loadFromFile();
        await onbf.ensureRunCodeContextConnector();
        runningRunCodeContextForNotebookFile.set(notebookFilePath,onbf);
        onbf.waitClose().then(()=>{
            runningRunCodeContextForNotebookFile.delete(notebookFilePath);
        });
    }
    return runningRunCodeContextForNotebookFile.get(notebookFilePath)!;
}

export async function runNotebook(notebookFilePath:string,cellsIndex:number[]|'all cells'){
    let notebook1=await openNotebookFile(notebookFilePath,{noRpc:true});
    let cld=notebook1.notebookFileData.getCellsData();
    let cc=await notebook1.ensureRunCodeContextConnector();
    if(cellsIndex==='all cells'){
        for(let t1 of cld.cellList){
            let {err}=await cc.runCode(t1.cellInput,'');
        }
    }else{
        for(let t1 of cellsIndex){
            let cellInput=cld.cellList.at(t1)?.cellInput;
            if(cellInput!=undefined){
                let {err}=await cc.runCode(cellInput);
            }
        }
    }
    return cc.value;
}