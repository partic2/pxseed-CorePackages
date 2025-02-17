import { GenerateRandomString, GetCurrentTime, Task, requirejs } from "partic2/jsutils1/base";
import { BuildUrlFromJsEntryModule, GetJsEntry, GetUrlQueryVariable, GetUrlQueryVariable2 } from "partic2/jsutils1/webutils";
import { ServerHostRpcName, addClient, getPersistentRegistered, getRegistered, persistent } from "partic2/pxprpcClient/registry";
import { WebSocketIo } from "pxprpc/backend";
import { Io, Serializer } from "pxprpc/base";


export const __name__=requirejs.getLocalRequireModule(require);

export async function getPxseedUrl(){
    let pxseedBaseUrl=requirejs.getConfig().baseUrl as string;
    if(pxseedBaseUrl.endsWith('/'))pxseedBaseUrl=pxseedBaseUrl.substring(0,pxseedBaseUrl.length-1);
    let slashAt=pxseedBaseUrl.lastIndexOf('/');
    let pxseedBase=slashAt>=0?pxseedBaseUrl.substring(0,slashAt):'';
    let pxprpcUrl=(pxseedBase+'/pxprpc/0').replace(/^http/,'ws');
    let wsPipeUrl=(pxseedBase+'/ws/pipe').replace(/^http/,'ws');
    return {pxseedBaseUrl,pxprpcUrl,wsPipeUrl};
}

//To be standardized BEGIN
export async function wsPipeConnectDirectly(id:string):Promise<Io>{
    let {wsPipeUrl}=await getPxseedUrl();
    return new WebSocketIo().connect(wsPipeUrl+`?id=${id}`);
}
export async function wsPipeConnectPxprpc(id:string):Promise<Io>{
    let { PxseedServer2023Function } =await import("./clientFunction")
    let fn=new PxseedServer2023Function();
    await fn.init(await (await getPersistentRegistered(ServerHostRpcName))!.ensureConnected())
    let pipe2=await fn.connectWsPipe(id);
    return pipe2;
}

export let wsPipeApi={
    connect:wsPipeConnectDirectly
};

export function wsPipeServe(serverName:string,onConnection:(io:Io)=>Generator<Promise<any>,void,any>):Task<void>{
    return Task.fork(function*(){
        let servIo:Io=yield* Task.yieldWrap(wsPipeApi.connect('/server/'+serverName));
        let ser=new Serializer().prepareSerializing(16);
        let serveTime=GetCurrentTime().getTime();
        let serveAnnounce=ser.putString('serve').putLong(BigInt(serveTime)).build();
        servIo.send([serveAnnounce]);
        try{
            while(Task.getAbortSignal()!=undefined){
                let msg=yield* Task.yieldWrap(servIo.receive());
                ser=new Serializer().prepareUnserializing(msg);
                let command=ser.getString();
                if(command=='serve'){
                    let serveOn=ser.getLong();
                    if(serveOn>serveTime){
                        yield servIo.send([serveAnnounce])
                    }else{
                        servIo.close()
                        throw new Error('Server name already used.');
                    }
                }else if(command=='connect'){
                    ser.getLong(); //connect time
                    let connectionName=ser.getString();
                    let connIo=yield* Task.yieldWrap(wsPipeApi.connect('/connection/'+connectionName));
                    yield connIo.send([new Serializer().prepareSerializing(16).putString('connect').putString(serverName).build()]);
                    Task.fork(onConnection(connIo)).run();
                }
            }
        }finally{
            servIo.close();
        }
    }).run();
}

export async function wsPipeConnect(serverName:string){
    let connectionId=GenerateRandomString();
    let needClose=new Set<Io>();
    try{
        let connIo=await wsPipeApi.connect('/connection/'+connectionId);
        needClose.add(connIo)
        let servIo=await wsPipeApi.connect('/server/'+serverName);
        needClose.add(servIo);
        let ser=new Serializer().prepareSerializing(16);
        let connectTime=GetCurrentTime().getTime();
        let connectRequest=ser.putString('connect').putLong(BigInt(connectTime)).putString(connectionId).build();
        await servIo.send([connectRequest]);
        ser=new Serializer().prepareUnserializing(await connIo.receive());
        while(!(ser.getString()=='connect' && ser.getString()==serverName)){
            ser=new Serializer().prepareUnserializing(await connIo.receive());
        }
        needClose.delete(connIo);
        return connIo;
    }finally{
        for(let t1 of needClose){
            t1.close();
        }
    }
}
//To be standardized END

export async function updatePxseedServerConfig(){
    await persistent.load();
    let {pxprpcUrl}=await getPxseedUrl();
    let key=GetUrlQueryVariable('__pxprpcKey');
    if(key!=null){
        pxprpcUrl+='?key='+key;
    }
    let wstest:WebSocketIo
    try{
        wstest=await new WebSocketIo().connect(pxprpcUrl);
        wstest.close();
        await addClient(pxprpcUrl,ServerHostRpcName);
    }catch(e){}
    
    await persistent.save()
}


(async ()=>{
    if(GetJsEntry()==__name__){
        await updatePxseedServerConfig();
        let redirectJsEntry=GetUrlQueryVariable('__redirectjsentry');
        if(redirectJsEntry==null){
            redirectJsEntry='partic2/packageManager/webui'
        }else{
            redirectJsEntry=decodeURIComponent(redirectJsEntry);
        }
        window.open(BuildUrlFromJsEntryModule(redirectJsEntry),'_self');
    }
})();
