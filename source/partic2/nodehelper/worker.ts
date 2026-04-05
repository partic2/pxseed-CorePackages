import { GenerateRandomString, amdContext, future, requirejs } from "partic2/jsutils1/base";
import { BasicMessagePort, FunctionCallOverMessagePort, IWorkerThread, WebWorkerThread, getWWWRoot, lifecycle, setWorkerThreadImplementation } from "partic2/jsutils1/webutils";
import { MessagePort} from "worker_threads";
import {Worker as NWorker} from 'worker_threads'

import path from "path";



class NodeMessageEvent implements MessageEvent{
    data: any;
    lastEventId: string='';
    origin: string='*';
    ports: readonly globalThis.MessagePort[]=[];
    source: MessageEventSource | null=null;
    initMessageEvent(type: string, bubbles?: boolean | undefined, cancelable?: boolean | undefined, data?: any, origin?: string | undefined, lastEventId?: string | undefined, source?: MessageEventSource | null | undefined, ports?: globalThis.MessagePort[] | undefined): void {
        throw new Error("Method not implemented.");
    }
    bubbles: boolean=false;
    cancelBubble: boolean=false;
    cancelable: boolean=false;
    composed: boolean=false;
    currentTarget: EventTarget | null=null;
    defaultPrevented: boolean=false;
    eventPhase: number=0;
    isTrusted: boolean=true;
    returnValue: boolean=false;
    srcElement: EventTarget | null=null;
    target: EventTarget | null=null;
    timeStamp: number=0;
    type: string='message';
    composedPath(): EventTarget[] {
        throw new Error("Method not implemented.");
    }
    initEvent(type: string, bubbles?: boolean | undefined, cancelable?: boolean | undefined): void {
        throw new Error("Method not implemented.");
    }
    preventDefault(): void {
    }
    stopImmediatePropagation(): void {
    }
    stopPropagation(): void {
    }
    NONE= 0 as const;
    CAPTURING_PHASE= 1 as const;
    AT_TARGET= 2 as const;
    BUBBLING_PHASE= 3 as const;

}

export class MessagePortForNodeWorker implements BasicMessagePort{
    //Partial<MessagePort> is loose type restrict.
    constructor(public nodePort:{
        on(type:'message',cb:(a0:any)=>void):void,
        postMessage(data:any):void
    }){
        nodePort.on!('message',(val)=>this.onMessage(val))
    }
    
    listener= new Set<(msg: MessageEvent<any>) => void>();
    addEventListener(type: "message", cb: (msg: MessageEvent<any>) => void){
        this.listener.add(cb);
    }
    removeEventListener (type: "message", cb: (msg: MessageEvent<any>) => void){
        this.listener.delete(cb);
    }
    onMessage(data:any){
        let msgevt=new NodeMessageEvent();
            msgevt.source=this as any;
            msgevt.data=data;
        for(let t1 of this.listener){
            t1(msgevt)
        }
    }
    postMessage (data: any, opt?: { transfer?: Transferable[]; } | undefined){
        this.nodePort.postMessage!(data);
    }
}


class NodeWorkerThread extends WebWorkerThread{
    nodeWorker?:NWorker;
    protected async _createWorker(): Promise<BasicMessagePort> {
        this.nodeWorker=new NWorker(path.join(getWWWRoot(),'noderun.js'),{workerData:{entryModule:'partic2/nodehelper/workerentry'}});
        return new MessagePortForNodeWorker(this.nodeWorker!);
    }
}


var implSetuped=false;
export function setupImpl(){
    if(!implSetuped){
        setWorkerThreadImplementation(NodeWorkerThread);
    }
}