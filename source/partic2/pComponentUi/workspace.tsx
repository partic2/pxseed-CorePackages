
import * as React from 'preact'
import { css as baseCss, JsxClassComponent, ReactRefEx } from './domui';
import { DefaultWindowComponent, ensureRootWindowContainer, language, rootWindowGroup, WindowComponentProps, css as windowCss, WindowGroup } from './window';
import {GenerateRandomString, GetCurrentTime, Ref2, assert, copy, future, mutex, objectPickField, requirejs, sleep} from 'partic2/jsutils1/base'
import { appendFloatWindow, removeFloatWindow, WindowComponent } from './window';
import { getIconUrl } from 'partic2/pxseedMedia1/index1';
import { DynamicPageCSSManager, GetPersistentConfig, SavePersistentConfig } from 'partic2/jsutils1/webutils';
import {ArrayWrap3, DebounceCall} from 'partic2/CodeRunner/jsutils2'

let __name__=requirejs.getLocalRequireModule(require);

let cssPrefix=__name__.replace(/\//g,'-');

export let css={
    dialogBoxContainer:cssPrefix+'-dialogBoxContainer',
}

type NewWindowHandleListsChangeEventArg='hide'|'show'|'add'|'remove'
class CNewWindowHandleLists{
    value=new Array<NewWindowHandle>();
    onChange=JsxClassComponent.defineEventSlot<NewWindowHandleListsChangeEventArg>();
    
}
export let NewWindowHandleLists=new CNewWindowHandleLists();

let config1:{savedWindowLayout?:Record<string,{left:number,top:number,width?:number|string,height?:number|string,time?:number}>}={}

interface OpenNewWindopwOption{
    title?:string,
    //If specifed, the layout will be saved(For days?), to recover the layout when window with same layoutHint open again.
    layoutHint?:string
    initialLayout?:{left:number,top:number,width?:number,height?:number}
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


export class DefaultWorkspaceWindowComponent<Props={}> extends DefaultWindowComponent<Props>{
    protected beforeMaximizeSize:{left:number,top:number,width?:number,height?:number}|null=null;
    async onMaximizeClick(){
        await this.setMaximized(!this.getMaximized());
    }
    getMaximized(){
        return this.beforeMaximizeSize!=null;
    }
    static componentClassName=__name__+'.DefaultWorkspaceWindowComponent';
    componentDidMount(): void {
        super.componentDidMount();
        this.userMoveEvent.setListener(DefaultWorkspaceWindowComponent.componentClassName,()=>{this.beforeMaximizeSize=null;});
        this.userResizeEvent.setListener(DefaultWorkspaceWindowComponent.componentClassName,()=>{this.beforeMaximizeSize=null;});
    }
    componentWillUnmount(): void {
        this.userMoveEvent.clearListener(DefaultWorkspaceWindowComponent.componentClassName)
        this.userResizeEvent.clearListener(DefaultWorkspaceWindowComponent.componentClassName)
        super.componentWillUnmount();
    }
    async setMaximized(maximized:boolean){
        if(maximized){
            this.beforeMaximizeSize={...this.currentLayout};
            let containerDiv=await this.rref.container.waitValid();
            this.layout({left:0,top:0,
                width:(containerDiv.offsetParent as HTMLElement).offsetWidth,
                height:(containerDiv.offsetParent as HTMLElement).offsetHeight});
        }else{
            if(this.beforeMaximizeSize!=null){
                this.layout({...this.beforeMaximizeSize});
            }
            this.beforeMaximizeSize=null;
        }
    }
    renderTitleIcons(){
        return [
            ...(this.titleBarButton??[]).map(t1=>this.renderIcon(t1.icon,t1.onClick)),
            this.renderIcon(getIconUrl('maximize-2.svg'),()=>this.onMaximizeClick()),
            this.renderIcon(this.closeIcon!,()=>this.onCloseClick())
        ]
    }
    hide(): void {
        super.hide();
        NewWindowHandleLists.onChange.dispatch('hide')
    }
    activate(activateTime?:number): void {
        super.activate(activateTime);
        NewWindowHandleLists.onChange.dispatch('show')
    }
}

export let WorkspaceWindowUtils={
    async centerWindow(windowComponent:WindowComponent){
        let windowGroup=windowComponent.getAncestorJsxClassComponents({clazz:WindowGroup,count:1}).at(0);
        if(windowGroup!=undefined){
            for(let t1=0;t1<40;t1++){
                let wndSize=windowGroup.getSize();
                let width=windowComponent.rref.container.current?.offsetWidth??0;
                let height=windowComponent.rref.container.current?.offsetHeight??0;
                if(width>wndSize.width-5)width=wndSize.width-5;
                if(height>wndSize.height-5)height=wndSize.height-5;
                let left=(wndSize.width-width)>>1;
                let top=(wndSize.height-height)>>1;
                if(left!=windowComponent.currentLayout.left || top!=windowComponent.currentLayout.top){
                    await windowComponent.layout({...windowComponent.currentLayout,left:left,top:top});
                }
                if(!windowComponent.sizeMeasuring.get())break;
                await sleep(25);
            }
        }
    }
}

export const WorkspaceWindowComponent=DefaultWorkspaceWindowComponent;
export type WorkspaceWindowComponent=DefaultWorkspaceWindowComponent;

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
            if(!closeFuture.done){
                closeFuture.setResult(true);
                removeFloatWindow(windowVNode);
                for(let t1 of this.children){
                    t1.close();
                }
                let at=NewWindowHandleLists.value.indexOf(handle);
                if(at>=0)NewWindowHandleLists.value.splice(at,1);
                NewWindowHandleLists.onChange.dispatch('remove');
            }
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
    let WindowComponentClass=options.WindowComponentClass??WorkspaceWindowComponent
    let windowVNode=<WindowComponentClass ref={windowRef} onClose={async ()=>{
        handle.close();
    }} titleBarButton={[{
        icon:getIconUrl('minus.svg'),
        onClick:async()=>handle.hide()
    }]} title={options.title} {... (options.windowOptions??{})}
    >{contentVNode}</WindowComponentClass>;
    handle.windowVNode=windowVNode;
    appendFloatWindow(windowVNode,true);
    if(options.parentWindow!=undefined){
        options.parentWindow.children.add(handle);
    }
    NewWindowHandleLists.value.push(handle);
    NewWindowHandleLists.onChange.dispatch('add');
    context.result=handle;
}});

openNewWindowPipeline.arr().push({name:__name__+'.openNewWindowLayoutWindow',handler:async (context)=>{
    let options=context.request;
    config1=await GetPersistentConfig(__name__);
    if(config1.savedWindowLayout==undefined){config1.savedWindowLayout={}};
    let windowRef=context.result!.windowRef;
    let window1=await windowRef.waitValid();
    
    if(options.windowOptions?.borderless!=true){
        let layout1=context.request?.initialLayout??null;
        if(layout1==null &&options.layoutHint!=undefined && config1.savedWindowLayout[options.layoutHint]!=undefined){
            layout1=objectPickField(config1.savedWindowLayout[options.layoutHint],['left','top','width','height']) as any;
            config1.savedWindowLayout[options.layoutHint].time=GetCurrentTime().getTime();
            await SavePersistentConfig(__name__,config1);
        }
        if(layout1==null){
            layout1={top:0,left:0}
            for(let t1=0;t1<window.innerHeight/2;t1+=20){
                let crowded=false;
                for(let t2 of NewWindowHandleLists.value){
                    if(t2.windowRef.current!=null){
                        let top=t2.windowRef.current.currentLayout.top;
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
        await window1.layout(layout1);
        if(options.layoutHint!=undefined){
            context.result!.saveWindowPosition=async ()=>{
                config1=await GetPersistentConfig(__name__);
                if(config1.savedWindowLayout==undefined)config1.savedWindowLayout={};
                config1.savedWindowLayout[options.layoutHint!]={time:GetCurrentTime().getTime(),...(await windowRef.waitValid()).currentLayout};
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
            let layoutHintTracer=__name__+'.layoutHintTracer';
            window1.moveEvent.setListener(layoutHintTracer,()=>{saveLayout.call()});
            window1.resizeEvent.setListener(layoutHintTracer,()=>{saveLayout.call()});
            context.result!.waitClose().then(()=>{
                window1.moveEvent.clearListener(layoutHintTracer);
                window1.resizeEvent.clearListener(layoutHintTracer);
            })
        }
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


export function setBaseWindowView(vnode:React.VNode){
    ensureRootWindowContainer();
    if(baseWindowComponnet!=null){
        removeFloatWindow(baseWindowComponnet);
    }
    baseWindowComponnet=vnode;
    appendFloatWindow(<WindowComponent disableUserInputActivate={true} borderless={true} ref={baseWindowRef} >
        {vnode}
    </WindowComponent>);
    rootWindowGroup.waitValid().then((wndGroup) => {
        wndGroup.resizeEvent.setListener(__name__ + '.setBaseWindowView', () => {
            if (baseWindowRef.current != null) {
                let wndSize = wndGroup.getSize();
                baseWindowRef.current.layout({
                    left: 0, top: 0,
                    width: wndSize.width,
                    height: wndSize.height
                });
            }
        });
        baseWindowRef.waitValid().then((baseWindow) => {
            let wndSize = wndGroup.getSize();
            baseWindow.layout({
                left: 0, top: 0,
                width: wndSize.width,
                height: wndSize.height

            })
        });
    });
    baseWindowRef.waitValid().then((wnd)=>wnd.activate(1));
}


export function setOpenNewWindowImpl(impl:(contentVNode:React.VNode,options?:OpenNewWindopwOption)=>Promise<NewWindowHandle>){
    openNewWindow=impl;
}


let i18n={
    caution:'',
    ok:'',
    cancel:'',
    dialogBox:''
}

language.watch((r)=>{
    let lang=r.get();
    if(lang==='zh-CN'){
        i18n.caution='提醒'
        i18n.ok='确认'
        i18n.cancel='取消';
        i18n.dialogBox='对话框'
    }else{
        i18n.caution='caution'
        i18n.ok='ok'
        i18n.cancel='cancel';
        i18n.dialogBox='dialog box'
    }
});

language.set(language.get());

export let defaultDialogBoxImplemention={
    dialogContainerWindow:null as NewWindowHandle|null,
    async ensureDialogContainerWindowWindow(){
        if(this.dialogContainerWindow==null){
            //XXX:Should we use mask to prevent user input outside the dialog box?
            this.dialogContainerWindow=await openNewWindow(<div></div>,
            {windowOptions:{borderless:true,disableUserInputActivate:true},title:i18n.dialogBox});
            NewWindowHandleLists.onChange.setListener(__name__+'.defaultDialogBoxImplemention.newWindowHandleListsChange',(e)=>{
                this.newWindowHandleListsChange(e);
            })
        }
    },
    newWindowHandleListsChange:function(ev:string){
        if(this.dialogContainerWindow!=null){
            let hasDialog=NewWindowHandleLists.value.some(t1=>t1.parentWindow==this.dialogContainerWindow);
            if(!hasDialog){
                this.dialogContainerWindow.close();
                this.dialogContainerWindow=null;
                NewWindowHandleLists.onChange.clearListener(__name__+'.defaultDialogBoxImplemention.newWindowHandleListsChange');
            }
        }
    },
    async alertImpl(message:React.ComponentChild,title?:string){
        await this.ensureDialogContainerWindowWindow();
        let result=new future<'ok'|'closed'>();
        let newWnd=await openNewWindow(<div className={css.dialogBoxContainer}
        style={{width:'100%',height:'100%',minWidth:Math.min((rootWindowGroup.current?.container.current?.offsetWidth)??0-10,300),whiteSpace:'pre-wrap'}}>
            {message}
            <div className={[baseCss.flexRow].join(' ')}>
                <input type='button' style={{flexGrow:'1'}} onClick={()=>result.setResult('ok')} value={i18n.ok}/>
            </div>
        </div>,{title:title??i18n.caution,parentWindow:this.dialogContainerWindow!});
        newWnd.waitClose().then(()=>result.setResult('closed'));
        WorkspaceWindowUtils.centerWindow(await newWnd.windowRef.waitValid());
        let r=await result.get();
        if(r=='ok'){
            newWnd.close();
        }
    },
    alert:(...args:any[])=>(defaultDialogBoxImplemention.alertImpl as any)(...args),
    async confirmImpl(message:React.ComponentChild,title?:string):Promise<'ok'|'cancel'>{
        await this.ensureDialogContainerWindowWindow();
        let result=new future<'ok'|'cancel'|'closed'>();
        let newWnd=await openNewWindow(<div className={css.dialogBoxContainer}
        style={{width:'100%',height:'100%',minWidth:Math.min((rootWindowGroup.current?.container.current?.offsetWidth)??0-10,300),whiteSpace:'pre-wrap'}}>
                {message}
                <div className={[baseCss.flexRow].join()}>
                    <input type='button' style={{flexGrow:'1'}} onClick={()=>result.setResult('ok')} value={i18n.ok}/>
                    <input type='button' style={{flexGrow:'1'}} onClick={()=>result.setResult('cancel')} value={i18n.cancel}/>
                </div>
            </div>,{title:title??i18n.caution,parentWindow:this.dialogContainerWindow!});
        newWnd.waitClose().then(()=>result.setResult('closed'));
        WorkspaceWindowUtils.centerWindow(await newWnd.windowRef.waitValid());
        let r=await result.get();
        if(r=='closed'){
            r='cancel';
        }else{
            newWnd.close();
        }
        return r;
    },
    confirm:(...args:any[])=>(defaultDialogBoxImplemention.confirmImpl as any)(...args),
    async promptImpl(form:React.ComponentChild,opt?:{
        onButtonClick?:(clicked:'ok'|'cancel')=>void
        title?:string,
        noButton?:boolean
    }|string){
        await this.ensureDialogContainerWindowWindow();
        let result=new future<'ok'|'cancel'>();
        if(typeof opt==='string'){
            opt={title:opt}
        }
        if(opt==undefined){
            opt={};
        }
        let title=opt.title;
        let newWnd=await openNewWindow(<div className={[baseCss.flexColumn,css.dialogBoxContainer].join(' ')} style={{height:'100%',width:'100%'}}>
                {form}
                {(opt!.noButton!==true)?<div className={[baseCss.flexRow].join(' ')}>
                    <input type='button' style={{flexGrow:'1'}} onClick={()=>{
                        result.setResult('ok');
                        opt?.onButtonClick?.('ok');
                    }} value={i18n.ok}/>
                    <input type='button' style={{flexGrow:'1'}} onClick={()=>{
                        result.setResult('cancel');
                        opt?.onButtonClick?.('cancel');
                    }} value={i18n.cancel}/>
                </div>:null}
            </div>,{title:title??i18n.caution,parentWindow:this.dialogContainerWindow!});
        newWnd.waitClose().then(()=>result.setResult('cancel'));
        WorkspaceWindowUtils.centerWindow(await newWnd.windowRef.waitValid());
        return {
            response:result,
            close:()=>newWnd.close()
        }
    },
    prompt:(...args:any[])=>(defaultDialogBoxImplemention.promptImpl as any)(...args),
};

export let __inited__=new Promise<void>(resolve=>resolve());

