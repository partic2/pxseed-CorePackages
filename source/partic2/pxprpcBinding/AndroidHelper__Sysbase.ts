import {RpcExtendClient1,RpcExtendClientCallable,RpcExtendClientObject} from 'pxprpc/extend'
import { getDefaultClient } from './pxprpc_config';
export class Invoker{
 RemoteName='AndroidHelper.Sysbase';
 rpc__client?:RpcExtendClient1;
 rpc__RemoteFuncs={} as {[k:string]:RpcExtendClientCallable|undefined|null};
 async useClient(client:RpcExtendClient1){
  this.rpc__client=client;
  this.rpc__RemoteFuncs={}
 }
 async ensureFunc(name:string,typedecl:string){
  let __v1=this.rpc__RemoteFuncs[name];
  if(__v1==undefined){
   __v1=await this.rpc__client!.getFunc(this.RemoteName + '.' + name);
   this.rpc__RemoteFuncs[name]=__v1
   __v1!.typedecl(typedecl);
  }
  return __v1;
 }
 async newBroadcastReceiver():Promise<RpcExtendClientObject>{
  let __v1=await this.ensureFunc('newBroadcastReceiver','->o');
  let __v2=await __v1!.call() as any;
  return __v2;
 }
 async getDefaultContext():Promise<RpcExtendClientObject>{
  let __v1=await this.ensureFunc('getDefaultContext','->o');
  let __v2=await __v1!.call() as any;
  return __v2;
 }
 async registerBroadcastReceiver(receiver:RpcExtendClientObject,filter:string):Promise<void>{
  let __v1=await this.ensureFunc('registerBroadcastReceiver','os->');
  let __v2=await __v1!.call(receiver,filter);
 }
 async unregisterBroadcastReceiver(receiver:RpcExtendClientObject):Promise<void>{
  let __v1=await this.ensureFunc('unregisterBroadcastReceiver','o->');
  let __v2=await __v1!.call(receiver);
 }
 async getService(name:string):Promise<RpcExtendClientObject>{
  let __v1=await this.ensureFunc('getService','s->o');
  let __v2=await __v1!.call(name) as any;
  return __v2;
 }
 async newUUID(mostSigBits:BigInt,leastSigBits:BigInt):Promise<RpcExtendClientObject>{
  let __v1=await this.ensureFunc('newUUID','ll->o');
  let __v2=await __v1!.call(mostSigBits,leastSigBits) as any;
  return __v2;
 }
 async requestExit():Promise<void>{
  let __v1=await this.ensureFunc('requestExit','->');
  let __v2=await __v1!.call();
 }
 async deviceInfo():Promise<Uint8Array>{
  let __v1=await this.ensureFunc('deviceInfo','->b');
  let __v2=await __v1!.call() as any;
  return __v2;
 }
 async getMemoryInfo():Promise<[BigInt,BigInt,BigInt,boolean]>{
  let __v1=await this.ensureFunc('getMemoryInfo','->lllc');
  let __v2=await __v1!.call() as any;
  return __v2;
 }
 async getDataDir():Promise<string>{
  let __v1=await this.ensureFunc('getDataDir','->s');
  let __v2=await __v1!.call() as any;
  return __v2;
 }
 async getHostPackageName():Promise<string>{
  let __v1=await this.ensureFunc('getHostPackageName','->s');
  let __v2=await __v1!.call() as any;
  return __v2;
 }
 async close():Promise<void>{
  let __v1=await this.ensureFunc('close','->');
  let __v2=await __v1!.call();
 }
}
let defaultInvoker:Invoker|null=null;
export async function getDefault(){
 if(defaultInvoker===null){
  defaultInvoker=new Invoker();
  await defaultInvoker.useClient(await getDefaultClient());
  }
 return defaultInvoker;
}