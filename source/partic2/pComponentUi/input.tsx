import { ArrayWrap2, GenerateRandomString } from "partic2/jsutils1/base"
import { getIconUrl } from "partic2/pxseedMedia1/index1"
import { css, ReactEventTarget, ReactRefEx } from "./domui"
import * as React from 'preact'
import { PlainTextEditorInput } from "./texteditor"
import { prompt } from "./window"



export class ValueCheckBox extends ReactEventTarget<{value?:boolean,style?:React.JSX.CSSProperties,className?:string},{}>{
    protected cbref=React.createRef();
    public componentDidMount(){
        if(this.props.value!=undefined){
            this.cbref.current.checked=this.props.value;
        }
    }
    render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined; }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChild {
        return <input ref={this.cbref} style={this.props.style} 
                    onChange={()=>this.eventTarget.dispatchEvent(new Event('change'))}
                    type="checkbox" className={this.props.className}/>
    }
    get value(){
        return this.cbref.current?.checked;
    }
    set value(v:boolean){
        if(this.cbref.current!=null){
            this.cbref.current.checked=v;
        }
    }
}

interface ReactInput{
    value:any;
    addEventListener(type:'change',cb:(ev:Event)=>void):void;
    removeEventListener(type:'change',cb:(ev:Event)=>void):void;
}


export class ReactInputValueCollection extends EventTarget{
    inputRef={} as {[k:string]:ReactRefEx<ReactInput>}
    protected _onInputValueChange=(ev:Event)=>{
        this.dispatchEvent(new Event('change'));
    }
    getRefForInput(name:string):React.RefObject<any>{
        if(name in this.inputRef){
            return this.inputRef[name];
        }
        let rref=new ReactRefEx<ReactInput>();
        rref.watch((r,prev)=>{
            if(prev!=null){
                prev.removeEventListener('change',this._onInputValueChange);
            }
            if(r.get()!=null){
                r.get()!.addEventListener('change',this._onInputValueChange);
            }
        });
        this.inputRef[name]=rref;
        return rref;
    }
    async waitRefValid():Promise<this>{
        await Promise.all(Object.values(this.inputRef).map(t1=>t1.waitValid))
        return this;
    }
    getValue(){
        let val:any={}
        for(var name in this.inputRef){
            let elem=this.inputRef[name].current;
            if(elem!=undefined){
                val[name]=elem.value;
            }
        }
        return val;
    }
    setValue(val:{[k:string]:any}){
        for(var name in this.inputRef){
            let elem=this.inputRef[name].current;
            if(elem!=undefined && val[name]!==undefined){
                elem.value=val[name];
            }
        }
    }
    forwardChangeEvent(eventTarget:EventTarget){
        this.addEventListener('change',()=>eventTarget.dispatchEvent(new Event('change')));
        return this;
    }
}

export class SimpleReactForm1<P={},S={}> extends ReactEventTarget<P&{
    value?:any,onChange?:(newValue:any)=>void,
    children?:(form:SimpleReactForm1)=>React.ComponentChildren
},S>{
    protected _onChangeListener=()=>{
        this.props.onChange?.(this.value);
    }
    constructor(props:any,ctx:any){
        super(props,ctx);
        this.eventTarget.addEventListener('change',this._onChangeListener);
    }
    public render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined; }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChild {
        //XXX: Is there any better place?
        if(this.props.value!=undefined){
            this.value=this.props.value
        }
        return this.props.children?.(this);
    }
    protected valueCollection=new ReactInputValueCollection().forwardChangeEvent(this.eventTarget);
    getRefForInput(name:string){
        return this.valueCollection.getRefForInput(name);
    }
    get value():any{
        if(this.__valueApplied){
            this.__cachedValue={...this.__cachedValue,...this.valueCollection.getValue()};
        }
        return this.__cachedValue;
    }
    protected __cachedValue={};
    protected __valueApplied:boolean=true;
    set value(val:any){
        this.__cachedValue={...val};
        if(this.__valueApplied){
            this.__valueApplied=false;
            (async ()=>{
                await this.valueCollection.waitRefValid();
                this.valueCollection.setValue(this.__cachedValue);
                this.__valueApplied=true;
            })();
        }
    }
    addEventListener(type:'change',cb:(ev:Event)=>void):void{
        this.eventTarget.addEventListener(type,cb);
    }
    removeEventListener(type:'change',cb:(ev:Event)=>void):void{
        this.eventTarget.removeEventListener(type,cb);
    }
}


export async function promptWithForm(simpleReactFormVNode:React.VNode,options?:{title?:string,initialValue?:any}){
    let ref2=new ReactRefEx<SimpleReactForm1>();
    if(simpleReactFormVNode.ref!=undefined)ref2.forward([simpleReactFormVNode.ref]);
    simpleReactFormVNode.ref=ref2
    let dlg=await prompt(simpleReactFormVNode,options?.title??'prompt');
    if(options?.initialValue!=undefined){
        (await ref2.waitValid()).value=options.initialValue;
    }
    if(await dlg.response.get()=='ok'){
        let resultValue=(await ref2.waitValid()).value;
        dlg.close();
        return resultValue;
    }
    dlg.close();
    return null
}