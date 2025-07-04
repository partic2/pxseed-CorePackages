import { ArrayWrap2 } from "partic2/jsutils1/base"
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
        rref.addEventListener('change',(ev:RefChangeEvent<ReactInput>)=>{
            if(ev.data.prev!=null){
                ev.data.prev.removeEventListener('change',this._onInputValueChange);
            }
            if(ev.data.curr!=null){
                ev.data.curr.addEventListener('change',this._onInputValueChange);
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

export class SimpleReactForm1<P={},S={}> extends ReactEventTarget<P&{value?:Record<string,any>,onChange?:(newValue:Record<string,any>)=>void},S>{
    protected _onChangeListener=()=>{
        this.props.onChange?.(this.value);
    }
    constructor(props:any,ctx:any){
        super(props,ctx);
        this.eventTarget.addEventListener('change',this._onChangeListener);
    }
    public render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined; }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChild {
        //XXX: Is there any better place?
        this.value=this.props.value
        return this.props.children;
    }
    protected valueCollection=new ReactInputValueCollection().forwardChangeEvent(this.eventTarget);
    getRefForInput(name:string){
        return this.valueCollection.getRefForInput(name);
    }
    get value():any{
        this.__cachedValue={...this.__cachedValue,...this.valueCollection.getValue()};
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
    onClick?:(parent:any[] | { [k: string]: any; }|undefined,subbtn?:string)=>void
}


type FormType=NumberType|StringType|BooleanType|ArrayType|EnumType|ObjectType|ButtonType|EnumSetType

export interface JsonFormPros{   
    type:ArrayType|ObjectType,
    divClass?:string[],
    divStyle?:React.JSX.CSSProperties,
}


export class JsonForm extends ReactEventTarget<JsonFormPros,
    {elemCount?:number}>{
    _inputCollector=new ReactInputValueCollection().forwardChangeEvent(this.eventTarget);
    constructor(props:any,ctx:any){
        super(props,ctx);
    }
    _renderInput(name:string,type:FormType){
        let jsx2:React.JSX.Element[]=[];
        if(this.props.type.type==='object' && type.type!=='button' && type.type!='boolean'){
            jsx2.push(<div>{name}</div>)
        }
        switch(type.type){
            case 'number':
                jsx2.push(<input type="number" style={{flexGrow:1}}
                    ref={this._inputCollector.getRefForInput(name)}
                />);
                break;
            case 'boolean':
                jsx2.push(<div className={css.flexRow}>{name}:<ValueCheckBox  style={{flexGrow:'1'}}
                    ref={this._inputCollector.getRefForInput(name)}
                /></div>);
                break;
            case 'string':
                jsx2.push(<PlainTextEditorInput 
                    ref={this._inputCollector.getRefForInput(name)}
                    divStyle={{flexGrow:1}} divClass={[css.simpleCard]}
                />)
                break;
            case 'enum':
                jsx2.push(<select style={{flexGrow:1}}
                    ref={this._inputCollector.getRefForInput(name)}>
                    {type.options?.map(opt=><option value={opt.value}>{opt.text}</option>)}
                </select>)
                break;
            case 'enumSet':
                jsx2.push(<select style={{flexGrow:1}} multiple={true}
                    ref={this._inputCollector.getRefForInput(name)}>
                    {type.options?.map(opt=><option value={opt.value}>{opt.text}</option>)}
                </select>)
                break;
            case 'array':
                jsx2.push(<JsonForm type={type} divStyle={{flexGrow:'1'}}
                    ref={this._inputCollector.getRefForInput(name)}>
                </JsonForm>)
                break;
            case 'object':
                jsx2.push(<JsonForm type={type} divStyle={{flexGrow:'1'}}
                    ref={this._inputCollector.getRefForInput(name)}>
                </JsonForm>);
                break;
            case 'button':
                if(type.subbtn==undefined){
                    jsx2.push(
                        <input type="button" value={name}
                        onClick={()=>type.onClick?.(this.value)}  style={{flexGrow:1}}/>)
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
    doPushElement=()=>{
        this.setState({elemCount:(this.state.elemCount??0)+1});
        this.dispatchEvent(new Event('change'))
    }
    doSliceElement=(delIdx:number)=>{
        let v=this.value as any[];
        v.splice(delIdx,1);
        this.value=v;
        this.setState({elemCount:v.length});
        this.dispatchEvent(new Event('change'));
    }
    
    public render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined; }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChild {
        let type2=this.props.type;
        if(type2.type==='array'){
            return <div className={[css.simpleCard,css.flexColumn,...(this.props.divClass??[])].join(' ')}
                style={{...this.props.divStyle}}>
                {[
                    ...(Array.from(ArrayWrap2.IntSequence(0,this.state.elemCount??0))).map((idx)=>
                        <div className={[css.flexRow].join(' ')} style={{alignItems:'center',flexGrow:'1'}}>
                            {this._renderInput(idx.toString(),(type2 as ArrayType).element)}
                            <img src={getIconUrl('x.svg')} onClick={()=>this.doSliceElement(idx)}/>
                        </div>),
                    <div style={{textAlign:'center',height:'16px',backgroundColor:'#ddd'}} onClick={this.doPushElement}>
                        <img src={getIconUrl('plus.svg')} height="16"/>
                    </div>
                ]}
            </div>
        }else if(type2.type==='object'){
            return <div className={[css.simpleCard,css.flexColumn,...(this.props.divClass??[])].join(' ')}
                style={{...this.props.divStyle}}>{
                type2.fields.map((val)=>this._renderInput(val[0],val[1]))
            }</div>
        }
    }
    get value(){
        if(this.props.type.type==='array'){
            let v=this._inputCollector.getValue();
            let r=[];
            for(let t1 of ArrayWrap2.IntSequence(0,this.state.elemCount??0)){
                r.push(v[t1.toString()]);
            }
            this.cachedValue=r;
        }else if(this.props.type.type==='object'){
            Object.assign(this.cachedValue,this._inputCollector.getValue());
        }
        return this.cachedValue;
    }
    protected cachedValue:any={};
    set value(v:any){
        if(this.props.type.type==='array'){
            let v2=v as Array<any>|undefined;
            let r={} as any;
            if(v2!=undefined){
                for(let t1=0;t1<v2.length;t1++){
                    r[t1.toString()]=v2[t1]
                }
                this.setState({elemCount:v2.length},()=>{
                    this._inputCollector.setValue(r);
                });
            }
        }else if(this.props.type.type==='object'){
            if(v!=undefined){
                this.forceUpdate(()=>{
                    this._inputCollector.setValue(v);
                });
            }
        }
        this.cachedValue=v;
    }
}