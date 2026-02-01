
import * as React from 'preact'
import { css as cssBase, DomDivComponent, DomRootComponent, FloatLayerComponent, ReactEventTarget, ReactRefEx, ReactRender } from './domui';
import { future, GenerateRandomString, GetCurrentTime } from 'partic2/jsutils1/base';
import { DynamicPageCSSManager } from 'partic2/jsutils1/webutils';
import { PointTrace } from './transform';



export interface WindowComponentProps{
    closeIcon?:string|null
    maximize?:string|null
    title?:string
    titleBarButton?:Array<{icon:string,onClick:()=>void}>
    onClose?:()=>void
    noTitleBar?:boolean
    noResizeHandle?:boolean
    disableUserInputActivate?:boolean
    keepTop?:boolean
    contentDivClassName?:string
    windowDivClassName?:string
    contentDivInlineStyle?:React.CSSProperties
    windowDivInlineStyle?:React.CSSProperties
    onComponentDidUpdate?:()=>void
    initialLayout?:{left:number,top:number,width?:number|string,height?:number|string}
}

interface WindowComponentStats{
    activateTime:number,
    layout:{left:number,top:number,width?:number|string,height?:number|string},
    errorOccured:Error|null,
}

import {getIconUrl} from 'partic2/pxseedMedia1/index1'

export let css={
    defaultWindowDiv:GenerateRandomString(),
    borderlessWindowDiv:GenerateRandomString(),
    defaultContentDiv:GenerateRandomString(),
    defaultTitleStyle:GenerateRandomString(),
}

DynamicPageCSSManager.PutCss('.'+css.defaultWindowDiv,['border:solid black 1px','box-sizing: border-box','pointer-events:auto']);
DynamicPageCSSManager.PutCss('.'+css.borderlessWindowDiv,['pointer-events:auto']);
DynamicPageCSSManager.PutCss('.'+css.defaultContentDiv ,['flex-grow:1','background-color:white','overflow:auto'])
DynamicPageCSSManager.PutCss('.'+css.defaultTitleStyle ,['background-color:black','color:white'])

export class DefaultWindowComponent extends ReactEventTarget<WindowComponentProps,WindowComponentStats>{
    static defaultProps:WindowComponentProps={
        closeIcon:getIconUrl('x.svg'),
        maximize:getIconUrl('maximize-2.svg'),
        title:'untitled'
    }
    static getDerivedStateFromError(error: any): object | null {
        return {errorOccured:error};
    }
    rref={
        container:new ReactRefEx<HTMLDivElement>(),
        contentDiv:new ReactRefEx<HTMLDivElement>()
    }
    constructor(props:WindowComponentProps,ctx:any){
        super(props,ctx);
        this.setState({activateTime:-1,layout:this.props.initialLayout??{left:0,top:0},errorOccured:null});
    }
    _triggerResize=()=>{this.forceUpdate();this.dispatchEvent(new Event('resize'))};
    componentDidMount(): void {
        window.addEventListener('resize',this._triggerResize);
    }
    componentWillUnmount(): void {
        window.removeEventListener('reisze',this._triggerResize);
    }
    async makeCenter(){

        let width=0;
        let height=0;
        let stableCount=0;
        for(let t1=0;t1<100;t1++){
            await new Promise(resolve=>requestAnimationFrame(resolve));
            let newWidth=this.rref.container.current?.scrollWidth??0;
            let newHeight=this.rref.container.current?.scrollHeight??0;
            if(width!=newWidth || height!=newHeight){
                width=newWidth;
                height=newHeight;
                stableCount=0;
            }else{
                stableCount++;
            }
            if(stableCount>=3)break;

            let wndWidth=(rootWindowsList.current?.container.current?.offsetWidth)??0;
            let wndHeight=(rootWindowsList.current?.container.current?.offsetHeight)??0;
            if(width>wndWidth-5)width=wndWidth-5;
            if(height>wndHeight-5)height=wndHeight-5;
            let left=(wndWidth-width)>>1;
            let top=(wndHeight-height)>>1;
            if(left!=this.state.layout.left || top!=this.state.layout.top){
                await new Promise((resolve)=>{
                    this.setState({layout:{left:left,top:top}},()=>resolve(null))
                });
            }
        }
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
    __wndMove=new PointTrace({
        onMove:(curr,start)=>{
            this.setState({layout:{...this.state.layout,left:curr.x-start.x,top:curr.y-start.y}},()=>this.dispatchEvent(new Event('move')));
        }
    });
    __onTitleMouseDownHandler=(evt:React.TargetedPointerEvent<HTMLDivElement>)=>{
        this.__wndMove.start({x:evt.clientX-this.state.layout.left,y:evt.clientY-this.state.layout.top},true);
        evt.preventDefault();
    }
    __wndResize=new PointTrace({
        onMove:(curr,start)=>{
            this.setState({layout:{...this.state.layout,width:curr.x-start.x,height:curr.y-start.y}},()=>this.dispatchEvent(new Event('resize')));
        }
    });
    __onResizeIconMouseDownHandler=(evt:React.TargetedPointerEvent<HTMLDivElement>)=>{
        this.__wndResize.start({x:this.state.layout.left,y:this.state.layout.top},true);
        evt.preventDefault();
    }
    activate(activateTime?:number){
        if(this.props.keepTop){
            activateTime=95617573200000;
        }
        this.setState({activateTime:activateTime??GetCurrentTime().getTime()},()=>{
            windowsContainerForceUpdate();
        });
    }
    hide(){
        this.setState({activateTime:-1});
        windowsContainerForceUpdate();
    }
    isHidden(){
        return this.state.activateTime<0&&!this.props.keepTop
    }
    renderTitle(){
        let titleString=this.props.title;
        if(typeof titleString!=='string'){
            titleString=''
        }
        return <div className={[cssBase.flexRow,css.defaultTitleStyle].join(' ')} style={{alignItems:'center'}}>
                <div style={{flexGrow:'1',cursor:'move',userSelect:'none',overflowY:'auto',touchAction:'none'}} 
                onPointerDown={this.__onTitleMouseDownHandler} >
                {titleString.replace(/ /g,String.fromCharCode(160))}</div>&nbsp;
                {
                    (this.props.titleBarButton??[]).map(t1=>this.renderIcon(t1.icon,t1.onClick))
                }{
                    this.renderIcon(this.props.maximize!,()=>this.onMaximizeClick())
                }{
                    this.renderIcon(this.props.closeIcon!,()=>this.onCloseClick())
                }
        </div>
    }
    async onCloseClick(){
        this.hide();
        this.dispatchEvent(new Event('close'));
        this.props.onClose?.();
    }
    protected beforeMaximizeSize:{left:number,top:number,width?:number|string,height?:number|string}|null=null;
    async onMaximizeClick(){
        if(this.beforeMaximizeSize!=null){
            this.setState({layout:{...this.beforeMaximizeSize}});
            this.beforeMaximizeSize=null;
        }else{
            this.beforeMaximizeSize={...this.state.layout};
            let containerDiv=await this.rref.container.waitValid();
            this.setState({layout:{left:0,top:0,
                width:(containerDiv.offsetParent as HTMLElement).offsetWidth,
                height:(containerDiv.offsetParent as HTMLElement).offsetHeight}});
        }
    }
    renderWindowMain(){
        try{
            let windowDivStyle:React.CSSProperties={
                boxSizing:'border-box',
                position:'absolute',
                left:this.state.layout.left+'px',
                top:this.state.layout.top+'px',
                maxWidth:(window.innerWidth-this.state.layout.left)+'px',
                maxHeight:(window.innerHeight-this.state.layout.top)+'px',
                touchAction:'none'
            };
            if(typeof this.state.layout.width==='number'){
                windowDivStyle.width=this.state.layout.width+'px';
            }else if(typeof this.state.layout.width==='string'){
                windowDivStyle.width=this.state.layout.width;
            }
            if(typeof this.state.layout.height==='number'){
                windowDivStyle.height=this.state.layout.height+'px';
            }else if(typeof this.state.layout.height==='string'){
                windowDivStyle.height=this.state.layout.height;
            }
            if(this.props.windowDivInlineStyle!=undefined){
                Object.assign(windowDivStyle,this.props.windowDivInlineStyle)
            }
            let contentDivStyle:React.CSSProperties={};
            if(this.props.contentDivInlineStyle!=undefined){
                Object.assign(contentDivStyle,this.props.contentDivInlineStyle)
            }
            return <div className={[cssBase.flexColumn,this.props.windowDivClassName??css.defaultWindowDiv].join(' ')} 
                style={windowDivStyle}
                ref={this.rref.container}
                onPointerDown={()=>{
                    if(this.state.activateTime>=0 && !this.props.disableUserInputActivate)
                        this.activate()
                }}>
                    {this.props.noTitleBar?null:this.renderTitle()}
                    {[
                        <div style={{...contentDivStyle}} 
                        className={[this.props.contentDivClassName??css.defaultContentDiv].join(' ')} ref={this.rref.contentDiv}>
                            {this.state.errorOccured==null?this.props.children:<pre style={{backgroundColor:'white',color:'black'}}>
                                {this.state.errorOccured.message}
                                {this.state.errorOccured.stack}
                            </pre>}
                        </div>,
                        (this.props.noResizeHandle)?null:<img src={getIconUrl('arrow-down-right.svg')} 
                        style={{
                            position:'absolute',cursor:'nwse-resize',
                            right:'0px',bottom:'0px',touchAction:'none',
                            backgroundColor:'white'}} 
                            onPointerDown={this.__onResizeIconMouseDownHandler} 
                        width="12" height="12"
                        />
                    ]}
            </div>
        }catch(err:any){
            return <div>{err.message+err.stack}</div>
        }
    }
    componentDidUpdate(previousProps: Readonly<WindowComponentProps>, previousState: Readonly<WindowComponentStats>, snapshot: any): void {
        this.props.onComponentDidUpdate?.();
    }
    windowsList:WindowsList|null=null;
    render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined; }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChild {
        return <FloatLayerComponent activateTime={this.state.activateTime}>
            <WindowsListContext.Consumer>{(value)=>{this.windowsList=value;return null}}</WindowsListContext.Consumer>
            {this.renderWindowMain()}
        </FloatLayerComponent> 
    }
}

export let WindowComponent=DefaultWindowComponent;
export type WindowComponent=DefaultWindowComponent;

export function setDefaultWindowComponentImplemention(impl:typeof DefaultWindowComponent){
    WindowComponent=impl;
}

export let WindowsListContext=React.createContext<WindowsList|null>(null);

export class WindowsList extends React.Component<{divStyle?:React.CSSProperties},{floatWindowVNodes:React.VNode[]}>{
    container=new ReactRefEx<HTMLDivElement>();
    constructor(prop:any,ctx:any){
        super(prop,ctx);
        this.setState({floatWindowVNodes:[]});
    }
    render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined; }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChild {
        return <WindowsListContext.Provider value={this}>
            <div style={{width:'100%',height:'100%',...this.props.divStyle}} ref={this.container}>{this.state.floatWindowVNodes}</div>
        </WindowsListContext.Provider>
    }
    appendFloatWindow(window:React.VNode,active?:boolean){
        active=active??true;
        let ref2=new ReactRefEx<React.VNode>().forward([window.ref].filter(v=>v!=undefined) as React.Ref<any>[]);
        window.ref=ref2;
        if(window.key==undefined){
            window.key=GenerateRandomString();
        }
        this.state.floatWindowVNodes.push(window);
        if(active){
            ref2.waitValid().then((v)=>{
                if(v instanceof WindowComponent){
                    v.activate();
                }
            });
        };
        this.forceUpdate();
    }
    removeFloatWindow(window:React.VNode){
        let index=this.state.floatWindowVNodes.findIndex(v=>v===window);
        if(index>=0){
            this.state.floatWindowVNodes.splice(index,1);
            this.forceUpdate();
        }
    }
}


let rootWindowsList=new ReactRefEx<WindowsList>();
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
        ReactRender(<WindowsList ref={rootWindowsList}/>,windowDomRootComponent);
    }
}



export function appendFloatWindow(window:React.VNode,active?:boolean){
    ensureRootWindowContainer();
    rootWindowsList.current?.appendFloatWindow(window,active);
}

export function removeFloatWindow(window:React.VNode){
    ensureRootWindowContainer();
    rootWindowsList.current?.removeFloatWindow(window);
}

export async function windowsContainerForceUpdate(){
    ensureRootWindowContainer();
    return new Promise<void>((resolve)=>rootWindowsList.current?.forceUpdate(resolve));
}

export function getFloatWindowVNodeList(){
    ensureRootWindowContainer();
    return rootWindowsList.current?.state.floatWindowVNodes??[];
}

let i18n={
    caution:'caution',
    ok:'ok',
    cancel:'cancel'
}

if(navigator.language==='zh-CN'){
    i18n.caution='提醒'
    i18n.ok='确认'
    i18n.cancel='取消'
}

export async function alert(message:string,title?:string){
    let result=new future<null>();
    let windowRef=new ReactRefEx<WindowComponent>();
    let floatWindow1=<WindowComponent key={GenerateRandomString()} ref={windowRef}
    title={title??i18n.caution} onClose={()=>result.setResult(null)}>
    <div style={{minWidth:Math.min((rootWindowsList.current?.container.current?.offsetWidth)??0-10,300),whiteSpace:'pre-wrap'}}>
        {message}
        <div className={cssBase.flexRow}>
            <input type='button' style={{flexGrow:'1'}} onClick={()=>result.setResult(null)} value={i18n.ok}/>
        </div>
    </div>
    </WindowComponent>
    appendFloatWindow(floatWindow1);
    windowRef.waitValid().then((w)=>w.makeCenter());
    await result.get();
    removeFloatWindow(floatWindow1);
}


export async function confirm(message:string,title?:string){
    let result=new future<'ok'|'cancel'>();
    let windowRef=new ReactRefEx<WindowComponent>();
    let floatWindow1=<WindowComponent key={GenerateRandomString()} ref={windowRef}
        title={title??i18n.caution} onClose={()=>result.setResult('cancel')}>
        <div style={{minWidth:Math.min((rootWindowsList.current?.container.current?.offsetWidth)??0-10,300),whiteSpace:'pre-wrap'}}>
            {message}
            <div className={cssBase.flexRow}>
                <input type='button' style={{flexGrow:'1'}} onClick={()=>result.setResult('ok')} value={i18n.ok}/>
                <input type='button' style={{flexGrow:'1'}} onClick={()=>result.setResult('cancel')} value={i18n.cancel}/>
            </div>
        </div>
    </WindowComponent>;
    appendFloatWindow(floatWindow1);
    windowRef.waitValid().then((w)=>{w.makeCenter()});
    let r=await result.get();
    removeFloatWindow(floatWindow1);
    return r;
}

export async function prompt(form:React.VNode,title?:string):Promise<{response:future<'ok'|'cancel'>,close:()=>void}>
export async function prompt(form:React.VNode,opt?:{
    onButtonClick?:(clicked:'ok'|'cancel')=>void
    title?:string
}|string){
    let result=new future<'ok'|'cancel'>();
    if(typeof opt==='string'){
        opt={title:opt}
    }
    let title=opt?.title;
    let windowRef=new ReactRefEx<WindowComponent>();
    let floatWindow1=<WindowComponent key={GenerateRandomString()} ref={windowRef}
    title={title??i18n.caution} onClose={()=>{
        result.setResult('cancel');
        opt?.onButtonClick?.('cancel');
    }} >
        <div className={cssBase.flexColumn}>
            {form}
            <div className={cssBase.flexRow}>
                <input type='button' style={{flexGrow:'1'}} onClick={()=>{
                    result.setResult('ok');
                    opt?.onButtonClick?.('ok');
                }} value={i18n.ok}/>
                <input type='button' style={{flexGrow:'1'}} onClick={()=>{
                    result.setResult('cancel');
                    opt?.onButtonClick?.('cancel');
                }} value={i18n.cancel}/>
            </div>
        </div>
    </WindowComponent>;
    appendFloatWindow(floatWindow1);
    windowRef.waitValid().then((w)=>{w.makeCenter()});
    return {
        response:result,
        close:()=>removeFloatWindow(floatWindow1)
    }
}