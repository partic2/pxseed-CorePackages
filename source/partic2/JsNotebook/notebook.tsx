
import { LocalRunCodeContext, registry, RunCodeContext } from 'partic2/CodeRunner/CodeContext';
import { CodeCellList } from 'partic2/CodeRunner/WebUi';
import { GenerateRandomString, GetCurrentTime, IamdeeScriptLoader, WaitUntil, assert, future, logger, requirejs, sleep } from 'partic2/jsutils1/base';
import * as React from 'preact'

import {ClientInfo, getAttachedRemoteRigstryFunction, getRegistered, listRegistered, persistent, ServerHostWorker1RpcName} from 'partic2/pxprpcClient/registry'
import { installRequireProvider,SimpleFileSystem,defaultFileSystem,ensureDefaultFileSystem } from 'partic2/CodeRunner/JsEnviron';
import { TabInfo, TabInfoBase } from 'partic2/pComponentUi/workspace';
import { FileTypeHandler, FileTypeHandlerBase } from './fileviewer';

import { __name__ as RemoteCodeContextName } from 'partic2/CodeRunner/RemoteCodeContext';
import { ReactRefEx, RefChangeEvent } from 'partic2/pComponentUi/domui';
import {JsonForm, ReactInputValueCollection} from 'partic2/pComponentUi/input'
import { RegistryUI } from 'partic2/pxprpcClient/ui';
import { RemoteRunCodeContext } from 'partic2/CodeRunner/RemoteCodeContext';
import { CodeContextChooser, DefaultActionBar, findRpcClientInfoFromClient, openCodeContextChooser } from './misclib';
import { WindowComponent,alert, appendFloatWindow, prompt, removeFloatWindow } from 'partic2/pComponentUi/window';;

export let __name__='partic2/JsNotebook/notebook'


//LWRP = LocalWindowRequireProvider, setup to requirejs
let LWRPSetuped=new future<{fs:SimpleFileSystem,rootPath:string}>();


async function ensureLWRPInstalled(){
    if(!LWRPSetuped.done){
        await ensureDefaultFileSystem();
        await defaultFileSystem!.ensureInited();
        LWRPSetuped.setResult(await installRequireProvider(defaultFileSystem!));
    }
    await LWRPSetuped.get();
}

export class IJSNBFileHandler extends FileTypeHandlerBase{
    title: string='javascript notebook';
    extension: string='.ijsnb';
    async create(dir: string): Promise<string> {
        let fs=this.workspace!.fs!;
        let path=await this.getUnusedFilename(dir,this.extension);
        await fs.writeAll(path,new TextEncoder().encode('{}'));
        return path;
    }
    async open(path: string): Promise<TabInfo> {
        return new RunCodeTab().init({
            id:'file://'+path,
            title:path.substring(path.lastIndexOf('/')+1),
            fs:this.workspace!.fs!,
            path:path,
            rpc:this.workspace!.props.rpc,
        });
    }
}


export async function initNotebookCodeContext(
    codeContext:'local window'|ClientInfo|RemoteRunCodeContext|LocalRunCodeContext,
    codePath?:string):Promise<{
        rpc?:ClientInfo,code:RunCodeContext
    }>{
    let res:{rpc?:ClientInfo,code:RunCodeContext};
    if(codeContext==='local window'){
        res={
            code:new LocalRunCodeContext()
        }
    }else if(codeContext instanceof ClientInfo){
        await codeContext.ensureConnected();
        await (await codeContext.jsServerLoadModule(RemoteCodeContextName)).free();
        let rpc=codeContext;
        let code=new RemoteRunCodeContext(codeContext.client!);
        //init worker context
        await code.runCode(`return await (async ()=>{
            let workerinit=await import('partic2/JsNotebook/workerinit')
            return await workerinit.ensureInited.get()})()`)
        res={rpc,code};
    }else if(codeContext instanceof RemoteRunCodeContext){
        let foundRpc=findRpcClientInfoFromClient(codeContext.client1);
        if(foundRpc===null){
            throw new Error('RemoteRunCodeContext must attached to a registered RpcClientInfo.');
        }
        let rpc=foundRpc;
        let code=codeContext;
        //init worker context
        await code.runCode(`return await (async ()=>{
            let workerinit=await import('partic2/JsNotebook/workerinit')
            return await workerinit.ensureInited.get()})()`)
        res={rpc,code}
    }else if(codeContext instanceof LocalRunCodeContext){
        res={code:codeContext};
    }else{
        throw new Error('Unsupported code context');
    }
    let result1=await res.code.runCode(
        `await (await import('partic2/CodeRunner/JsEnviron')).initCodeEnv(_ENV,{codePath:${JSON.stringify(codePath??'')}});`)
    if(result1.err!=null){
        logger.warning(result1.err);
    }
    return res;
}


export class RunCodeTab extends TabInfoBase{
    codeContext?:RunCodeContext
    fs?:SimpleFileSystem
    path?:string;
    rpc?:ClientInfo|'local window'
    rref={
        ccl:new ReactRefEx<CodeCellList>(),
        replccl:new ReactRefEx<RunCodeReplView>(),
        rpcRegistry:React.createRef<WindowComponent>(),
        actionBar:new ReactRefEx<DefaultActionBar>()
    };
    action={} as Record<string,()=>Promise<void>>
    inited=new future<boolean>();
    async openCodeContextChooser(){
        let r=await openCodeContextChooser();
        if(r!=null){
            this.useCodeContext(r);
        }
    }
    async useCodeContext(codeContext:'local window'|ClientInfo|RemoteRunCodeContext|LocalRunCodeContext|null){
        try{
            if(codeContext===null){
                //canceled
                return
            }
            let {rpc,code}=await initNotebookCodeContext(codeContext,this.path);
            this.rpc=rpc;
            this.codeContext=code;
        }catch(e:any){
            await alert(e.toString(),'Error');
        }
        this.requestPageViewUpdate();
    }
    async init(initval:Partial<RunCodeTab>){
        await super.init(initval)
        this.rref.ccl.addEventListener('change',(ev:RefChangeEvent<any>)=>{
            (window as any).log2=[...((window as any).log2??[]),ev]
        })
        if(this.fs==undefined){
            if(this.rpc==undefined){
                await ensureDefaultFileSystem();
                this.fs=defaultFileSystem!;
            }
        }
        if(this.rpc==undefined){
            this.codeContext=new LocalRunCodeContext();
            await ensureLWRPInstalled()
        }
        this.action.save=async()=>{
            if(this.fs!=undefined && this.path!=undefined){
                let cells=(await this.getCurrentCellList()).saveTo();
                let saved=JSON.stringify({ver:1,rpc:this.getRpcStringRepresent(),path:this.path,cells})
                await this.fs!.writeAll(this.path,new TextEncoder().encode(saved));
            }
        }
        this.action.Settting=async()=>{
            let form=new ReactRefEx<JsonForm>();
            let dlg=await prompt(<div style={{minWidth:'300px'}}><JsonForm ref={form} type={{type:'object',fields:[
                ['path',{type:'string'}]
            ]}}/></div>);
            let form2=await form.waitValid();
            form2.value={path:this.path};
            if((await dlg.response.get())=='ok'){
                this.path=form2.value.path;
            }
            dlg.close();
        }
        this.inited.setResult(true);
        this.doLoad();
        return this;
    }
    async getCurrentCellList(){
        return await this.rref.ccl.waitValid();
    }
    ignoreRpcConfigOnLoading=false;
    async doLoad(){
        if(this.fs!=undefined && this.path!=undefined){
            let t1=await this.fs.readAll(this.path);
            if(t1==null)return;
            let data=new Uint8Array(t1);
            if(data.length>0){
                let t1=data.indexOf(0);
                if(t1>=0)data=data.slice(0,t1);
                let {ver,rpc,cells}=JSON.parse(new TextDecoder().decode(data)) as {ver?:string,rpc?:string,cells?:string};
                if(!this.ignoreRpcConfigOnLoading){
                    if(rpc==='local window'){
                        this.rpc='local window';
                    }else if(rpc!=undefined){
                        await persistent.load()
                        this.rpc=getRegistered(rpc);
                    }
                    await this.useCodeContext(this.rpc??'local window');
                }
                if(cells!=undefined){
                    (await this.getCurrentCellList()).loadFrom(cells);
                }
            }
        }
    }
    onKeyDown(ev: React.JSX.TargetedKeyboardEvent<HTMLElement>){
        this.rref.actionBar.current?.processKeyEvent(ev);
    }
    protected getRpcStringRepresent(){
        let rpc:ClientInfo|string='local window';
        if(typeof this.rpc==='string'){
            rpc=this.rpc
        }else if(this.rpc !=undefined){
            rpc=this.rpc.name;
        }
        return rpc;
    }
    renderPage() {
        return <div style={{width:'100%',overflow:'auto'}} onKeyDown={(ev)=>this.onKeyDown(ev)}>
        <div>
        <a href="javascript:;" onClick={()=>this.openCodeContextChooser()}>
            Code Context:{this.getRpcStringRepresent()}
        </a><span>&nbsp;&nbsp;</span><DefaultActionBar action={this.action} ref={this.rref.actionBar}/></div>
        {(this.codeContext!=undefined)?
            <CodeCellList codeContext={this.codeContext} ref={this.rref.ccl} />:
            'No CodeContext'
        }
        </div>
    }
}


export class RunCodeReplView extends React.Component<{
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
            let {rpc,code}=await initNotebookCodeContext(this.props.codeContext as any,this.props.codePath);
            this.rpc=rpc;
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