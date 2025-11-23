
import * as React from 'preact'
import { css, DomComponent, ReactRefEx } from './domui';
import { WindowComponentProps, css as windowCss } from './window';
import {GenerateRandomString, Ref2, copy, future} from 'partic2/jsutils1/base'
import { appendFloatWindow, removeFloatWindow, WindowComponent } from './window';
import { getIconUrl } from 'partic2/pxseedMedia1/index1';


class CNewWindowHandleLists extends EventTarget{
    value=new Array<NewWindowHandle>();
}
export let NewWindowHandleLists=new CNewWindowHandleLists();

interface OpenNewWindopwOption{
    title?:string,
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
    //TODO: Find a good initial window place.
    let windowVNode=<WindowComponent ref={windowRef} onClose={()=>{
        closeFuture.setResult(true);
        removeFloatWindow(windowVNode);
        let at=NewWindowHandleLists.value.indexOf(handle);
        if(at>=0)NewWindowHandleLists.value.splice(at,1);
        NewWindowHandleLists.dispatchEvent(new Event('change'));
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


export interface TabInfo{
    id:string,
    title:string,
    container:Ref2<{forceUpdate:(callback:()=>void)=>void}|null>,
    renderPage:()=>React.ComponentChild,
    onRendered?:()=>void
    onClose():Promise<boolean>,
}

export abstract class TabInfoBase implements TabInfo{
    renderPage():React.ComponentChild{
        throw new Error('Not Implemented')
    }
    async onClose(): Promise<boolean> {
        return true;
    }
    id: string='';
    title: string='';
    container=new Ref2<{forceUpdate:(callback:()=>void)=>void}|null>(null);
    async init(initval:Partial<TabInfo>){
        for(let k in initval){
            (this as any)[k]=(initval as any)[k]
        }
        return this;
    }
    async requestPageViewUpdate(){
        let tabView=this.container.get();
        if(tabView!=null){
            return new Promise<void>(r=>tabView!.forceUpdate(r));
        }else{
            return new Promise<void>(r=>r())
        }
    }
}

