import {RpcExtendClient1,RpcExtendClientCallable,RpcExtendClientObject} from 'pxprpc/extend'
import { getDefaultClient } from './pxprpc_config';
export class Invoker{
 RemoteName='AndroidHelper.DisplayManager';
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
 async listDisplayStaticConst():Promise<Uint8Array>{
  let __v1=await this.ensureFunc('listDisplayStaticConst','->b');
  let __v2=await __v1!.call() as any;
  return __v2;
 }
 async getDevicesInfo():Promise<Uint8Array>{
  let __v1=await this.ensureFunc('getDevicesInfo','->b');
  let __v2=await __v1!.call() as any;
  return __v2;
 }
 async getCurrentDisplaySize():Promise<[number,number]>{
  let __v1=await this.ensureFunc('getCurrentDisplaySize','->ii');
  let __v2=await __v1!.call() as any;
  return __v2;
 }
 async getCurrentDisplayDevice():Promise<number>{
  let __v1=await this.ensureFunc('getCurrentDisplayDevice','->i');
  let __v2=await __v1!.call() as any;
  return __v2;
 }
 async viewReadPixels(v:RpcExtendClientObject):Promise<RpcExtendClientObject>{
  let __v1=await this.ensureFunc('viewReadPixels','o->o');
  let __v2=await __v1!.call(v) as any;
  return __v2;
 }
 async getCurrentMainView():Promise<RpcExtendClientObject>{
  let __v1=await this.ensureFunc('getCurrentMainView','->o');
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