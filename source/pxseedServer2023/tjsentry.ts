import 'partic2/tjshelper/tjsenv'

import { HttpServer, SimpleFileServer, SimpleHttpServerRouter } from 'partic2/tjshelper/httpprot'
import { buildTjs } from 'partic2/tjshelper/tjsbuilder';
import { DirAsRootFS, TjsSfs } from 'partic2/CodeRunner/JsEnviron';
import { ArrayBufferConcat, Task } from 'partic2/jsutils1/base';
import { RpcExtendServer1 } from 'pxprpc/extend';
import { Io, Server as PxprpcBaseServer } from 'pxprpc/base'
import { getTypescriptModuleTjs } from 'partic2/packageManager/nodecompat';

import {inited as jseiorpcserverinited} from 'partic2/tjshelper/jseiorpcserver'
import { getWWWRoot,path } from 'partic2/jsutils1/webutils';

import {rpcWorkerInitModule} from 'partic2/pxprpcClient/registry'

export let inited=(async ()=>{

    await jseiorpcserverinited;

    rpcWorkerInitModule.push('partic2/tjshelper/jseiorpcserver');

    let pxseedBase='/pxseed'

    let http=new HttpServer();
    let router=new SimpleHttpServerRouter();
    http.onfetch=router.onfetch;
    http.onwebsocket=router.onwebsocket;
    let wwwroot=getWWWRoot().replace(/\\/g,'/');

    let tjs=await buildTjs();
    let tjsfs=new TjsSfs();
    tjsfs.from(tjs);
    await tjsfs.ensureInited();

    let fileServer=new SimpleFileServer(new DirAsRootFS(tjsfs,path.join(wwwroot)));
    fileServer.pathStartAt=(pxseedBase+'/www').length;
    router.setHandler(pxseedBase+'/www',{fetch:fileServer.onfetch});

    {
        //For sourcemap
        fileServer=new SimpleFileServer(new DirAsRootFS(tjsfs,path.join(wwwroot,'..','source')));
        fileServer.pathStartAt=(pxseedBase+'/source').length;
        router.setHandler(pxseedBase+'/source',{fetch:fileServer.onfetch});
    }

    router.setHandler(pxseedBase+'/pxprpc/0',{
        websocket:async (ctl)=>{
            let ws=await ctl.accept();
            let serv=new RpcExtendServer1(new PxprpcBaseServer(ws as any));
            serv.serve().catch((err)=>console.error(err));
        }
    });

    let ssoc=await tjs.listen('tcp','127.0.0.1',2081) as tjs.Listener;
    Task.fork(http.serveTjs(ssoc)).run();
    
    console.info('serving on 2081');
    let webuientry='partic2/packageManager/webui';
    console.info('entry url:'+`http://127.0.0.1:2081${pxseedBase}/www/index.html?__jsentry=pxseedServer2023%2fwebentry&__redirectjsentry=${encodeURIComponent(webuientry)}`)
    
})();


