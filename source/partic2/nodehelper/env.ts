import { setupImpl as kvdbInit } from "./kvdb";
import { setupImpl as workerInit } from "./worker";
import {setup as jseioInit} from './jseio'


function setupImpl(){
    kvdbInit()
    workerInit()
    jseioInit()
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
                let os=await import('os');
                if(os.platform()==='win32'){
                    path=path.substring(1);
                }
                let fs=await import('fs/promises')
                jscode=new TextDecoder().decode(await fs.readFile(path));
            }
            new Function(jscode)();
        }) as any
    }
}

export let __inited__=(async ()=>{
    if(globalThis.process?.versions?.node==undefined){
        console.warn('This module is only used to initialize pxseed environment on Node.js,'+
            ' and has no effect on other platform.'+
            'Also avoid to import this module on other platform.')
    }else{
        setupImpl();
    }    
})()
