
import { LocalRunCodeContext, RunCodeContext } from 'partic2/CodeRunner/CodeContext';
import { CodeCellList } from 'partic2/CodeRunner/WebUi';
import { GetCurrentTime, WaitUntil, assert, future, requirejs, sleep } from 'partic2/jsutils1/base';
import * as React from 'preact'

import {ClientInfo, getRegistered, persistent} from 'partic2/pxprpcClient/registry'
import { LocalWindowSFS, installRequireProvider,SimpleFileSystem } from 'partic2/CodeRunner/JsEnviron';
import { TabInfo, TabInfoBase } from 'partic2/pComponentUi/workspace';
import { FileTypeHandler, FileTypeHandlerBase } from './fileviewer';

import { __name__ as RemoteCodeContextName } from 'partic2/CodeRunner/RemoteCodeContext';
import { FloatLayerComponent, ReactInputValueCollection, SimpleReactForm1, css } from 'partic2/pComponentUi/domui';
import { RegistryUI } from 'partic2/pxprpcClient/ui';
import { RemoteRunCodeContext } from 'partic2/CodeRunner/RemoteCodeContext';
import { DefaultActionBar } from './misclib';
import { WindowComponent } from '../pComponentUi/window';

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
            fs:this.workspace!.fs!,path:path,rpc:this.workspace?.props?.rpc
        });
    }
}


class RunCodeView extends React.Component<{tab:RunCodeTab},{}>{
    valueCollection=new ReactInputValueCollection();
    async useCodeContext(codeContext:'LocalWindow'|ClientInfo|null){
        if(codeContext===null){
            //canceled
            return
        }
        if(codeContext==='LocalWindow'){
            this.props.tab.codeContext=new LocalRunCodeContext();
            this.props.tab.rpc=undefined;
        }else{
            await codeContext.ensureConnected();
            await (await codeContext.jsServerLoadModule(RemoteCodeContextName)).free();
            //init worker context
            await (await codeContext.jsServerLoadModule('partic2/JsNotebook/workerinit')).free();
            this.props.tab.rpc=codeContext;
            this.props.tab.codeContext=new RemoteRunCodeContext(codeContext.client!);
        }
        this.forceUpdate();
    }
    actionBar=React.createRef<DefaultActionBar>();
    onKeyDown(ev: React.JSX.TargetedKeyboardEvent<HTMLElement>){
        this.actionBar.current?.processKeyEvent(ev);
    }
    rref={
        selectContext:React.createRef<WindowComponent>(),
        rpcRegistry:React.createRef<WindowComponent>()
    }
    render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined; }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChild {
        if(this.props.tab.codeContext==undefined){
            ;(async ()=>{
                this.useCodeContext('LocalWindow');
                this.forceUpdate();
            })();
        }else{
            return <div style={{width:'100%',overflow:'auto'}} onKeyDown={(ev)=>this.onKeyDown(ev)}>
            <div>
            <a href="javascript:;" onClick={()=>this.rref.selectContext.current?.active()}>
                Code Context:{(this.props.tab.rpc?.name)??'local window'}
            </a><span>&nbsp;&nbsp;</span><DefaultActionBar action={this.props.tab.action} ref={this.actionBar}/></div>
            <CodeCellList codeContext={this.props.tab.codeContext} ref={(refObj)=>{
                this.props.tab.rref.ccl.current=refObj;
                if(this.props.tab.initLoad){
                    this.props.tab.doLoad();
                    this.props.tab.initLoad=false;
                }
            }}/>
            <WindowComponent ref={this.rref.selectContext} title="select context">
                <div className={css.simpleCard}>
                    <a href="javascript:;" onClick={()=>this.useCodeContext('LocalWindow')}>Local Window</a>&emsp;&emsp;
                    <div>
                        From RPC
                        <RegistryUI onSelectConfirm={(client)=>this.useCodeContext(client)}/>
                    </div>
                </div>
            </WindowComponent>
            </div>
        }
    }

}

export class RunCodeTab extends TabInfoBase{
    codeContext?:RunCodeContext
    fs?:SimpleFileSystem
    path:string=''
    rpc?:ClientInfo
    rref={ccl:React.createRef<CodeCellList>(),view:React.createRef<RunCodeView>()};
    initLoad=true;
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
            }else if(rpc==undefined){
                //use default rpc(workspace rpc)
            }else{
                await persistent.load()
                this.rpc=getRegistered(rpc);
                if(this.rpc!=undefined){
                    try{
                        await this.rref.view.current?.useCodeContext(this.rpc)
                    }catch(e){
                        console.error(`rpc ${rpc} can not connect`);
                    };
                }else{
                    console.error(`rpc ${rpc} can not connect`);
                }
            }
            if(cells){
                this.rref.ccl.current!.loadFrom(cells);
            }
        }
        this.rref.view.current?.forceUpdate();
    }
    renderPage() {
        return <RunCodeView ref={this.rref.view} tab={this}/>
    }
}
