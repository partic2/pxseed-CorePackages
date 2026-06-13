
import * as React from 'preact'
import { css, DomComponent, ReactRefEx } from './domui';
import { rootWindowsList, WindowComponentProps, css as windowCss } from './window';
import {GenerateRandomString, GetCurrentTime, Ref2, assert, copy, future, mutex, partial, requirejs, sleep} from 'partic2/jsutils1/base'
import { appendFloatWindow, removeFloatWindow, WindowComponent } from './window';
import { getIconUrl } from 'partic2/pxseedMedia1/index1';
import { GetPersistentConfig, SavePersistentConfig } from 'partic2/jsutils1/webutils';
import {ArrayWrap3, DebounceCall} from 'partic2/CodeRunner/jsutils2'

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
    saveWindowPosition?:()=>void,
    forgetWindowPosition?:()=>void,
}
export interface NewWindowRequestContext{
    contentVNode:React.VNode
    request:OpenNewWindopwOption;
    result:NewWindowHandle|null
}
export let WorkspaceWindowContext=React.createContext<{lastWindow?:NewWindowHandle}>({});


export let openNewWindowPipeline=new ArrayWrap3<{
    name:string,
    handler:(context:NewWindowRequestContext)=>(Promise<void>|void)
}>();

openNewWindowPipeline.arr().push({name:__name__+'.openNewWindowCreateWindow',handler:async (context)=>{
    let options=context.request;
    let contentVNode=context.contentVNode;
    let closeFuture=new future<boolean>();
    let windowRef=new ReactRefEx<WindowComponent>();
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
        async forgetWindowPosition(){
            config1=await GetPersistentConfig(__name__);
            delete config1.savedWindowLayout![options.layoutHint!]
            await SavePersistentConfig(__name__,config1);
        },
        windowRef,windowVNode:null as any,
        children:new Set<NewWindowHandle>()
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
    context.result=handle;
    NewWindowHandleLists.dispatchEvent(new Event('change'));
}});

openNewWindowPipeline.arr().push({name:__name__+'.openNewWindowLayoutWindow',handler:async (context)=>{
    let options=context.request;
    config1=await GetPersistentConfig(__name__);
    if(config1.savedWindowLayout==undefined){config1.savedWindowLayout={}};
    let layout1:{left:number,top:number,width?:number,height?:number}|null=null;
    if(options.layoutHint!=undefined && config1.savedWindowLayout[options.layoutHint]!=undefined){
        layout1=partial(config1.savedWindowLayout[options.layoutHint],['left','top','width','height']) as any;
        config1.savedWindowLayout[options.layoutHint].time=GetCurrentTime().getTime();
        await SavePersistentConfig(__name__,config1);
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
    let windowRef=context.result!.windowRef;
    let window1=await windowRef.waitValid();
    window1.setState({layout:{...layout1}})
    if(options.layoutHint!=undefined){
        context.result!.saveWindowPosition=async ()=>{
            config1=await GetPersistentConfig(__name__);
            if(config1.savedWindowLayout==undefined)config1.savedWindowLayout={};
            config1.savedWindowLayout[options.layoutHint!]={time:GetCurrentTime().getTime(),...(await windowRef.waitValid()).state.layout};
            let allEnt=Array.from(Object.entries(config1.savedWindowLayout!));
            if(allEnt.length>16){
                allEnt.sort((a,b)=>(a[1].time??0)-(b[1].time??0));
                for(let t1=0;allEnt.length-16;t1++){
                    delete config1.savedWindowLayout![allEnt[t1][0]]
                }
            }
            await SavePersistentConfig(__name__,config1);
        }
        let saveLayout=new DebounceCall(()=>context.result!.saveWindowPosition!(),3000);
        let onWindowLayoutChange=()=>{saveLayout.call()}
        window1.addEventListener('move',onWindowLayoutChange);
        window1.addEventListener('resize',onWindowLayoutChange);
        context.result!.waitClose().then(()=>{
            window1.removeEventListener('move',onWindowLayoutChange);
            window1.removeEventListener('resize',onWindowLayoutChange);
        })
    }
}})

export let openNewWindow=async function(contentVNode:React.VNode,options?:OpenNewWindopwOption):Promise<NewWindowHandle>{
    let context={contentVNode,request:options??{},result:null}
    let handlers=openNewWindowPipeline.arr();
    for(let t1 of handlers){
        await t1.handler(context);
    }
    assert(context.result!=null);
    return context.result;
}


let baseWindowComponnet:React.VNode|null=null
let baseWindowRef=new ReactRefEx<WindowComponent>();

const onRootWindowsListResize=()=>{
    if(baseWindowRef.current!=null){
        baseWindowRef.current.setState({layout:{left:0,top:0,
            width:rootWindowsList.current?.container?.current?.offsetWidth,
            height:rootWindowsList.current?.container?.current?.offsetWidth
        }})
    }
}
export function setBaseWindowView(vnode:React.VNode){
    if(baseWindowComponnet!=null){
        removeFloatWindow(baseWindowComponnet);
    }
    baseWindowComponnet=vnode;
    appendFloatWindow(<WindowComponent disableUserInputActivate={true} borderless={true} ref={baseWindowRef} initialLayout={{left:0,top:0,
        width:rootWindowsList.current?.container?.current?.offsetWidth,
        height:rootWindowsList.current?.container?.current?.offsetWidth}}>
        {vnode}
    </WindowComponent>);
    rootWindowsList.waitValid().then((wndList)=>{
        if(!wndList.onResize.has(onRootWindowsListResize)){
            wndList.onResize.add(onRootWindowsListResize);
        }
    });
    baseWindowRef.waitValid().then((wnd)=>wnd.activate(1));
}


export function setOpenNewWindowImpl(impl:(contentVNode:React.VNode,options?:OpenNewWindopwOption)=>Promise<NewWindowHandle>){
    openNewWindow=impl;
}

