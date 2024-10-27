import {RpcExtendClient1,RpcExtendClientCallable,RpcExtendClientObject} from 'pxprpc/extend'
import { getDefaultClient } from './pxprpc_config';
export class Invoker{
 RemoteName='AndroidHelper.MediaProjection';
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
 async mediaProjectionRequest(param:RpcExtendClientObject,result:RpcExtendClientObject):Promise<boolean>{
  let __v1=await this.ensureFunc('mediaProjectionRequest','oo->c');
  let __v2=await __v1!.call(param,result) as any;
  return __v2;
 }
 async startScreenCapture(sur:RpcExtendClientObject):Promise<void>{
  let __v1=await this.ensureFunc('startScreenCapture','o->');
  let __v2=await __v1!.call(sur);
 }
 async stopScreenCapture():Promise<void>{
  let __v1=await this.ensureFunc('stopScreenCapture','->');
  let __v2=await __v1!.call();
 }
 async takeScreenShot():Promise<Uint8Array>{
  let __v1=await this.ensureFunc('takeScreenShot','->b');
  let __v2=await __v1!.call() as any;
  return __v2;
 }
 async takeMainViewShot():Promise<Uint8Array>{
  let __v1=await this.ensureFunc('takeMainViewShot','->b');
  let __v2=await __v1!.call() as any;
  return __v2;
 }
 async requestScreenCapture():Promise<boolean>{
  let __v1=await this.ensureFunc('requestScreenCapture','->c');
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