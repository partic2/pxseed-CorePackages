
import * as React from 'preact'
import { css as cssBase, DomDivComponent, DomRootComponent, FloatLayerComponent, ReactRefEx, ReactRender, RefChangeEvent } from './domui';
import { ArrayWrap2, future, GenerateRandomString, GetCurrentTime } from 'partic2/jsutils1/base';
import { DynamicPageCSSManager } from 'partic2/jsutils1/webutils';
import { PointTrace, TransformHelper } from './transform';



interface WindowComponentProps{
    closeIcon?:string|null
    foldIcon?:string|null
    expandIcon?:string|null
    maximize?:string|null
    title?:string
    onClose?:()=>void
    position?:'keep center'|'initial center'|'fill'
    noTitleBar?:boolean
    noResizeHandle?:boolean
    disablePassiveActive?:boolean
    keepTop?:boolean
    contentDivClassName?:string
    windowDivClassName?:string
    contentDivInlineStyle?:React.JSX.CSSProperties
    windowDivInlineStyle?:React.JSX.CSSProperties
    onComponentDidUpdate?:()=>void
}

interface WindowComponentStats{
    activeTime:number,
    folded:boolean,
    layout:{left:number,top:number,width?:number,height?:number},
    errorOccured:Error|null,
}

import {getIconUrl} from 'partic2/pxseedMedia1/index1'

export let css={
    defaultWindowDiv:GenerateRandomString(),
    borderlessWindowDiv:GenerateRandomString(),
    defaultContentDiv:GenerateRandomString(),
    defaultTitleStyle:GenerateRandomString(),
}

DynamicPageCSSManager.PutCss('.'+css.defaultWindowDiv,['max-height:100vh','max-width:100vw','border:solid black 1px']);
DynamicPageCSSManager.PutCss('.'+css.borderlessWindowDiv,['max-height:100vh','max-width:100vw']);
DynamicPageCSSManager.PutCss('.'+css.defaultContentDiv ,['flex-grow:1','background-color:white','overflow:auto'])
DynamicPageCSSManager.PutCss('.'+css.defaultTitleStyle ,['background-color:black','color:white'])

export class WindowComponent extends React.Component<WindowComponentProps,WindowComponentStats>{
    static defaultProps:WindowComponentProps={
        closeIcon:getIconUrl('x.svg'),
        foldIcon:getIconUrl('minus.svg'),
        expandIcon:getIconUrl('plus.svg'),
        maximize:getIconUrl('maximize-2.svg'),
        
        title:'untitled',
        position:'initial center'
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
        this.setState({activeTime:-1,folded:false,layout:{left:0,top:0},errorOccured:null});
    }
    async makeCenter(){
        //wait for layout complete?     
        await (async()=>{
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
            }
        })();
        
        let width=this.rref.container.current?.scrollWidth??0;
        let height=this.rref.container.current?.scrollHeight??0;
        let wndWidth=(rootWindowContainer?.offsetWidth)??0;
        let wndHeight=(rootWindowContainer?.offsetHeight)??0;
        if(width>wndWidth-5)width=wndWidth-5;
        if(height>wndHeight-5)height=wndHeight-5;
        let left=(wndWidth-width)>>1;
        let top=(wndHeight-height)>>1;
        await new Promise((resolve)=>{
            this.setState({layout:{left:left,top:top}},()=>resolve(null))
        });
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
            this.setState({layout:{...this.state.layout,left:curr.x-start.x,top:curr.y-start.y}});
        }
    });
    __onTitleMouseDownHandler=(evt:React.JSX.TargetedMouseEvent<HTMLDivElement>)=>{
        this.__wndMove.start({x:evt.clientX-this.state.layout.left,y:evt.clientY-this.state.layout.top},true);
        evt.preventDefault();
    }
    __onTitleTouchDownHandler=(evt:React.JSX.TargetedTouchEvent<HTMLDivElement>)=>{
        if(evt.touches.length==1){
            this.__wndMove.start({x:evt.touches.item(0)!.clientX-this.state.layout.left,y:evt.touches.item(0)!.clientY-this.state.layout.top},true);
            evt.preventDefault();
        }
    }
    __wndResize=new PointTrace({
        onMove:(curr,start)=>{
            this.setState({layout:{...this.state.layout,width:curr.x-start.x,height:curr.y-start.y}});
        }
    });
    __onResizeIconMouseDownHandler=(evt:React.JSX.TargetedMouseEvent<HTMLDivElement>)=>{
        this.__wndResize.start({x:this.state.layout.left,y:this.state.layout.top},true);
        evt.preventDefault();
    }
    __onResizeIconTouchDownHandler=(evt:React.JSX.TargetedTouchEvent<HTMLDivElement>)=>{
        if(evt.touches.length==1){
            this.__wndResize.start({x:this.state.layout.left,y:this.state.layout.top},true);
            evt.preventDefault();
        }
    }
    protected __initialLayout=false;
    active(){
        this.setState({activeTime:GetCurrentTime().getTime()},()=>{
            if(!this.__initialLayout){
                if(['initial center','keep center'].indexOf(this.props.position!)>=0){
                    this.makeCenter();
                }
                this.__initialLayout=true;
            }
        });
        globalWindowsList.current?.forceUpdate();
    }
    hide(){
        this.setState({activeTime:-1});
        globalWindowsList.current?.forceUpdate();
    }
    isHidden(){
        return this.state.activeTime<0&&!this.props.keepTop
    }
    isFolded(){
        return this.state.folded;
    }
    setFolded(v:boolean){
        this.setState({folded:v})
    }
    renderTitle(){
        return <div className={[cssBase.flexRow,css.defaultTitleStyle].join(' ')} style={{alignItems:'center'}}>
                <div style={{flexGrow:'1',cursor:'move',userSelect:'none'}} 
                onMouseDown={this.__onTitleMouseDownHandler} onTouchStart={this.__onTitleTouchDownHandler} >
                {(this.props.title??'').replace(/ /g,String.fromCharCode(160))}</div>&nbsp;
                {
                    this.renderIcon(this.props.maximize!,()=>this.onMaximizeClick())
                }{this.state.folded?
                    this.renderIcon(this.props.expandIcon!,()=>this.onExpandClick()):
                    this.renderIcon(this.props.foldIcon!,()=>this.onFoldClick())
                }{
                    this.renderIcon(this.props.closeIcon!,()=>this.onCloseClick())
                }
        </div>
    }
    async onFoldClick(){
        this.setState({folded:true})
    }
    async onExpandClick(){
        this.setState({folded:false})
    }
    async onCloseClick(){
        this.hide();
        this.props.onClose?.();
    }
    protected beforeMaximizeSize:{left:number,top:number,width?:number,height?:number}|null=null;
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
    doRelayout(){
        if(this.props.position==='keep center'){
            this.makeCenter();
        }
    }
    renderWindowMain(){
        let windowDivStyle:React.JSX.CSSProperties={
            boxSizing:'border-box',
            position:'absolute',
            left:this.state.layout.left+'px',
            top:this.state.layout.top+'px',
            pointerEvents:'auto'
        };
        if(this.state.layout.width!=undefined && !this.state.folded){
            windowDivStyle.width=this.state.layout.width+'px';
        }
        if(this.state.layout.height!=undefined && !this.state.folded){
            windowDivStyle.height=this.state.layout.height+'px';
        }
        if(this.props.position=='fill'){
            windowDivStyle.width='100%';
            windowDivStyle.height='100%';
        }
        if(this.props.windowDivInlineStyle!=undefined){
            Object.assign(windowDivStyle,this.props.windowDivInlineStyle)
        }
        let contentDivStyle:React.JSX.CSSProperties={};
        if(this.state.folded){
            contentDivStyle.display='none'
        }
        if(this.props.contentDivInlineStyle!=undefined){
            Object.assign(contentDivStyle,this.props.contentDivInlineStyle)
        }
        return <div className={[cssBase.flexColumn,this.props.windowDivClassName??css.defaultWindowDiv].join(' ')} style={windowDivStyle}
            ref={this.rref.container}
            onMouseDown={()=>{
                if(this.state.activeTime>=0 && !this.props.disablePassiveActive)
                    this.setState({activeTime:GetCurrentTime().getTime()})
            }}
            onTouchStart={()=>{
                if(this.state.activeTime>=0 && !this.props.disablePassiveActive)
                    this.setState({activeTime:GetCurrentTime().getTime()})
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
                    (this.state.folded||this.props.noResizeHandle||this.props.position=='fill')?null:<img src={getIconUrl('arrow-down-right.svg')} 
                    style={{
                        position:'absolute',cursor:'nwse-resize',
                        right:'0px',bottom:'0px',
                        backgroundColor:'white'}} 
                        onMouseDown={this.__onResizeIconMouseDownHandler} 
                        onTouchStart={this.__onResizeIconTouchDownHandler}
                    width="12" height="12"
                    />
                ]}
        </div>
    }
    componentDidUpdate(previousProps: Readonly<WindowComponentProps>, previousState: Readonly<WindowComponentStats>, snapshot: any): void {
        this.props.onComponentDidUpdate?.();
    }
    render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined; }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChild {
        if(this.props.keepTop){
            return <div className={cssBase.overlayLayer}>
                {this.renderWindowMain()}
            </div>
        }else{
            return <FloatLayerComponent activeTime={this.state.activeTime} onLayout={()=>this.doRelayout()}>
                {this.renderWindowMain()}
            </FloatLayerComponent> 
        }
    }
}



export let rootWindowContainer:HTMLDivElement|null=null;
export function ensureRootWindowContainer(){
    if(rootWindowContainer==null){
        let div=new DomDivComponent();
        rootWindowContainer=div.getDomElement()! as HTMLDivElement;
        rootWindowContainer.style.position='absolute';
        rootWindowContainer.style.left='0px';
        rootWindowContainer.style.top='0px';
        rootWindowContainer.style.width='100vw';
        rootWindowContainer.style.height='100vh';
        DomRootComponent.addChild(div);
        ReactRender(<WindowsList ref={globalWindowsList}/>,rootWindowContainer);
    }
    return rootWindowContainer;
}
let floatWindowVNodes:React.VNode[]=[];
class WindowsList extends React.Component{
    windowActiveTimeCompare=(t1:ReactRefEx<React.VNode>,t2:ReactRefEx<React.VNode>)=>{
        let t3=(t1.current as any)?.state?.activeTime??0;
        let t4=(t2.current as any)?.state?.activeTime??0;
        return t3-t4;
    }
    render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined; }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChild {
        floatWindowVNodes.sort((t1,t2)=>this.windowActiveTimeCompare(t1.ref as any,t2.ref as any));
        return floatWindowVNodes
    }
}
let globalWindowsList=new ReactRefEx<WindowsList>();

export function appendFloatWindow(window:React.VNode,active?:boolean){
    active=active??true;
    let ref2=new ReactRefEx<React.VNode>().forward([window.ref].filter(v=>v!=undefined) as React.Ref<any>[]);
    window.ref=ref2;
    if(window.key==undefined){
        window.key=GenerateRandomString();
    }
    ensureRootWindowContainer();
    globalWindowsList.current?.forceUpdate();
    floatWindowVNodes.push(window);
    if(active){
        ref2.waitValid().then((v)=>(v as any).active?.());
    }
}

export function removeFloatWindow(window:React.VNode){
    new ArrayWrap2(floatWindowVNodes).removeFirst(v=>v===window);
    ensureRootWindowContainer();
    globalWindowsList.current?.forceUpdate();
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
    let floatWindow1=<WindowComponent key={GenerateRandomString()}
    title={title??i18n.caution} onClose={()=>result.setResult(null)}>
    <div style={{backgroundColor:'#FFF', minWidth:Math.min((rootWindowContainer?.offsetWidth)??0-10,300)}}>
        {message}
        <div className={cssBase.flexRow}>
            <input type='button' style={{flexGrow:'1'}} onClick={()=>result.setResult(null)} value={i18n.ok}/>
        </div>
    </div>
    </WindowComponent>
    appendFloatWindow(floatWindow1);
    await result.get();
    removeFloatWindow(floatWindow1);
}


export async function confirm(message:string,title?:string){
    let result=new future<'ok'|'cancel'>();
    let floatWindow1=<WindowComponent key={GenerateRandomString()}
        title={title??i18n.caution} onClose={()=>result.setResult('cancel')}>
        <div style={{backgroundColor:'#FFF', minWidth:Math.min((rootWindowContainer?.offsetWidth)??0-10,300)}}>
            {message}
            <div className={cssBase.flexRow}>
                <input type='button' style={{flexGrow:'1'}} onClick={()=>result.setResult('ok')} value={i18n.ok}/>
                <input type='button' style={{flexGrow:'1'}} onClick={()=>result.setResult('cancel')} value={i18n.cancel}/>
            </div>
        </div>
    </WindowComponent>;
    appendFloatWindow(floatWindow1);
    let r=await result.get();
    removeFloatWindow(floatWindow1);
    return r;
}

export async function prompt(form:React.VNode,title?:string){
    let result=new future<'ok'|'cancel'>();
    let floatWindow1=<WindowComponent title={title??i18n.caution} onClose={()=>result.setResult('cancel')} key={GenerateRandomString()}>
        <div className={cssBase.flexColumn}>
            {form}
            <div className={cssBase.flexRow}>
                <input type='button' style={{flexGrow:'1'}} onClick={()=>result.setResult('ok')} value={i18n.ok}/>
                <input type='button' style={{flexGrow:'1'}} onClick={()=>result.setResult('cancel')} value={i18n.cancel}/>
            </div>
        </div>
    </WindowComponent>;
    appendFloatWindow(floatWindow1);
    return {
        answer:result,
        close:()=>removeFloatWindow(floatWindow1)
    }
}