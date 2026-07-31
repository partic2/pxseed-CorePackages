
import { CodeContextEvent, LocalRunCodeContext, RunCodeContext } from 'partic2/CodeRunner/CodeContext';
import { CodeCell, CodeCellControl, CodeCellList } from 'partic2/CodeRunner/WebUi';
import { GenerateRandomString, GetCurrentTime, IamdeeScriptLoader, Ref2, Task, WaitUntil, assert, future, logger, requirejs, sleep, throwIfAbortError } from 'partic2/jsutils1/base';
import * as React from 'preact'

import {ClientInfo, createIoPipe, getAttachedRemoteRigstryFunction, getPersistentRegistered, getRegistered, importRemoteModule, ServerHostWorker1RpcName} from 'partic2/pxprpcClient/registry'
import { FileTypeHandlerBase } from './fileviewer';

import { ReactRefEx } from 'partic2/pComponentUi/domui';
import { RegistryUI } from 'partic2/pxprpcClient/ui';
import { RemoteRunCodeContext } from 'partic2/CodeRunner/RemoteCodeContext';
import { WindowComponent,alert, appendFloatWindow, prompt, removeFloatWindow } from 'partic2/pComponentUi/window';import { WorkspaceContext } from './workspace';
import { DebounceCall, utf8conv } from 'partic2/CodeRunner/jsutils2';
import { RpcExtendClient1, RpcExtendServer1 } from 'pxprpc/extend';
import { Client,Server } from 'pxprpc/base';
import { NotebookFileData,OpenedJsNotebookFile,__internal__ as workeriniti } from './workerinit';
import { NewWindowHandle, openNewWindow, WorkspaceWindowContext } from 'partic2/pComponentUi/workspace';

import { getResourceManager, useCssFile } from 'partic2/jsutils1/webutils';

export let __name__='partic2/JsNotebook/notebook'

let webworkercall:typeof import('./webworkercall');

export let __inited__=(async function (){
    webworkercall=await importRemoteModule(await (await getPersistentRegistered('webworker 1'))!.ensureConnected(),
        'partic2/JsNotebook/webworkercall');
})()

class RpcChooser extends React.Component<{onChoose:(rpc:ClientInfo)=>void,rpc?:RpcExtendClient1},{}>{
    rref={
        registry:new ReactRefEx<RegistryUI>(),
        registryContainerDiv:new ReactRefEx<HTMLDivElement>()
    }
    render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined; }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChild {
        return <div>
        <h2> <a href="javascript:;" onClick={async ()=>{
            let selected=(await this.rref.registry.waitValid()).getSelected();
            if(selected==null){
                alert('select at least one rpc client below.');
                (await this.rref.registryContainerDiv.waitValid()).style.border='solid red 2px';
                await sleep(1000);
                (await this.rref.registryContainerDiv.waitValid()).style.border='0px';
                return;
            }
            this.props.onChoose((await getRegistered(selected))!);
        }}>Use RPC</a> below</h2>
        <div ref={this.rref.registryContainerDiv}>
            <RegistryUI ref={this.rref.registry} rpc={this.props.rpc}/>
        </div>
        </div>
    }
}

async function openRpcChooser(rpc?:RpcExtendClient1){
    return new Promise<ClientInfo|null|'<No RPC>'>((resolve,reject)=>{
        let wnd2=<WindowComponent onClose={()=>{
            removeFloatWindow(wnd2);
            resolve(null);
        }} title='choose code context' >
            <div style={{backgroundColor:'white',padding:'1px'}}>
            <RpcChooser onChoose={(rpc)=>{
                resolve(rpc);
                removeFloatWindow(wnd2);
            }} rpc={rpc}/>
            <h2>Or <a href="javascript:;" onClick={(ev)=>{
                resolve('<No RPC>')
                removeFloatWindow(wnd2);
            }}>Don't use RPC</a></h2>
            </div>
        </WindowComponent>
        appendFloatWindow(wnd2);
    })
    
}

class NotebookViewerContainer extends React.Component<{context:WorkspaceContext,path:string},{notebookViewerImpl?:{new(prop:any,ctx:any):NotebookViewer}}>{
    render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined; }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChildren {
        let Nbimpl=this.state.notebookViewerImpl??NotebookViewer;
        return <Nbimpl context={this.props.context} path={this.props.path} switchNotebookViewerImpl={(impl)=>this.setState({notebookViewerImpl:impl})}/> 
    }
}



class IJSNBFileHandler extends FileTypeHandlerBase{
    title: string='javascript notebook';
    extension=['.ijsnb'];
    async open(path: string) {
        await this.context!.openNewWindowForFile({
            vnode:<NotebookViewerContainer context={this.context!} path={path}/>,
            title:'Notebook:'+path.substring(path.lastIndexOf('/')+1),
            layoutHint:__name__+'.IJSNBFileHandler',
            filePath:path
        });
    }
}


export class NotebookViewer extends React.Component<{
    context:{rpc:ClientInfo},path:string,
    switchNotebookViewerImpl?:(impl?:{new(prop:any,ctx:any):NotebookViewer})=>void
},{usingRpcName?:string|null}>{
    rref={
        ccl:new ReactRefEx<CodeCellList>(),
        container:new ReactRefEx<HTMLDivElement>()
    };
    async openRpcChooser(){
        let r=await openRpcChooser(await this.props.context.rpc.ensureConnected());
        if(r=='<No RPC>'){
            this.useRpc({name:null});
        }else if(r!=null){
            this.useRpc({name:r.name});
        }
    }
    __notebookViewerEventHandler=async (ev:CodeContextEvent)=>{
        let {call,argv}=ev.data;
        let resultFuture:future<{result?:any,error?:{message:string,stack?:string}}>|null=ev.data.result;
        try{
            let r1=(this as any)[call](...argv);
            if(resultFuture!=null){
                r1=await r1;
                resultFuture.setResult({result:r1});
            }
        }catch(err:any){
            if(resultFuture!=null){
                resultFuture.setResult({error:{message:err.message,stack:err.stack}})
            }
        }
    }
    notebookFile:OpenedJsNotebookFile|null=null;
    codeContext:RunCodeContext|null=null;
    async useRpc(rpc?:{name:string|null}){
        try{
            if(this.notebookFile!=null){
                if(this.codeContext!=undefined){
                    try{
                        this.codeContext.event.dispatchEvent(new CodeContextEvent(`${__name__}.NotebookViewer.disconnect`))
                        this.codeContext.event.removeEventListener(`${__name__}.NotebookViewer`,this.__notebookViewerEventHandler);
                    }catch(err){}
                }
                if(rpc!=undefined){
                    await this.notebookFile.useRpc(rpc.name);
                }
                let connector=await this.notebookFile.ensureRunCodeContextConnector();
                this.codeContext=new RemoteRunCodeContext(await this.props.context.rpc.ensureConnected(),connector);
                this.codeContext.event.addEventListener(`${__name__}.NotebookViewer`,this.__notebookViewerEventHandler);
                await this.codeContext.runCode(`(await import('partic2/JsNotebook/inspector')).setupInspectorHelper(_ENV)`,'')
                this.codeContext.event.dispatchEvent(new CodeContextEvent(`${__name__}.NotebookViewer.connect`));
                if(rpc!=undefined){
                    this.setState({usingRpcName:rpc.name});
                }
            }
        }catch(e:any){
            await alert([e.toString(),e.stack,(e.remoteStack??'')].join('\n'),'Error');
        }
    }
    componentDidMount(): void {
        this.doLoad();
    }
    componentWillUnmount(): void {
        if(this.codeContext!=undefined){
            try{
                this.codeContext.event.dispatchEvent(new CodeContextEvent(`${__name__}.NotebookViewer.disconnect`))
                this.codeContext.event.removeEventListener(`${__name__}.NotebookViewer`,this.__notebookViewerEventHandler)
            }catch(err){}
        }
    }
    async doLoad(){
        try{
            let workerinit=await importRemoteModule(await this.props.context.rpc.ensureConnected(),'partic2/JsNotebook/workerinit') as 
                typeof import('partic2/JsNotebook/workerinit');
            this.notebookFile=await workerinit.openNotebookFile(this.props.path,{});
            let usingRpcName=await this.notebookFile.getRpcName();
            await this.useRpc();
            this.setState({usingRpcName});
            let cellsData=await this.notebookFile.getRawCellsData();
            if(cellsData!=null){
                let ccl=await this.rref.ccl.waitValid();
                await ccl.loadFrom(cellsData);
                for(let t2 of ccl.getCellList()){
                    if(t2.ref.current!=undefined)this.codeCellHighlightQueue.add(t2.ref.current);
                }
                this.DoCodeCellsHightlight.call();
            }
            
        }catch(err:any){
            throwIfAbortError(err);
            alert(err.stack);
        }
    }
    onKeyDown(ev: React.TargetedKeyboardEvent<HTMLElement>){
        if(ev.code==='KeyS' && ev.ctrlKey){
            this.doSave();
            ev.preventDefault();
        }
    }
    async doSave(){
        let ccl=await this.rref.ccl.waitValid();
        let cells=ccl.saveTo();
        if(this.notebookFile!=null){
            await this.notebookFile.setRawCellsData(cells);
            await this.notebookFile.saveToFile();
        }
    }
    async callFunctionInNotebookWebui(module:string,fnName:string,args:any[]){
        let fn=(await import(module))[fnName];
        return await fn(...args,{rpc:this.props.context.rpc,codeContext:this.codeContext,notebookViewer:this});
    }
    async updateNotebookCodeCellsData(cellsData:string){
        let ccl=await this.rref.ccl.waitValid();
        ccl.loadFrom(cellsData);
    }
    async setCodeCellsDataOnRemoteJsNotebook(){
        let ccl=await this.rref.ccl.waitValid();
        await this.codeContext?.runCode(`jsnotebook.codeCellsData=${JSON.stringify(ccl.saveTo())}`);
    }
    async reconnectCodeContextSoon(opt?:{wait?:number}){
        await sleep(opt?.wait??1000);
        try{
            await this.useRpc({name:this.state.usingRpcName!});
        }catch(err:any){
            alert(err.message+err.stack)
        }
    }
    protected codeCellHighlightQueue=new Set<CodeCellControl>();
    protected DoCodeCellsHightlight=new DebounceCall(async ()=>{
        let copy=Array.from(this.codeCellHighlightQueue);
        this.codeCellHighlightQueue.clear();
        for(let codeCell of copy){
            if(!(codeCell.setCellInputHtml!=undefined && codeCell instanceof CodeCell))continue;
            let code=codeCell.getCellInput();
            if(code==undefined || code.length>10000)continue;
            await __inited__;
            let hlcode=await webworkercall.prismHighlightJS(code);
            if(!this.codeCellHighlightQueue.has(codeCell)){
                let lf=hlcode.match(/\n+$/);
                if(lf!=null){
                    hlcode=hlcode.substring(0,hlcode.length-lf[0].length);
                    for(let t1=0;t1<lf[0].length;t1++){
                        hlcode+='<div><br/></div>';
                    }
                }
                codeCell.setCellInputHtml(hlcode);
            }
        }
    },200);
    protected async onCellInputChange(codeCell:CodeCellControl){
        this.codeCellHighlightQueue.add(codeCell);
        this.DoCodeCellsHightlight.call();
    }
    protected renderCodeCellList(){
        return <CodeCellList codeContext={this.codeContext!} ref={this.rref.ccl} cellProps={{
            onInputChange:(target)=>this.onCellInputChange(target)
        }}/>
    }
    containsWindow=new Ref2<NewWindowHandle|null>(null);
    render() {
        return <WorkspaceWindowContext.Consumer>{
            (value)=>{
                this.containsWindow.set(value.lastWindow??null);
                return <div style={{width:'100%',height:'100%',display:'flex',flexDirection:'column'}} onKeyDown={(ev)=>this.onKeyDown(ev)} ref={this.rref.container}>
                    <div style={{flexGrow:'0',flexShrink:'0'}}>
                    <a href="javascript:;" onClick={()=>this.openRpcChooser()}>RPC:{this.state.usingRpcName??'<No RPC>'}</a>
                    <span>&nbsp;&nbsp;</span>
                    <a onClick={()=>this.doSave()} href="javascript:;">Save</a>
                    </div>
                    {(this.codeContext!=undefined)?
                        <div style={{flexShrink:1,minHeight:'0px'}}>{this.renderCodeCellList()}</div>:
                        'No CodeContext'
                    }
                </div>
            }
        }</WorkspaceWindowContext.Consumer>
        
        
    }
    hasMethod(name:string){
        return typeof (this as any)[name]==='function'
    }
    async switchNotebookViewerImpl(implFactory?:{module:string,func:string}){
        assert(this.props.switchNotebookViewerImpl!=undefined);
        let impl:{new (prop: any, ctx: any): NotebookViewer;}|undefined=undefined;
        if(implFactory!=undefined){
            impl=await (await import(implFactory.module))[implFactory.func]();
        }
        this.props.switchNotebookViewerImpl(impl)
    }
}

let resource=getResourceManager(__name__);
useCssFile(resource.getUrl('prism/theme-one-light.css'))

class RunCodeReplView extends React.Component<{
    codeContext:RunCodeContext,onCellRun?:(cellKey:string)=>void,containerStyle?:React.JSX.CSSProperties,
    maxCellCount?:number,codePath?:string
}>{
    rref={
        list:new ReactRefEx<CodeCellList>(),
    }
    rpc?:ClientInfo
    async onCellRun(cellKey:string){
        let ccl=await this.rref.list.waitValid();
        let cellList=ccl.getCellList();
        if(cellList.length>=(this.props.maxCellCount??100)){
            ccl.deleteCell(cellList.at(0)!.key);
        }
    }
    async doRunCode(code:string){
        let cl=(await this.rref.list.waitValid());
        let cl2=cl.getCellList();
        if(cl2.length==0){
            await cl.newCell('');
        }
        let cc=await cl.getCellList().at(-1)!.ref.waitValid();
        cc.setCellInput(code);
        await cc.runCode();
    }
    protected autoScrollToBottom=true;
    componentWillUnmount(): void {
    }
    protected codeCellHighlightQueue=new Set<CodeCellControl>();
    protected DoCodeCellsHightlight=new DebounceCall(async ()=>{
        let copy=Array.from(this.codeCellHighlightQueue);
        this.codeCellHighlightQueue.clear();
        for(let codeCell of copy){
            if(!(codeCell.setCellInputHtml!=undefined && codeCell instanceof CodeCell))continue;
            let code=codeCell.getCellInput();
            if(code==undefined || code.length>10000)continue;
            await __inited__;
            let hlcode=await webworkercall.prismHighlightJS(code);
            if(!this.codeCellHighlightQueue.has(codeCell)){
                let lf=hlcode.match(/\n+$/);
                if(lf!=null){
                    hlcode=hlcode.substring(0,hlcode.length-lf[0].length);
                    for(let t1=0;t1<lf[0].length;t1++){
                        hlcode+='<div><br/></div>';
                    }
                }
                codeCell.setCellInputHtml(hlcode);
            }
        }
    },200);
    protected async onCellInputChange(codeCell:CodeCellControl){
        this.codeCellHighlightQueue.add(codeCell);
        this.DoCodeCellsHightlight.call();
    }
    protected renderCodeCellList(){
        return <CodeCellList codeContext={this.props.codeContext} onRun={(key)=>this.onCellRun(key)} ref={this.rref.list} cellProps={{
            runCodeKey:'Enter',
            onInputChange:(target)=>this.onCellInputChange(target)
        }}/>
    }
    containsWindow=new Ref2<NewWindowHandle|null>(null);
    render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined; }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChild {
        return <WorkspaceWindowContext.Consumer>
            {(value)=>{
                this.containsWindow.set(value.lastWindow??null);
                return this.renderCodeCellList();
            }}
        </WorkspaceWindowContext.Consumer>
    }
}


export let __internal__={
    IJSNBFileHandler,RunCodeReplView,NotebookViewer,RpcChooser,openRpcChooser
}