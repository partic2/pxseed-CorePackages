import {RpcExtendClient1,RpcExtendClientCallable,RpcExtendClientObject} from 'pxprpc/extend'
import { getDefaultClient } from './pxprpc_config';
export class Invoker{
 RemoteName='AndroidHelper.Power';
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
 async accuireCpuWakeLock():Promise<void>{
  let __v1=await this.ensureFunc('accuireCpuWakeLock','->');
  let __v2=await __v1!.call();
 }
 async accuireScreenWakeLock(keepBright:boolean):Promise<void>{
  let __v1=await this.ensureFunc('accuireScreenWakeLock','c->');
  let __v2=await __v1!.call(keepBright);
 }
 async releaseWakeLock():Promise<void>{
  let __v1=await this.ensureFunc('releaseWakeLock','->');
  let __v2=await __v1!.call();
 }
 async getBatteryState():Promise<Uint8Array>{
  let __v1=await this.ensureFunc('getBatteryState','->b');
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