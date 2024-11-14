import { ArrayWrap2 } from "partic2/jsutils1/base"
import { getIconUrl } from "partic2/pxseedMedia1/index1"
import { css, ReactEventTarget, ReactInputValueCollection, SimpleReactForm1, ValueCheckBox } from "./domui"
import * as React from 'preact'
import { PlainTextEditorInput } from "./texteditor"


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
        if(this.props.type.type==='object' && type.type!=='button'){
            jsx2.push(<div>{name}</div>)
        }
        switch(type.type){
            case 'number':
                jsx2.push(<input type="number" style={{flexGrow:1}}
                    ref={this._inputCollector.getRefForInput(name)}
                />);
                break;
            case 'boolean':
                jsx2.push(<ValueCheckBox 
                    ref={this._inputCollector.getRefForInput(name)}
                />);
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
            return r;
        }else if(this.props.type.type==='object'){
            return this._inputCollector.getValue();
        }
    }
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
    }
}