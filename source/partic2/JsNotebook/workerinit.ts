import { defaultFileSystem, ensureDefaultFileSystem, installRequireProvider, SimpleFileSystem } from "partic2/CodeRunner/JsEnviron";
import { assert, future, GenerateRandomString, requirejs, Task } from "partic2/jsutils1/base";
import { ClientInfo, createIoPipe, getPersistentRegistered, rpcWorkerInitModule } from "partic2/pxprpcClient/registry";
import { LocalRunCodeContext, RunCodeContext } from "partic2/CodeRunner/CodeContext";
import { createConnectorWithNewRunCodeContext, RunCodeContextConnector } from "partic2/CodeRunner/RemoteCodeContext";
import { utf8conv } from "partic2/CodeRunner/jsutils2";
import { RpcExtendClient1, RpcExtendServer1 } from "pxprpc/extend";
import { Client, Server } from "pxprpc/base";
import { CodeCellListData, CodeCompletionContext } from "partic2/CodeRunner/Inspector";
import type {} from 'partic2/tjshelper/txikijs'
import { TjsUtilsProcess } from "./tjseasyapi";

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
    rpc:string|ClientInfo='local window';
    startupScript:string='';
    dump(){
        let rpcString='local window';
        if(this.rpc instanceof ClientInfo){
            rpcString=this.rpc.name;
        }else{
            rpcString=this.rpc;
        }
        return utf8conv(JSON.stringify({ver:1,rpc:rpcString,startupScript:this.startupScript,cells:this.cells}));
    }
    load(data:Uint8Array){
        let r=JSON.parse(utf8conv(data));
        if(r.rpc!=undefined)this.rpc=r.rpc;
        this.startupScript=r.startupScript??'';
        this.cells=r.cells??new CodeCellListData().saveTo();
    }
    getCellsData(){
        let cld=new CodeCellListData();
        if(this.cells!=null){
            cld.loadFrom(this.cells);
        }
        return cld;
    }
    setCellsData(ccld:CodeCellListData){
        this.cells=ccld.saveTo();
    }
    async getRpcClient(){
        if(this.rpc instanceof ClientInfo){
            return this.rpc;
        }else if(this.rpc=='local window'){
            return new LoopbackRpcClient('local window','loopback:local window')
        }else{
            return getPersistentRegistered(this.rpc);
        }
    }
}


export let runningRunCodeContextForNotebookFile=new Map<string,RunCodeContext>();

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
//Used in workerinit.createRunCodeContextConnectorForNotebookFile
export async function initNotebookCodeEnv(_ENV:any,opt?:{codePath?:string}){
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
            await cc.runCode(js);
            this.codePath=savedCodePath;
        }
    };
    _ENV.fs=fs;
    _ENV.import2env=async (moduleName:string)=>{
        let mod=await import(moduleName);
        for(let [k1,v1] of Object.entries(mod)){
            _ENV[k1]=v1;
        }
    }
    let {CustomFunctionParameterCompletionSymbol,importNameCompletion,makeFunctionCompletionWithFilePathArg0}=(await import('partic2/CodeRunner/Inspector'));
    _ENV.import2env[CustomFunctionParameterCompletionSymbol]=async (context:CodeCompletionContext)=>{
        let param=context.code.substring(context.funcParamStart!,context.caret);
        let importName2=param.match(/\(\s*(['"])([^'"]+)$/);
        if(importName2!=null){
            let replaceRange:[number,number]=[context.funcParamStart!+param.lastIndexOf(importName2[1])+1,0];
            replaceRange[1]=replaceRange[0]+importName2[2].length;
            let importName=importName2[2];
            let t1=await importNameCompletion(importName);
            context.completionItems.push(...t1.map(v=>({type:'literal',candidate:v,replaceRange})))
        }
    }
    let {path}=await import('partic2/jsutils1/webutils');
    _ENV.fs.loadScript[CustomFunctionParameterCompletionSymbol]=makeFunctionCompletionWithFilePathArg0(path.dirname(_ENV.fs.codePath??''));
    if(_ENV.fs.simple!=undefined){
        _ENV.fs.simple.readAll[CustomFunctionParameterCompletionSymbol]=makeFunctionCompletionWithFilePathArg0(undefined);
        _ENV.fs.simple.writeAll[CustomFunctionParameterCompletionSymbol]=makeFunctionCompletionWithFilePathArg0(undefined);
        _ENV.fs.simple.listdir[CustomFunctionParameterCompletionSymbol]=makeFunctionCompletionWithFilePathArg0(undefined);
        _ENV.fs.simple.filetype[CustomFunctionParameterCompletionSymbol]=makeFunctionCompletionWithFilePathArg0(undefined);
        _ENV.fs.simple.delete2[CustomFunctionParameterCompletionSymbol]=makeFunctionCompletionWithFilePathArg0(undefined);
    }
    _ENV.globalThis=globalThis;
}


export async function createRunCodeContextConnectorForNotebookFile(notebookFilePath:string){
    await __inited__;
    
    if(!runningRunCodeContextForNotebookFile.has(notebookFilePath)){
        let connector=await createConnectorWithNewRunCodeContext();
        if(connector.value instanceof LocalRunCodeContext){
            await initNotebookCodeEnv(connector.value.localScope,{codePath:notebookFilePath});
        }
        await ensureDefaultFileSystem();
        let nbd=new NotebookFileData();
        let fileData=await defaultFileSystem!.readAll(notebookFilePath);
        if(fileData!=null && fileData.length>0){
            try{nbd.load(fileData);}catch(err){};
        }
        runningRunCodeContextForNotebookFile.set(notebookFilePath,connector.value);
        connector.value.event.addEventListener('close',()=>{
            runningRunCodeContextForNotebookFile.delete(notebookFilePath)
        });
        if(nbd.startupScript!==''){
            await connector.value.runCode(nbd.startupScript);
        }
    }
    return new RunCodeContextConnector(runningRunCodeContextForNotebookFile.get(notebookFilePath)!);
}

export async function runNotebook(notebookFilePath:string,cellsIndex:number[]|'all cells'){
    let cc=await createRunCodeContextConnectorForNotebookFile(notebookFilePath);
    await ensureDefaultFileSystem();
    let nbd=new NotebookFileData();
    let fileData=await defaultFileSystem!.readAll(notebookFilePath);
    if(fileData!=null){
        nbd.load(fileData);
    }
    let cld=nbd.getCellsData();
    if(cellsIndex==='all cells'){
        for(let t1 of cld.cellList){
            await cc.value.runCode(t1.cellInput);
        }
    }else{
        for(let t1 of cellsIndex){
            let cellInput=cld.cellList.at(t1)?.cellInput;
            if(cellInput!=undefined){
                await cc.value.runCode(cellInput)
            }
        }
    }
    return cc.value;
}