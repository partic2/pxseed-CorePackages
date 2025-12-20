
import './tjsenv'

import type {} from 'partic2/tjshelper/txikijs'

import { requirejs } from 'partic2/jsutils1/base';
import { TjsReaderDataSource, TjsWriterDataSink } from './tjsutil';
import { SimpleCli } from 'partic2/CodeRunner/simplecli'


let __name__=requirejs.getLocalRequireModule(require)

async function cliMain(){
    let stdin=new ReadableStream<Uint8Array>(new TjsReaderDataSource(tjs.stdin)).getReader();
    let stdout=new WritableStream<Uint8Array>(new TjsWriterDataSink(tjs.stdout)).getWriter();
    let stderr=new WritableStream<Uint8Array>(new TjsWriterDataSink(tjs.stdout)).getWriter();
    let cli=new SimpleCli(stdin,stdout,stderr);
    await cli.initEnv()
    cli.codeContext.localScope.exit=(exitCode?:number)=>{
        cli.codeContext.close();
        tjs.exit(exitCode??0);
    }
    let args=[...tjs.args];
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
            for(let t1 of args.slice(1)){
                await cli.codeContext.runCode(t1);
            }
            await cli.codeContext.runCode('exit()');
        }else{
            cli.repl();
        }
    }

}


cliMain();