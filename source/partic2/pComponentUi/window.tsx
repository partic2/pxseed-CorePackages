
import * as React from 'preact'
import { css as cssBase, DomDivComponent, DomRootComponent, FloatLayerComponent, JsxClassComponent, ReactRefEx, ReactRender } from './domui';
import { future, GenerateRandomString, GetCurrentTime, Ref2, requirejs, sleep } from 'partic2/jsutils1/base';
import { DynamicPageCSSManager } from 'partic2/jsutils1/webutils';
import { PointTrace } from './transform';

export let language=new Ref2<string>('en');

let __name__=requirejs.getLocalRequireModule(require);

export interface WindowComponentProps{
    closeIcon?:string|null
    title?:string
    titleBarButton?:Array<{icon:string,onClick:()=>void}>
    onClose?:()=>void
    borderless?:boolean
    disableUserInputActivate?:boolean
    keepTop?:boolean
    onComponentDidUpdate?:()=>void
}



import {getIconUrl} from 'partic2/pxseedMedia1/index1'

let cssPrefix=__name__.replace(/\//g,'-');

export let css={
    defaultWindowDiv:cssPrefix+'-defaultWindowDiv',
    borderlessWindowContentDiv:cssPrefix+'-borderlessWindowContentDiv',
    defaultContentDiv:cssPrefix+'-defaultContentDiv',
    defaultTitleStyle:cssPrefix+'-defaultTitleStyle',
}

if(globalThis.document!=undefined){
    DynamicPageCSSManager.PutCss('.'+css.defaultWindowDiv,['box-sizing: border-box','pointer-events:auto']);
    DynamicPageCSSManager.PutCss('.'+css.defaultContentDiv ,['box-sizing: border-box','flex-grow:1','background-color:white','overflow:auto','border:solid black 1px','min-height:0px','min-width:0px'])
    DynamicPageCSSManager.PutCss('.'+css.borderlessWindowContentDiv,['pointer-events:auto','flex-grow:1','box-sizing: border-box','min-height:0px','min-width:0px']);
    DynamicPageCSSManager.PutCss('.'+css.defaultTitleStyle ,['box-sizing: border-box','background-color:silver','color:balck','border-left:solid black 1px','border-top:solid black 1px','border-right:solid black 1px'])    
}

export class DefaultWindowComponent<Props=WindowComponentProps> extends JsxClassComponent<Props>{
    static getDerivedStateFromError(error: any): object | null {
        return {errorOccured:error};
    }
    closeIcon=getIconUrl('x.svg');
    title='untitled';
    titleBarButton?:Array<{icon:string,onClick:()=>void}>
    onClose?:()=>void
    borderless?:boolean
    disableUserInputActivate?:boolean
    keepTop?:boolean
    onComponentDidUpdate?:()=>void

    activateTime:number=0;
    currentLayout:{left:number,top:number,width?:number,height?:number}={left:0,top:0}
    errorOccured:Error|null=null
    children:React.ComponentChildren|null=null;
    rref={
        container:new ReactRefEx<HTMLDivElement>(),
        contentDiv:new ReactRefEx<HTMLDivElement>()
    }
    resizeEvent=JsxClassComponent.defineEventSlot<void>();
    moveEvent=JsxClassComponent.defineEventSlot<void>();
    __resizeObserver=new ResizeObserver(()=>this.resizeEvent.dispatch());
    componentDidMount(): void {
        if(this.rref.container.current!=undefined){
            this.__resizeObserver.observe(this.rref.container.current);
        }
    }
    componentWillUnmount(): void {
        this.__resizeObserver.disconnect();
    }
    renderIcon(url:string|null,onClick:()=>void){
        if(url==null){
            return null;
        }
        if(url.indexOf(':')>=0){
            return <div className={cssBase.simpleCard} onClick={onClick} >
                <img src={url} width='16' height='16'/>
            </div>
        }else{
            return <div className={cssBase.simpleCard} onClick={onClick} style={{userSelect:'none'}}>
            {url}
        </div>
        }
    }
    userMoveEvent=JsxClassComponent.defineEventSlot<void>();
    __wndMove=new PointTrace({
        onMove:(curr,start)=>{
            this.layout({left:curr.x-start.x,top:curr.y-start.y});
            this.userMoveEvent.dispatch();
        }
    });
    __onTitleMouseDownHandler=(evt:React.TargetedPointerEvent<HTMLDivElement>)=>{
        this.__wndMove.start({x:evt.clientX-this.currentLayout.left,y:evt.clientY-this.currentLayout.top},true);
        evt.preventDefault();
    }
    userResizeEvent=JsxClassComponent.defineEventSlot<void>();
    __wndResize=new PointTrace({
        onMove:(curr,start)=>{
            this.layout({...this.currentLayout,width:curr.x-start.x,height:curr.y-start.y});
            this.userResizeEvent.dispatch();
        }
    });
    __onResizeIconMouseDownHandler=(evt:React.TargetedPointerEvent<HTMLDivElement>)=>{
        this.__wndResize.start({x:this.currentLayout.left,y:this.currentLayout.top},true);
        evt.preventDefault();
    }
    activate(activateTime?:number){
        if(this.keepTop){
            activateTime=95617573200000;
        }
        this.activateTime=activateTime??GetCurrentTime().getTime();
        this.setState({},()=>{windowsContainerForceUpdate();});
    }
    hide(){
        this.activateTime=-1;
        this.setState({},()=>{windowsContainerForceUpdate();});
    }
    isHidden(){
        return this.activateTime<0&&!this.keepTop
    }
    renderTitleIcons(){
        return [
            ...(this.titleBarButton??[]).map(t1=>this.renderIcon(t1.icon,t1.onClick)),
            this.renderIcon(this.closeIcon!,()=>this.onCloseClick())
        ]
    }
    getLayout(){
        return this.currentLayout;
    }
    async layout(layout:{left?:number,top?:number,width?:number,height?:number}){
        return new Promise<void>((resolve)=>{
            let newLayout={...this.currentLayout,...layout};
            let oldLayout=this.currentLayout;
            let windowGroup=this.getAncestorJsxClassComponents({clazz:WindowGroup,count:1}).at(0);
            if(windowGroup!=undefined){
                let windowGroupSize=windowGroup.getSize();
                if(newLayout.width!=undefined && newLayout.left+newLayout.width>windowGroupSize.width){
                    newLayout.width=windowGroupSize.width-newLayout.left;
                }
                if(newLayout.height!=undefined && newLayout.top+newLayout.height>windowGroupSize.height){
                    newLayout.height=windowGroupSize.height-newLayout.top;
                }
            }
            this.currentLayout=newLayout;
            this.setState({},()=>{
                if(newLayout.left!=oldLayout.left || newLayout.top!=oldLayout.top){
                    this.moveEvent.dispatch();
                }
                resolve();
            })
        });
    }
    renderTitle(){
        let titleString=this.title;
        if(typeof titleString!=='string'){
            titleString=''
        }
        return <div className={[cssBase.flexRow,css.defaultTitleStyle].join(' ')} style={{alignItems:'center'}}>
                <div style={{flexGrow:'1',cursor:'move',userSelect:'none',overflowY:'auto',touchAction:'none'}} 
                onPointerDown={this.__onTitleMouseDownHandler} >
                {titleString.replace(/ /g,String.fromCharCode(160))}</div>&nbsp;
                {this.renderTitleIcons()}
        </div>
    }
    renderContent(){
        return <div 
            className={[this.borderless?css.borderlessWindowContentDiv:css.defaultContentDiv].join(' ')} ref={this.rref.contentDiv}>
                {this.errorOccured==null?this.children:<pre style={{backgroundColor:'white',color:'black'}}>
                    {this.errorOccured.message}
                    {this.errorOccured.stack}
                </pre>}
        </div>
    }
    renderResizeHandler(){
        return <img src={getIconUrl('arrow-down-right.svg')} 
            style={{
                position:'absolute',cursor:'nwse-resize',
                right:'0px',bottom:'0px',touchAction:'none',
                backgroundColor:'white'}} 
                onPointerDown={this.__onResizeIconMouseDownHandler} 
            width="12" height="12"
            />
    }
    closeEvent=JsxClassComponent.defineEventSlot<void>();
    async onCloseClick(){
        this.hide();
        this.closeEvent.dispatch();
        this.onClose?.();
    }
    sizeMeasuring=new Ref2(false);
    async sizeToContent(){
        this.sizeMeasuring.set(true);
        let width=0;
        let height=0;
        let stableCount=0;
        for(let t1=0;t1<40&&this.sizeMeasuring.get();t1++){
            await sleep(25);
            let newWidth=this.rref.container.current?.offsetWidth??0;
            let newHeight=this.rref.container.current?.offsetHeight??0;
            if(width!=newWidth || height!=newHeight){
                width=newWidth;
                height=newHeight;
                stableCount=0;
            }else{
                stableCount++;
            }
            if(stableCount>=8)break;
        }
        let windowGroup=this.getAncestorJsxClassComponents({clazz:WindowGroup,count:1}).at(0);
        if(this.sizeMeasuring.get() && this.rref.container.current!=null && windowGroup!=undefined && (this.currentLayout.width==undefined || this.currentLayout.height==undefined)){
            let layout={...this.currentLayout,width:width+1,height:height+1};
            this.layout(layout);
        }
        this.sizeMeasuring.set(false);
    }
    renderWindowMain(){
        try{
            if(!this.borderless){
                if((this.currentLayout.width==undefined||this.currentLayout.height==undefined)&&!this.sizeMeasuring.get()){
                    let windowGroup=this.getAncestorJsxClassComponents({clazz:WindowGroup,count:1}).at(0);
                    if(windowGroup!=undefined)this.sizeToContent();
                }else if(this.currentLayout.width!=undefined && this.currentLayout.height!=undefined && this.sizeMeasuring.get()){
                    this.sizeMeasuring.set(false);
                }
            }
            let windowDivStyle:React.CSSProperties={
                position:'absolute',
                left:this.currentLayout.left+'px',
                top:this.currentLayout.top+'px',
                touchAction:'none'
            };
            if(this.currentLayout.width!=undefined){
                windowDivStyle.width=this.currentLayout.width+'px';
            }
            if(this.currentLayout.height!=undefined){
                windowDivStyle.height=this.currentLayout.height+'px';
            }
            return <div className={[cssBase.flexColumn,css.defaultWindowDiv].join(' ')} 
                style={windowDivStyle}
                ref={this.rref.container}
                onPointerDown={()=>{
                    if(this.activateTime>=0 && !this.disableUserInputActivate)
                        this.activate()
                }}>
                    {this.borderless?null:this.renderTitle()}
                    {[
                        this.renderContent(),
                        (this.borderless)?null:this.renderResizeHandler()
                    ]}
            </div>
        }catch(err:any){
            return <div>{err.message+err.stack}</div>
        }
    }
    componentDidUpdate(): void {
        this.onComponentDidUpdate?.();
    }
    jsx(): React.ComponentChild {
        return <FloatLayerComponent activateTime={this.activateTime}>
            {this.renderWindowMain()}
        </FloatLayerComponent> 
    }
}

export let WindowComponent=DefaultWindowComponent;
export type WindowComponent=DefaultWindowComponent;

export function setDefaultWindowComponentImplemention(impl:typeof DefaultWindowComponent){
    WindowComponent=impl;
}

export class WindowGroup<Props={}> extends JsxClassComponent<Props&{divStyle?:React.CSSProperties}>{
    container=new ReactRefEx<HTMLDivElement>();
    floatWindowVNodes=new Array<React.VNode>();
    resizeEvent=JsxClassComponent.defineEventSlot<void>();
    resizeObserver=new ResizeObserver((ent)=>{this.resizeEvent.dispatch()})
    async componentDidMount() {
        this.resizeObserver.observe(await this.container.waitValid());
    }
    async componentWillUnmount() {
        this.resizeObserver.disconnect();
    }
    jsx(): React.ComponentChild {
        return <div style={{width:'100%',height:'100%',...this.props.divStyle}} ref={this.container}>{this.floatWindowVNodes}</div>
    }
    appendFloatWindow(window:React.VNode,active?:boolean){
        active=active??true;
        let ref2=new ReactRefEx<React.VNode>().forward([window.ref].filter(v=>v!=undefined) as React.Ref<any>[]);
        window.ref=ref2;
        if(window.key==undefined){
            window.key=GenerateRandomString();
        }
        this.floatWindowVNodes.push(window);
        if(active){
            ref2.waitValid().then((v)=>{
                if(v instanceof WindowComponent){
                    v.activate();
                }
            });
        };
        this.setState({});
    }
    removeFloatWindow(window:React.VNode){
        let index=this.floatWindowVNodes.findIndex(v=>v===window);
        if(index>=0){
            this.floatWindowVNodes.splice(index,1);
            this.setState({});
        }
    }
    getSize(){
        return {
            width:this.container.current?.clientWidth??0,
            height:this.container.current?.clientHeight??0
        }
    }
}


export let rootWindowGroup=new ReactRefEx<WindowGroup>();
let windowDomRootComponent:DomDivComponent|null=null;
export function ensureRootWindowContainer(){
    if(windowDomRootComponent==null){
        windowDomRootComponent=new DomDivComponent();
        DomRootComponent.addChild(windowDomRootComponent);
        let div=windowDomRootComponent.getDomElement()!;
        div.style.width='100vw';
        div.style.height='100vh';
        div.style.position='absolute';
        div.style.left='0px';
        div.style.top='0px';
        div.style.pointerEvents='none'
        DomRootComponent.addChild(windowDomRootComponent).then(()=>DomRootComponent.update());
        ReactRender(<WindowGroup ref={rootWindowGroup}/>,windowDomRootComponent);
        //To fix bug in EDGE --app mode
        document.body.style.overflow='hidden'
    }
}



export function appendFloatWindow(window:React.VNode,active?:boolean){
    ensureRootWindowContainer();
    rootWindowGroup.current?.appendFloatWindow(window,active);
}

export function removeFloatWindow(window:React.VNode){
    ensureRootWindowContainer();
    rootWindowGroup.current?.removeFloatWindow(window);
}

export async function windowsContainerForceUpdate(){
    ensureRootWindowContainer();
    return new Promise<void>((resolve)=>rootWindowGroup.current?.forceUpdate(resolve));
}

export function getFloatWindowVNodeList(){
    ensureRootWindowContainer();
    return rootWindowGroup.current?.floatWindowVNodes??[];
}


language.set(navigator.language)

export let dialogBoxProvider:{
    alert?:(message:React.ComponentChild,title?:string)=>Promise<void>,
    confirm?:(message:React.ComponentChild,title?:string)=>Promise<'ok'|'cancel'>,
    prompt?:(form:React.ComponentChild,opt?:{
            onButtonClick?:(clicked:'ok'|'cancel')=>void
            title?:string,
            noButton?:boolean
        }|string)=>Promise<{response:future<'ok'|'cancel'>,close:()=>void}>
}={};


export async function alert(message:React.ComponentChild,title?:string){
    if(dialogBoxProvider.alert==null){
        dialogBoxProvider.alert=(await import('./workspace')).defaultDialogBoxImplemention.alert;
    }
    return dialogBoxProvider.alert(message,title);
}


export async function confirm(message:React.ComponentChild,title?:string){
    if(dialogBoxProvider.confirm==null){
        dialogBoxProvider.confirm=(await import('./workspace')).defaultDialogBoxImplemention.confirm;
    }
    return dialogBoxProvider.confirm(message,title);
}

export async function prompt(form:React.ComponentChild,opt?:{
    onButtonClick?:(clicked:'ok'|'cancel')=>void
    title?:string,
    noButton?:boolean
}|string){
    if(dialogBoxProvider.prompt==null){
        dialogBoxProvider.prompt=(await import('./workspace')).defaultDialogBoxImplemention.prompt;
    }
    return dialogBoxProvider.prompt(form,opt);
}