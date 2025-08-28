
import * as React from 'preact'
import { ArrayWrap2, clone, future, GenerateRandomString, Ref2, sleep } from 'partic2/jsutils1/base';
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
    public changeRoot(rootDiv:HTMLElement){
        this.domElem=rootDiv;
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

class DomRootComponentProxy extends Ref2<CDomRootComponent>{
    public async appendToNode(parent:HTMLElement){
        return this.get().appendToNode(parent);
    }
    public async update(){
        return this.get().update();
    }
    public addHiddenElement(e:HTMLElement){
        return this.get().addHiddenElement(e);
    }
    public removeHiddenElement(e:HTMLElement){
        return this.get().removeHiddenElement(e);
    }
    public async addHiddenComponent(comp:DomComponent){
        return this.get().addHiddenComponent(comp);
    }
    public getChildren(){
        return this.get().getChildren();
    }
    public async addChild(comp:DomComponent){
        return this.get().addChild(comp);
    }
    public async removeChild(comp:DomComponent){
        return this.get().removeChild(comp);
    }
}

export var DomRootComponent=new DomRootComponentProxy(new CDomRootComponent());


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
    floatLayer:GenerateRandomString()
}
DynamicPageCSSManager.PutCss('.'+css.flexRow,['display:flex','flex-direction:row']);
DynamicPageCSSManager.PutCss('.'+css.flexColumn,['display:flex','flex-direction:column']);
DynamicPageCSSManager.PutCss('.'+css.selectable+':hover',['background-color:rgb(200,200,200)']);
DynamicPageCSSManager.PutCss('.'+css.selected,['background-color:rgb(150,150,255)'])
DynamicPageCSSManager.PutCss('.'+css.simpleCard,['display:inline-block','border:solid black 2px','margin:2px','padding:2px','background-color:white'])
DynamicPageCSSManager.PutCss('.'+css.simpleTable,['border-collapse:collapse']);
DynamicPageCSSManager.PutCss('.'+css.simpleTableCell,['border:solid black 2px']);
DynamicPageCSSManager.PutCss('.'+css.floatLayer,['position:absolute','left:0px','top:0px','width:100%','height:100%','pointer-events:none']);

export var event={
    layout:'partic2-layout' as const
}

export let floatLayerZIndexBase=600;

let FloatLayerManager={
    layerComponents:new Map<FloatLayerComponent,{activateTime:number,layerZIndex:number}>(),
    checkRenderLayerStyle:function(c:FloatLayerComponent,activateTime:number):React.JSX.CSSProperties{
        let cur=this.layerComponents.get(c);
        if(cur==null){
            this.layerComponents.set(c,{activateTime,layerZIndex:0});
            this.resortAllLayer();
        }else if(cur.activateTime!=activateTime){
            this.layerComponents.set(c,{activateTime,layerZIndex:0});
            this.resortAllLayer();
        }
        cur=this.layerComponents.get(c);
        let t1:React.JSX.CSSProperties={zIndex:cur!.layerZIndex};
        if(activateTime<0){
            t1.display='none'
        }
        return t1;
    },
    resortAllLayer(){
        let ent=Array.from(this.layerComponents.entries());
        ent.sort((t1,t2)=>t1[1].activateTime-t2[1].activateTime);
        for(let [t1,t2] of ent.entries()){
            if(t2[1].layerZIndex!=floatLayerZIndexBase+t1){
                t2[1].layerZIndex=floatLayerZIndexBase+t1;
                t2[0].forceUpdate();
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

//activateTime: The last actived layer (which activateTime is latest.) will be put to activeLayer as foreground layer, 
interface FloatLayerComponentProps{
    activateTime:number
    divClass?:string[],
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
    render(): React.ComponentChild {
        return <div ref={this.props.divRef} 
            className={[css.floatLayer,
                ...this.props.divClass??[]].join(' ')} style={FloatLayerManager.checkRenderLayerStyle(this,this.props.activateTime)} >
            {this.props.children}
        </div>
    }
}


export function ReactRender<T1 extends DomComponentGroup|HTMLElement>(vnode:React.ComponentChild,container:HTMLElement|DomComponentGroup|'create'|Ref2<T1>){
    if(container instanceof HTMLElement){
        React.render(vnode,container);
    }else if(container instanceof DomComponentGroup){
        React.render(vnode,container.getDomElement()!);
    }else if(container instanceof Ref2){
        ReactRender(vnode,container.get());
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
        DomRootComponent.get().addHiddenComponent(comp);
    }
    await comp.getDomElement()!.requestFullscreen();
    DomRootComponent.get().hiddenDiv!.style.display='block';
    var fsCb=function(ev:Event){
        if(document.fullscreenElement!==comp.getDomElement()){
            comp.getDomElement()!.removeEventListener('fullscreenchange',fsCb);
            ctl.onExit.setResult(true);
            DomRootComponent.get().hiddenDiv!.style.display='none';
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