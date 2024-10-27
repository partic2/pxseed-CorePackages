import {RpcExtendClient1,RpcExtendClientCallable,RpcExtendClientObject} from 'pxprpc/extend'
import { getDefaultClient } from './pxprpc_config';
export class Invoker{
 RemoteName='AndroidHelper.Bluetooth';
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
 async initDefault():Promise<void>{
  let __v1=await this.ensureFunc('initDefault','->');
  let __v2=await __v1!.call();
 }
 async close():Promise<void>{
  let __v1=await this.ensureFunc('close','->');
  let __v2=await __v1!.call();
 }
 async describeBluetoothAdapterConstant():Promise<Uint8Array>{
  let __v1=await this.ensureFunc('describeBluetoothAdapterConstant','->b');
  let __v2=await __v1!.call() as any;
  return __v2;
 }
 async describeBluetoothDeviceConstant():Promise<Uint8Array>{
  let __v1=await this.ensureFunc('describeBluetoothDeviceConstant','->b');
  let __v2=await __v1!.call() as any;
  return __v2;
 }
 async describeAdapterState():Promise<Uint8Array>{
  let __v1=await this.ensureFunc('describeAdapterState','->b');
  let __v2=await __v1!.call() as any;
  return __v2;
 }
 async setName(name:string):Promise<void>{
  let __v1=await this.ensureFunc('setName','s->');
  let __v2=await __v1!.call(name);
 }
 async self():Promise<RpcExtendClientObject>{
  let __v1=await this.ensureFunc('self','->o');
  let __v2=await __v1!.call() as any;
  return __v2;
 }
 async asLeScanListener():Promise<RpcExtendClientObject>{
  let __v1=await this.ensureFunc('asLeScanListener','->o');
  let __v2=await __v1!.call() as any;
  return __v2;
 }
 async bluetoothAdapter():Promise<RpcExtendClientObject>{
  let __v1=await this.ensureFunc('bluetoothAdapter','->o');
  let __v2=await __v1!.call() as any;
  return __v2;
 }
 async requestBluetoothDicoverable(durationSec:number):Promise<void>{
  let __v1=await this.ensureFunc('requestBluetoothDicoverable','i->');
  let __v2=await __v1!.call(durationSec);
 }
 async requestEnableBluetooth():Promise<void>{
  let __v1=await this.ensureFunc('requestEnableBluetooth','->');
  let __v2=await __v1!.call();
 }
 async createBond(address:string):Promise<boolean>{
  let __v1=await this.ensureFunc('createBond','s->c');
  let __v2=await __v1!.call(address) as any;
  return __v2;
 }
 async removeBond(address:string):Promise<boolean>{
  let __v1=await this.ensureFunc('removeBond','s->c');
  let __v2=await __v1!.call(address) as any;
  return __v2;
 }
 async setAllowNoConfirmPairing(b:boolean):Promise<void>{
  let __v1=await this.ensureFunc('setAllowNoConfirmPairing','c->');
  let __v2=await __v1!.call(b);
 }
 async setPairPin(address:string,pin:Uint8Array):Promise<boolean>{
  let __v1=await this.ensureFunc('setPairPin','sb->c');
  let __v2=await __v1!.call(address,pin) as any;
  return __v2;
 }
 async onReceive(context:RpcExtendClientObject,intent:RpcExtendClientObject):Promise<void>{
  let __v1=await this.ensureFunc('onReceive','oo->');
  let __v2=await __v1!.call(context,intent);
 }
 async startDiscovery():Promise<void>{
  let __v1=await this.ensureFunc('startDiscovery','->');
  let __v2=await __v1!.call();
 }
 async cancelDiscovery():Promise<void>{
  let __v1=await this.ensureFunc('cancelDiscovery','->');
  let __v2=await __v1!.call();
 }
 async cleanDiscoveryResults():Promise<void>{
  let __v1=await this.ensureFunc('cleanDiscoveryResults','->');
  let __v2=await __v1!.call();
 }
 async describeDiscoveredDevices():Promise<Uint8Array>{
  let __v1=await this.ensureFunc('describeDiscoveredDevices','->b');
  let __v2=await __v1!.call() as any;
  return __v2;
 }
 async describeDiscoveredDevice(address:string):Promise<Uint8Array>{
  let __v1=await this.ensureFunc('describeDiscoveredDevice','s->b');
  let __v2=await __v1!.call(address) as any;
  return __v2;
 }
 async onLeScan(bluetoothDevice:RpcExtendClientObject,rssi:number,scanRecord:RpcExtendClientObject):Promise<void>{
  let __v1=await this.ensureFunc('onLeScan','oio->');
  let __v2=await __v1!.call(bluetoothDevice,rssi,scanRecord);
 }
 async listenRfcomm(name:string,uuid:string):Promise<RpcExtendClientObject>{
  let __v1=await this.ensureFunc('listenRfcomm','ss->o');
  let __v2=await __v1!.call(name,uuid) as any;
  return __v2;
 }
 async listenRfcommSecure(name:string,uuid:string):Promise<RpcExtendClientObject>{
  let __v1=await this.ensureFunc('listenRfcommSecure','ss->o');
  let __v2=await __v1!.call(name,uuid) as any;
  return __v2;
 }
 async connectRfcomm(address:string,uuid:string):Promise<RpcExtendClientObject>{
  let __v1=await this.ensureFunc('connectRfcomm','ss->o');
  let __v2=await __v1!.call(address,uuid) as any;
  return __v2;
 }
 async connectRfcommSecure(address:string,uuid:string):Promise<RpcExtendClientObject>{
  let __v1=await this.ensureFunc('connectRfcommSecure','ss->o');
  let __v2=await __v1!.call(address,uuid) as any;
  return __v2;
 }
 async querySupportUuids(address:string):Promise<Uint8Array>{
  let __v1=await this.ensureFunc('querySupportUuids','s->b');
  let __v2=await __v1!.call(address) as any;
  return __v2;
 }
 async listenL2cap():Promise<RpcExtendClientObject>{
  let __v1=await this.ensureFunc('listenL2cap','->o');
  let __v2=await __v1!.call() as any;
  return __v2;
 }
 async listenL2capSecure():Promise<RpcExtendClientObject>{
  let __v1=await this.ensureFunc('listenL2capSecure','->o');
  let __v2=await __v1!.call() as any;
  return __v2;
 }
 async socketAccept(s:RpcExtendClientObject,timeout:number):Promise<RpcExtendClientObject>{
  let __v1=await this.ensureFunc('socketAccept','oi->o');
  let __v2=await __v1!.call(s,timeout) as any;
  return __v2;
 }
 async socketRead(s:RpcExtendClientObject):Promise<Uint8Array>{
  let __v1=await this.ensureFunc('socketRead','o->b');
  let __v2=await __v1!.call(s) as any;
  return __v2;
 }
 async socketWrite(s:RpcExtendClientObject,b:Uint8Array):Promise<void>{
  let __v1=await this.ensureFunc('socketWrite','ob->');
  let __v2=await __v1!.call(s,b);
 }
 async socketClose(s:RpcExtendClientObject):Promise<void>{
  let __v1=await this.ensureFunc('socketClose','o->');
  let __v2=await __v1!.call(s);
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