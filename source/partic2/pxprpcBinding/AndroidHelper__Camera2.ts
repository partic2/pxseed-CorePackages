import {RpcExtendClient1,RpcExtendClientCallable,RpcExtendClientObject} from 'pxprpc/extend'
import { getDefaultClient } from './pxprpc_config';
export class Invoker{
 RemoteName='AndroidHelper.Camera2';
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
 async closeAllOpenedResource():Promise<void>{
  let __v1=await this.ensureFunc('closeAllOpenedResource','->');
  let __v2=await __v1!.call();
 }
 async getBaseCamerasInfo():Promise<Uint8Array>{
  let __v1=await this.ensureFunc('getBaseCamerasInfo','->b');
  let __v2=await __v1!.call() as any;
  return __v2;
 }
 async close():Promise<void>{
  let __v1=await this.ensureFunc('close','->');
  let __v2=await __v1!.call();
 }
 async openCamera(id:string):Promise<RpcExtendClientObject>{
  let __v1=await this.ensureFunc('openCamera','s->o');
  let __v2=await __v1!.call(id) as any;
  return __v2;
 }
 async closeCamera(cam:RpcExtendClientObject):Promise<void>{
  let __v1=await this.ensureFunc('closeCamera','o->');
  let __v2=await __v1!.call(cam);
 }
 async setCaptureConfig1(camWrap:RpcExtendClientObject,imageWidth:number,imageHeight:number,flashMode:number,autoFocusMode:number):Promise<void>{
  let __v1=await this.ensureFunc('setCaptureConfig1','oiiii->');
  let __v2=await __v1!.call(camWrap,imageWidth,imageHeight,flashMode,autoFocusMode);
 }
 async setRenderTarget(cam:RpcExtendClientObject,sur:RpcExtendClientObject):Promise<void>{
  let __v1=await this.ensureFunc('setRenderTarget','oo->');
  let __v2=await __v1!.call(cam,sur);
 }
 async getCaptureConfigKeyConst():Promise<Uint8Array>{
  let __v1=await this.ensureFunc('getCaptureConfigKeyConst','->b');
  let __v2=await __v1!.call() as any;
  return __v2;
 }
 async getCaptureConfigValueConst():Promise<Uint8Array>{
  let __v1=await this.ensureFunc('getCaptureConfigValueConst','->b');
  let __v2=await __v1!.call() as any;
  return __v2;
 }
 async prepareCaptureRequest(camWrap:RpcExtendClientObject,capReq:RpcExtendClientObject):Promise<void>{
  let __v1=await this.ensureFunc('prepareCaptureRequest','oo->');
  let __v2=await __v1!.call(camWrap,capReq);
 }
 async requestAutoFocusAndAdjust(camWrap:RpcExtendClientObject,x:number,y:number,width:number,height:number):Promise<void>{
  let __v1=await this.ensureFunc('requestAutoFocusAndAdjust','oiiii->');
  let __v2=await __v1!.call(camWrap,x,y,width,height);
 }
 async requestDigitScale(camWrap:RpcExtendClientObject,l:number,t:number,r:number,b:number):Promise<void>{
  let __v1=await this.ensureFunc('requestDigitScale','oiiii->');
  let __v2=await __v1!.call(camWrap,l,t,r,b);
 }
 async requestContinuousCapture(camWrap:RpcExtendClientObject):Promise<void>{
  let __v1=await this.ensureFunc('requestContinuousCapture','o->');
  let __v2=await __v1!.call(camWrap);
 }
 async stopContinuousCapture(camWrap:RpcExtendClientObject):Promise<void>{
  let __v1=await this.ensureFunc('stopContinuousCapture','o->');
  let __v2=await __v1!.call(camWrap);
 }
 async requestOnceCapture(camWrap:RpcExtendClientObject):Promise<void>{
  let __v1=await this.ensureFunc('requestOnceCapture','o->');
  let __v2=await __v1!.call(camWrap);
 }
 async accuireLastestImageData(camDev:RpcExtendClientObject):Promise<RpcExtendClientObject>{
  let __v1=await this.ensureFunc('accuireLastestImageData','o->o');
  let __v2=await __v1!.call(camDev) as any;
  return __v2;
 }
 async describePlanesInfo(img:RpcExtendClientObject):Promise<Uint8Array>{
  let __v1=await this.ensureFunc('describePlanesInfo','o->b');
  let __v2=await __v1!.call(img) as any;
  return __v2;
 }
 async waitForImageAvailable(camDev:RpcExtendClientObject):Promise<RpcExtendClientObject>{
  let __v1=await this.ensureFunc('waitForImageAvailable','o->o');
  let __v2=await __v1!.call(camDev) as any;
  return __v2;
 }
 async getPlaneBufferData(img:RpcExtendClientObject,planeIndex:number):Promise<Uint8Array>{
  let __v1=await this.ensureFunc('getPlaneBufferData','oi->b');
  let __v2=await __v1!.call(img,planeIndex) as any;
  return __v2;
 }
 async packPlaneData(img:RpcExtendClientObject):Promise<Uint8Array>{
  let __v1=await this.ensureFunc('packPlaneData','o->b');
  let __v2=await __v1!.call(img) as any;
  return __v2;
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