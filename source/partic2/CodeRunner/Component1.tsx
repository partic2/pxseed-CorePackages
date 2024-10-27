import * as React from 'preact'
import { IInteractiveCodeShell, MiscObject, UnidentifiedObject } from './Inspector';
import { BytesToHex, GenerateRandomString } from 'partic2/jsutils1/base';
import { ConsoleDataEvent } from './CodeContext';


export class ObjectViewer extends React.Component<
    {name:string,object:any},
    {folded:boolean,identified?:any}
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
    componentWillReceiveProps?(nextProps: Readonly<{name:string,object:any}>, nextContext: any): void{
        if(this.props.object!==nextProps.object){
            let folded=false;
            if(nextProps.object instanceof UnidentifiedObject){
                folded=true;
            }
            this.setState({identified:null,folded});
        }
    }
    render(props?: React.RenderableProps<{ object: any; }, any> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChild {
        let robj=this.state.identified??this.props.object
        let type1=typeof(robj);
        let TypedArray=Object.getPrototypeOf(Object.getPrototypeOf(new Uint8Array())).constructor;
        if(type1==='string'){
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
                    {this.state.folded?'+':'-'} {this.props.name} ({robj.keyCount>=0?robj.keyCount:'iteratable'})
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
            return 'Date:'+robj.toString()
        }else if(robj instanceof TypedArray){
            return robj.constructor.name+':'+BytesToHex(new Uint8Array(robj.buffer,robj.bytesOffset,robj.length*robj.BYTES_PER_ELEMENT))
        }else if(robj instanceof ArrayBuffer){
            return 'ArrayBuffer:'+BytesToHex(new Uint8Array(robj))
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

export class InspectableShellInspector extends React.Component<{shell:InspectableShell}>{
    componentDidMount(): void {
        this.props.shell.onHistoryChange=()=>this.forceUpdate();
    }
    render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined; }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChild {
        return <div>{
                this.props.shell.historyRecord.map((record)=>
                <div>
                    {record}
                </div>)
        }</div>
    }
}

export class InspectableShell implements IInteractiveCodeShell{
    constructor(public wrapped:IInteractiveCodeShell){}
    historyRecord:string[]=[];
    maxHistoryCount=80;
    onHistoryChange=()=>{};
    pushHistory(record:string){
        this.historyRecord.push(record);
        let cleanCount=this.historyRecord.length-this.maxHistoryCount;
        for(let t1=0;t1<cleanCount;t1++){
            this.historyRecord.shift();
        }
        this.onHistoryChange();
    }
    setMaxHistoryCount(maxHistoryCount: number): void {
        this.maxHistoryCount=maxHistoryCount;
    }
    async init(): Promise<void> {
        this.wrapped.init();
        this.wrapped.onConsoleData=(event)=>{
            this.onConsoleData(event);
            this.historyRecord.push(`[${event.data?.level}]:${event.data?.message}`);
        }
    }
    async runCode(code: string): Promise<any> {
        this.historyRecord.push(`input:${code}`);
        try{
            let result=this.wrapped.runCode(code);
            this.historyRecord.push(`output:${JSON.stringify(code)}`)
            return result;
        }catch(e:any){
            this.historyRecord.push(`error:${e.toString()}`)
            throw e;
        }

    }
    async inspectObject(accessPath: string[]): Promise<any> {
        return this.wrapped.inspectObject(accessPath);
    }
    getRemoteFunction(functionName: string): (...argv: any[]) => Promise<any> {
        return this.wrapped.getRemoteFunction(functionName);
    }
    async setVariable(variableName: string, value: any): Promise<void> {
        return this.wrapped.setVariable(variableName,value);
    }
    close(): void {
        this.wrapped.close();
    }
    onConsoleData: (event: ConsoleDataEvent) => void=()=>{};
}