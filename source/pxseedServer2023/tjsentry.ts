import { assert, GetCurrentTime, requirejs, Task } from 'partic2/jsutils1/base';
import { RpcExtendClient1, RpcExtendServer1, TableSerializer } from 'pxprpc/extend';
import 'partic2/tjshelper/tjsenv'
import {PxprpcRtbIo} from 'partic2/tjshelper/tjsenv'
import { Client,Server as PxprpcBaseServer } from 'pxprpc/base';
import { getRpcFunctionOn, rpcWorkerInitModule } from 'partic2/pxprpcClient/registry';
import {inited as jseiorpcserverinited} from 'partic2/tjshelper/jseiorpcserver'
import { HttpServer, WebSocketServerConnection } from 'partic2/tjshelper/httpprot'
import { buildTjs } from 'partic2/tjshelper/tjsbuilder';
import { DirAsRootFS, TjsSfs } from 'partic2/CodeRunner/JsEnviron';
import { getWWWRoot, path } from 'partic2/jsutils1/webutils';
import {Invoker as rtbridgeInvoker} from 'partic2/pxprpcBinding/pxprpc_rtbridge'
import * as pxseedhttpserver from './pxseedhttpserver';
import { WebSocketIo } from 'pxprpc/backend';

let __name__=requirejs.getLocalRequireModule(require);

export let pxprpcRuntimeBridgeClient:RpcExtendClient1|null=null;

export async function getLoaderInfo(): Promise<{pxseedLoaderDataDir:string,processTag:string,hostFlags:string}> {
    let __v1 = await getRpcFunctionOn(pxprpcRuntimeBridgeClient!,'pxprpc_PxseedLoader.getLoaderInfo', '->b');
    let __v2 = await __v1!.call();
    return new TableSerializer().load(__v2).toMapArray()[0]
}


export let __inited__=(async ()=>{
    assert(globalThis.__pxprpc4tjs__!=undefined);
    let io1=await PxprpcRtbIo.connect('/pxprpc/runtime_bridge/0');
    assert(io1!=null);
    pxprpcRuntimeBridgeClient=await new RpcExtendClient1(new Client(io1)).init();

    await jseiorpcserverinited;

    rpcWorkerInitModule.push('partic2/tjshelper/jseiorpcserver');

    let pxseedBase='/pxseed'

    let http=new HttpServer();
    http.onfetch=pxseedhttpserver.defaultRouter.onfetch;
    http.onwebsocket=pxseedhttpserver.defaultRouter.onwebsocket;
    let wwwroot=getWWWRoot().replace(/\\/g,'/');

    let tjs=await buildTjs();

    await pxseedhttpserver.loadConfig();
    if(pxseedhttpserver.config.pxseedBase!=undefined){
        pxseedBase=pxseedhttpserver.config.pxseedBase
    }

    

    let rtbtunnel=async function(ws: WebSocketServerConnection){
        let rtbc:PxprpcRtbIo|null=null;
        try{
            let target=new TextDecoder().decode(await ws.receive() as Uint8Array);
            rtbc=await PxprpcRtbIo.connect(target);
            if(rtbc==null){
                ws.close();
            }else{
                await Promise.race([(async ()=>{
                    while(true){
                        ws.send(await rtbc!.receive());
                    }
                })(),(async ()=>{
                    while(true){
                        rtbc!.send([await ws.receive() as Uint8Array])
                    }
                })()])
            }
        }catch(err){
            console.error(err);
        }finally{
            ws.close()
            if(rtbc!=null){rtbc.close()}
        }
    }
    pxseedhttpserver.defaultRouter.setHandler(pxseedBase+'/pxprpc/runtime_bridge',{
        websocket:async (ctl)=>{
            let ws=await ctl.accept();
            rtbtunnel(ws);
        }
    })
    let ssoc:tjs.Listener|null=null;
    let port1=pxseedhttpserver.config.listenOn!.port;
    for(;port1<20000;port1+=2048){
        try{
            ssoc=await tjs.listen('tcp',pxseedhttpserver.config.listenOn!.host,port1) as tjs.Listener;
            break;
        }catch(err){}
    }
    if(ssoc==null){
        console.error('No available tcp port to bind');
        tjs.exit(0);
        return;
    }
    pxseedhttpserver.config.listenOn!.port=port1;
    
    Task.fork(http.serveTjs(ssoc!)).run();
    await tjs.makeDir(path.join(wwwroot,__name__,'..','state'),{recursive:true});
    let pxseedloaderStateFile=await tjs.open(path.join(wwwroot,__name__,'..','state','pxseedloader.json'),'w');
    try{
        await pxseedloaderStateFile.write(new TextEncoder().encode(JSON.stringify(pxseedhttpserver.config)))
    }catch(err:any){console.error(err.toString())}
    
    await pxseedhttpserver.setupHttpServerHandler()

    console.info('serving on :'+port1);
    let webuientry='partic2/packageManager/webui';
    let entryUrl=`http://127.0.0.1:${port1}${pxseedBase}/www/index.html?__jsentry=pxseedServer2023%2fwebentry&__redirectjsentry=${encodeURIComponent(webuientry)}&__pxprpcKey=${pxseedhttpserver.config.pxprpcKey}`;
    console.info('entry url:'+entryUrl)
    
})();