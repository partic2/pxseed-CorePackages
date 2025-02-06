import { assert, requirejs } from "partic2/jsutils1/base";
import { RpcExtendClient1, RpcExtendClientCallable, RpcExtendClientObject } from "pxprpc/extend";
import type { PxseedServer2023StartupConfig } from "./entry";
import { Client } from "pxprpc/base";
import { WebSocketIo } from "pxprpc/backend";


let boundRpcFunctions=Symbol('boundRpcFunctions')

export class PxseedServer2023Function{
    async exit(){
        await this.funcs[0].call();
    }
    async subprocessWaitExitCode(index:number){
        await this.funcs[1].call(index) as number;
    }
    async subprocessRestart(index:number){
        await this.funcs[2].call(index) 
    }
    async subprocessRestartOnExit(index:number){
        return await this.funcs[3].call(index) as RpcExtendClientObject
    }
    funcs:RpcExtendClientCallable[]=[];
    async init(client1:RpcExtendClient1){
        if(boundRpcFunctions in client1){
            this.funcs=(client1 as any).boundRpcFunctions;
        }else{
            this.funcs.push((await client1.getFunc('pxseedServer2023.exit'))!.typedecl('->'));
            this.funcs.push((await client1.getFunc('pxseedServer2023.subprocess.waitExitCode'))!.typedecl('i->i'));
            this.funcs.push((await client1.getFunc('pxseedServer2023.subprocess.restart'))!.typedecl('i->'));
            this.funcs.push((await client1.getFunc('pxseedServer2023.subprocess.restartOnExit'))!.typedecl('i->o'));
            (client1 as any).boundRpcFunctions=this.funcs;
        }
    }
}


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