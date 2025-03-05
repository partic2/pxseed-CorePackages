
import './tjsenv'

import type {} from '@txikijs/types/src/index'

import {LocalRunCodeContext} from 'partic2/CodeRunner/CodeContext'
import { CodeContextRemoteObjectFetcher, fromSerializableObject, inspectCodeContextVariable, toSerializableObject } from 'partic2/CodeRunner/Inspector';
import { requirejs } from 'partic2/jsutils1/base';
import { GetPersistentConfig, SavePersistentConfig } from 'partic2/jsutils1/webutils';


let codeContext=new LocalRunCodeContext();
let remoteObjectFetcher=new CodeContextRemoteObjectFetcher(codeContext);
let remoteObjectFetchConfig={maxDepth:3,maxKeyCount:50,enumerateMode:'for in' as 'for in'}


async function executeJs(jscode:string){
    try{
        let result=await codeContext.runCode(jscode,'_');
        if(result.err!=null){
            await tjs.stderr.write(new TextEncoder().encode(JSON.stringify(result,undefined,2)));
        }else if(result.stringResult!=null){
            await tjs.stdout.write(new TextEncoder().encode(result.stringResult));
        }else{
            let remoteObj=await inspectCodeContextVariable(remoteObjectFetcher,['_'],remoteObjectFetchConfig);
            await tjs.stdout.write(new TextEncoder().encode(JSON.stringify(remoteObj,undefined,2)));
        }
    }catch(err:any){
        await tjs.stderr.write(new TextEncoder().encode(JSON.stringify({message:err.message,stack:err.stack},undefined,2)));
    }
    await tjs.stdout.write(new TextEncoder().encode('\n>'));
}

let __name__=requirejs.getLocalRequireModule(require)

async function cliMain(){
    let buf=new Uint8Array(4096);
    let offset=0;
    let loop=true;
    //tjs.stdin.setRawMode(true);
    codeContext.localScope.exit=function(code:number){
        loop=false;
        codeContext.close();
        tjs.exit(code);
    }
    tjs.stdout.write(new TextEncoder().encode('>'));
    while(loop){
        let count=await tjs.stdin.read(new Uint8Array(buf.buffer,offset,4096-offset));
        if(count==null){
            loop=false;
        }else{
            offset+=count;
        }
        if(buf.at(offset-1)=='\n'.charCodeAt(0)){
            let jscode=new TextDecoder().decode(new Uint8Array(buf.buffer,0,offset));
            offset=0;
            executeJs(jscode);
        }
    }
}


cliMain();