
import * as React from 'preact'
import { css, DomComponent, ReactRefEx } from './domui';
import { WindowComponentProps, css as windowCss } from './window';
import {GenerateRandomString, GetCurrentTime, Ref2, copy, future, mutex, partial, requirejs, sleep} from 'partic2/jsutils1/base'
import { appendFloatWindow, removeFloatWindow, WindowComponent } from './window';
import { getIconUrl } from 'partic2/pxseedMedia1/index1';
import { GetPersistentConfig, SavePersistentConfig } from 'partic2/jsutils1/webutils';

let __name__=requirejs.getLocalRequireModule(require);

class DelayOnceCall{
    protected callId:number=1;
    protected result=new future();
    protected mut=new mutex();
    constructor(public fn:()=>Promise<void>,public delayMs:number){}
    async call(){
        if(this.callId==-1){
            //waiting fn return
            return await this.result.get();
        }
        this.callId++;
        let thisCallId=this.callId;
        await sleep(this.delayMs);
        if(thisCallId==this.callId){
        try{
            this.callId=-1;
            let r=await this.fn();
            this.result.setResult(r);
        }catch(e){
            this.result.setException(e);
        }finally{
            this.callId=1;
            let r2=this.result;
            this.result=new future();
            return r2.get();
        }}else{
            return await this.result.get();
        }
        
    }
}

class CNewWindowHandleLists extends EventTarget{
    value=new Array<NewWindowHandle>();
}
export let NewWindowHandleLists=new CNewWindowHandleLists();

let config1:{savedWindowLayout?:Record<string,{left:number,top:number,width?:number|string,height?:number|string,time?:number}>}={}

interface OpenNewWindopwOption{
    title?:string,
    //If specifed, the layout will be saved(For days?), to recover the layout when window with same layoutHint open again.
    layoutHint?:string
    parentWindow?:NewWindowHandle,
    windowOptions?:WindowComponentProps
}
export interface NewWindowHandle extends OpenNewWindopwOption{
    waitClose:()=>Promise<void>,
    close:()=>void,
    windowVNode:React.VNode
    windowRef:ReactRefEx<WindowComponent>,
    activate:()=>Promise<void>,
    hide:()=>Promise<void>,
    isHidden:()=>Promise<boolean>,
    children:Set<NewWindowHandle>,
}
export let WorkspaceWindowContext=React.createContext<{lastWindow?:NewWindowHandle}>({});
export let openNewWindow=async function(contentVNode:React.VNode,options?:OpenNewWindopwOption):Promise<NewWindowHandle>{
    options=options??{};
    let closeFuture=new future<boolean>();
    let windowRef=new ReactRefEx<WindowComponent>();
    let handle={
        ...options,
        waitClose:async function(){
            await closeFuture.get();
        },
        close:function(){
            for(let t1 of this.children){
                t1.close();
            }
            removeFloatWindow(windowVNode);
        },
        async activate(){
            (await this.windowRef.waitValid()).activate();
            for(let t1 of this.children){
                await t1.activate();
            }
        },
        async hide(){
            for(let t1 of this.children){
                await t1.hide();
            }
            (await this.windowRef.waitValid()).hide();
        },
        async isHidden(){
            return (await this.windowRef.waitValid()).isHidden()
        },
        windowRef,windowVNode:null as any,
        children:new Set<NewWindowHandle>()
    }
    config1=await GetPersistentConfig(__name__);
    if(config1.savedWindowLayout==undefined){config1.savedWindowLayout={}};
    let layout1:{left:number,top:number,width?:number|string,height?:number|string}|null=null;
    if(options.layoutHint!=undefined && config1.savedWindowLayout[options.layoutHint]!=undefined){
        layout1=partial(config1.savedWindowLayout[options.layoutHint],['left','top','width','height']) as any;
        config1.savedWindowLayout[options.layoutHint].time=GetCurrentTime().getTime();
        await SavePersistentConfig(__name__);
    }
    let allEnt=Array.from(Object.entries(config1.savedWindowLayout));
    if(allEnt.length>100){
        allEnt.sort((a,b)=>(a[1].time??0)-(b[1].time??0));
        for(let t1=0;allEnt.length-100;t1++){
            delete config1.savedWindowLayout[allEnt[t1][0]]
        }
        await SavePersistentConfig(__name__);
    }
    if(layout1==null){
        layout1={top:0,left:0}
        for(let t1=0;t1<window.innerHeight/2;t1+=20){
            let crowded=false;
            for(let t2 of NewWindowHandleLists.value){
                if(t2.windowRef.current!=null){
                    let top=t2.windowRef.current.state.layout.top;
                    if(top>=t1-10 && top<t1+10){
                        crowded=true;
                        break;
                    }
                }
            }
            if(!crowded){
                layout1.top=t1;
                layout1.left=t1/2;
                break;
            }
        }
    }
    let onWindowLayooutChange:(()=>void)|null=null;
    let windowVNode=<WindowComponent ref={windowRef} onClose={async ()=>{
        closeFuture.setResult(true);
        removeFloatWindow(windowVNode);
        let at=NewWindowHandleLists.value.indexOf(handle);
        if(at>=0)NewWindowHandleLists.value.splice(at,1);
        NewWindowHandleLists.dispatchEvent(new Event('change'));
        if(onWindowLayooutChange!=null){
            let window1=await windowRef.waitValid();
            window1.removeEventListener('move',onWindowLayooutChange);
            window1.removeEventListener('resize',onWindowLayooutChange);
        }
    }} onComponentDidUpdate={()=>{
        NewWindowHandleLists.dispatchEvent(new Event('change'));
    }} titleBarButton={[{
        icon:getIconUrl('minus.svg'),
        onClick:async()=>handle.hide()
    }]} title={options.title} {... (options.windowOptions??{})}
    ><WorkspaceWindowContext.Provider value={{lastWindow:handle}}>{contentVNode}</WorkspaceWindowContext.Provider></WindowComponent>;
    handle.windowVNode=windowVNode;
    appendFloatWindow(windowVNode,true);
    NewWindowHandleLists.value.push(handle);
    if(options.parentWindow!=undefined){
        options.parentWindow.children.add(handle);
    }
    NewWindowHandleLists.dispatchEvent(new Event('change'));
    let window1=await windowRef.waitValid();
    window1.setState({layout:{...layout1}})
    if(options.layoutHint!=undefined){
        let saveLayout=new DelayOnceCall(async ()=>{
            config1=await GetPersistentConfig(__name__);
            config1.savedWindowLayout![options.layoutHint!]={time:GetCurrentTime().getTime(),...(await windowRef.waitValid()).state.layout};
            await SavePersistentConfig(__name__);
        },3000);
        onWindowLayooutChange=()=>{
            saveLayout.call()
        }
        window1.addEventListener('move',onWindowLayooutChange);
        window1.addEventListener('resize',onWindowLayooutChange);
    }
    return handle;
}


let baseWindowComponnet:React.VNode|null=null
let baseWindowRef=new ReactRefEx<WindowComponent>();
export function setBaseWindowView(vnode:React.VNode){
    if(baseWindowComponnet!=null){
        removeFloatWindow(baseWindowComponnet);
    }
    baseWindowComponnet=vnode;
    appendFloatWindow(<WindowComponent disableUserInputActivate={true} noTitleBar={true} noResizeHandle={true}
        windowDivClassName={windowCss.borderlessWindowDiv} ref={baseWindowRef} initialLayout={{left:0,top:0,width:'100%',height:'100%'}}>
        {vnode}
    </WindowComponent>);
    baseWindowRef.waitValid().then((wnd)=>wnd.activate(1));
}


export function setOpenNewWindowImpl(impl:(contentVNode:React.VNode,options?:OpenNewWindopwOption)=>Promise<NewWindowHandle>){
    openNewWindow=impl;
}

