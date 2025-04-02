



import './workerInit'
import {LocalRunCodeContext} from 'partic2/CodeRunner/CodeContext'
import { CodeContextRemoteObjectFetcher, fromSerializableObject, inspectCodeContextVariable, toSerializableObject } from 'partic2/CodeRunner/Inspector';
import { requirejs } from 'partic2/jsutils1/base';


let codeContext=new LocalRunCodeContext();
let remoteObjectFetcher=new CodeContextRemoteObjectFetcher(codeContext);
let remoteObjectFetchConfig={maxDepth:3,maxKeyCount:50,enumerateMode:'for in' as 'for in'}



async function executeJs(jscode:string){
    try{
        let result=await codeContext.runCode(jscode,'_');
        if(result.err!=null){
            process.stderr.write(new TextEncoder().encode(JSON.stringify(result,undefined,2)));
        }else if(result.stringResult!=null){
            process.stdout.write(new TextEncoder().encode(result.stringResult));
        }else{
            let remoteObj=await inspectCodeContextVariable(remoteObjectFetcher,['_'],remoteObjectFetchConfig);
            process.stdout.write(new TextEncoder().encode(JSON.stringify(remoteObj,undefined,2)));
        }
    }catch(err:any){
        process.stderr.write(new TextEncoder().encode(JSON.stringify({message:err.message,stack:err.stack},undefined,2)));
    }
    process.stdout.write(new TextEncoder().encode('\n>'));
}

let __name__=requirejs.getLocalRequireModule(require);

async function cliMain(){
    //(await import('inspector')).open(9229,'127.0.0.1');
    codeContext.localScope.exit=function(code:number){
        codeContext.close();
        process.exit(code);
    }
    process.stdout.write(new TextEncoder().encode('>'))
    process.stdin.on('data',(buf)=>{
        let jscode=new TextDecoder().decode(buf);
        executeJs(jscode);
    })
}

cliMain();