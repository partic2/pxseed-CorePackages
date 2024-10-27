import {RpcExtendClient1,RpcExtendClientCallable,RpcExtendClientObject} from 'pxprpc/extend'
import { getDefaultClient } from './pxprpc_config';
export class Invoker{
 RemoteName='AndroidHelper.Intent';
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
 async requestInstallApk(apkPath:string):Promise<void>{
  let __v1=await this.ensureFunc('requestInstallApk','s->');
  let __v2=await __v1!.call(apkPath);
 }
 async requestOpenTelephone(tel:string):Promise<void>{
  let __v1=await this.ensureFunc('requestOpenTelephone','s->');
  let __v2=await __v1!.call(tel);
 }
 async requestSendShortMessage(tel:string,body:string):Promise<void>{
  let __v1=await this.ensureFunc('requestSendShortMessage','ss->');
  let __v2=await __v1!.call(tel,body);
 }
 async requestSendOthers(filePath:string,mime:string,chooserTitle:string):Promise<void>{
  let __v1=await this.ensureFunc('requestSendOthers','sss->');
  let __v2=await __v1!.call(filePath,mime,chooserTitle);
 }
 async requestOpenByDefaultHandler(uris:string):Promise<void>{
  let __v1=await this.ensureFunc('requestOpenByDefaultHandler','s->');
  let __v2=await __v1!.call(uris);
 }
 async requestOpenSetting(setting:string):Promise<void>{
  let __v1=await this.ensureFunc('requestOpenSetting','s->');
  let __v2=await __v1!.call(setting);
 }
 async getSettingProviderList():Promise<string>{
  let __v1=await this.ensureFunc('getSettingProviderList','->s');
  let __v2=await __v1!.call() as any;
  return __v2;
 }
 async requestOpenApplication(packageName:string,componentName:string,action:string):Promise<void>{
  let __v1=await this.ensureFunc('requestOpenApplication','sss->');
  let __v2=await __v1!.call(packageName,componentName,action);
 }
 async requestEnableBluetooth():Promise<void>{
  let __v1=await this.ensureFunc('requestEnableBluetooth','->');
  let __v2=await __v1!.call();
 }
 async requestBluetoothDicoverable(durationSec:number):Promise<void>{
  let __v1=await this.ensureFunc('requestBluetoothDicoverable','i->');
  let __v2=await __v1!.call(durationSec);
 }
 async requestImageCapture(imagePath:string):Promise<number>{
  let __v1=await this.ensureFunc('requestImageCapture','s->i');
  let __v2=await __v1!.call(imagePath) as any;
  return __v2;
 }
 async getContentUriForFile(path:string):Promise<string>{
  let __v1=await this.ensureFunc('getContentUriForFile','s->s');
  let __v2=await __v1!.call(path) as any;
  return __v2;
 }
 async requestSystemAlertWindowPermission():Promise<boolean>{
  let __v1=await this.ensureFunc('requestSystemAlertWindowPermission','->c');
  let __v2=await __v1!.call() as any;
  return __v2;
 }
 async requestOpenUniversalTypeFile(path:string):Promise<void>{
  let __v1=await this.ensureFunc('requestOpenUniversalTypeFile','s->');
  let __v2=await __v1!.call(path);
 }
 async getMimeTypeFromUri(uri:string):Promise<string>{
  let __v1=await this.ensureFunc('getMimeTypeFromUri','s->s');
  let __v2=await __v1!.call(uri) as any;
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