
import { LocalRunCodeContext, RunCodeContext } from 'partic2/CodeRunner/CodeContext';
import { CodeCellList } from 'partic2/CodeRunner/WebUi';
import { GenerateRandomString, GetCurrentTime, IamdeeScriptLoader, WaitUntil, assert, future, logger, requirejs, sleep } from 'partic2/jsutils1/base';
import * as React from 'preact'

import {ClientInfo, createIoPipe, getAttachedRemoteRigstryFunction, getPersistentRegistered, getRegistered, listRegistered, persistent, ServerHostWorker1RpcName} from 'partic2/pxprpcClient/registry'
import { installRequireProvider,SimpleFileSystem,defaultFileSystem,ensureDefaultFileSystem } from 'partic2/CodeRunner/JsEnviron';
import { FileTypeHandlerBase } from './fileviewer';

import { connectToRemoteCodeContext, __name__ as RemoteCodeContextName } from 'partic2/CodeRunner/RemoteCodeContext';
import { ReactRefEx, RefChangeEvent } from 'partic2/pComponentUi/domui';
import {JsonForm, ReactInputValueCollection} from 'partic2/pComponentUi/input'
import { RegistryUI } from 'partic2/pxprpcClient/ui';
import { RemoteRunCodeContext } from 'partic2/CodeRunner/RemoteCodeContext';
import { WindowComponent,alert, appendFloatWindow, prompt, removeFloatWindow } from 'partic2/pComponentUi/window';import { WorkspaceContext } from './workspace';
import { utf8conv } from 'partic2/CodeRunner/jsutils2';
import { RpcExtendClient1, RpcExtendServer1 } from 'pxprpc/extend';
import { Client,Server } from 'pxprpc/base';

export let __name__='partic2/JsNotebook/notebook'



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


class LoopbackRpcClient extends ClientInfo{
    client:RpcExtendClient1|null=null;
    async ensureConnected():Promise<RpcExtendClient1>{
        if(!this.connected()){
            let [c2s,s2c]=createIoPipe();
            new RpcExtendServer1(new Server(s2c)).serve().catch(()=>{});
            this.client=await new RpcExtendClient1(new Client(c2s)).init();
        }
        return this.client!;
    }
}

class IJSNBFileHandler extends FileTypeHandlerBase{
    title: string='javascript notebook';
    extension=['.ijsnb'];
    async open(path: string) {
        this.context!.openNewWindow(<NotebookViewer context={this.context!} path={path}/>,{
            title:'Notebook:'+path.substring(path.lastIndexOf('/')+1)
        })
    }
}


class NotebookViewer extends React.Component<{context:WorkspaceContext,path:string},{
    rpc?:ClientInfo,codeContext?:RunCodeContext,connectCode?:string
}>{
    rref={
        ccl:new ReactRefEx<CodeCellList>(),
    };
    async openRpcChooser(){
        let r=await openRpcChooser();
        if(r=='local window'){
            if(this.props.context.rpc instanceof LoopbackRpcClient){
                r=this.props.context.rpc
            }else{
                r=new LoopbackRpcClient('local window','loopback:local window');
            }
        }
        if(r!=null){
            this.useRpc(r as ClientInfo);
        }
    }
    async useRpc(rpc:ClientInfo){
        try{
            let code=await connectToRemoteCodeContext(await rpc.ensureConnected(),
            `return (await lib.importModule('partic2/JsNotebook/workerinit')).createRunCodeContextConnectorForNotebookFile(
                ${JSON.stringify(this.props.path)}
            )`)
            this.setState({rpc,codeContext:code});
        }catch(e:any){
            await alert(e.toString(),'Error');
        }
    }
    componentDidMount(): void {
        this.doLoad();
    }
    async doLoad(){
        let t1=await this.props.context.fs!.readAll(this.props!.path);
        if(t1==null)return;
        let data=new Uint8Array(t1);
        if(data.length==0){
            data=utf8conv('{}');
        }
        let t2=data.indexOf(0);
        if(t2>=0)data=data.slice(0,t2);
        let f1=JSON.parse(new TextDecoder().decode(data)) as {ver?:string,rpc?:any,cells?:string};
        if(f1.rpc==='local window'){
            if(this.props.context.rpc instanceof LoopbackRpcClient){
                f1.rpc=this.props.context.rpc
            }else{
                f1.rpc=new LoopbackRpcClient('local window','loopback:local window');
            }
        }else if(f1.rpc!=undefined){
            f1.rpc=await getPersistentRegistered(f1.rpc);
        }
        await this.useRpc(f1.rpc??this.props.context.rpc!);
        if(f1.cells!=undefined){
            (await this.rref.ccl.waitValid()).loadFrom(f1.cells);
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
        let saved=JSON.stringify({ver:1,rpc:this.getRpcStringRepresent(),path:this.props.path,cells})
        await this.props.context.fs!.writeAll(this.props.path,new TextEncoder().encode(saved));
    }
    protected getRpcStringRepresent(){
        return this.state.rpc?.name??'<No name>';
    }
    render() {
        return <div style={{width:'100%',overflow:'auto'}} onKeyDown={(ev)=>this.onKeyDown(ev)}>
        <div>
        <a href="javascript:;" onClick={()=>this.openRpcChooser()}>
            RPC:{this.getRpcStringRepresent()}
        </a><span>&nbsp;&nbsp;</span></div>
        {(this.state.codeContext!=undefined)?
            <CodeCellList codeContext={this.state.codeContext!} ref={this.rref.ccl} />:
            'No CodeContext'
        }
        </div>
    }
}


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
        let cellList=(await this.rref.list.waitValid()).getCellList();
        if(cellList.length>=(this.props.maxCellCount??100)){
            (await this.rref.list.waitValid()).deleteCell(cellList.at(0)!.key);
        }
        if(cellList.at(-1)?.key==cellKey){
            this.autoScrollToBottom=true;
        }
        let runCellAt=cellList.findIndex(t1=>t1.key===cellKey);
        if(runCellAt==cellList.length-1){
            let nextCell=await (await this.rref.list.waitValid()).newCell(cellKey);
            (await this.rref.list.waitValid()).setCurrentEditing(nextCell);
        }else{
            let nextCell=cellList[runCellAt+1].key;
            (await this.rref.list.waitValid()).setCurrentEditing(nextCell);
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
    protected savedScrollHight:number=0;
    protected async _keepScrollState(){
        let cont=await this.rref.container.waitValid();
        while(this.rref.container.current!=null){
            if(this.autoScrollToBottom && cont.scrollHeight!=this.savedScrollHight){
                cont=this.rref.container.current;
                cont.scrollTo({top:cont.scrollHeight,behavior:'smooth'});
                this.savedScrollHight=cont.scrollHeight;
            }
            await sleep(100);
        }
        
    }
    inited=false;
    async beforeRender(){
        if(!this.inited){
            this.inited=true;
            this._keepScrollState();
        }
    }
    render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined; }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChild {
        this.beforeRender();
        return <div ref={this.rref.container} style={{
            overflowY:'auto',border:'0px',padding:'0px',margin:'0px',width:'100%',height:'100%',...this.props.containerStyle}} 
        onMouseDown={()=>this.autoScrollToBottom=false} onTouchStart={()=>this.autoScrollToBottom=false} onWheel={()=>this.autoScrollToBottom=false}>
            <CodeCellList codeContext={this.props.codeContext} onRun={(key)=>this.onCellRun(key)} ref={this.rref.list} cellProps={{runCodeKey:'Enter'}}/>
        </div>
    }
}

export let __internal__={
    IJSNBFileHandler,RunCodeReplView,NotebookViewer,LoopbackRpcClient,RpcChooser,openRpcChooser
}