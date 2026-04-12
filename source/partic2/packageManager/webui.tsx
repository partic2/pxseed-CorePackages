import { BuildUrlFromJsEntryModule, GetJsEntry,  GetPersistentConfig } from "partic2/jsutils1/webutils";
import { requirejs } from "partic2/jsutils1/base";
import { easyCallRemoteJsonFunction, getPersistentRegistered, ServerHostWorker1RpcName } from "partic2/pxprpcClient/registry";
import { RemotePxseedJsIoServer } from "partic2/pxprpcClient/bus";
import { rpcId } from "partic2/pxprpcClient/rpcworker";
import { RpcExtendServer1 } from "pxprpc/extend";
import { Server } from "pxprpc/base";


const __name__=requirejs.getLocalRequireModule(require);

export let packageManagerWebuiEntry={
    module:'partic2/packageManager/webui2',func:'main'
}

let config:{onWebuiStartup?:Array<{module:string,func:string}>}={};

;(async ()=>{
    if(GetJsEntry()==__name__){
        config=await GetPersistentConfig(__name__);
        if(config.onWebuiStartup!=undefined){
            await Promise.allSettled(config.onWebuiStartup.map(t1=>import(t1.module).then((mod)=>mod[t1.func]()).catch((err)=>{console.warn(err)})))
        }
        try{
            let shw1=await getPersistentRegistered(ServerHostWorker1RpcName);
            RemotePxseedJsIoServer.serve(`/pxprpc/pxseed_webui/${__name__.replace(/\//g,'.')}/${rpcId.get()}`,{
                        onConnect:(io)=>new RpcExtendServer1(new Server(io))
                    }).catch((err:any)=>console.warn(err.message,err.stack));
            if(shw1!=null){
                let rpc1=await shw1.ensureConnected();
                let startups=await easyCallRemoteJsonFunction(rpc1,'partic2/packageManager/registry','getPackageListeners',['onWebuiStartup']) as Array<{module:string,func:string}>;
                await Promise.allSettled((startups.map(t1=>import(t1.module).then(t2=>t2[t1.func]()).catch((err)=>{console.warn(err)}))));
            }
        }catch(err){}
        import(packageManagerWebuiEntry.module).then((mod)=>mod[packageManagerWebuiEntry.func]('webui')).catch(()=>{});
    }
})()


export function navigateWindowToThisWebui(urlarg?:string){
    window.open(BuildUrlFromJsEntryModule(__name__,urlarg),'_self')
}