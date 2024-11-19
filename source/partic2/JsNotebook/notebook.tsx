
import { LocalRunCodeContext, registry, RunCodeContext } from 'partic2/CodeRunner/CodeContext';
import { CodeCellList } from 'partic2/CodeRunner/WebUi';
import { GetCurrentTime, WaitUntil, assert, future, requirejs, sleep } from 'partic2/jsutils1/base';
import * as React from 'preact'

import {ClientInfo, getAttachedRemoteRigstryFunction, getRegistered, listRegistered, persistent} from 'partic2/pxprpcClient/registry'
import { LocalWindowSFS, installRequireProvider,SimpleFileSystem } from 'partic2/CodeRunner/JsEnviron';
import { TabInfo, TabInfoBase } from 'partic2/pComponentUi/workspace';
import { FileTypeHandler, FileTypeHandlerBase } from './fileviewer';

import { __name__ as RemoteCodeContextName } from 'partic2/CodeRunner/RemoteCodeContext';
import { FloatLayerComponent, ReactInputValueCollection, ReactRefEx, SimpleReactForm1, css } from 'partic2/pComponentUi/domui';
import { RegistryUI } from 'partic2/pxprpcClient/ui';
import { RemoteRunCodeContext } from 'partic2/CodeRunner/RemoteCodeContext';
import { DefaultActionBar, findRpcClientInfoFromClient } from './misclib';
import { WindowComponent,alert } from 'partic2/pComponentUi/window';

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


class RunCodeView extends React.Component<{tab:RunCodeTab},{}>{
    valueCollection=new ReactInputValueCollection();
    
    actionBar=React.createRef<DefaultActionBar>();
    onKeyDown(ev: React.JSX.TargetedKeyboardEvent<HTMLElement>){
        this.actionBar.current?.processKeyEvent(ev);
    }
    rref={
        selectContext:React.createRef<WindowComponent>(),
        rpcRegistry:React.createRef<WindowComponent>()
    }
    render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined; }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChild {
        return <div style={{width:'100%',overflow:'auto'}} onKeyDown={(ev)=>this.onKeyDown(ev)}>
            <div>
            <a href="javascript:;" onClick={()=>this.rref.selectContext.current?.active()}>
                Code Context:{(this.props.tab.rpc?.name)??'local window'}
            </a><span>&nbsp;&nbsp;</span><DefaultActionBar action={this.props.tab.action} ref={this.actionBar}/></div>
            {(this.props.tab.codeContext!=undefined)?
                <CodeCellList codeContext={this.props.tab.codeContext} ref={this.props.tab.rref.ccl}/>:
                'No CodeContext'
            }
            <WindowComponent ref={this.rref.selectContext} title="select context">
                <div className={css.simpleCard}>
                    <div>
                        From builtin<br/>
                        <a href="javascript:;" onClick={()=>this.props.tab.useCodeContext('local window')}>Local Window</a>&emsp;&emsp;
                    </div>
                    <div>
                        From RPC<br/>
                        <RegistryUI onSelectConfirm={(client)=>this.props.tab.useCodeContext(client)}/>
                    </div>
                    <div>
                        From RunCodeContext registry<br/>
                        {registry.list().map(name=>
                            <a href="javascript:;" 
                                onClick={()=>this.props.tab.useCodeContext(registry.get(name) as any)}>
                                {name}
                            </a>
                        )}
                    </div>
                </div>
            </WindowComponent>
            </div>
    }

}

export class RunCodeTab extends TabInfoBase{
    codeContext?:RunCodeContext
    fs?:SimpleFileSystem
    path:string=''
    rpc?:ClientInfo
    rref={ccl:new ReactRefEx<CodeCellList>(),view:new ReactRefEx<RunCodeView>()};
    inited=new future<boolean>();
    async useCodeContext(codeContext:'local window'|ClientInfo|RemoteRunCodeContext|LocalRunCodeContext|null){
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
            //init worker context
            await (await codeContext.jsServerLoadModule('partic2/JsNotebook/workerinit')).free();
            this.rpc=codeContext;
            this.codeContext=new RemoteRunCodeContext(codeContext.client!);
        }else if(codeContext instanceof RemoteRunCodeContext){
            let foundRpc=findRpcClientInfoFromClient(codeContext.client1);
            if(foundRpc===null){
                await alert('RemoteRunCodeContext must attached to a registered RpcClientInfo.');
                return;
            }
            await (await foundRpc.jsServerLoadModule('partic2/JsNotebook/workerinit')).free();
            this.rpc=foundRpc;
            this.codeContext=codeContext;
        }else if(codeContext instanceof LocalRunCodeContext){
            this.codeContext=codeContext
        }else{
            await alert('Unsupported code context');
            return;
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
