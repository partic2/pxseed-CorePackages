
import { CodeContextEvent, LocalRunCodeContext, RunCodeContext } from 'partic2/CodeRunner/CodeContext';
import { CodeCell, CodeCellList } from 'partic2/CodeRunner/WebUi';
import { GenerateRandomString, GetCurrentTime, IamdeeScriptLoader, Task, WaitUntil, assert, future, logger, requirejs, sleep } from 'partic2/jsutils1/base';
import * as React from 'preact'

import {ClientInfo, createIoPipe, getAttachedRemoteRigstryFunction, getPersistentRegistered, getRegistered, importRemoteModule, listRegistered, persistent, ServerHostWorker1RpcName} from 'partic2/pxprpcClient/registry'
import { FileTypeHandlerBase } from './fileviewer';

import { connectToRemoteCodeContext, __name__ as RemoteCodeContextName } from 'partic2/CodeRunner/RemoteCodeContext';
import { ReactRefEx } from 'partic2/pComponentUi/domui';
import { RegistryUI } from 'partic2/pxprpcClient/ui';
import { RemoteRunCodeContext } from 'partic2/CodeRunner/RemoteCodeContext';
import { WindowComponent,alert, appendFloatWindow, prompt, removeFloatWindow } from 'partic2/pComponentUi/window';import { WorkspaceContext } from './workspace';
import { DebounceCall, utf8conv } from 'partic2/CodeRunner/jsutils2';
import { RpcExtendClient1, RpcExtendServer1 } from 'pxprpc/extend';
import { Client,Server } from 'pxprpc/base';
import { NotebookFileData,__internal__ as workeriniti } from './workerinit';
import { openNewWindow } from 'partic2/pComponentUi/workspace';

import { getResourceManager, useCssFile } from 'partic2/jsutils1/webutils';

export let __name__='partic2/JsNotebook/notebook'

let webworkercall:typeof import('./webworkercall');

export let __inited__=(async function (){
    webworkercall=await importRemoteModule(await (await getPersistentRegistered('webworker 1'))!.ensureConnected(),
        'partic2/JsNotebook/webworkercall');
})()

class RpcChooser extends React.Component<{onChoose:(rpc:ClientInfo|'local window')=>void},{}>{
    rref={
        registry:new ReactRefEx<RegistryUI>(),
        registryContainerDiv:new ReactRefEx<HTMLDivElement>()
    }
    render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined; }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChild {
        return <div>
        <h2>From...</h2>
        <a href="javascript:;" onClick={()=>this.props.onChoose('local window')}>Local Window</a>
        <h2>or <a href="javascript:;" onClick={async ()=>{
            let selected=(await this.rref.registry.waitValid()).getSelected();
            if(selected==null){
                alert('select at least one rpc client below.');
                (await this.rref.registryContainerDiv.waitValid()).style.border='solid red 2px';
                await sleep(1000);
                (await this.rref.registryContainerDiv.waitValid()).style.border='0px';
                return;
            }
            this.props.onChoose(getRegistered(selected)!);
        }}>Use RPC</a> below</h2>
        <div ref={this.rref.registryContainerDiv}>
            <RegistryUI ref={this.rref.registry}/>
        </div>
        </div>
    }
}

async function openRpcChooser(){
    return new Promise<ClientInfo|'local window'|null>((resolve,reject)=>{
        let wnd2=<WindowComponent onClose={()=>{
            removeFloatWindow(wnd2);
            resolve(null);
        }} title='choose code context' >
            <div style={{backgroundColor:'white',padding:'1px'}}>
            <RpcChooser onChoose={(rpc)=>{
                resolve(rpc);
                removeFloatWindow(wnd2);
            }}/>
            </div>
        </WindowComponent>
        appendFloatWindow(wnd2);
    })
    
}

class IJSNBFileHandler extends FileTypeHandlerBase{
    title: string='javascript notebook';
    extension=['.ijsnb'];
    async open(path: string) {
        await this.context!.openNewWindowForFile({
            vnode:<NotebookViewer context={this.context!} path={path}/>,
            title:'Notebook:'+path.substring(path.lastIndexOf('/')+1),
            layoutHint:__name__+'.IJSNBFileHandler',
            filePath:path
        });
    }
}


class NotebookViewer extends React.Component<{context:WorkspaceContext,path:string},{
    rpc?:ClientInfo,codeContext?:RunCodeContext,connectCode?:string,startupScript?:string
}>{
    rref={
        ccl:new ReactRefEx<CodeCellList>(),
        container:new ReactRefEx<HTMLDivElement>()
    };
    async openRpcChooser(){
        let r=await openRpcChooser();
        if(r=='local window'){
            if(this.props.context.rpc instanceof workeriniti.LoopbackRpcClient){
                r=this.props.context.rpc
            }else{
                r=new workeriniti.LoopbackRpcClient('local window','loopback:local window');
            }
        }
        if(r!=null){
            this.useRpc(r as ClientInfo);
        }
    }
    __notebookViewerEventHandler=(ev:CodeContextEvent)=>{
        let {call,argv}=ev.data;
        (this as any)[call](...argv);
    }
    async useRpc(rpc:ClientInfo,opt?:{startupScript?:string}){
        try{
            let code=await connectToRemoteCodeContext(await rpc.ensureConnected(),
            `return (await lib.importModule('partic2/JsNotebook/workerinit')).createRunCodeContextConnectorForNotebookFile(
                ${JSON.stringify(this.props.path)},${JSON.stringify({setupInspectorHelper:true})}
            )`);
            if(this.state.codeContext!=undefined){
                if(opt==undefined){
                    try{opt=JSON.parse((await this.state.codeContext.runCode(`return JSON.stringify(jsnotebook)`)).stringResult??'{}')}catch(err){}
                }
                try{this.state.codeContext.close();}catch(err){}
                try{this.state.codeContext.event.removeEventListener(`${__name__}.NotebookViewer`,this.__notebookViewerEventHandler)}catch(err){}
            }
            code.event.addEventListener(`${__name__}.NotebookViewer`,this.__notebookViewerEventHandler)
            this.setState({rpc,codeContext:code});
            let jsnotebook=JSON.parse((await code.runCode('return JSON.stringify(jsnotebook)')).stringResult!);
            if(jsnotebook==null){
                await code.runCode(`jsnotebook={};`);
            }
            await code.runCode(`Object.assign(jsnotebook,${JSON.stringify({startupScript:opt?.startupScript??''})});`);
            await code.runCode(`jsnotebook.doSave=(...argv)=>_ENV.event.dispatchEvent(new CodeContextEvent('${__name__}.NotebookViewer',{data:{call:'doSave',argv}}))`);
            await code.runCode(`jsnotebook.callFunctionInNotebookWebui=(...argv)=>_ENV.event.dispatchEvent(new CodeContextEvent('${__name__}.NotebookViewer',{data:{call:'callFunctionInNotebookWebui',argv}}))`);
            await code.runCode(`jsnotebook.openRpcChooser=(...argv)=>_ENV.event.dispatchEvent(new CodeContextEvent('${__name__}.NotebookViewer',{data:{call:'openRpcChooser',argv}}))`);
            await code.runCode(`jsnotebook.updateNotebookCodeCellsData=(...argv)=>_ENV.event.dispatchEvent(new CodeContextEvent('${__name__}.NotebookViewer',{data:{call:'updateNotebookCodeCellsData',argv}}))`);
            await code.runCode(`jsnotebook.setCodeCellsDataOnRemoteJsNotebook=(...argv)=>_ENV.event.dispatchEvent(new CodeContextEvent('${__name__}.NotebookViewer',{data:{call:'setCodeCellsDataOnRemoteJsNotebook',argv}}))`);
            await code.runCode(`jsnotebook.reconnectCodeContextSoon=(...argv)=>_ENV.event.dispatchEvent(new CodeContextEvent('${__name__}.NotebookViewer',{data:{call:'reconnectCodeContextSoon',argv}}))`)
        }catch(e:any){
            await alert([e.toString(),e.stack,(e.remoteStack??'')].join('\n'),'Error');
        }
    }
    componentDidMount(): void {
        this.doLoad();
    }
    componentWillUnmount(): void {
        if(this.state.codeContext!=undefined){
            this.state.codeContext.close();
        }
    }
    async doLoad(){
        let t1=await this.props.context.fs!.readAll(this.props!.path);
        if(t1==null)return;
        let data=new Uint8Array(t1);
        if(data.length==0){
            data=utf8conv('{}');
        }
        let f1=new NotebookFileData();
        try{f1.load(data);}catch(err){};
        await this.useRpc((await f1.getRpcClient())!,{startupScript:f1.startupScript});
        if(f1.cells!=undefined){
            let ccl=await this.rref.ccl.waitValid();
            await ccl.loadFrom(f1.cells);
            for(let t2 of ccl.state.list){
                if(t2.ref.current!=undefined)this.codeCellHighlightQueue.add(t2.ref.current);
            }
            this.DoCodeCellsHightlight.call();
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
        let saved={ver:1,rpc:this.getRpcStringRepresent(),path:this.props.path,cells} as any;
        if(this.state.codeContext!=undefined){
            let jsnotebook=JSON.parse((await this.state.codeContext.runCode(`return JSON.stringify(jsnotebook)`)).stringResult??'{}');
            saved.startupScript=jsnotebook.startupScript;
        }
        await this.props.context.fs!.writeAll(this.props.path,utf8conv(JSON.stringify(saved)));
    }
    async callFunctionInNotebookWebui(module:string,fnName:string,args:any[]){
        let fn=(await import(module))[fnName];
        fn(...args,{rpc:this.state.rpc,codeCellList:this.rref.ccl,codeContext:this.state.codeContext});
    }
    async updateNotebookCodeCellsData(cellsData:string){
        let ccl=await this.rref.ccl.waitValid();
        ccl.loadFrom(cellsData);
    }
    async setCodeCellsDataOnRemoteJsNotebook(){
        let ccl=await this.rref.ccl.waitValid();
        await this.state.codeContext?.runCode(`jsnotebook.codeCellsData=${JSON.stringify(ccl.saveTo())}`);
    }
    async reconnectCodeContextSoon(opt?:{wait?:number}){
        try{
            await this.state.rpc!.disconnect();
        }catch(err){};
        await sleep(opt?.wait??1000);
        try{
            await this.state.rpc!.ensureConnected();
            await this.useRpc(this.state.rpc!);
        }catch(err:any){
            alert(err.message+err.stack)
        }
    }
    protected getRpcStringRepresent(){
        return this.state.rpc?.name??'<No name>';
    }
    protected codeCellHighlightQueue=new Set<CodeCell>();
    protected DoCodeCellsHightlight=new DebounceCall(async ()=>{
        let copy=Array.from(this.codeCellHighlightQueue);
        this.codeCellHighlightQueue.clear();
        for(let codeCell of copy){
            let input1=await codeCell.rref.codeInput.waitValid();
            let code=input1.getPlainText();
            if(code.length>10000)continue;
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
                let caret=null;
                if(input1.isEditing()){
                    caret=input1.getTextCaretOffset();
                }
                input1.setHtml(hlcode);
                if(caret!=null){
                    input1.setTextCaretOffset(caret);
                }
            }
        }
    },200);
    protected async onCellInputChange(codeCell:CodeCell){
        this.codeCellHighlightQueue.add(codeCell);
        this.DoCodeCellsHightlight.call();
    }
    render() {
        return <div style={{width:'100%',overflow:'auto'}} onKeyDown={(ev)=>this.onKeyDown(ev)} ref={this.rref.container}>
            <div>
            <a href="javascript:;" onClick={()=>this.openRpcChooser()}>RPC:{this.getRpcStringRepresent()}</a>
            <span>&nbsp;&nbsp;</span>
            <a onClick={()=>this.doSave()} href="javascript:;">Save</a>
            </div>
            {(this.state.codeContext!=undefined)?
                <CodeCellList codeContext={this.state.codeContext!} ref={this.rref.ccl} cellProps={{
                    onInputChange:(target)=>this.onCellInputChange(target)
                }}/>:
                'No CodeContext'
            }
        </div>
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
        container:new ReactRefEx<HTMLDivElement>()
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
    protected *_keepScrollState(){
        let cont=yield* Task.yieldWrap(this.rref.container.waitValid());
        while(this.rref.container.current!=null){
            if(this.autoScrollToBottom){
                cont=this.rref.container.current;
                cont.scrollTo({top:cont.scrollHeight,behavior:'smooth'});
            }
            yield sleep(200);
        }
    }
    componentWillUnmount(): void {
        this._scrollTask?.abort();
        this._scrollTask=null;
    }
    protected codeCellHighlightQueue=new Set<CodeCell>();
    protected DoCodeCellsHightlight=new DebounceCall(async ()=>{
        let copy=Array.from(this.codeCellHighlightQueue);
        this.codeCellHighlightQueue.clear();
        for(let codeCell of copy){
            let input1=await codeCell.rref.codeInput.waitValid();
            let code=input1.getPlainText();
            if(code.length>10000)continue;
            await __inited__;
            let hlcode=await webworkercall.prismHighlightJS(code);
            if(/[^\n]\n$/.test(hlcode))hlcode+='\n';
            let caret=null;
            if(input1.isEditing()){
                caret=input1.getTextCaretOffset();
            }
            input1.setHtml(hlcode);
            if(caret!=null){
                input1.setTextCaretOffset(caret);
            }
        }
    },200);
    protected async onCellInputChange(codeCell:CodeCell){
        this.codeCellHighlightQueue.add(codeCell);
        this.DoCodeCellsHightlight.call();
    }
    _scrollTask:Task<void>|null=null;
    async beforeRender(){
        if(this._scrollTask==null){
            let that=this;
            this._scrollTask=Task.fork(function*(){
                yield* that._keepScrollState();
            }).run()
        }
    }
    onContainerScroll=new DebounceCall(async ()=>{
        let cont=await this.rref.container.waitValid();
        console.info('#1 scrollState'+(cont.scrollHeight-(cont.scrollTop+cont.clientHeight)))
        if(cont.scrollHeight-(cont.scrollTop+cont.clientHeight)<15){
            this.autoScrollToBottom=true;
        }
    },300);
    render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined; }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChild {
        this.beforeRender();
        return <div ref={this.rref.container} style={{
            overflowY:'auto',border:'0px',padding:'0px',margin:'0px',width:'100%',height:'100%',...this.props.containerStyle}} 
         onPointerDown={()=>this.autoScrollToBottom=false} onScroll={()=>this.onContainerScroll.call()}>
            <CodeCellList codeContext={this.props.codeContext} onRun={(key)=>this.onCellRun(key)} ref={this.rref.list} cellProps={{
                runCodeKey:'Enter',
                onInputChange:(target)=>this.onCellInputChange(target)
                }}/>
        </div>
    }
}


export let __internal__={
    IJSNBFileHandler,RunCodeReplView,NotebookViewer,RpcChooser,openRpcChooser
}