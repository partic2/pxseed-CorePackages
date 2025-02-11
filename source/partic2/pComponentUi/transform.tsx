import { GenerateRandomString, Ref2, clone } from 'partic2/jsutils1/base';
import { DynamicPageCSSManager } from 'partic2/jsutils1/webutils';
import * as React from 'preact'
import { ReactRefEx } from './domui';


export class PointTrace{
    startPos:{x:number,y:number}={x:0,y:0}
    currPos:{x:number,y:number}={x:0,y:0}
    
    constructor(public opt:{
        onMove?:(curr:{x:number,y:number},start:{x:number,y:number})=>void,
        preventDefault?:boolean
    }){
        this.opt.preventDefault=this.opt.preventDefault??true;
    }
    __onMouseMove=(ev:MouseEvent)=>{
        this.currPos.x=ev.clientX;
        this.currPos.y=ev.clientY;
        this.opt.onMove?.(this.currPos,this.startPos);
        if(this.opt.preventDefault){
            ev.preventDefault();
        }
    }
    __onTouchMove=(ev:TouchEvent)=>{
        if(ev.touches.length>=1){
            this.currPos={x:ev.touches.item(0)!.clientX,y:ev.touches.item(0)!.clientY}
        }
        this.opt.onMove?.(this.currPos,this.startPos);
        if(this.opt.preventDefault){
            ev.preventDefault();
        }
    }
    __onMouseUp=(ev:MouseEvent)=>{
        this.stop();
        if(this.opt.preventDefault){
            ev.preventDefault();
        }
    }
    __onTouchEnd=(ev:TouchEvent)=>{
        if(ev.touches.length==0){
            this.stop();
        }
        if(this.opt.preventDefault){
            ev.preventDefault();
        }
    }
    start(initClientPosition?:{x:number,y:number},stopOnUp?:boolean){
        this.startPos={...this.startPos,...initClientPosition};
        document.addEventListener('mousemove',this.__onMouseMove,{passive:false})
        document.addEventListener('touchmove',this.__onTouchMove,{passive:false})
        if(stopOnUp===true){
            document.addEventListener('mouseup',this.__onMouseUp,{passive:false});
            document.addEventListener('touchend',this.__onTouchEnd,{passive:false});
        }
    }
    stop(){
        document.removeEventListener('mousemove',this.__onMouseMove)
        document.removeEventListener('touchmove',this.__onTouchMove)
        document.removeEventListener('mouseup',this.__onMouseUp);
        document.removeEventListener('touchend',this.__onTouchEnd);
    }
}

export class TransformHelper{
    protected transElem?:HTMLElement|null;
    protected eventElem?:HTMLElement|null;
    protected scale=1.0;
    protected translate=[0,0]
    public translateMode:'translate'|'top left'='translate';
    protected applyTransform(){
        let translateCss=`translate(${this.translate.map(v=>v+'px').join(',')}) scale(${this.scale})`
        if(this.transElem!=null){
            this.transElem.style.transform=translateCss;
        }
    }
    public attach(transElement:HTMLElement,eventElement?:HTMLElement){
        this.transElem=transElement;
        this.transElem.style.position='absolute';
        this.eventElem=eventElement??transElement;
        return this;
    }
    public setTransform(translate:number[],scale:number){
        this.translate=translate;
        this.scale=scale;
        this.applyTransform();
        return this;
    }
    public getTransform(){
        return {translate:this.translate,scale:this.scale}
    }
    public detach(){}
}


export class DraggableAndScalable extends TransformHelper{
    
    protected dragging=false;
    protected mouseinitpos=[0,0];
    protected inittranslate=[0,0];
    protected listener:{[name:string]:any}={};
    protected resizable={left:false,top:false,right:false,bottom:false};
    protected resizing:''|'l'|'t'|'b'|'r'='';
    public onWheel(ev:WheelEvent){
        let sscale=this.scale;
        this.scale += ev.deltaY * -0.001;
        // Restrict scale
        this.scale = Math.min(Math.max(0.125, this.scale), 4);
        // Apply scale transform
        let offx=ev.offsetX;
        let offy=ev.offsetY;
        this.translate[0]+=sscale*offx-offx*this.scale;
        this.translate[1]+=sscale*offy-offy*this.scale;
        this.applyTransform();
    }
    public onMouseMove(ev:MouseEvent){
        if(this.resizing==''){
            this.translate[0]=this.inittranslate[0]+ev.clientX-this.mouseinitpos[0];
            this.translate[1]=this.inittranslate[1]+ev.clientY-this.mouseinitpos[1];
        }
        this.applyTransform();
    }
    
    public onMouseDown(ev:MouseEvent){
        if(this.listener.mousemove==undefined){
            let domRc=this.transElem!.getBoundingClientRect();
            let borderWidth=3;
            if(this.resizable.left && ev.clientX<=domRc.left+borderWidth){
                this.resizing='l';
            }else if(this.resizable.right && ev.clientX>=domRc.right-borderWidth){
                this.resizing='r';
            }else if(this.resizable.top && ev.clientY<=domRc.top+borderWidth){
                this.resizing='t';
            }else if(this.resizable.bottom && ev.clientY>=domRc.bottom-borderWidth){
                this.resizing='b'
            }
            this.mouseinitpos=[ev.clientX,ev.clientY];
            this.inittranslate=clone(this.translate,1);
            this.listener.mousemove=(ev:MouseEvent)=>{this.onMouseMove(ev);}
            this.transElem!.addEventListener('mousemove',this.listener.mousemove,{passive:false});
        }
    }
    public onMouseUp(ev:MouseEvent){
        if(this.listener.mousemove!=undefined){
            this.transElem!.removeEventListener('mousemove',this.listener.mousemove);
            delete this.listener.mousemove
        }
        this.resizing='';
    }
    protected touchScaleCenter=[0,0];
    protected lastTouchDistance=0;
    protected touchmode:'scale'|'translate'|'none'='none'
    public onTouchStart(ev:TouchEvent){
        if(ev.touches.length>=2 && this.touchmode!='scale'){
            this.touchmode='scale';
            let touch1=ev.touches.item(0)!;
            let touch2=ev.touches.item(1)!;
            let dx=touch1.clientX-touch2!.clientX
            let dy=touch1.clientY-touch2!.clientY
            this.lastTouchDistance=Math.sqrt(dx*dx+dy*dy)
            this.touchScaleCenter[0]=((touch1.clientX+touch2!.clientX)/2-this.transElem!.clientLeft-this.translate[0])/this.scale;
            this.touchScaleCenter[1]=((touch1.clientY+touch2!.clientY)/2-this.transElem!.clientTop-this.translate[1])/this.scale;
        }else if(ev.touches.length==1 && this.touchmode=='none'){
            this.touchmode='translate'
            this.mouseinitpos=[ev.touches.item(0)!.clientX,ev.touches.item(0)!.clientY];
            this.inittranslate=clone(this.translate,1);
        }
        if(this.listener.touchmove==undefined){
            this.listener.touchmove=(ev:TouchEvent)=>{ev.preventDefault();this.onTouchMove(ev)};
            this.transElem!.addEventListener('touchmove',this.listener.touchmove,{passive:false});
        }
    }
    public onTouchMove(ev:TouchEvent){
        if(ev.touches.length>=2 && this.touchmode=='scale'){
            let dx=ev.touches.item(0)!.clientX-ev.touches.item(1)!.clientX
            let dy=ev.touches.item(0)!.clientY-ev.touches.item(1)!.clientY
            let dist2=Math.sqrt(dx*dx+dy*dy);
            let sscale=this.scale;
            this.scale *= dist2/this.lastTouchDistance;
            this.lastTouchDistance=dist2;
            this.scale = Math.min(Math.max(0.125, this.scale), 4);
            this.translate[0]+=sscale*this.touchScaleCenter[0]-this.touchScaleCenter[0]*this.scale;
            this.translate[1]+=sscale*this.touchScaleCenter[1]-this.touchScaleCenter[1]*this.scale;
        }else if(ev.touches.length==1 && this.touchmode=='translate'){
            this.translate[0]=this.inittranslate[0]+ev.touches.item(0)!.clientX-this.mouseinitpos[0];
            this.translate[1]=this.inittranslate[1]+ev.touches.item(0)!.clientY-this.mouseinitpos[1];
        }
        this.applyTransform();
    }
    public onTouchEnd(ev:TouchEvent){
        if(ev.touches.length==0 && this.listener.touchmove!=undefined){
            this.transElem!.removeEventListener('touchmove',this.listener.touchmove);
            delete this.listener.touchmove;
            this.touchmode='none';
        }
    }
    public attach(transElement:HTMLElement,eventElement?:HTMLElement){
        super.attach(transElement,eventElement);
        this.listener.mousedown=(ev:MouseEvent)=>{this.onMouseDown(ev);}
        eventElement!.addEventListener('mousedown',this.listener.mousedown,{passive:false});
        this.listener.mouseup=(ev:MouseEvent)=>{this.onMouseUp(ev);}
        eventElement!.addEventListener('mouseup',this.listener.mouseup,{passive:false});
        this.listener.wheel=(ev:WheelEvent)=>{ev.preventDefault();this.onWheel(ev);}
        eventElement!.addEventListener('wheel',this.listener.wheel,{passive:false});
        
        this.listener.touchstart=(ev:TouchEvent)=>{this.onTouchStart(ev)};
        eventElement!.addEventListener('touchstart',this.listener.touchstart,{passive:false});
        this.listener.touchend=(ev:TouchEvent)=>{this.onTouchEnd(ev)};
        eventElement!.addEventListener('touchend',this.listener.touchend,{passive:false});
        
        if(transElement.style.transformOrigin=='')transElement.style.transformOrigin='0 0';
        return this;
    }
    public detach(){
        super.detach();
        for(let k in this.listener){
            this.eventElem!.removeEventListener(k,this.listener[k]);
        }
    }
}

export class DragController{
    dragged:{
        newPos?:(pos:{left:number,top:number})=>void
        curPos?:()=>{left:number,top:number}
    }={}
    positionInitialized=false;
    moved=false;
    draggedRef<T2 extends HTMLElement>(initPos?:{left:number,top:number}){
        let ref=new ReactRefEx<T2>();
        this.dragged.curPos=()=>{
            let elem=ref.current;
            if(elem==null)return {left:0,top:0};
            return {left:Number(elem.style.left.replace(/px/,'')),top:Number(elem.style.top.replace(/px/,''))}
        }
        this.dragged.newPos=(pos)=>{
            let elem=ref.current;
            if(elem!=null){
                elem.style.left=pos.left+'px';
                elem.style.top=pos.top+'px';
            }
        }
        if(initPos!=undefined&&!this.positionInitialized){
            this.positionInitialized=true;
            ref.waitValid().then((elem)=>{
                elem.style.left=initPos.left+'px';
                elem.style.top=initPos.top+'px';
            });
        }
        return ref;
    }
    //Usually used for click handle
    checkIsMovedSinceLastCheck(){
        let moved=this.moved;
        this.moved=false;
        return moved;
    }
    protected _moveTrace=new PointTrace({
        onMove:(curr,start)=>{
            this.dragged.newPos?.({left:curr.x-start.x,top:curr.y-start.y});
            this.moved=true;
        }
    });
    trigger={
        onMouseDown:(ev:MouseEvent)=>{
            let {left,top}=this.dragged.curPos?.()??{left:0,top:0};
            this._moveTrace.start({x:ev.clientX-left,y:ev.clientY-top},true);
        },
        onTouchStart:(ev:TouchEvent)=>{
            let {left,top}=this.dragged.curPos?.()??{left:0,top:0};
            this._moveTrace.start({x:ev.touches[0].clientX-left,y:ev.touches[0].clientY-top},true);
        }
    }
}


export let cssAnimation={
    registerSimpleKeyframes:function(name:string,skf:{percent:number,rule:string[]}[]){
        DynamicPageCSSManager.PutCss('@keyframes '+name,[skf.map(v=>v.percent+'% { '+v.rule.join(';')+'} ').join('')])
        return name;
    },
    unregisterSimpleKeyframes:function(name:string){
        DynamicPageCSSManager.RemoveCss('@keyframes '+name)
    },
    blink:GenerateRandomString()
}

cssAnimation.registerSimpleKeyframes(cssAnimation.blink,[{percent:0,rule:['opacity:0']},{percent:50,rule:['opacity:1']},{percent:100,rule:['opacity:0']}]);