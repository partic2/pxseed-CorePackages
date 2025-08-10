import { RpcExtendClient1, RpcExtendClientCallable, RpcExtendClientObject } from 'pxprpc/extend'
import { getRpcFunctionOn } from 'partic2/pxprpcClient/registry';
import { Serializer } from 'pxprpc/base';
import { getRpc4XplatjCServer } from './rpcregistry';
export class Invoker {
    RemoteName = 'pxprpc_libuv';
    rpc__client?: RpcExtendClient1;
    rpc__RemoteFuncs = {} as { [k: string]: RpcExtendClientCallable | undefined | null };
    async useClient(client: RpcExtendClient1) {
        this.rpc__client = client;
        this.rpc__RemoteFuncs = {}
    }
    async ensureFunc(name:string,typedecl:string){
        return await getRpcFunctionOn(this.rpc__client!,this.RemoteName+'.'+name, typedecl);
     }
    async fs_open(path: string, flag: 'r' | 'w' | 'r+'): Promise<RpcExtendClientObject> {
        let __v1 = await this.ensureFunc('fs_open', 'ss->o');
        let __v2 = await __v1!.call(path, flag);
        return __v2;
    }
    async fs_read(fh: RpcExtendClientObject, size: number, offset: BigInt): Promise<Uint8Array> {
        let __v1 = await this.ensureFunc('fs_read', 'oil->b');
        let __v2 = await __v1!.call(fh, size, offset);
        return __v2;
    }
    async fs_write(fh: RpcExtendClientObject, offset: BigInt, data:Uint8Array): Promise<number> {
        let __v1 = await this.ensureFunc('fs_write', 'olb->i');
        let __v2 = await __v1!.call(fh, offset, data);
        return __v2;
    }
    async fs_unlink(path:string): Promise<void> {
        let __v1 = await this.ensureFunc('fs_unlink', 's->');
        let __v2 = await __v1!.call(path);
    }
    async fs_mkdir(path:string): Promise<void> {
        let __v1 = await this.ensureFunc('fs_mkdir', 's->');
        let __v2 = await __v1!.call(path);
    }
    async fs_rmdir(path:string): Promise<void> {
        let __v1 = await this.ensureFunc('fs_rmdir', 's->');
        let __v2 = await __v1!.call(path);
    }
    async fs_scandir(path:string): Promise<Uint8Array> {
        let __v1 = await this.ensureFunc('fs_scandir', 's->b');
        let __v2 = await __v1!.call(path);
        return __v2;
    }
    async fs_stat(path:string): Promise<Uint8Array> {
        let __v1 = await this.ensureFunc('fs_stat', 's->b');
        let __v2 = await __v1!.call(path);
        return __v2;
    }
    async fs_rename(path:string,newPath:string): Promise<void> {
        let __v1 = await this.ensureFunc('fs_rename', 'ss->');
        let __v2 = await __v1!.call(path,newPath);
    }
    async fs_ftruncate(path:string,offset:BigInt): Promise<void> {
        let __v1 = await this.ensureFunc('fs_ftruncate', 'sl->');
        let __v2 = await __v1!.call(path,offset);
    }
    async fs_readlink(path:string,offset:BigInt): Promise<string> {
        let __v1 = await this.ensureFunc('fs_readlink', 's->s');
        let __v2 = await __v1!.call(path,offset);
        return __v2;
    }
    async fs_chmod(path:string,mode:number): Promise<void> {
        let __v1 = await this.ensureFunc('fs_chmod', 'si->');
        let __v2 = await __v1!.call(path,mode);
    }
    async stream_read(stream: RpcExtendClientObject): Promise<Uint8Array> {
        let __v1 = await this.ensureFunc('stream_read', 'o->b');
        let __v2 = await __v1!.call(stream);
        return __v2;
    }
    async stream_write(stream: RpcExtendClientObject, data:Uint8Array): Promise<number> {
        let __v1 = await this.ensureFunc('stream_write', 'ob->i');
        let __v2 = await __v1!.call(stream, data);
        return __v2;
    }
    async stream_accept(stream: RpcExtendClientObject): Promise<RpcExtendClientObject> {
        let __v1 = await this.ensureFunc('stream_accept', 'o->o');
        let __v2 = await __v1!.call(stream);
        return __v2;
    }
    async spawn(param: Uint8Array): Promise<RpcExtendClientObject> {
        let __v1 = await this.ensureFunc('spawn', 'b->o');
        let __v2 = await __v1!.call(param);
        return __v2;
    }
    async spawnWrap(param: {fileName?:string,cwd?:string,args:string[],envs?:string[]}): Promise<RpcExtendClientObject> {
        if(param.fileName==undefined){param.fileName=''};
        if(param.cwd==undefined){param.cwd=''};
        if(param.envs==undefined){param.envs=[]};
        let p2=new Serializer().prepareSerializing(16);
        p2.putString(param.fileName).putString(param.cwd);
        p2.putInt(param.args.length);
        for(let t1 of param.args){
            p2.putString(t1);
        }
        p2.putInt(param.envs.length);
        for(let t1 of param.envs){
            p2.putString(t1);
        }
        return this.spawn(p2.build());
    }
    async process_stdio(proc:RpcExtendClientObject,index: number): Promise<RpcExtendClientObject> {
        let __v1 = await this.ensureFunc('process_stdio', 'oi->o');
        let __v2 = await __v1!.call(proc,index);
        return __v2;
    }
    async process_get_result(proc:RpcExtendClientObject,waitExit: boolean): Promise<[alive:boolean,exitStatus:BigInt,termSignal:number]> {
        let __v1 = await this.ensureFunc('process_get_result', 'oc->cli');
        let __v2 = await __v1!.call(proc,waitExit);
        return __v2;
    }
    async pipe_bind(name:string): Promise<RpcExtendClientObject> {
        let __v1 = await this.ensureFunc('pipe_bind', 's->o');
        let __v2 = await __v1!.call(name);
        return __v2;
    }
    async pipe_connect(name:string): Promise<RpcExtendClientObject> {
        let __v1 = await this.ensureFunc('pipe_connect', 's->o');
        let __v2 = await __v1!.call(name);
        return __v2;
    }
    async tcp_bind(name:string,port:number): Promise<RpcExtendClientObject> {
        let __v1 = await this.ensureFunc('tcp_bind', 'si->o');
        let __v2 = await __v1!.call(name,port);
        return __v2;
    }
    async tcp_connect(name:string,port:number): Promise<RpcExtendClientObject> {
        let __v1 = await this.ensureFunc('tcp_connect', 'si->o');
        let __v2 = await __v1!.call(name,port);
        return __v2;
    }
    async tcp_getpeername(tcp:RpcExtendClientObject): Promise<[string,number]> {
        let __v1 = await this.ensureFunc('tcp_getpeername', 'o->si');
        let __v2 = await __v1!.call(tcp);
        return __v2;
    }
    async interface_address(): Promise<Uint8Array> {
        let __v1 = await this.ensureFunc('interface_address', '->b');
        let __v2 = await __v1!.call();
        return __v2;
    }
    async os_getenv(name:string): Promise<string> {
        let __v1 = await this.ensureFunc('os_getenv', 's->s');
        let __v2 = await __v1!.call(name);
        return __v2;
    }
    async os_setenv(name:string,val:string): Promise<void> {
        let __v1 = await this.ensureFunc('os_setenv', 'ss->');
        let __v2 = await __v1!.call(name,val);
    }
    async os_unsetenv(name:string): Promise<void> {
        let __v1 = await this.ensureFunc('os_unsetenv', 's->');
        let __v2 = await __v1!.call(name);
    }
    async os_getprop(name:string): Promise<string> {
        let __v1 = await this.ensureFunc('os_getprop', 's->s');
        let __v2 = await __v1!.call(name);
        return __v2;
    }
    async os_setprop(name:string,val:string): Promise<void> {
        let __v1 = await this.ensureFunc('os_setprop', 'ss->');
        let __v2 = await __v1!.call(name,val);
    }
    async get_memory_info(): Promise<Uint8Array> {
        let __v1 = await this.ensureFunc('get_memory_info', '->b');
        let __v2 = await __v1!.call();
        return __v2;
    }
    async gettimeofday(): Promise<BigInt> {
        let __v1 = await this.ensureFunc('gettimeofday', '->l');
        let __v2 = await __v1!.call();
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