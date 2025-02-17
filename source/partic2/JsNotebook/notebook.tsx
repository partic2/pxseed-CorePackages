
import { LocalRunCodeContext, registry, RunCodeContext } from 'partic2/CodeRunner/CodeContext';
import { CodeCellList } from 'partic2/CodeRunner/WebUi';
import { GenerateRandomString, GetCurrentTime, WaitUntil, assert, future, logger, requirejs, sleep } from 'partic2/jsutils1/base';
import * as React from 'preact'

import {ClientInfo, getAttachedRemoteRigstryFunction, getRegistered, listRegistered, persistent, ServerHostWorker1RpcName} from 'partic2/pxprpcClient/registry'
import { LocalWindowSFS, installRequireProvider,SimpleFileSystem } from 'partic2/CodeRunner/JsEnviron';
import { TabInfo, TabInfoBase } from 'partic2/pComponentUi/workspace';
import { FileTypeHandler, FileTypeHandlerBase } from './fileviewer';

import { __name__ as RemoteCodeContextName } from 'partic2/CodeRunner/RemoteCodeContext';
import { ReactRefEx } from 'partic2/pComponentUi/domui';
import {ReactInputValueCollection} from 'partic2/pComponentUi/input'
import { RegistryUI } from 'partic2/pxprpcClient/ui';
import { RemoteRunCodeContext } from 'partic2/CodeRunner/RemoteCodeContext';
import { CodeContextChooser, DefaultActionBar, findRpcClientInfoFromClient } from './misclib';
import { WindowComponent,alert, appendFloatWindow, prompt, removeFloatWindow } from 'partic2/pComponentUi/window';;

export let __name__='partic2/JsNotebook/notebook'


//LWRP = LocalWindowRequireProvider, setup to requirejs
let LWRPSetuped=[false,new future()] as [boolean,future<(modName: string, url: string) => Promise<string | null>>];

let defaultFs=new LocalWindowSFS();

async function ensureLWRPInstalled(){
    if(!LWRPSetuped[0]){
        await defaultFs.ensureInited();
        LWRPSetuped[0]=true;
        LWRPSetuped[1].setResult(await installRequireProvider(defaultFs));
    }
    await LWRPSetuped[1].get();
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


class RunCodeView extends React.Component<{tab:RunCodeTab}>{
    valueCollection=new ReactInputValueCollection();
    constructor(prop:any,ctx:any){
        super(prop,ctx);
    }
    actionBar=new ReactRefEx<DefaultActionBar>();
    onKeyDown(ev: React.JSX.TargetedKeyboardEvent<HTMLElement>){
        this.actionBar.current?.processKeyEvent(ev);
    }
    rref={
        rpcRegistry:React.createRef<WindowComponent>()
    }
    async openCodeContextChooser(){
        let wnd2=<WindowComponent onClose={()=>{
            removeFloatWindow(wnd2);
        }} title='choose code context' >
            <div style={{backgroundColor:'white',padding:'1px'}}>
            <CodeContextChooser onChoose={(rpc)=>{
                this.props.tab.useCodeContext(rpc);
                removeFloatWindow(wnd2);
            }}/>
            </div>
        </WindowComponent>
        appendFloatWindow(wnd2);
    }
    render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined; }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChild {
        return <div style={{width:'100%',overflow:'auto'}} onKeyDown={(ev)=>this.onKeyDown(ev)}>
            <div>
            <a href="javascript:;" onClick={()=>this.openCodeContextChooser()}>
                Code Context:{(this.props.tab.rpc?.name)??'local window'}
            </a><span>&nbsp;&nbsp;</span><DefaultActionBar action={this.props.tab.action} ref={this.actionBar}/></div>
            {(this.props.tab.codeContext!=undefined)?
                <CodeCellList codeContext={this.props.tab.codeContext} ref={this.props.tab.rref.ccl} />:
                'No CodeContext'
            }
            </div>
    }
}

export class RunCodeTab extends TabInfoBase{
    codeContext?:RunCodeContext
    fs?:SimpleFileSystem
    path:string=''
    rpc?:ClientInfo
    rref={ccl:new ReactRefEx<CodeCellList>(),replccl:new ReactRefEx<RunCodeReplView>(),view:new ReactRefEx<RunCodeView>()};
    action={} as Record<string,()=>Promise<void>>
    inited=new future<boolean>();
    async useCodeContext(codeContext:'local window'|ClientInfo|RemoteRunCodeContext|LocalRunCodeContext|null){
        try{
            if(codeContext===null){
                //canceled
                return
            }
            if(codeContext==='local window'){
                this.codeContext=new LocalRunCodeContext();
                this.rpc=undefined;
            }else if(codeContext instanceof ClientInfo){
                await codeContext.ensureConnected();
                await (await codeContext.jsServerLoadModule(RemoteCodeContextName)).free();
                this.rpc=codeContext;
                this.codeContext=new RemoteRunCodeContext(codeContext.client!);
                //init worker context
                await this.codeContext.runCode(`return await (async ()=>{
                    let workerinit=await import('partic2/JsNotebook/workerinit')
                    return await workerinit.ensureInited.get()})()`)
            }else if(codeContext instanceof RemoteRunCodeContext){
                let foundRpc=findRpcClientInfoFromClient(codeContext.client1);
                if(foundRpc===null){
                    await alert('RemoteRunCodeContext must attached to a registered RpcClientInfo.');
                    return;
                }
                this.rpc=foundRpc;
                this.codeContext=codeContext;
                //init worker context
                await this.codeContext.runCode(`return await (async ()=>{
                    let workerinit=await import('partic2/JsNotebook/workerinit')
                    return await workerinit.ensureInited.get()})()`)
            }else if(codeContext instanceof LocalRunCodeContext){
                this.codeContext=codeContext
            }else{
                await alert('Unsupported code context');
                return;
            }
            let result1=await this.codeContext.runCode(
                `await (await import('partic2/CodeRunner/JsEnviron')).initCodeEnv(_ENV,{codePath:${JSON.stringify(this.path)}});`)
            if(result1.err!=null){
                logger.warning(result1.err);
            }
        }catch(e:any){
            await alert(e.toString(),'Error');
        }
        this.rref.view.current?.forceUpdate();
    }
    async init(initval:Partial<RunCodeTab>){
        await super.init(initval)
        if(this.fs==undefined){
            if(this.rpc==undefined){
                await defaultFs.ensureInited()
                this.fs=defaultFs;
            }
        }
        if(this.rpc==undefined){
            this.codeContext=new LocalRunCodeContext();
            await ensureLWRPInstalled()
        }
        this.action.save=async()=>{
            let cells=this.rref.ccl.current!.saveTo();
            let saved=JSON.stringify({ver:1,rpc:(this.rpc?.name)??'__local',path:this.path,cells})
            await this.fs!.writeAll(this.path,new TextEncoder().encode(saved));
        }
        this.action.reloadCodeWorker=async()=>{
            if(!(this.codeContext instanceof RemoteRunCodeContext)){
                await alert('Only Remote Code Context support to reload.');
                return;
            }

            let pxseedServ=getRegistered(ServerHostWorker1RpcName);
            if(pxseedServ!=undefined){
                try{
                    let client1=await pxseedServ.ensureConnected();
                    let runBuildScript=await client1.getFunc('pxseedServer2023/workerInit.runPxseedBuildScript');
                    if(runBuildScript!=null){
                        await runBuildScript.typedecl('->').call();
                    }
                }catch(e){
                    //skip if error.
                };
            }
            
            let res=await this.codeContext.runCode(`
if(globalThis.__workerId!=undefined){
let workerInit=await import('partic2/pxprpcClient/rpcworker');
await workerInit.reloadRpcWorker()
}else{
throw new Error('Only worker can reload');
}`)
            if(res.err!=null){
                await alert(res.err.message);
                return;
            }else{
                await this.useCodeContext(this.codeContext);
            }
            
        }
        this.doLoad();
        return this;
    }
    async doLoad(){
        let t1=await this.fs!.readAll(this.path);
        if(t1==null)return;
        let data=new Uint8Array(t1);
        if(data.length>0){
            let t1=data.indexOf(0);
            if(t1>=0)data=data.slice(0,t1);
            let {ver,rpc,cells}=JSON.parse(new TextDecoder().decode(data)) as {ver?:string,rpc?:string,cells?:string};
            if(rpc==='__local'){
                this.rpc=undefined;
            }else if(rpc!=undefined){
                await persistent.load()
                this.rpc=getRegistered(rpc);
            }
            await this.useCodeContext(this.rpc??'local window');
            if(cells!=undefined){
                (await this.rref.ccl.waitValid()).loadFrom(cells);
            }
        }
        this.inited.setResult(true);
    }
    renderPage() {
        return <RunCodeView ref={this.rref.view} tab={this}/>
    }
}


export class RunCodeReplView extends React.Component<{codeContext:RunCodeContext}>{
    rref={
        list:new ReactRefEx<CodeCellList>()
    }
    async onCellRun(cellKey:string){
        let nextCell=await (await this.rref.list.waitValid()).newCell(cellKey);
        (await this.rref.list.waitValid()).setCurrentEditing(nextCell);
    }
    render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined; }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChild {
        return <CodeCellList codeContext={this.props.codeContext} onRun={(key)=>this.onCellRun(key)} ref={this.rref.list} cellProps={{runCodeKey:'Enter'}}/>
    }
}