import {RpcExtendClient1,RpcExtendClientCallable,RpcExtendClientObject} from 'pxprpc/extend'
import { getRpcFunctionOn } from 'partic2/pxprpcClient/registry';
import { getRpc4XplatjJavaServer } from './rpcregistry';


export class Invoker{
 RemoteName='JseHelper.JseIo';
 rpc__client?:RpcExtendClient1;
 rpc__RemoteFuncs={} as {[k:string]:RpcExtendClientCallable|undefined|null};
 async useClient(client:RpcExtendClient1){
  this.rpc__client=client;
  this.rpc__RemoteFuncs=(client as any).__attached__JseHelper__JseIo;
  if(this.rpc__RemoteFuncs==undefined){
    this.rpc__RemoteFuncs={};
    (client as any).__attached__JseHelper__JseIo=this.rpc__RemoteFuncs;
  }
 }
 async ensureFunc(name:string,typedecl:string){
    return await getRpcFunctionOn(this.rpc__client!,this.RemoteName+'.'+name, typedecl);
 }
 async realpath(path:string):Promise<string>{
  let __v1=await this.ensureFunc('realpath','s->s');
  let __v2=await __v1!.call(path) as any;
  return __v2;
 }
 async unlink(path:string):Promise<void>{
  let __v1=await this.ensureFunc('unlink','s->');
  let __v2=await __v1!.call(path);
 }
 async rename(path:string,newPath:string):Promise<void>{
  let __v1=await this.ensureFunc('rename','ss->');
  let __v2=await __v1!.call(path,newPath);
 }
 async close():Promise<void>{
  let __v1=await this.ensureFunc('close','->');
  let __v2=await __v1!.call();
 }
 async mkstemp(template:string):Promise<[RpcExtendClientObject,string]>{
  let __v1=await this.ensureFunc('mkstemp','s->os');
  let __v2=await __v1!.call(template) as any;
  return __v2;
 }
 async fhRead(f:RpcExtendClientObject,offset:BigInt,length:number):Promise<Uint8Array>{
  let __v1=await this.ensureFunc('fhRead','oli->b');
  let __v2=await __v1!.call(f,offset,length) as any;
  return __v2;
 }
 async fhWrite(f:RpcExtendClientObject,offset:BigInt,buf:Uint8Array):Promise<number>{
  let __v1=await this.ensureFunc('fhWrite','olb->i');
  let __v2=await __v1!.call(f,offset,buf) as any;
  return __v2;
 }
 async fhClose(f:RpcExtendClientObject):Promise<void>{
  let __v1=await this.ensureFunc('fhClose','o->');
  let __v2=await __v1!.call(f);
 }
 async fhTruncate(f:RpcExtendClientObject,offset:BigInt):Promise<void>{
  let __v1=await this.ensureFunc('fhTruncate','ol->');
  let __v2=await __v1!.call(f,offset);
 }
 async stat(path:string):Promise<[string,BigInt,BigInt]>{
  let __v1=await this.ensureFunc('stat','s->sll');
  let __v2=await __v1!.call(path) as any;
  return __v2;
 }
 async open(path:string,flag:string,mode:number):Promise<RpcExtendClientObject>{
  let __v1=await this.ensureFunc('open','ssi->o');
  let __v2=await __v1!.call(path,flag,mode) as any;
  return __v2;
 }
 async rmdir(path:string):Promise<void>{
  let __v1=await this.ensureFunc('rmdir','s->');
  let __v2=await __v1!.call(path);
 }
 async mkdir(path:string):Promise<void>{
  let __v1=await this.ensureFunc('mkdir','s->');
  let __v2=await __v1!.call(path);
 }
 async copyFileRecursively(path:string,newPath:string):Promise<void>{
  let __v1=await this.ensureFunc('copyFileRecursively','ss->');
  let __v2=await __v1!.call(path,newPath);
 }
 async copyFile(path:string,newPath:string):Promise<void>{
  let __v1=await this.ensureFunc('copyFile','ss->');
  let __v2=await __v1!.call(path,newPath);
 }
 async readdir(path:string):Promise<Uint8Array>{
  let __v1=await this.ensureFunc('readdir','s->b');
  let __v2=await __v1!.call(path) as any;
  return __v2;
 }
 async rm(path:string):Promise<void>{
  let __v1=await this.ensureFunc('rm','s->');
  let __v2=await __v1!.call(path);
 }
 async execCommand(command:string):Promise<RpcExtendClientObject>{
  let __v1=await this.ensureFunc('execCommand','s->o');
  let __v2=await __v1!.call(command) as any;
  return __v2;
 }
 async processWait(proc:RpcExtendClientObject):Promise<number>{
  let __v1=await this.ensureFunc('processWait','o->i');
  let __v2=await __v1!.call(proc) as any;
  return __v2;
 }
 async processIsAlive(proc:RpcExtendClientObject):Promise<boolean>{
  let __v1=await this.ensureFunc('processIsAlive','o->c');
  let __v2=await __v1!.call(proc) as any;
  return __v2;
 }
 async processStdio(proc:RpcExtendClientObject,in2:boolean,out:boolean,err:boolean):Promise<[RpcExtendClientObject,RpcExtendClientObject,RpcExtendClientObject]>{
  let __v1=await this.ensureFunc('processStdio','occc->ooo');
  let __v2=await __v1!.call(proc,in2,out,err) as any;
  return __v2;
 }
 async inputRead(in2:RpcExtendClientObject,len:number):Promise<Uint8Array>{
  let __v1=await this.ensureFunc('inputRead','oi->b');
  let __v2=await __v1!.call(in2,len) as any;
  return __v2;
 }
 async outputWrite(out:RpcExtendClientObject,buf:Uint8Array):Promise<void>{
  let __v1=await this.ensureFunc('outputWrite','ob->');
  let __v2=await __v1!.call(out,buf);
 }
 async getDataDir():Promise<string>{
  let __v1=await this.ensureFunc('getDataDir','->s');
  let __v2=await __v1!.call() as any;
  return __v2;
 }
 async getProp(prop:string):Promise<string>{
  let __v1=await this.ensureFunc('getProp','s->s');
  let __v2=await __v1!.call(prop) as any;
  return __v2;
 }
 async dumpPropNames():Promise<string>{
  let __v1=await this.ensureFunc('dumpPropNames','->s');
  let __v2=await __v1!.call() as any;
  return __v2;
 }
 async tcpConnect(host:string,port:number):Promise<RpcExtendClientObject>{
  let __v1=await this.ensureFunc('tcpConnect','si->o');
  let __v2=await __v1!.call(host,port) as any;
  return __v2;
 }
 async tcpStreams(soc:RpcExtendClientObject):Promise<[RpcExtendClientObject,RpcExtendClientObject]>{
  let __v1=await this.ensureFunc('tcpStreams','o->oo');
  let __v2=await __v1!.call(soc) as any;
  return __v2;
 }
 async tcpListen(host:string,port:number):Promise<RpcExtendClientObject>{
  let __v1=await this.ensureFunc('tcpListen','si->o');
  let __v2=await __v1!.call(host,port) as any;
  return __v2;
 }
 async tcpAccept(ss:RpcExtendClientObject):Promise<RpcExtendClientObject>{
  let __v1=await this.ensureFunc('tcpAccept','o->o');
  let __v2=await __v1!.call(ss) as any;
  return __v2;
 }
 async platform():Promise<string>{
  let __v1=await this.ensureFunc('platform','->s');
  let __v2=await __v1!.call() as any;
  return __v2;
 }
}


export let defaultInvoker:Invoker|null=null

export async function ensureDefaultInvoker(){
    if(defaultInvoker==null){
        defaultInvoker=new Invoker();
        defaultInvoker.useClient(await getRpc4XplatjJavaServer());
    }
}