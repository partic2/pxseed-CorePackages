import { RpcExtendClient1, RpcExtendClientCallable, RpcExtendClientObject } from 'pxprpc/extend'
import { getRpcFunctionOn } from 'partic2/pxprpcClient/registry';
import { getRpc4XplatjCServer } from './rpcregistry';
export class Invoker {
    rpc__client?: RpcExtendClient1;
    rpc__RemoteFuncs = {} as { [k: string]: RpcExtendClientCallable | undefined | null };
    async useClient(client: RpcExtendClient1) {
        this.rpc__client = client;
        this.rpc__RemoteFuncs = {}
    }
    
    async pipe_serve(name:string): Promise<RpcExtendClientObject> {
        let __v1 = await getRpcFunctionOn(this.rpc__client!,'pxprpc_pipe_pp.serve', 's->o');
        let __v2 = await __v1!.call(name);
        return __v2
    }
    async pipe_accept(pipeServer:RpcExtendClientObject): Promise<RpcExtendClientObject> {
        let __v1 = await getRpcFunctionOn(this.rpc__client!,'pxprpc_pipe_pp.accept', 'o->o');
        let __v2 = await __v1!.call(pipeServer);
        return __v2;
    }
    async pipe_connect(target:string): Promise<RpcExtendClientObject> {
        let __v1 = await getRpcFunctionOn(this.rpc__client!,'pxprpc_pipe_pp.connect', 's->o');
        let __v2 = await __v1!.call(target);
        return __v2;
    }
    async io_to_raw_addr(io1:RpcExtendClientObject): Promise<BigInt> {
        let __v1 = await getRpcFunctionOn(this.rpc__client!,'pxprpc_pp.io_to_raw_addr', 'o->l');
        let __v2 = await __v1!.call(io1);
        return __v2;
    }
    async io_from_raw_addr(addr:BigInt): Promise<RpcExtendClientObject> {
        let __v1 = await getRpcFunctionOn(this.rpc__client!,'pxprpc_pp.io_from_raw_addr', 'l->o');
        let __v2 = await __v1!.call(addr);
        return __v2;
    }
    async io_send(io1:RpcExtendClientObject,data:Uint8Array): Promise<RpcExtendClientObject> {
        let __v1 = await getRpcFunctionOn(this.rpc__client!,'pxprpc_pp.io_send', 'ob->');
        let __v2 = await __v1!.call(io1,data);
        return __v2;
    }
    async io_receive(io1:RpcExtendClientObject): Promise<Uint8Array> {
        let __v1 = await getRpcFunctionOn(this.rpc__client!,'pxprpc_pp.io_receive', 'o->b');
        let __v2 = await __v1!.call(io1);
        return __v2;
    }
    async io_set_auto_close(io1:RpcExtendClientObject,autoClose:boolean): Promise<Uint8Array> {
        let __v1 = await getRpcFunctionOn(this.rpc__client!,'pxprpc_pp.io_set_auto_close', 'oc->');
        let __v2 = await __v1!.call(io1,autoClose);
        return __v2;
    }
    async new_tcp_rpc_server(host:string,port:number):Promise<RpcExtendClient1> {
        let __v1 = await getRpcFunctionOn(this.rpc__client!,'pxprpc_rtbridge_host.new_tcp_rpc_server', 'si->');
        let __v2 = await __v1!.call(host,port);
        return __v2;
    }
    async memory_alloc(size:number):Promise<RpcExtendClient1> {
        let __v1 = await getRpcFunctionOn(this.rpc__client!,'pxprpc_rtbridge_host.memory_alloc', 'i->o');
        let __v2 = await __v1!.call(size);
        return __v2;
    }
    async memory_access(addr:BigInt,size:number):Promise<RpcExtendClient1> {
        let __v1 = await getRpcFunctionOn(this.rpc__client!,'pxprpc_rtbridge_host.memory_access', 'li->o');
        let __v2 = await __v1!.call(addr,size);
        return __v2;
    }
    async memory_read(chunk:RpcExtendClientObject,offset:number,size:number):Promise<Uint8Array> {
        let __v1 = await getRpcFunctionOn(this.rpc__client!,'pxprpc_rtbridge_host.memory_read', 'oii->b');
        let __v2 = await __v1!.call(chunk,offset,size);
        return __v2;
    }
    async memory_write(chunk:RpcExtendClientObject,offset:number,data:Uint8Array):Promise<void> {
        let __v1 = await getRpcFunctionOn(this.rpc__client!,'pxprpc_rtbridge_host.memory_write', 'oib->');
        let __v2 = await __v1!.call(chunk,offset,data);
        return __v2;
    }
    async memory_info(chunk:RpcExtendClientObject):Promise<[BigInt,number]> {
        let __v1 = await getRpcFunctionOn(this.rpc__client!,'pxprpc_rtbridge_host.memory_info', 'o->li');
        let __v2 = await __v1!.call(chunk);
        return __v2;
    }
    async memory_mapfile(path:string,mode:'r'|'w'|'rw',size:number):Promise<RpcExtendClient1> {
        let __v1 = await getRpcFunctionOn(this.rpc__client!,'pxprpc_rtbridge_host.memory_mapfile', 'ssi->o');
        let __v2 = await __v1!.call(path,mode,size);
        return __v2;
    }
}


export let defaultInvoker:Invoker|null=null

export async function ensureDefaultInvoker(){
    if(defaultInvoker==null){
        defaultInvoker=new Invoker();
        defaultInvoker.useClient(await getRpc4XplatjCServer());
    }
}