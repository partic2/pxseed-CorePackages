import { ArrayWrap2, GenerateRandomString } from "partic2/jsutils1/base"
import { getIconUrl } from "partic2/pxseedMedia1/index1"
import { css, ReactEventTarget, ReactRefEx, RefChangeEvent } from "./domui"
import * as React from 'preact'
import { PlainTextEditorInput } from "./texteditor"



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

let InputInternalAttr=Symbol('InputInternalAttr')

export class InputArray<P={},S={}> extends ReactEventTarget<P&{
    value?:any[],onChange?:(newValue:any[])=>void,defaultValue?:any
    divClass?:string[],divStyle?:React.JSX.CSSProperties,
    children:(inputRef:React.RefObject<any>)=>React.ComponentChildren
},S>{
    protected valueCollection=new ReactInputValueCollection().forwardChangeEvent(this.eventTarget);
    doPushElement=()=>{
        this.value=[...this.value,this.props.defaultValue??{}];
        this.dispatchEvent(new Event('change'))
    }
    doSliceElement=(delIdx:number)=>{
        let v=this.value as any[];
        v.splice(delIdx,1);
        this.value=v;
        this.dispatchEvent(new Event('change'));
    }
    protected renderElements(tpl:(inputRef:React.RefObject<any>)=>React.ComponentChildren){
        let r:React.VNode[]=[];
        this.value.forEach((t2,t1)=>{
            let t4=tpl(this.valueCollection.getRefForInput('e'+t1));
            if(t2[t1]!=null && typeof t2[t1] =='object' && React.isValidElement(t4)){
                if(t2[t1][InputInternalAttr].arrayKey!=undefined){
                    t4.key=t2[t1][InputInternalAttr].arrayKey
                }else{
                    t4.key=t2[t1][InputInternalAttr].arrayKey
                }
            }
            r.push(<div className={[css.flexRow].join(' ')} style={{alignItems:'center',flexGrow:'1'}}>
                {t4}
                <img src={getIconUrl('x.svg')} onClick={()=>this.doSliceElement(t1)}/>
            </div>)
        });
        return r;
    }
    render(props?: any, state?: Readonly<S> | undefined, context?: any): React.ComponentChild {
        if(this.props.value!=undefined){
            this.value=this.props.value
        }
        let elem=this.props.children;
        if(typeof this.props.children!='function'){
            return this.props.children;
        }else{
            return <div className={[css.flexColumn,...(this.props.divClass??[css.simpleCard])].join(' ')}
                style={{...this.props.divStyle}}>
                {[
                    ...this.renderElements(elem),
                    <div style={{textAlign:'center',height:'16px',backgroundColor:'#ddd'}} onClick={this.doPushElement}>
                        <img src={getIconUrl('plus.svg')} height="16"/>
                    </div>
                ]}
            </div>;
        }
    }
    get value():any[]{
        if(this.__valueApplied){
            let r1:any[]=[]
            let t2=this.valueCollection.getValue();
            for(let t1=0;t1<this.__cachedValue.length;t1++){
                this.__cachedValue[t1]=t2['e'+t1];
            }
        }
        return this.__cachedValue;
    }
    protected __cachedValue:any[]=[];
    protected __valueApplied:boolean=true;
    set value(val:any[]){
        this.__cachedValue=[...val];
        if(this.__valueApplied){
            this.__valueApplied=false;
            this.forceUpdate(async ()=>{
                await this.valueCollection.waitRefValid();
                let v1:Record<string,any>={};
                for(let t1=0;t1<this.__cachedValue.length;t1++){
                    v1['e'+t1]=this.__cachedValue[t1];
                }
                this.valueCollection.setValue(v1);
                this.__valueApplied=true;
            });
        }
    }
    addEventListener(type:'change',cb:(ev:Event)=>void):void{
        this.eventTarget.addEventListener(type,cb);
    }
    removeEventListener(type:'change',cb:(ev:Event)=>void):void{
        this.eventTarget.removeEventListener(type,cb);
    }
}


interface NumberType{
    type:'number'
}

interface StringType{
    type:'string'
}

interface BooleanType{
    type:'boolean'
}

interface ArrayType{
    type:'array'
    element:FormType
}

interface EnumType{
    type:'enum'
    options?:{value:string,text:string}[]
}

interface EnumSetType{
    type:'enumSet'
    options?:{value:string,text:string}[]
}

interface ObjectType{
    type:'object'
    fields:[string,FormType][]
}

interface ButtonType{
    type:'button',
    subbtn?:string[]
    onClick?:(parent:any,subbtn:string)=>void
}


type FormType=NumberType|StringType|BooleanType|ArrayType|EnumType|ObjectType|ButtonType|EnumSetType

export interface JsonFormPros{   
    type:ArrayType|ObjectType,
    divClass?:string[],
    divStyle?:React.JSX.CSSProperties,
}


export class JsonForm extends SimpleReactForm1<JsonFormPros>{
    constructor(props:any,ctx:any){
        super(props,ctx);
    }
    _renderInput(ref:React.RefObject<any>,type:FormType,name:string|null){
        let jsx2:React.JSX.Element[]=[];
        if(this.props.type.type==='object' && type.type!=='button' && type.type!='boolean'){
            jsx2.push(<div>{name}</div>)
        }
        switch(type.type){
            case 'number':
                jsx2.push(<input ref={ref} type="number" style={{flexGrow:1}}/>);
                break;
            case 'boolean':
                jsx2.push(<div className={css.flexRow}>
                    {name}:<ValueCheckBox ref={ref} style={{flexGrow:'1'}}/>
                </div>);
                break;
            case 'string':
                jsx2.push(<PlainTextEditorInput ref={ref}
                    divStyle={{flexGrow:1}} divClass={[css.simpleCard]}
                />)
                break;
            case 'enum':
                jsx2.push(<select style={{flexGrow:1}} ref={ref}>
                    {type.options?.map(opt=><option value={opt.value}>{opt.text}</option>)}
                </select>)
                break;
            case 'enumSet':
                jsx2.push(<select style={{flexGrow:1}} multiple={true} ref={ref}>
                    {type.options?.map(opt=><option value={opt.value}>{opt.text}</option>)}
                </select>)
                break;
            case 'array':
                jsx2.push(<JsonForm ref={ref} type={type} divStyle={{flexGrow:'1'}}></JsonForm>)
                break;
            case 'object':
                jsx2.push(<JsonForm ref={ref} type={type} divStyle={{flexGrow:'1'}}></JsonForm>);
                break;
            case 'button':
                if(type.subbtn==undefined){
                    jsx2.push(
                        <input type="button" value={name??'null'}
                        onClick={()=>type.onClick?.(this.value,'')}  style={{flexGrow:1}}/>)
                }else{
                    jsx2.push(<div className={css.flexRow} style={{alignItems:'center',flexGrow:'1'}}>
                        {type.subbtn!.map(btn=>
                            <input type="button" value={btn}
                            onClick={()=>type.onClick?.(this.value,btn)}  style={{flexGrow:1}}/>
                        )}
                    </div>)
                }
                break;
        }
        return <div style={{flexGrow:'1',alignItems:'left'}} className={css.flexColumn}>{jsx2}</div>;
    }
    static defaultValue:Record<FormType['type'],any>={
        number: 0,
        boolean: false,
        object: {},
        enum: '',
        button: '',
        enumSet: '',
        string: '',
        array: []
    }
    public render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined; }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChild {
        super.render(props,state);
        let type2=this.props.type;
        if(type2.type==='array'){
            return <InputArray divClass={this.props.divClass} divStyle={this.props.divStyle} ref={this.getRefForInput('root')}
                    defaultValue={JsonForm.defaultValue[type2.element.type]}>
                {(ref)=>this._renderInput(ref,(type2 as ArrayType).element,null)}
            </InputArray>
        }else if(type2.type==='object'){
            return <SimpleReactForm1 ref={this.getRefForInput('root')}>{
                (form)=>
                    <div className={[css.simpleCard,css.flexColumn,...(this.props.divClass??[])].join(' ')}
                        style={{...this.props.divStyle}}>
                        {type2.fields.map((val)=>this._renderInput(form.getRefForInput(val[0]),val[1],val[0]))}
                    </div>
            }
            </SimpleReactForm1>
        }
    }
    get value(){
        return super.value.root;
    }
    set value(v:any){
        if(this.props.type.type==='object'){
            for(let [k1,t1] of this.props.type.fields){
                if(v[k1]==undefined){
                    v[k1]=JsonForm.defaultValue[t1.type];
                }
            }
        }
        super.value={root:v};
    }
}