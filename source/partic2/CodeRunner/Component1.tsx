import * as React from 'preact'
import { MiscObject, UnidentifiedObject } from './Inspector';
import { assert, BytesToHex, GenerateRandomString, requirejs, ToDataUrl } from 'partic2/jsutils1/base';


let __name__=requirejs.getLocalRequireModule(require)

export const CustomViewerFactoryProp='__Zag7QaCUiZb1ABgM__'

export type ObjectViewerProps={name:string,object:any}

export class ObjectViewer extends React.Component<
    {name:string,object:any},
    {folded:boolean,identified?:any,object:any,viewer:null|React.ComponentType<ObjectViewerProps>}
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
                    this.setState({folded:false,identified})
                }catch(e:any){
                    this.setState({folded:false,identified:[e.message,e.stack]})
                }
            }
            this.setState({folded:false});
        }else{
            this.setState({folded:true});
        }
    }
    async beforeRender(){
        if(this.props.object!==this.state.object){
            let folded=false;
            if(this.props.object instanceof UnidentifiedObject){
                folded=true;
            }
            this.setState({identified:null,folded,object:this.props.object,viewer:null});
        }else{
            try{
                if(typeof this.state.object=='object' && this.state.object!=null && CustomViewerFactoryProp in this.state.object && 
                    this.state.viewer==null){
                    let viewerPath=this.state.object[CustomViewerFactoryProp] as string;
                    let dotAt=viewerPath.lastIndexOf('.');
                    let mod=await import(viewerPath.substring(0,dotAt));
                    let viewerFactory=mod[viewerPath.substring(dotAt+1)];
                    if(typeof viewerFactory==='function'){
                        if('render' in viewerFactory.prototype){
                            this.setState({
                                viewer:viewerFactory
                            })
                        }else{
                            this.setState({
                                viewer:await viewerFactory(this.state.object)
                            });
                        }
                    }
                }
            }catch(err:any){
                console.warn(__name__,':',err.toString());
            };
        }
    }
    render(props?: React.RenderableProps<{ object: any; }, any> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChild {
        this.beforeRender();
        let robj=this.state.identified??this.props.object
        let type1=typeof(robj);
        let TypedArray=Object.getPrototypeOf(Object.getPrototypeOf(new Uint8Array())).constructor;
        if(this.state.viewer!=null){
            return React.createElement(this.state.viewer,{...this.props})
        }if(type1==='string'){
            if(robj.indexOf('\n')>=0){
                return <div>{this.props.name}:<pre>{robj}</pre></div>
            }else{
                return <div>{this.props.name}:"{robj}"</div>
            }
        }else if(type1!=='object'){
            return <div>{this.props.name}:{String(robj)}</div>
        }else if(robj===null){
            return <div>{this.props.name}:null</div>
        }else if(robj instanceof Array){
            return <div>
                <a href="javascript:;" onClick={()=>this.toggleFolding()}>
                    {this.state.folded?'+':'-'} {this.props.name} ({robj.length})
                </a><br/>
                {(!this.state.folded)?
                <div style={{paddingLeft:'1em'}}>{
                    robj.map((v1,i1)=>{
                        return <ObjectViewer name={String(i1)} object={v1} key={'index'+i1}/>
                    })
                }</div>:null}
                </div>
        }else if(robj instanceof UnidentifiedObject){
            return <div>
                <a href="javascript:;" onClick={()=>this.toggleFolding()}>
                    {this.state.folded?'+':'-'} {this.props.name} ({robj.keyCount})
                </a>
            </div>
        }else if(robj instanceof MiscObject){
            if(robj.type=='function'){
                return <div>
                    {this.props.name}: function {robj.functionName}()
                </div>
            }else if(robj.type=='serializingError'){
                return <div>
                    {this.props.name}: error {robj.errorMessage}
                </div>
            }
        }else if(robj instanceof Date){
            return <div>
            {this.props.name}: Date:{robj.toString()})
        </div>
        }else if(robj instanceof TypedArray){
            return <div>
            {this.props.name}: {robj.constructor.name}:{BytesToHex(new Uint8Array(robj.buffer,robj.bytesOffset,robj.length*robj.BYTES_PER_ELEMENT))}
        </div>
        }else if(robj instanceof ArrayBuffer){
            return <div>
            {this.props.name}: ArrayBuffer:{BytesToHex(new Uint8Array(robj))}
        </div>
        }else{            
            let keys=Object.keys(robj)
            return <div>
                <a href="javascript:;" onClick={()=>this.toggleFolding()}>
                    {this.state.folded?'+':'-'}{this.props.name} ({keys.length})
                </a><br/>
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


export class HtmlViewer extends React.Component<{name:string,object:{html?:string}}>{
    render(props?: React.RenderableProps<ObjectViewerProps, any> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChildren {
        if(this.props.object.html!=undefined){
            return <div>
                <div>{this.props.name}</div>
                <div dangerouslySetInnerHTML={{__html:this.props.object.html}}></div>
            </div>
        }else{
            return null;
        }
    }
}
export function createViewableHtml(source:{html?:string}){
    let opt:{html?:string}={};
    if(source.html!=undefined){
        opt.html=source.html
    }
    return {
        [CustomViewerFactoryProp]:__name__+'.HtmlViewer',
        ...opt
    }
}


export class ImageViewer extends React.Component<{name:string,object:{url?:string}}>{
    render(props?: React.RenderableProps<ObjectViewerProps, any> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChildren {
        if(this.props.object.url!=undefined){
            return <div>
                <div>{this.props.name}</div>
                <img src={this.props.object.url}></img>
            </div>
        }else{
            return null;
        }
    }
}
export function createViewableImage(source:{url?:string,svg?:string,pngdata?:Uint8Array,jpegdata?:Uint8Array}){
    let opt:{url?:string}={};
    if(source.url!=undefined){
        opt.url=source.url
    }else if(source.svg!=undefined){
        opt.url=ToDataUrl(source.svg,'image/svg+xml')
    }else if(source.pngdata!=undefined){
        opt.url=ToDataUrl(source.pngdata,'image/png')
    }else if(source.jpegdata!=undefined){
        opt.url=ToDataUrl(source.jpegdata,'image/jpeg')
    }
    return {
        [CustomViewerFactoryProp]:__name__+'.ImageViewer',
        ...opt
    }
}

