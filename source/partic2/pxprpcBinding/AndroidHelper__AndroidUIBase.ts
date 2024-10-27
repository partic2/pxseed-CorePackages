import {RpcExtendClient1,RpcExtendClientCallable,RpcExtendClientObject} from 'pxprpc/extend'
import { getDefaultClient } from './pxprpc_config';
export class Invoker{
 RemoteName='AndroidHelper.AndroidUIBase';
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
 async dispatchKeyEvent(action:number,code:number):Promise<void>{
  let __v1=await this.ensureFunc('dispatchKeyEvent','ii->');
  let __v2=await __v1!.call(action,code);
 }
 async close():Promise<void>{
  let __v1=await this.ensureFunc('close','->');
  let __v2=await __v1!.call();
 }
 async indexOf(arr:RpcExtendClientObject,val:RpcExtendClientObject):Promise<number>{
  let __v1=await this.ensureFunc('indexOf','oo->i');
  let __v2=await __v1!.call(arr,val) as any;
  return __v2;
 }
 async createTouchPointer(init:Uint8Array):Promise<RpcExtendClientObject>{
  let __v1=await this.ensureFunc('createTouchPointer','b->o');
  let __v2=await __v1!.call(init) as any;
  return __v2;
 }
 async dispatchTouchEvent(action:number,touchPointers:RpcExtendClientObject):Promise<void>{
  let __v1=await this.ensureFunc('dispatchTouchEvent','io->');
  let __v2=await __v1!.call(action,touchPointers);
 }
 async webViewSetStartScript(script:string):Promise<void>{
  let __v1=await this.ensureFunc('webViewSetStartScript','s->');
  let __v2=await __v1!.call(script);
 }
 async webViewRunJs(script:string):Promise<void>{
  let __v1=await this.ensureFunc('webViewRunJs','s->');
  let __v2=await __v1!.call(script);
 }
 async getCurrentMainContent():Promise<RpcExtendClientObject>{
  let __v1=await this.ensureFunc('getCurrentMainContent','->o');
  let __v2=await __v1!.call() as any;
  return __v2;
 }
 async dialogEvent():Promise<RpcExtendClientObject>{
  let __v1=await this.ensureFunc('dialogEvent','->o');
  let __v2=await __v1!.call() as any;
  return __v2;
 }
 async dialogSet(dialog:RpcExtendClientObject,msg:string,show:boolean):Promise<void>{
  let __v1=await this.ensureFunc('dialogSet','osc->');
  let __v2=await __v1!.call(dialog,msg,show);
 }
 async dialogGet(dialog:RpcExtendClientObject):Promise<boolean>{
  let __v1=await this.ensureFunc('dialogGet','o->c');
  let __v2=await __v1!.call(dialog) as any;
  return __v2;
 }
 async dialogNew(btn1:string,id1:string,btn2:string,id2:string):Promise<void>{
  let __v1=await this.ensureFunc('dialogNew','ssss->');
  let __v2=await __v1!.call(btn1,id1,btn2,id2);
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