import { LocalWindowSFS, installRequireProvider } from "partic2/CodeRunner/JsEnviron";

export var __name__='partic2/JsNotebook/workerinit'

;(async ()=>{
    if(typeof ((globalThis as any).importScripts)==='function'){
        let defaultFs=new LocalWindowSFS();
        await defaultFs.ensureInited()
        await installRequireProvider(defaultFs);
    }
})()