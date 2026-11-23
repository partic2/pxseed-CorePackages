//To initialize node environment. 
import {__inited__ as nodeenvinited} from 'partic2/nodehelper/env'

import { config, defaultRouter, loadConfig, pxseedRunStartupModules, rootConfig, saveConfig, serverCommand, serverCommandRegistry, setupHttpServerHandler } from './pxseedhttpserver';

export let __name__=requirejs.getLocalRequireModule(require);

import { ArrayBufferConcat, ArrayWrap2, future, Ref2, requirejs, sleep, Task } from 'partic2/jsutils1/base';
import {Duplex, EventEmitter, Readable} from 'stream'
import { IncomingHttpHeaders, IncomingMessage, OutgoingMessage, Server, ServerResponse } from 'http';
import {dirname,join as pathJoin} from 'path'
import { GetUrlQueryVariable2, getWWWRoot, lifecycle } from 'partic2/jsutils1/webutils';
import { ChildProcess, spawn } from 'child_process';
import { NodeReadableDataSource, NodeWritableDataSink } from 'partic2/nodehelper/nodeio';


export {config}

export let ensureInit=new future<number>();




export let httpServ=new Server();
//To keep compatibility with old Koa server, koa server can override it and deligate request to default handler.
export let httpOnRequest=new Ref2(async (nodereq:IncomingMessage,noderes: ServerResponse)=>{
    let url=new URL(nodereq.url!,`http://${nodereq.headers.host}`);
    let req=new Request(url,{
        method:nodereq.method,
        headers:Object.entries(nodereq.headers).map(t1=>{
            if(typeof t1[1]!=='string'){
                return [t1[0],(t1[1]??'').toString()] as [string,string]
            }else{
                return t1 as [string,string];
            }
        }),
        body:['GET','HEAD'].includes(nodereq.method??'')?undefined:new ReadableStream(new NodeReadableDataSource(nodereq)),
        duplex:'half'
    } as RequestInit);
    let resp=await defaultHttpHandler.onfetch(req);
    resp.headers.forEach((v,k)=>{
        noderes.setHeader(k,v);
    });
    noderes.statusCode=resp.status;
    if(resp.body!=null){
        Readable.fromWeb(resp.body as any).pipe(noderes,{end:true});
    }else{
        noderes.end();
    }
});

import { defaultHttpHandler } from './pxseedhttpserver';
import { WebSocketServerStreamHandler } from 'partic2/tjshelper/httpprot';
import { ExtendStreamReader, utf8conv } from 'partic2/CodeRunner/jsutils2';


let noderunJs=getWWWRoot()+'/noderun.js'
export function nodeRun(moduleName:string,args:string[]):ChildProcess{
    console.info(noderunJs,moduleName,...args)

    let subproc=spawn(process.execPath,[noderunJs,moduleName,...args],{
        stdio:'pipe'
    });
    subproc.stdout.on('data',function(data){
        console.info('[CHILD PROCESS OUTPUT]:\n',new TextDecoder().decode(data));
    });
    subproc.stderr.on('data',function(data){
        console.warn('[CHILD PROCESS ERROR]:',new TextDecoder().decode(data));
    });
    return subproc;
}

export async function createNewEntryUrlWithPxprpcKey(jsentry:string,urlarg?:string){
    let accessHost=config.listenOn!.host;
        if(accessHost=='0.0.0.0'){
            accessHost='127.0.0.1';
        }
    let launcherUrl=`http://${accessHost}:${config.listenOn!.port}${config.pxseedBase}/www/index.html?__jsentry=pxseedServer2023%2fwebentry&__redirectjsentry=${encodeURIComponent(jsentry)}`
    if(config.pxprpcKey!=null){
        launcherUrl+=`&__pxprpcKey=${encodeURIComponent(config.pxprpcKey)}`;
    }
    if(urlarg!=undefined){
        launcherUrl+='&'+urlarg;
    }
    return launcherUrl;
}

function doExit(){
    console.info('exiting...');
    lifecycle.dispatchEvent(new Event('pause'));
    lifecycle.dispatchEvent(new Event('exit'));
    setTimeout(()=>process.exit(),3000);
}
async function runCommand(cmd:string,cwd?:string){
    let process=spawn(cmd,{shell:true,stdio:'pipe',cwd});
    let stdoutbuffer:string[]=[];
    process.stdout.on('data',(chunk)=>{
        stdoutbuffer.push(chunk);
    });
    process.stderr.on('data',(chunk)=>{
        stdoutbuffer.push(chunk);
    });
    await new Promise((resolve=>{
        process.on('close',resolve);
    }));
    return stdoutbuffer.join('');
}

export async function startServer(){
    await loadConfig()
    httpServ.on('upgrade',async (nodereq,socket,head)=>{
        if(nodereq.headers['upgrade']?.toLowerCase()==='websocket'){
            let stream={
                r:new ExtendStreamReader(new ReadableStream(new NodeReadableDataSource(socket)).getReader()),
                w:new WritableStream(new NodeWritableDataSink(socket)).getWriter()
            }
            stream.r.unshiftBuffer(new Uint8Array(head.buffer,head.byteOffset,head.byteLength));
            let url=new URL(nodereq.url!,`http://${nodereq.headers.host}`);
            let req=new Request(url,{
                method:nodereq.method,
                headers:Object.entries(nodereq.headers).map(t1=>{
                    if(typeof t1[1]!=='string'){
                        return [t1[0],(t1[1]??'').toString()] as [string,string]
                    }else{
                        return t1 as [string,string];
                    }
                }),
            });
            async function simpleWriteResponse(resp:Response){
                let headersString=new Array<string>();
                resp.headers.forEach((val,key)=>{
                    headersString.push(`${key}: ${val}`);
                });
                await stream.w.write(utf8conv(
                    [
                        `HTTP/1.1 ${resp.status} ${resp.statusText}`,
                        ...headersString,
                        '\r\n'
                    ].join('\r\n'))
                );
            }
            let p={
                _ws:null as null|WebSocketServerStreamHandler,
                request:req,
                accept:async function(){
                    if(this._ws==null){
                        this._ws=new WebSocketServerStreamHandler(stream.r,stream.w);
                        let resp=await this._ws.switchToWebsocketResponse(req)
                        await simpleWriteResponse(resp);
                    }
                    return this._ws;
                }
            };
            await defaultHttpHandler.onwebsocket(p);
            if(p._ws==null){
                await simpleWriteResponse(new Response("Unsupported",{status:426}));
                socket.destroy();
            }else{
                await p._ws.closed.get();
            }
        }
    });
    httpServ.on('request',(req,res)=>{
        httpOnRequest.get()(req,res);
    });
    async function doListen(){
        let p=new future<any>();
        const cb=(err:any)=>{
            if(!p.done){
                httpServ.close(()=>p.setResult(err))
            }
        }
        httpServ.once('error',cb);
        httpServ.listen(config.listenOn!.port,config.listenOn!.host,8,()=>{
            httpServ.off('error',cb);
            p.setResult(null)
        });
        return p.get();
    }
    let listenSucc=false;
    let maxListenPort=config.listenOn!.port+4;
    for(;config.listenOn!.port<maxListenPort;config.listenOn!.port++){
        let t1=await doListen();
        if(t1==null){
            listenSucc=true;
            break;
        }
        if(t1.code!=='EADDRINUSE'){
            throw t1;
        }
    }
    if(!listenSucc)throw new Error('No available listen port.');
    
    console.log(JSON.stringify(config,undefined,2));
    
    ensureInit.setResult(0);
    
    console.info(`pxseed server entry url:`)
    let launcherUrl=await createNewEntryUrlWithPxprpcKey('partic2/packageManager/webui')
    console.info(launcherUrl);

    lifecycle.addEventListener('exit',()=>{
        console.info('close http server');
        httpServ.close((err)=>{
            console.info('http server closed');
        });
    });
    
    serverCommandRegistry.restartListener=async ()=>{
        httpServ.close();
        await sleep(300);
        httpServ=new Server();
        startServer();
    }
}

export let __inited__=(async ()=>{
    await nodeenvinited;
    await startServer();

    serverCommandRegistry.buildEnviron=async ()=>{
        return runCommand(`${process.execPath} ${pathJoin(getWWWRoot(),'..','script','buildEnviron.js')}`)
    }
    serverCommandRegistry.exit=async ()=>{
        return doExit();
    }
    await setupHttpServerHandler()

    pxseedRunStartupModules()
    ensureInit.setResult(0);

})();





