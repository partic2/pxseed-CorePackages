import 'partic2/nodehelper/env'
import './pxseedhttpserver'

import type {} from 'partic2/tjshelper/txikijs'

import { requirejs } from 'partic2/jsutils1/base';
import { SimpleCli } from 'partic2/CodeRunner/simplecli'

import {NodeReadableDataSource,NodeWritableDataSink} from 'partic2/nodehelper/nodeio'


let __name__=requirejs.getLocalRequireModule(require)

let cliOption={
    autoExitAfterAllCodeSettled:false
}

export async function setCliOption(opt:Partial<typeof cliOption>){
    for(let [k1,v1] of Object.entries(opt)){
        if(v1!=undefined){
            (cliOption as any)[k1]=v1;
        }
    }
}

async function cliMain(){
    let stdin=new ReadableStream<Uint8Array>(new NodeReadableDataSource(process.stdin)).getReader();
    let stdout=new WritableStream<Uint8Array>(new NodeWritableDataSink(process.stdout)).getWriter();
    let stderr=new WritableStream<Uint8Array>(new NodeWritableDataSink(process.stdout)).getWriter();
    let cli=new SimpleCli(stdin,stdout,stderr);
    await cli.initEnv()
    cli.codeContext.localScope.exit=(exitCode?:number)=>{
        cli.codeContext.close();
        process.exit(exitCode??0);
    }
    cli.codeContext.localScope.startServer=async ()=>{
        await import('./nodeentry');
        setCliOption({autoExitAfterAllCodeSettled:false})
    }
    cli.codeContext.localScope.buildAndStartServer=async ()=>{
        let {processDirectory}=await import('pxseedBuildScript/buildlib');
        let loader1=await import('pxseedBuildScript/loaders')
        await loader1.inited;
        await processDirectory(loader1.sourceDir);
        await import('./nodeentry')
        setCliOption({autoExitAfterAllCodeSettled:false})
    }
    let args=[...process.argv];
    let found=false;
    for(let t1=1;t1<args.length;t1++){
        if(args[t1]===__name__){
            args=args.slice(t1);
            found=true;
            break;
        }
    }
    if(found){
        if(args.length>1){
            setCliOption({autoExitAfterAllCodeSettled:true})
            for(let t1 of args.slice(1)){
                await cli.codeContext.runCode(t1);
            }
            if(cliOption.autoExitAfterAllCodeSettled){
                await cli.codeContext.runCode('exit()');
            }else{
                cli.repl();
            }
        }else{
            cli.repl();
        }
    }

}


cliMain();