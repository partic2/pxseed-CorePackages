
import {defaultFuncMap,RpcExtendClient1,RpcExtendClientCallable,RpcExtendClientObject,RpcExtendServerCallable} from 'pxprpc/extend'
import { ConsoleDataEvent, LocalRunCodeContext, RunCodeContext,jsExecLib } from './CodeContext';


import { future, TextToJsString } from 'partic2/jsutils1/base';



export let __name__='partic2/CodeRunner/RemoteCodeContext';

let pxprpcNamespace=__name__


async function jsExecFn(source:string,arg:any){
    try{
        let r=new Function('arg','lib',`return (async ()=>{${source}})()`)(arg,jsExecLib);
        if(r instanceof Promise){
            r=await r;
        }
        return r;
    }catch(e){
        throw(e)
    }
}

defaultFuncMap[pxprpcNamespace+'.jsExecObj']=new RpcExtendServerCallable(jsExecFn).typedecl('so->o');
defaultFuncMap[pxprpcNamespace+'.jsExecStr']=new RpcExtendServerCallable(jsExecFn).typedecl('so->s');

/* 
remote code call like this
*/
async function __temp1(arg:any,lib:typeof jsExecLib){
}



let attached=new Map<string,RemoteRunCodeContext>();

export function getRemoteContext(client1:RpcExtendClient1){
    if(attached.has(client1.id)){
        return attached.get(client1.id)!;
    }else{
        attached.set(client1.id,new RemoteRunCodeContext(client1));
        return attached.get(client1.id)!;
    }
}

let rpcfunctionsProps=Symbol(__name__+'/'+'/rpcfunctions')


export class RemoteRunCodeContext implements RunCodeContext{
    public constructor(public client1:RpcExtendClient1){this.doInit();}
    event: EventTarget=new EventTarget();
    remoteEventQueue?:RpcExtendClientObject
    closed=false;
    protected async doInit(){
        //XXX:race condition
        if(rpcfunctionsProps in this.client1){
            let t1=(this.client1 as any)[rpcfunctionsProps];
            this.jsExecObj=t1.jsExecObj;
            this.jsExecStr=t1.jsExecStr;
        }else{
            this.jsExecObj=(await this.client1.getFunc(pxprpcNamespace+'.jsExecObj'))!.typedecl('so->o');
            this.jsExecStr=(await this.client1.getFunc(pxprpcNamespace+'.jsExecStr'))!.typedecl('so->s');
            (this.client1 as any)[rpcfunctionsProps]={
                jsExecObj:this.jsExecObj,
                jsExecStr:this.jsExecStr
            }
        }
        this.remoteContext=await this.remoteExecObj(`return new lib.LocalRunCodeContext();`,null)
        this.remoteEventQueue=await this.remoteExecObj(`return lib.CreateEventQueue(arg.event,['console.data']);`,this.remoteContext)
        this.pullEventInterval();
        this.initDone.setResult(true)
    }
    protected async pullEventInterval(){
        while(!this.closed){
            let evt=JSON.parse(await this.remoteExecStr(`return await arg.next();`,this.remoteEventQueue));
            if(evt.type=='console.data'){
                let e=new ConsoleDataEvent();
                e.data=evt.data;
                this.event.dispatchEvent(e);
            }
        }
    }
    protected jsExecObj:RpcExtendClientCallable|null=null;
    protected jsExecStr:RpcExtendClientCallable|null=null;
    protected remoteContext:RpcExtendClientObject|null=null;
    protected initDone=new future<boolean>();
    async remoteExecObj(source:string,arg:any):Promise<RpcExtendClientObject>{
        return await this.jsExecObj!.call(source,arg)
    }
    async remoteExecStr(source:string,arg:any):Promise<string>{
        return await this.jsExecStr!.call(source,arg);
    }
    async runCode(source: string,resultVariable?:string): Promise<{err:{message:string,stack?:string}|null,resultVariable?:'_'}> {
        await this.initDone.get();
        resultVariable=resultVariable??'_';
        source=TextToJsString(source);
        let r=await this.remoteExecStr(`
            let r=await arg.runCode('${source}','${resultVariable}');
            return JSON.stringify(r);`,this.remoteContext)
        return JSON.parse(r);
    }
    async codeComplete(code: string, caret: number) {
        await this.initDone.get();
        let source=TextToJsString(code);
        let ret=await this.remoteExecStr(
            `let r=await arg.codeComplete('${source}',${caret});
            return JSON.stringify(r);`,
            this.remoteContext)
        return JSON.parse(ret);
    }
    async jsExec(source: string): Promise<string> {
        await this.initDone.get();
        source=TextToJsString(source);
        return await this.remoteExecStr(`return await arg.jsExec('${source}')`,this.remoteContext)
    }
    async queryTooltip(code: string, caret: number): Promise<string> {
        await this.initDone.get();
        return '';
    }
    
    close(): void {
        this.remoteContext?.free();
        this.remoteEventQueue?.free();
    };
}