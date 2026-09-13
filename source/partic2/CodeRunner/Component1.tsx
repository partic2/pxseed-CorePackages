import * as React from 'preact'
import { MiscObject, UnidentifiedObject } from './Inspector';
import { assert, GenerateRandomString, LogHandlerArg0, requirejs, Task, ToDataUrl } from 'partic2/jsutils1/base';
import { text2html } from 'partic2/pComponentUi/utils';
import { DynamicPageCSSManager } from 'partic2/jsutils1/webutils';
import {EventBuffer, u8hexconv} from './jsutils2'
import { RunCodeContext } from './CodeContext';
import { ReactRefEx } from 'partic2/pComponentUi/domui';


let __name__=requirejs.getLocalRequireModule(require)

export const CustomViewerFactoryProp='__Zag7QaCUiZb1ABgM__'

export type ObjectViewerProps={name:string,object:any,codeContext?:RunCodeContext,variableName?:string}

export let css1={
    propName:GenerateRandomString()
}



export function createViewableHtml(source:{html?:string,js?:string}){
    return {
        [CustomViewerFactoryProp]:__name__+'.HtmlViewer',
        ...source
    }
}

export function createViewableImage(source:{url?:string,svg?:string,pngdata?:Uint8Array,jpegdata?:Uint8Array,bmpdata?:Uint8Array}){
    let opt:{url?:string}={};
    if(source.url!=undefined){
        opt.url=source.url
    }else if(source.svg!=undefined){
        opt.url=ToDataUrl(source.svg,'image/svg+xml')
    }else if(source.pngdata!=undefined){
        opt.url=ToDataUrl(source.pngdata,'image/png')
    }else if(source.jpegdata!=undefined){
        opt.url=ToDataUrl(source.jpegdata,'image/jpeg')
    }else if(source.bmpdata!=undefined){
        opt.url=ToDataUrl(source.bmpdata,'image/bmp')
    }
    return {
        [CustomViewerFactoryProp]:__name__+'.ImageViewer',
        ...opt
    }
}
if(globalThis.document!=undefined){
    DynamicPageCSSManager.PutCss('.'+css1.propName,['color:blue']);
}
export class ObjectViewer extends React.Component<
    {name:string,object:any,variableName?:string},
    {folded:boolean,displayModel?:any,lastPropObject:any,viewer:null|React.ComponentType<ObjectViewerProps>}
>{
    constructor(props:any,ctx:any){
        super(props,ctx);
        if(this.props.object instanceof UnidentifiedObject){
            this.setState({folded:true});
        }else{
            this.setState({folded:false});
        }
    }
    async toggleFolding(){
        if(this.state.folded){
            if(this.props.object instanceof UnidentifiedObject){
                try{
                    let identified=await this.props.object.identify({maxDepth:1,maxKeyCount:this.props.object.keyCount+1});
                    this.setState({folded:false,displayModel:identified})
                }catch(e:any){
                    this.setState({folded:false,displayModel:[e.message,e.stack]})
                }
            }
            this.setState({folded:false});
        }else{
            this.setState({folded:true});
        }
    }
    protected async onDisplayModelChanged(){
        try{
            let robj=this.state.displayModel;
            if(typeof robj==='object' && robj!=null && CustomViewerFactoryProp in robj){
                let viewerPath=robj[CustomViewerFactoryProp] as string;
                let dotAt=viewerPath.lastIndexOf('.');
                let mod=await import(viewerPath.substring(0,dotAt));
                let viewerFactory=mod[viewerPath.substring(dotAt+1)];
                if(typeof viewerFactory==='function'){
                    if('render' in viewerFactory.prototype){
                        this.setState({viewer:viewerFactory});
                    }else{
                        this.setState({viewer:await viewerFactory(robj)});
                    }
                }
            }else{
                this.setState({viewer:null});
            }
        }catch(err:any){
            console.warn(__name__,':',err.toString());
        };
    }
    protected lastDisplayModel=null;
    async renderUpdateCheck(){
        if(this.props.object!==this.state.lastPropObject){
            let folded=false;
            if(this.props.object instanceof UnidentifiedObject){
                folded=true;
            }
            this.setState({displayModel:this.props.object,folded,lastPropObject:this.props.object});
            if(this.props.object instanceof Array){
                let newArr=new Array();
                let arrayElemUpdated=false;
                try{
                    for(let t1 of this.props.object){
                        if(t1 instanceof UnidentifiedObject && t1.keyCount<10){
                            newArr.push(await t1.identify({maxDepth:1}))
                            arrayElemUpdated=true;
                        }else{
                            newArr.push(t1);
                        }
                    }
                    if(arrayElemUpdated){
                        this.setState({displayModel:newArr});
                    }
                }catch(e:any){
                    this.setState({displayModel:[e.message,e.stack]})
                }
            }
        }
        if(this.state.displayModel!=this.lastDisplayModel){
            this.onDisplayModelChanged();
            this.lastDisplayModel=this.state.displayModel
        }
    }
    renderExpandChildrenBtnIfAvailable(){
        let robj=this.state.displayModel;
        if(robj instanceof Array){
            if(robj.find(t1=>t1 instanceof UnidentifiedObject)!=undefined){
                return <a style={{color:'blue'}} onClick={async ()=>{
                    let newArr=[];
                    try{
                        for(let t1 of robj){
                            if(t1 instanceof UnidentifiedObject){
                                newArr.push(await t1.identify({maxDepth:1}))
                            }
                        }
                        this.setState({displayModel:newArr});
                    }catch(e:any){
                        this.setState({displayModel:[e.message,e.stack]})
                    }
                }}>(Expand Children)</a>
            }
        }else{
            if(Object.values(robj).find(t1=>t1 instanceof UnidentifiedObject)!=undefined){
                return <a style={{color:'blue'}} onClick={async ()=>{
                    let newObj:any={};
                    try{
                        for(let t1 in robj){
                            if(robj[t1] instanceof UnidentifiedObject){
                                newObj[t1]=await robj[t1].identify({maxDepth:1});
                            }else{
                                newObj[t1]=robj[t1];
                            }
                        }
                        this.setState({displayModel:newObj});
                    }catch(e:any){
                        this.setState({displayModel:[e.message,e.stack]})
                    }
                }}>(Expand Children)</a>
            }
        }
        return null;
    }
    render(props?: React.RenderableProps<{ object: any; }, any> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChild {
        this.renderUpdateCheck();
        let robj=this.state.displayModel
        let type1=typeof(robj);
        let TypedArray=Object.getPrototypeOf(Object.getPrototypeOf(new Uint8Array())).constructor;
        if(this.state.viewer!=null){
            return React.createElement(this.state.viewer,{...this.props})
        }else if(type1==='string'){
            if(robj.includes('\n')){
                let html1=text2html('`'+robj+'`');
                return <div>
                    <div><span className={css1.propName}>{this.props.name}:</span></div>
                    <div style={{wordBreak:'break-all'}} dangerouslySetInnerHTML={{__html:html1}}></div>
                    </div>
            }else{
                let html1=text2html('"'+robj+'"');
                return <div>
                    <span className={css1.propName}>{this.props.name}:</span>
                    <div style={{wordBreak:'break-all',display:'inline-block'}} dangerouslySetInnerHTML={{__html:html1}}></div>
                </div>
            }
        }else if(type1!=='object'){
            return <div><span className={css1.propName}>{this.props.name}:</span>{String(robj)}</div>
        }else if(robj===null){
            return <div><span className={css1.propName}>{this.props.name}:</span>null</div>
        }else if(robj instanceof Array){
            return <div>
                <a className={css1.propName} onClick={()=>this.toggleFolding()}>
                    {this.state.folded?'+':'-'} {(this.props.variableName??'')+this.props.name} ({robj.length})
                </a>
                {this.renderExpandChildrenBtnIfAvailable()}<br/>
                {(!this.state.folded)?
                <div style={{paddingLeft:'1em'}}>{
                    robj.map((v1,i1)=>{
                        return <ObjectViewer name={String(i1)} object={v1} key={'index'+i1}/>
                    })
                }</div>:null}
                </div>
        }else if(robj instanceof UnidentifiedObject){
            return <div>
                <a className={css1.propName} onClick={()=>this.toggleFolding()}>
                    {this.state.folded?'+':'-'} {(this.props.variableName??'')+this.props.name} ({robj.keyCount})
                </a>
            </div>
        }else if(robj instanceof MiscObject){
            if(robj.type=='function'){
                return <div>
                    <span className={css1.propName}>{this.props.name}:</span> function {robj.functionName}()
                </div>
            }else if(robj.type=='serializingError'){
                return <div>
                    <span className={css1.propName}>{this.props.name}:</span> error {robj.errorMessage}
                </div>
            }
        }else if(robj instanceof Date){
            return <div style={{wordBreak:'break-all'}}>
            <span className={css1.propName}>{this.props.name}:</span> Date:{robj.toString()})
        </div>
        }else if(robj instanceof TypedArray){
            return <div style={{wordBreak:'break-all'}}>
            <span className={css1.propName}>{this.props.name}:</span> {robj.constructor.name}:{u8hexconv(new Uint8Array(robj.buffer,robj.bytesOffset,robj.length*robj.BYTES_PER_ELEMENT))}
        </div>
        }else if(robj instanceof ArrayBuffer){
            return <div style={{wordBreak:'break-all'}}>
            <span className={css1.propName}>{this.props.name}:</span> ArrayBuffer:{u8hexconv(new Uint8Array(robj))}
        </div>
        }else{            
            let keys=Object.keys(robj)
            return <div>
                <a className={css1.propName} onClick={()=>this.toggleFolding()}>
                    {this.state.folded?'+':'-'}{(this.props.variableName??'')+this.props.name} ({keys.length})
                </a>
                {this.renderExpandChildrenBtnIfAvailable()}<br/>
                {(!this.state.folded)?
                <div style={{paddingLeft:'1em'}}>{
                    keys.map((v1)=>{
                        return <ObjectViewer name={v1} object={robj[v1]} key={'index'+v1}/>
                    })
                }</div>:null}
            </div>
        }
    }
}
class HtmlViewer extends React.Component<{name:string,object:{html?:string,js?:string}}>{
    divRef=new ReactRefEx<HTMLDivElement>();
    render(props?: React.RenderableProps<ObjectViewerProps, any> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChildren {
        if(this.props.object.js!=undefined){
            new Function('component',this.props.object.js)(this);
            this.props.object.js=undefined;
        }
        if(this.props.object.html!=undefined){
            return <div>
                <div className={css1.propName}>{this.props.name}:</div>
                <div dangerouslySetInnerHTML={{__html:this.props.object.html}} ref={this.divRef}></div>
            </div>
        }else{
            return <div ref={this.divRef}></div>;
        }
    }
}

export class ImageViewer extends React.Component<{name:string,object:{url?:string}}>{
    render(props?: React.RenderableProps<ObjectViewerProps, any> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChildren {
        if(this.props.object.url!=undefined){
            return <div>
                <div className={css1.propName}>{this.props.name}</div>
                <img src={this.props.object.url}></img>
            </div>
        }else{
            return null;
        }
    }
}



export class SimpleLogViewer extends React.Component<
    {logSources:Array<EventBuffer<LogHandlerArg0>>},
    {history:Array<{level:'debug'|'info'|'warning'|'error',label:string,msg:string[]}>,filter: string}>{
    constructor(props:any,ctx:any){
        super(props,ctx);
        this.setState({filter:'',history:[]})
    }
    onFilterChange = (ev: React.TargetedInputEvent<HTMLInputElement>) => {
        this.setState({ filter: (ev.target as any).value })
    }
    clearHistory() {
        this.setState({ history: [] })
    }
    consumerId=GenerateRandomString()
    pollTask:Task<any>|null=null;
    componentDidMount(){
        this.pollTask=Task.fork(function *(this:SimpleLogViewer){
            let rootPollTask=Task.currentTask;
            yield Promise.allSettled(this.props.logSources.map(logBuffer=>{
                return Task.fork(function *(this:SimpleLogViewer){
                    while(this.pollTask===rootPollTask){
                        let logmsg=yield *Task.yieldWrap(logBuffer.take(this.consumerId));
                        this.state.history.push(...logmsg.map(t1=>({...t1.event,msg:t1.event.msg.map(t2=>String(t2))})));
                        this.setState({});
                    }
                }.bind(this)).run();
            }))
        }.bind(this));
        this.pollTask.run();
    }
    componentWillUnmount(){
        if(this.pollTask!=null){
            this.pollTask.abort();
            this.pollTask=null;
        }
    }
    render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined; }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChildren {
        return <div style={{ display: 'flex', flexDirection: 'column', height: '100%' ,minWidth:'400px',minHeight:'300px'}}>
            <div style={{ flexGrow: '1', flexShrink: '1', overflow: 'auto' }}>{this.state.history.filter(t1 => t1.label.includes(this.state.filter) || t1.msg.some(t2=>t2.includes(this.state.filter))).map((t1,t2) => {
                return <div style={{ whiteSpace: 'pre-wrap' }}>
                    [{t1.level}]{t1.label}:{t1.msg.map(t2=>t2.toString()).join(' ')}
                </div>
            })}</div>
            <div style={{ flexShrink: '0', display: 'flex', flexDirection: 'row' }}>
                <input type='button' style={{ flexGrow: '0' }} value='clear' onClick={() => this.clearHistory()} />
                <input type='text' onChange={this.onFilterChange} style={{ flexGrow: '1' }} placeholder='filter' />
            </div>
        </div>
    }
}