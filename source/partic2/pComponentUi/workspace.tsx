
import * as React from 'preact'
import { css, DomComponent, ReactRefEx } from './domui';
import { WindowComponentProps, css as windowCss } from './window';
import {GenerateRandomString, GetCurrentTime, Ref2, copy, future, mutex, partial, requirejs, sleep} from 'partic2/jsutils1/base'
import { appendFloatWindow, removeFloatWindow, WindowComponent } from './window';
import { getIconUrl } from 'partic2/pxseedMedia1/index1';
import { GetPersistentConfig, SavePersistentConfig } from 'partic2/jsutils1/webutils';
import {DebounceCall} from 'partic2/CodeRunner/jsutils2'

let __name__=requirejs.getLocalRequireModule(require);


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
    WindowComponentClass?:{new(prop:WindowComponentProps,ctx:any):WindowComponent}
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
    //For window has layoutHint
    saveWindowPosition?:()=>void
    forgetWindowPosition?:()=>void

}
export let WorkspaceWindowContext=React.createContext<{lastWindow?:NewWindowHandle}>({});
export let openNewWindow=async function(contentVNode:React.VNode,options?:OpenNewWindopwOption):Promise<NewWindowHandle>{
    options=options??{};
    let closeFuture=new future<boolean>();
    let windowRef=new ReactRefEx<WindowComponent>();
    let onWindowLayoutChange:(()=>void)|null=null;
    let handle={
        ...options,
        waitClose:async function(){
            await closeFuture.get();
        },
        close:async function(){
            for(let t1 of this.children){
                t1.close();
            }
            let at=NewWindowHandleLists.value.indexOf(handle);
            if(at>=0)NewWindowHandleLists.value.splice(at,1);
            NewWindowHandleLists.dispatchEvent(new Event('change'));
            if(onWindowLayoutChange!=null){
                let window1=await windowRef.waitValid();
                window1.removeEventListener('move',onWindowLayoutChange);
                window1.removeEventListener('resize',onWindowLayoutChange);
            }
            removeFloatWindow(windowVNode);
            closeFuture.setResult(true);
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
        async saveWindowPosition(){
            config1=await GetPersistentConfig(__name__);
            config1.savedWindowLayout![options.layoutHint!]={time:GetCurrentTime().getTime(),...(await windowRef.waitValid()).state.layout};
            await SavePersistentConfig(__name__);
        },
        async forgetWindowPosition(){
            config1=await GetPersistentConfig(__name__);
            delete config1.savedWindowLayout![options.layoutHint!]
            await SavePersistentConfig(__name__);
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
    
    let WindowComponentClass=options.WindowComponentClass??WindowComponent
    let windowVNode=<WindowComponentClass ref={windowRef} onClose={async ()=>{
        handle.close();
    }} onComponentDidUpdate={()=>{
        NewWindowHandleLists.dispatchEvent(new Event('change'));
    }} titleBarButton={[{
        icon:getIconUrl('minus.svg'),
        onClick:async()=>handle.hide()
    }]} title={options.title} {... (options.windowOptions??{})}
    ><WorkspaceWindowContext.Provider value={{lastWindow:handle}}>{contentVNode}</WorkspaceWindowContext.Provider></WindowComponentClass>;
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
        let saveLayout=new DebounceCall(handle.saveWindowPosition,3000);
        onWindowLayoutChange=()=>{
            saveLayout.call()
        }
        window1.addEventListener('move',onWindowLayoutChange);
        window1.addEventListener('resize',onWindowLayoutChange);
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

