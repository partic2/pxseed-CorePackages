import { LocalWindowSFS, defaultFileSystem, ensureDefaultFileSystem, initNotebookCodeEnv, installRequireProvider } from "partic2/CodeRunner/JsEnviron";
import { future } from "partic2/jsutils1/base";
import { rpcWorkerInitModule } from "partic2/pxprpcClient/registry";
import { LocalRunCodeContext, RunCodeContext } from "partic2/CodeRunner/CodeContext";
import { createConnectorWithNewRunCodeContext } from "partic2/CodeRunner/RemoteCodeContext";

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

export let runningRunCodeContextForNotebookFile=new Map<string,RunCodeContext>();

export async function createRunCodeContextConnectorForNotebookFile(notebookFilePath:string){
    await __inited__;
    if(!runningRunCodeContextForNotebookFile.has(notebookFilePath)){
        let connector=await createConnectorWithNewRunCodeContext();
        runningRunCodeContextForNotebookFile.set(notebookFilePath,connector.value);
        connector.value.event.addEventListener('close',()=>{
            runningRunCodeContextForNotebookFile.delete(notebookFilePath)
        });
        if(connector.value instanceof LocalRunCodeContext){
            await initNotebookCodeEnv(connector.value.localScope,{codePath:notebookFilePath});
        }
    }
    return {value:runningRunCodeContextForNotebookFile.get(notebookFilePath)!};
}