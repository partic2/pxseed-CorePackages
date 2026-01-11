import { GenerateRandomString, GetCurrentTime, Task, assert, requirejs } from "partic2/jsutils1/base";
import { RpcExtendClient1, RpcExtendClientCallable, RpcExtendClientObject } from "pxprpc/extend";
import type { PxseedServer2023StartupConfig } from "./pxseedhttpserver";
import { Client, Io, Serializer } from "pxprpc/base";
import { WebSocketIo } from "pxprpc/backend";
import { importRemoteModule } from 'partic2/pxprpcClient/registry'


export class PxseedServer2023Function{
    client1?: RpcExtendClient1;
    remoteModule?:typeof import('./pxseedhttpserver')
    async init(client1:RpcExtendClient1){
        this.client1=client1;
        this.remoteModule=await importRemoteModule(this.client1,'pxseedServer2023/pxseedhttpserver');
    }
    async exit(){
        await this.serverCommand('exit');
    }
    async subprocessWaitExitCode(index:number){
        return this.serverCommand('subprocessWaitExitCode',index)
    }
    async subprocessRestart(index:number){
        return this.serverCommand('subprocessRestart',index)
    }
    async serverCommand(cmd:string,param?:any){
        return this.remoteModule!.serverCommand(cmd,param);
    }
    async buildEnviron(){
        return this.serverCommand('buildEnviron');
    }
    async buildPackages(){
        return this.serverCommand('buildPackages');
    }
    async rebuildPackages(){
        return this.serverCommand('rebuildPackages');
    }
    async getConfig(){
        return await this.serverCommand('getConfig') as PxseedServer2023StartupConfig
    }
    async saveConfig(cfg:PxseedServer2023StartupConfig){
        return await this.serverCommand('saveConfig',cfg);
    }
}

//wsPipe
export class WebsocketPipe{
    constructor(public wsUrl:string){};
    directlyConnect(id:string):Promise<Io>{
        return new WebSocketIo().connect(this.wsUrl+(this.wsUrl.includes('?')?'&':'?')+`id=${encodeURIComponent(id)}`);
    }
    async clientConnect(serverName:string):Promise<Io>{
        let connectionId=GenerateRandomString();
        let needClose=new Set<Io>();
        try{
            let connIo=await this.directlyConnect('/connection/'+connectionId);
            needClose.add(connIo)
            let servIo=await this.directlyConnect('/server/'+serverName);
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
    *serverServe(serverName:string,onConnection:(io:Io)=>Generator<Promise<any>,void,any>){
        let servIo:Io=yield* Task.yieldWrap(this.directlyConnect('/server/'+serverName));
        let ser=new Serializer().prepareSerializing(16);
        let serveTime=GetCurrentTime().getTime();
        let serveAnnounce=ser.putString('serve').putLong(BigInt(serveTime)).build();
        servIo.send([serveAnnounce]);
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
                let connIo=yield* Task.yieldWrap(this.directlyConnect('/connection/'+connectionName));
                yield connIo.send([new Serializer().prepareSerializing(16).putString('connect').putString(serverName).build()]);
                Task.fork(onConnection(connIo)).run();
            }
        }
    }
}


export async function getServerConfig():Promise<null|{root:PxseedServer2023StartupConfig,current:PxseedServer2023StartupConfig}>{
    if('pxseedServer2023/pxseedhttpserver' in await requirejs.getDefined()){
        let serv=await import('pxseedServer2023/pxseedhttpserver');
        return {root:serv.rootConfig,current:serv.config}
    }else{
        return null;
    }
}

export async function restartSubprocessSelf(){
    let {current,root}=(await getServerConfig())!;
    assert(current.subprocessIndex!=undefined)
    let client1=new RpcExtendClient1(new Client(await new WebSocketIo().connect(`ws://127.0.0.1:${root.listenOn!.port}${root.pxseedBase}/pxprpc/0?key=${encodeURIComponent(root.pxprpcKey??'')}`)))
    await client1.init();
    let func=new PxseedServer2023Function();
    await func.init(client1);
    await func.subprocessRestart(current.subprocessIndex);
    process.exit(0);
}
