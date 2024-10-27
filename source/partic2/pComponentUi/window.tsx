
import * as React from 'preact'
import { FloatLayerComponent, ReactRefEx, RefChangeEvent } from './domui';
import { GenerateRandomString, GetCurrentTime } from 'partic2/jsutils1/base';
import { DynamicPageCSSManager } from 'partic2/jsutils1/webutils';
import {css as cssBase} from './domui'
import { PointTrace, TransformHelper } from './transform';



interface WindowComponentProps{
    closeIcon?:string|null,
    foldIcon?:string|null,
    expandIcon?:string|null,
    title?:string,
    windowClassName?:string,
    onClose?:()=>void,
    position?:'keep center'|'initial center'|'static',
    //window uid used to persistent the window specified infomation.
    windowUid?:string
}

interface WindowComponentStats{
    activeTime:number,
    folded:boolean,
    layout:{left:number,top:number,width?:number,height?:number}
}

import {getIconUrl} from 'partic2/pxseedMedia1/index1'

export class WindowComponent extends React.Component<WindowComponentProps,WindowComponentStats>{
    static defaultProps:WindowComponentProps={
        closeIcon:getIconUrl('x.svg'),
        foldIcon:getIconUrl('minus.svg'),
        expandIcon:getIconUrl('plus.svg'),
        title:'untitled',
        position:'initial center'
    }
    layerTransformer=new TransformHelper();
    rref={
        container:new ReactRefEx<HTMLDivElement>()
    }
    constructor(props:WindowComponentProps,ctx:any){
        super(props,ctx);
        this.setState({activeTime:-1,folded:false,layout:{left:0,top:0}});
    }
    makeCenter(){
        let {width,height}=this.getCurrentSize();
        let wndWidth=window.innerWidth;
        let wndHeight=window.innerHeight;
        let left=(wndWidth-width)/2;
        let top=(wndHeight-height)/2;
        this.setState({layout:{left:left,top:top,width:width,height:height}})
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
    active(){
        if(this.state.activeTime<0 && ['initial center','keep center'].indexOf(this.props.position!)>=0){
            this.setState({activeTime:GetCurrentTime().getTime()},()=>{
                requestAnimationFrame(()=>{
                    this.makeCenter();
                })
            });
        }else{
            this.setState({activeTime:GetCurrentTime().getTime()});
        }
    }
    hide(){
        this.setState({activeTime:-1})
    }
    renderTitle(){
        return <div className={cssBase.flexRow} style={{borderBottom:'solid black 1px',alignItems:'center',backgroundColor:'#f88'}}>
                <div style={{flexGrow:'1',cursor:'move',userSelect:'none'}} 
                onMouseDown={this.__onTitleMouseDownHandler} onTouchStart={this.__onTitleTouchDownHandler} >
                {(this.props.title??'').replace(/ /g,String.fromCharCode(160))}</div>&nbsp;
                {this.state.folded?
                    this.renderIcon(this.props.expandIcon!,()=>this.onExpandClick()):
                    this.renderIcon(this.props.foldIcon!,()=>this.onFoldClick())
                }{
                    this.renderIcon(this.props.closeIcon!,()=>this.onCloseClick())
                }
        </div>
    }
    onFoldClick(){
        this.setState({folded:true})
    }
    onExpandClick(){
        this.setState({folded:false})
    }
    onCloseClick(){
        this.hide();
        this.props.onClose?.();
    }
    getCurrentSize(){
        if(this.rref.container.current){
            let {width,height}=this.rref.container.current.getBoundingClientRect();
            return {width,height}
        }else{
            return {width:0,height:0};
        }
    }
    doRelayout(){
        if(this.props.position==='keep center'){
            this.makeCenter();
        }
    }
    renderWindowMain(){
        let windowDivStyle:React.JSX.CSSProperties={
            border:'solid black 1px',
            position:'absolute',
            left:this.state.layout.left+'px',
            top:this.state.layout.top+'px',
        };
        if(this.props.position==='static'){
            windowDivStyle.position='static'
        }
        if(this.state.layout.width!=undefined && !this.state.folded){
            windowDivStyle.width=this.state.layout.width+'px';
        }
        if(this.state.layout.height!=undefined && !this.state.folded){
            windowDivStyle.height=this.state.layout.height+'px';
        }
        return <div className={cssBase.flexColumn} style={windowDivStyle}
            ref={this.rref.container}
            onClick={()=>{
                if(this.state.activeTime>=0)
                    this.setState({activeTime:GetCurrentTime().getTime()})
            }}>
                {this.renderTitle()}
                {this.state.folded?null:[
                    <div style={{overflow:'auto'}}>
                        {this.props.children}
                    </div>,
                    <img src={getIconUrl('arrow-down-right.svg')} 
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
    render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined; }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChild {
        if(this.props.position==='static'){
            return <div>
                {this.renderWindowMain()}
            </div>
        }else{
            return <FloatLayerComponent activeTime={this.state.activeTime} onLayout={()=>this.doRelayout()}>
                {this.renderWindowMain()}
            </FloatLayerComponent> 
        }
    }
}
