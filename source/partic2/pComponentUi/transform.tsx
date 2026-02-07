import { GenerateRandomString, clone } from 'partic2/jsutils1/base';
import { DynamicPageCSSManager } from 'partic2/jsutils1/webutils';
import { ReactRefEx } from './domui';


export class PointTrace{
    startPos:{x:number,y:number}={x:0,y:0}
    currPos:{x:number,y:number}={x:0,y:0}
    stopped=true;
    constructor(public opt:{
        onMove?:(curr:{x:number,y:number},start:{x:number,y:number})=>void,
        onStop?:(curr:{x:number,y:number},start:{x:number,y:number})=>void,
        preventDefault?:boolean
    }){
        this.opt.preventDefault=this.opt.preventDefault??true;
    }
    __onPointerMove=(ev:PointerEvent)=>{
        this.currPos.x=ev.clientX;
        this.currPos.y=ev.clientY;
        this.opt.onMove?.(this.currPos,this.startPos);
        if(this.opt.preventDefault){
            ev.preventDefault();
        }
    }
    __onPointerUp=(ev:PointerEvent)=>{
        this.stop();
        this.currPos.x=ev.clientX;
        this.currPos.y=ev.clientY;
        this.opt.onStop?.(this.currPos,this.startPos);
        if(this.opt.preventDefault){
            ev.preventDefault();
        }
    }
    start(initClientPosition?:{x:number,y:number},stopOnUp?:boolean){
        this.startPos={...this.startPos,...initClientPosition};
        document.addEventListener('pointermove',this.__onPointerMove,{passive:false})
        if(stopOnUp===true){
            document.addEventListener('pointerup',this.__onPointerUp,{passive:false});
        }
        this.stopped=false;
    }
    stop(){
        document.removeEventListener('pointermove',this.__onPointerMove);
        document.removeEventListener('pointerup',this.__onPointerUp);
        this.stopped=true;
    }
}


export class ReactDragController extends EventTarget{
    dragged:{
        newPos?:(pos:{left:number,top:number})=>void
        curPos?:()=>{left:number,top:number}
    }={}
    protected positionInitialized=false;
    protected _ref:ReactRefEx<any>|null=null;
    draggedRef<T2 extends HTMLElement>(initPos?:{left:number,top:number}){
        if(this._ref!=null){
            return this._ref;
        }
        let ref=new ReactRefEx<T2>();
        this._ref=ref;
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
    protected moved=false;
    //Usually used for click handle
    checkIsMovedSinceLastCheck(){
        let moved=this.moved;
        this.moved=false;
        return moved;
    }
    onMove?:(curr: {x: number;y: number;}, start: {x: number;y: number;})=>void
    protected _moveTrace=new PointTrace({
        onMove:(curr,start)=>{
            this.onMove?.(curr,start);
            this.dragged.newPos?.({left:curr.x-start.x+this.moveStartPos.left,top:curr.y-start.y+this.moveStartPos.top});
            if(Math.abs(curr.x-start.x)+Math.abs(curr.y-start.y)>5){
                this.moved=true;
            }
        }
    });
    protected moveStartPos={left:0,top:0}
    trigger={
        onPointerDown:(ev:MouseEvent)=>{
            this.moveStartPos=this.dragged.curPos?.()??{left:0,top:0};
            this._moveTrace.start({x:ev.clientX,y:ev.clientY},true);
        },
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