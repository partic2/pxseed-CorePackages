import { LocalWindowSFS, installRequireProvider } from "partic2/CodeRunner/JsEnviron";
import { future } from "partic2/jsutils1/base";

export var __name__='partic2/JsNotebook/workerinit'

export let ensureInited=new future<string>();

;(async ()=>{
    try{
        if(typeof ((globalThis as any).importScripts)==='function'){
            let defaultFs=new LocalWindowSFS();
            await defaultFs.ensureInited()
            await installRequireProvider(defaultFs);
        }
        ensureInited.setResult('done');
    }catch(e:any){
        ensureInited.setException(e);
    }
})();
