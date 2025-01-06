
import * as React from 'preact'
import { ArrayWrap2, clone, future, GenerateRandomString, sleep } from 'partic2/jsutils1/base';
import { DynamicPageCSSManager } from 'partic2/jsutils1/webutils';
var ReactDOM=React

export class DomComponent{
    protected domElem?:HTMLElement
    protected mounted=false;
    public async appendToNode(parent:HTMLElement){
        parent.appendChild(this.domElem!);
        this.mounted=true;
    }
    public async removeFromNode(){
        if(this.domElem!=undefined&&this.domElem.parentElement!=null){
            this.domElem.parentElement.removeChild(this.domElem);
        }
    }
    public getDomElement(){
        return this.domElem;
    }
    public async update(){
    }
}

export class DomComponentGroup extends DomComponent{
    
    protected children:Array<DomComponent>=new Array();
    
    public getChildren(){
        return this.children;
    }
    
    public async addChild(comp:DomComponent){
        this.children.push(comp);
        await comp.appendToNode(this.domElem!);
        await comp.update();
    }
    public async removeChild(comp:DomComponent){
        let at=this.children.indexOf(comp);
        if(at>=0){
            let ch=this.children.splice(at,1)[0];
            await ch.removeFromNode();
        }
    }
    public async update(){
        let doUpdate=[];
        for(let ch of this.children){
            doUpdate.push(ch.update());
        }
        await Promise.all(doUpdate);
    }
}



export class DomDivComponent extends DomComponentGroup{
    public constructor(){
        super();
        this.domElem=document.createElement('div');
    }
}



class CDomRootComponent extends DomComponentGroup{
    public constructor(){
        super();
        let domroot=document.createElement('div');
        document.body.appendChild(domroot);
        this.domElem=domroot
        this.mounted=true
    }
    public async appendToNode(parent:HTMLElement){
        this.mounted=true;
    }
    public async update(){
        if(!this.mounted){
            await this.appendToNode(document.body);
        }
        await super.update()
    }
    public hiddenDiv?:HTMLDivElement
    public addHiddenElement(e:HTMLElement){
        if(this.hiddenDiv==undefined){
            this.hiddenDiv=document.createElement('div');
            this.hiddenDiv.style.display='none'
            this.getDomElement()!.append(this.hiddenDiv);
        }
        this.hiddenDiv.append(e);
    }
    public removeHiddenElement(e:HTMLElement){
        if(this.hiddenDiv!=undefined){
            this.hiddenDiv.removeChild(e);
        }
    }
    public async addHiddenComponent(comp:DomComponent){
        if(this.hiddenDiv==undefined){
            this.hiddenDiv=document.createElement('div');
            this.hiddenDiv.style.display='none'
            this.getDomElement()!.append(this.hiddenDiv);
        }
        this.children.push(comp);
        await comp.appendToNode(this.hiddenDiv!);
        await this.update();
    }
}

export var DomRootComponent=new CDomRootComponent();


export abstract class ReactEventTarget<P={},S={}> extends React.Component<P,S> implements EventTarget{
    eventTarget:EventTarget=new EventTarget();
    addEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions | undefined): void {
        this.eventTarget.addEventListener(type,callback,options);
    }
    dispatchEvent(event: Event): boolean {
        return this.eventTarget.dispatchEvent(event);
    }
    removeEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions | undefined): void {
        this.eventTarget.removeEventListener(type,callback,options);
    }
}



export var css={
    flexRow:GenerateRandomString(),
    flexColumn:GenerateRandomString(),
    selected:GenerateRandomString(),
    simpleCard:GenerateRandomString(),
    simpleTable:GenerateRandomString(),
    simpleTableCell:GenerateRandomString(),
    selectable:GenerateRandomString(),
    overlayLayer:GenerateRandomString(),
    activeLayer:GenerateRandomString(),
    inactiveLayer:GenerateRandomString(),
    hideLayer:GenerateRandomString()
}
DynamicPageCSSManager.PutCss('.'+css.flexRow,['display:flex','flex-direction:row']);
DynamicPageCSSManager.PutCss('.'+css.flexColumn,['display:flex','flex-direction:column']);
DynamicPageCSSManager.PutCss('.'+css.selectable+':hover',['background-color:rgb(200,200,200)']);
DynamicPageCSSManager.PutCss('.'+css.selected,['background-color:rgb(150,150,255)'])
DynamicPageCSSManager.PutCss('.'+css.simpleCard,['display:inline-block','border:solid black 2px','margin:2px','padding:2px','background-color:white'])
DynamicPageCSSManager.PutCss('.'+css.simpleTable,['border-collapse:collapse']);
DynamicPageCSSManager.PutCss('.'+css.simpleTableCell,['border:solid black 2px']);
DynamicPageCSSManager.PutCss('.'+css.overlayLayer,['z-index:1000','position:absolute','left:0px','top:0px']);
DynamicPageCSSManager.PutCss('.'+css.activeLayer,['z-index:800','position:absolute','left:0px','top:0px']);
DynamicPageCSSManager.PutCss('.'+css.inactiveLayer,['z-index:600','position:absolute','left:0px','top:0px']);
DynamicPageCSSManager.PutCss('.'+css.hideLayer,['z-index:600','position:absolute','display:none','left:0px','top:0px']);

export var event={
    layout:'partic2-layout' as const
}


let FloatLayerManager={
    layerComponents:new Map<FloatLayerComponent,{activeTime:number,layerClass:string}>(),
    checkRenderLayer:function(c:FloatLayerComponent,activeTime:number):string{
        let cur=this.layerComponents.get(c);
        if(cur==null){
            this.layerComponents.set(c,{activeTime,layerClass:''});
            this.resortAllLayer();
        }else if(cur.activeTime!=activeTime){
            this.layerComponents.set(c,{activeTime,layerClass:''});
            this.resortAllLayer();
        }
        cur=this.layerComponents.get(c);
        return cur!.layerClass;
    },
    resortAllLayer(){
        let activeLayer:[FloatLayerComponent|null,number]=[null,0];''
        for(let t1 of this.layerComponents.entries()){
            if(activeLayer[1]<=t1[1].activeTime){
                activeLayer=[t1[0],t1[1].activeTime];
            }
        }
        for(let t1 of this.layerComponents.entries()){
            if(t1[1].activeTime<0){
                t1[1].layerClass=css.hideLayer;
                t1[0].forceUpdate();
            }else if(activeLayer[0]==t1[0] && t1[1].layerClass!=css.inactiveLayer){
                t1[1].layerClass=css.activeLayer;
                t1[0].forceUpdate();
            }else if(activeLayer[0]!=t1[0] && t1[1].layerClass!=css.inactiveLayer){
                t1[1].layerClass=css.inactiveLayer;
                t1[0].forceUpdate();
            }
        }
    }
}

export class RefChangeEvent<T> extends Event{
    constructor(public data:{prev:T|null,curr:T|null}){
        super('change')
    }
}
export class ReactRefEx<T> extends EventTarget implements React.RefObject<T>{
    __current:T|null=null;
    constructor(){
        super();
        this.addEventListener('change',(evt:RefChangeEvent<T>)=>{
            for(let t1 of this.__forwardTo){
                if(typeof t1==='function'){
                    t1(evt.data.curr);
                }else if(t1!=null){
                    t1.current=evt.data.curr;
                }
            }
        })
    }
    set current(curr:T|null){
        let prev=this.__current;
        this.__current=curr;
        this.dispatchEvent(new RefChangeEvent<T>({prev,curr}))
    }
    get current():T|null{
        return this.__current;
    }
    __forwardTo:React.Ref<T>[]=[];
    forward(refs:React.Ref<T>[]){
        this.__forwardTo.push(...refs);
        return this;
    }
    addEventListener(type: 'change', callback: ((evt:RefChangeEvent<T>)=>void)|EventListenerOrEventListenerObject|null , options?: AddEventListenerOptions | boolean): void
    addEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean): void {
        super.addEventListener(type,callback,options);
    }
    removeEventListener(type: 'change', callback: ((evt:RefChangeEvent<T>)=>void)|EventListenerOrEventListenerObject|null): void
    removeEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: EventListenerOptions | boolean): void {
        super.removeEventListener(type,callback,options);
    }
    async waitValid(){
        if(this.current!=null){
            return this.current;
        }else{
            return new Promise<T>((resolve)=>{
                const onRefChange=(ev:RefChangeEvent<T>)=>{
                    if(ev.data.curr!=null){
                        this.removeEventListener('change',onRefChange);
                        resolve(ev.data.curr);
                    }
                }
                this.addEventListener('change',onRefChange)
            });
        }
        
    }
    async waitInvalid(){
        if(this.current==null){
            return
        }
        return new Promise<undefined>((resolve)=>{
            const onRefChange=(ev:RefChangeEvent<T>)=>{
                if(ev.data.curr==null){
                    this.removeEventListener('change',onRefChange);
                    resolve(undefined);
                }
            }
            this.addEventListener('change',onRefChange)
        });
    }
}

//activeTime: The last actived layer (which activeTime is latest.) will be put to activeLayer as foreground layer, 
//others layer will put to inactiveLayer.
interface FloatLayerComponentProps{
    activeTime:number
    divClass?:string[],
    onLayout?:()=>void,
    divRef?:React.Ref<HTMLDivElement>
}

interface FloatLayerComponentStats{
}

export class FloatLayerComponent<
    P extends FloatLayerComponentProps=FloatLayerComponentProps,
    S extends FloatLayerComponentStats=FloatLayerComponentStats>
    extends React.Component<P,S>{
    
    componentWillUnmount(): void {
        FloatLayerManager.layerComponents.delete(this);
    }
    containerDiv:HTMLDivElement|null=null;
    protected cbOnLayout=()=>{
        this.props.onLayout?.();
    }
    render(): React.ComponentChild {
        return <div ref={this.props.divRef} 
            className={[FloatLayerManager.checkRenderLayer(this,this.props.activeTime),
                ...this.props.divClass??[]].join(' ')} >
            {this.props.children}
        </div>
    }
}


export function ReactRender(vnode:React.ComponentChild,container:HTMLElement|DomComponentGroup|'create'){
    if(container instanceof HTMLElement){
        React.render(vnode,container);
    }else if(container instanceof DomComponentGroup){
        React.render(vnode,container.getDomElement()!);
    }else if(container=='create'){
        let div1=document.createElement('div');
        React.render(vnode,div1);
        return div1;
    }
}
export async function SetComponentFullScreen(comp:DomComponent):Promise<{onExit:future<boolean>,exit:()=>void}>{
    let ctl={
        onExit:new future<boolean>(),
        exit:function(){if(!this.onExit.done){document.exitFullscreen()}}
    }
    if(!document.body.contains(comp.getDomElement()!)){
        DomRootComponent.addHiddenComponent(comp);
    }
    await comp.getDomElement()!.requestFullscreen();
    DomRootComponent.hiddenDiv!.style.display='block';
    var fsCb=function(ev:Event){
        if(document.fullscreenElement!==comp.getDomElement()){
            comp.getDomElement()!.removeEventListener('fullscreenchange',fsCb);
            ctl.onExit.setResult(true);
            DomRootComponent.hiddenDiv!.style.display='none';
        }
    }
    comp.getDomElement()!.addEventListener('fullscreenchange',fsCb);
    return ctl;
}


export function RequestPrintWindow(options:{
    pageSize?:{w:string,h:string}|'portrait'|'landscape'|'auto',
    pageOrientation?:'upright'|'rotate-left'|'rotate-right',
    margin?:{top?:string,left?:string,bottom?:string,right?:string}|string
}){
    let rules:string[]=[];
    if(options.pageSize!=undefined){
          if(typeof options.pageSize!=='string'){
                rules.push('size:'+options.pageSize.w+' '+options.pageSize.h);
          }else{
                rules.push('size:'+options.pageSize);
          }
    }
    if(options.pageOrientation!=undefined){
          rules.push('page-orientation:'+options.pageOrientation)
    }
    if(options.margin!=undefined){
          if(typeof options.margin!=='string'){
                for(let side in options.margin){
                      let val=(options.margin as any)[side];
                      if(typeof val==='string'){
                            rules.push('margin-'+side+':'+val)
                      }
                }
          }else{
                rules.push('margin:'+options.margin)
          }
    }
    DynamicPageCSSManager.PutCss('@page',rules)  
    window.print();
    DynamicPageCSSManager.RemoveCss('@page')  
}