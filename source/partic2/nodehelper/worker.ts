import { GenerateRandomString, amdContext, future, requirejs } from "partic2/jsutils1/base";
import { BasicMessagePort, IWorkerThread, setWorkerThreadImplementation } from "partic2/jsutils1/webutils";
import { MessagePort} from "worker_threads";
import {Worker} from 'worker_threads'

const WorkerThreadMessageMark='__messageMark_WorkerThread'



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
    postMessage (data: any, opt?: { transfer: Transferable[]; } | undefined){
        this.nodePort.postMessage!(data);
    }
}

class NodeWorkerThread implements IWorkerThread{
    nodeWorker?:Worker;
    workerId='';
    port?:BasicMessagePort
    waitReady=new future<number>();
    constructor(workerId?:string){
        this.workerId=workerId??GenerateRandomString();
    };
    async start(){
        //Program started with noderun.js
        this.nodeWorker=new Worker(process.argv[1],{workerData:{entryModule:'partic2/nodehelper/workerentry'}});
        this.nodeWorker.on('message',(msgdata)=>{
            let msg={data:msgdata};
            if(typeof msg.data==='object' && msg.data[WorkerThreadMessageMark]){
                let {type,scriptId}=msg.data as {type:string,scriptId?:string};
                switch(type){
                    case 'run':
                        this.onHostRunScript(msg.data.script)
                        break;
                    case 'onScriptResolve':
                        this.onScriptResult(msg.data.result,scriptId)
                        break;
                    case 'onScriptReject':
                        this.onScriptReject(msg.data.reason,scriptId);
                        break;
                    case 'ready':
                        this.waitReady.setResult(0);
                        break;
                }
            }
        });
        await this.waitReady.get();
        await this.runScript(`global.__workerId='${this.workerId}'`)
        
        this.port=new MessagePortForNodeWorker(this.nodeWorker!)
    }
    onHostRunScript(script:string){
        (new Function('workerThread',script))(this);
    }
    processingScript={} as {[scriptId:string]:future<any>}
    async runScript(script:string,getResult?:boolean){
        let scriptId='';
        if(getResult===true){
            scriptId=GenerateRandomString();
            this.processingScript[scriptId]=new future<any>();
        }
            this.nodeWorker?.postMessage({[WorkerThreadMessageMark]:true,type:'run',script,scriptId})
        if(getResult===true){
            return await this.processingScript[scriptId].get();            
        }
    }
    onScriptResult(result:any,scriptId?:string){
        if(scriptId!==undefined && scriptId in this.processingScript){
            let fut=this.processingScript[scriptId];
            delete this.processingScript[scriptId];
            fut.setResult(result);
        }
    }
    onScriptReject(reason:any,scriptId?:string){
        if(scriptId!==undefined && scriptId in this.processingScript){
            let fut=this.processingScript[scriptId];
            delete this.processingScript[scriptId];
            fut.setException(new Error(reason));
        }
    }
}

var implSetuped=false;
export function setupImpl(){
    if(!implSetuped){
        setWorkerThreadImplementation(NodeWorkerThread);
    }
}