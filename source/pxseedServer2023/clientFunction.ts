import { GenerateRandomString, GetCurrentTime, Task, assert, requirejs } from "partic2/jsutils1/base";
import { RpcExtendClient1, RpcExtendClientCallable, RpcExtendClientObject } from "pxprpc/extend";
import type { PxseedServer2023StartupConfig } from "./entry";
import { Client, Io, Serializer } from "pxprpc/base";
import { WebSocketIo } from "pxprpc/backend";
import { IoOverPxprpc, ServerHostRpcName, getPersistentRegistered, getRegistered } from 'partic2/pxprpcClient/registry'
import { GetUrlQueryVariable2 } from "partic2/jsutils1/webutils";
import { getPxseedUrl } from "./webentry";


let boundRpcFunctions=Symbol('boundRpcFunctions')

export class PxseedServer2023Function{
    async exit(){
        await this.funcs[0]!.call();
    }
    async subprocessWaitExitCode(index:number){
        await this.funcs[1]!.call(index) as number;
    }
    async subprocessRestart(index:number){
        await this.funcs[2]!.call(index) 
    }
    async subprocessRestartOnExit(index:number){
        return await this.funcs[3]!.call(index) as RpcExtendClientObject
    }
    async connectWsPipe(id:string){
        return new IoOverPxprpc(await this.funcs[4]!.call(id) as RpcExtendClientObject)
    }
    funcs:(RpcExtendClientCallable|undefined)[]=[];
    async init(client1:RpcExtendClient1){
        if(boundRpcFunctions in client1){
            this.funcs=(client1 as any).boundRpcFunctions;
        }else{
            this.funcs.push((await client1.getFunc('pxseedServer2023.exit'))?.typedecl('->'));
            this.funcs.push((await client1.getFunc('pxseedServer2023.subprocess.waitExitCode'))?.typedecl('i->i'));
            this.funcs.push((await client1.getFunc('pxseedServer2023.subprocess.restart'))?.typedecl('i->'));
            this.funcs.push((await client1.getFunc('pxseedServer2023.subprocess.restartOnExit'))?.typedecl('i->o'));
            this.funcs.push((await client1.getFunc('pxseedServer2023.connectWsPipe'))?.typedecl('s->o'));
            (client1 as any).boundRpcFunctions=this.funcs;
        }
    }
}


//To be standardized BEGIN
export async function wsPipeConnectDirectly(id:string):Promise<Io>{
    let {wsPipeUrl}=await getPxseedUrl();
    return new WebSocketIo().connect(wsPipeUrl+`?id=${id}`);
}
export async function wsPipeConnectPxprpc(id:string):Promise<Io>{
    let { PxseedServer2023Function } =await import("./clientFunction")
    let fn=new PxseedServer2023Function();
    await fn.init(await getRegistered(ServerHostRpcName)!.ensureConnected())
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

export async function wsPipeConnectPxseedJsUrl(url:string){
    let servName=decodeURIComponent(GetUrlQueryVariable2(url,'serverName')??'');
    return wsPipeConnect(servName);
}

//To be standardized END

export async function getServerConfig():Promise<null|{root:PxseedServer2023StartupConfig,current:PxseedServer2023StartupConfig}>{
    if('pxseedServer2023/entry' in await requirejs.getDefined()){
        let serv=await import('pxseedServer2023/entry');
        return {root:serv.rootConfig,current:serv.config}
    }else{
        return null;
    }
}

export async function restartSubprocessSelf(){
    let {current,root}=(await getServerConfig())!;
    assert(current.subprocessIndex!=undefined)
    let client1=new RpcExtendClient1(new Client(await new WebSocketIo().connect(`ws://127.0.0.1:${root.listenOn!.port}${root.pxseedBase}${root.pxprpcPath}`)))
    await client1.init();
    let func=new PxseedServer2023Function();
    await func.init(client1);
    let closable=await func.subprocessRestartOnExit(current.subprocessIndex);
    process.exit(0);
}

;(async ()=>{
    if(await getPersistentRegistered(ServerHostRpcName)!=null){
        wsPipeApi.connect=wsPipeConnectPxprpc
    }
})()