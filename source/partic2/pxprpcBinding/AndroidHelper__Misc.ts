import {RpcExtendClient1,RpcExtendClientCallable,RpcExtendClientObject} from 'pxprpc/extend'
import { getDefaultClient } from './pxprpc_config';
export class Invoker{
 RemoteName='AndroidHelper.Misc';
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
 async close():Promise<void>{
  let __v1=await this.ensureFunc('close','->');
  let __v2=await __v1!.call();
 }
 async initCameraFlashLight():Promise<void>{
  let __v1=await this.ensureFunc('initCameraFlashLight','->');
  let __v2=await __v1!.call();
 }
 async initNotifyChannel():Promise<void>{
  let __v1=await this.ensureFunc('initNotifyChannel','->');
  let __v2=await __v1!.call();
 }
 async hasVibrator():Promise<boolean>{
  let __v1=await this.ensureFunc('hasVibrator','->c');
  let __v2=await __v1!.call() as any;
  return __v2;
 }
 async vibrate(ms:number,amplitude:number):Promise<void>{
  let __v1=await this.ensureFunc('vibrate','ii->');
  let __v2=await __v1!.call(ms,amplitude);
 }
 async getClipboardText():Promise<string>{
  let __v1=await this.ensureFunc('getClipboardText','->s');
  let __v2=await __v1!.call() as any;
  return __v2;
 }
 async setClipboardText(text:string):Promise<void>{
  let __v1=await this.ensureFunc('setClipboardText','s->');
  let __v2=await __v1!.call(text);
 }
 async getDefaultAudioVolume():Promise<number>{
  let __v1=await this.ensureFunc('getDefaultAudioVolume','->i');
  let __v2=await __v1!.call() as any;
  return __v2;
 }
 async setDefaultAudioVolume(vol:number):Promise<void>{
  let __v1=await this.ensureFunc('setDefaultAudioVolume','i->');
  let __v2=await __v1!.call(vol);
 }
 async getLastLocationInfo(provider:string):Promise<RpcExtendClientObject>{
  let __v1=await this.ensureFunc('getLastLocationInfo','s->o');
  let __v2=await __v1!.call(provider) as any;
  return __v2;
 }
 async packLocation(location:RpcExtendClientObject,tableSer:boolean):Promise<Uint8Array>{
  let __v1=await this.ensureFunc('packLocation','oc->b');
  let __v2=await __v1!.call(location,tableSer) as any;
  return __v2;
 }
 async requestLocationUpdate(provider:string):Promise<RpcExtendClientObject>{
  let __v1=await this.ensureFunc('requestLocationUpdate','s->o');
  let __v2=await __v1!.call(provider) as any;
  return __v2;
 }
 async cancelLocationUpdate():Promise<void>{
  let __v1=await this.ensureFunc('cancelLocationUpdate','->');
  let __v2=await __v1!.call();
 }
 async getLocationProviders():Promise<string>{
  let __v1=await this.ensureFunc('getLocationProviders','->s');
  let __v2=await __v1!.call() as any;
  return __v2;
 }
 async getLightsInfo():Promise<Uint8Array>{
  let __v1=await this.ensureFunc('getLightsInfo','->b');
  let __v2=await __v1!.call() as any;
  return __v2;
 }
 async turnOnLight(id:number):Promise<void>{
  let __v1=await this.ensureFunc('turnOnLight','i->');
  let __v2=await __v1!.call(id);
 }
 async turnOffLight(id:number):Promise<void>{
  let __v1=await this.ensureFunc('turnOffLight','i->');
  let __v2=await __v1!.call(id);
 }
 async postNotification(notifyId:number,title:string,content:string):Promise<void>{
  let __v1=await this.ensureFunc('postNotification','iss->');
  let __v2=await __v1!.call(notifyId,title,content);
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