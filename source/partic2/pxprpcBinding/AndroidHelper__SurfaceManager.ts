import {RpcExtendClient1,RpcExtendClientCallable,RpcExtendClientObject} from 'pxprpc/extend'
import { getDefaultClient } from './pxprpc_config';
export class Invoker{
 RemoteName='AndroidHelper.SurfaceManager';
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
 async newSurface(width:number,height:number):Promise<RpcExtendClientObject>{
  let __v1=await this.ensureFunc('newSurface','ii->o');
  let __v2=await __v1!.call(width,height) as any;
  return __v2;
 }
 async getOpenglTexName(sur:RpcExtendClientObject):Promise<number>{
  let __v1=await this.ensureFunc('getOpenglTexName','o->i');
  let __v2=await __v1!.call(sur) as any;
  return __v2;
 }
 async listImageFormatConst():Promise<Uint8Array>{
  let __v1=await this.ensureFunc('listImageFormatConst','->b');
  let __v2=await __v1!.call() as any;
  return __v2;
 }
 async listPixelFormatConst():Promise<Uint8Array>{
  let __v1=await this.ensureFunc('listPixelFormatConst','->b');
  let __v2=await __v1!.call() as any;
  return __v2;
 }
 async newImageReader(width:number,height:number,format:number):Promise<RpcExtendClientObject>{
  let __v1=await this.ensureFunc('newImageReader','iii->o');
  let __v2=await __v1!.call(width,height,format) as any;
  return __v2;
 }
 async getImageInfo2(img:RpcExtendClientObject):Promise<[number,number,number,string]>{
  let __v1=await this.ensureFunc('getImageInfo2','o->iiis');
  let __v2=await __v1!.call(img) as any;
  return __v2;
 }
 async getImageInfo(img:RpcExtendClientObject):Promise<Uint8Array>{
  let __v1=await this.ensureFunc('getImageInfo','o->b');
  let __v2=await __v1!.call(img) as any;
  return __v2;
 }
 async newSurfaceFromImageReader(reader:RpcExtendClientObject):Promise<RpcExtendClientObject>{
  let __v1=await this.ensureFunc('newSurfaceFromImageReader','o->o');
  let __v2=await __v1!.call(reader) as any;
  return __v2;
 }
 async waitForImageAvailable(reader:RpcExtendClientObject):Promise<RpcExtendClientObject>{
  let __v1=await this.ensureFunc('waitForImageAvailable','o->o');
  let __v2=await __v1!.call(reader) as any;
  return __v2;
 }
 async accuireLastestImage(reader:RpcExtendClientObject):Promise<RpcExtendClientObject>{
  let __v1=await this.ensureFunc('accuireLastestImage','o->o');
  let __v2=await __v1!.call(reader) as any;
  return __v2;
 }
 async acquireNextImage(reader:RpcExtendClientObject):Promise<RpcExtendClientObject>{
  let __v1=await this.ensureFunc('acquireNextImage','o->o');
  let __v2=await __v1!.call(reader) as any;
  return __v2;
 }
 async describePlanesInfo(img:RpcExtendClientObject):Promise<Uint8Array>{
  let __v1=await this.ensureFunc('describePlanesInfo','o->b');
  let __v2=await __v1!.call(img) as any;
  return __v2;
 }
 async getPlaneBufferData(img:RpcExtendClientObject,planeIndex:number):Promise<Uint8Array>{
  let __v1=await this.ensureFunc('getPlaneBufferData','oi->b');
  let __v2=await __v1!.call(img,planeIndex) as any;
  return __v2;
 }
 async getPlaneBufferDataRange(img:RpcExtendClientObject,planeIndex:number,offset:number,len:number):Promise<Uint8Array>{
  let __v1=await this.ensureFunc('getPlaneBufferDataRange','oiii->b');
  let __v2=await __v1!.call(img,planeIndex,offset,len) as any;
  return __v2;
 }
 async packPlaneData(planes:RpcExtendClientObject):Promise<Uint8Array>{
  let __v1=await this.ensureFunc('packPlaneData','o->b');
  let __v2=await __v1!.call(planes) as any;
  return __v2;
 }
 async toPNG(img:RpcExtendClientObject,quality:number):Promise<Uint8Array>{
  let __v1=await this.ensureFunc('toPNG','oi->b');
  let __v2=await __v1!.call(img,quality) as any;
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