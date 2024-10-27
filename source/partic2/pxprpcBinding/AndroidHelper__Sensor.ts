import {RpcExtendClient1,RpcExtendClientCallable,RpcExtendClientObject} from 'pxprpc/extend'
import { getDefaultClient } from './pxprpc_config';
export class Invoker{
 RemoteName='AndroidHelper.Sensor';
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
 async getSensorList(filter:number):Promise<RpcExtendClientObject>{
  let __v1=await this.ensureFunc('getSensorList','i->o');
  let __v2=await __v1!.call(filter) as any;
  return __v2;
 }
 async listSensorFilter():Promise<string>{
  let __v1=await this.ensureFunc('listSensorFilter','->s');
  let __v2=await __v1!.call() as any;
  return __v2;
 }
 async getUid():Promise<string>{
  let __v1=await this.ensureFunc('getUid','->s');
  let __v2=await __v1!.call() as any;
  return __v2;
 }
 async setUid(uid:string):Promise<void>{
  let __v1=await this.ensureFunc('setUid','s->');
  let __v2=await __v1!.call(uid);
 }
 async self():Promise<RpcExtendClientObject>{
  let __v1=await this.ensureFunc('self','->o');
  let __v2=await __v1!.call() as any;
  return __v2;
 }
 async sensorStart(sensor:RpcExtendClientObject,samplePeriod:number):Promise<number>{
  let __v1=await this.ensureFunc('sensorStart','oi->i');
  let __v2=await __v1!.call(sensor,samplePeriod) as any;
  return __v2;
 }
 async sensorStop(sensor:RpcExtendClientObject):Promise<void>{
  let __v1=await this.ensureFunc('sensorStop','o->');
  let __v2=await __v1!.call(sensor);
 }
 async sensorStopAll():Promise<void>{
  let __v1=await this.ensureFunc('sensorStopAll','->');
  let __v2=await __v1!.call();
 }
 async getRunningSensor():Promise<RpcExtendClientObject>{
  let __v1=await this.ensureFunc('getRunningSensor','->o');
  let __v2=await __v1!.call() as any;
  return __v2;
 }
 async sendorListNames(sensorList:RpcExtendClientObject):Promise<string>{
  let __v1=await this.ensureFunc('sendorListNames','o->s');
  let __v2=await __v1!.call(sensorList) as any;
  return __v2;
 }
 async onSensorChanged(event:RpcExtendClientObject):Promise<void>{
  let __v1=await this.ensureFunc('onSensorChanged','o->');
  let __v2=await __v1!.call(event);
 }
 async packSensorEvent(event:RpcExtendClientObject):Promise<Uint8Array>{
  let __v1=await this.ensureFunc('packSensorEvent','o->b');
  let __v2=await __v1!.call(event) as any;
  return __v2;
 }
 async onAccuracyChanged(sensor:RpcExtendClientObject,accuracy:number):Promise<void>{
  let __v1=await this.ensureFunc('onAccuracyChanged','oi->');
  let __v2=await __v1!.call(sensor,accuracy);
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