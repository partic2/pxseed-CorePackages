
import { WebMessage } from "pxprpc/backend";
import { Server } from "pxprpc/base";
import { RpcExtendServer1, RpcExtendServerCallable, defaultFuncMap } from "pxprpc/extend";



//to import partic2/pxprpcClient/registry.loadModule
import './registry'

declare var __workerId:string;
WebMessage.bind(globalThis);


new WebMessage.Server((conn)=>{
    //mute error
    new RpcExtendServer1(new Server(conn)).serve().catch(()=>{});
}).listen(__workerId);
