import { FloatLayerComponent, ReactRefEx, ReactRender, css } from 'partic2/pComponentUi/domui';
import * as React from 'preact';
import {  DummyDirectoryHandler, FileBrowser } from './filebrowser';
import { TabInfoBase, TabView } from 'partic2/pComponentUi/workspace';
import { ClientInfo } from 'partic2/pxprpcClient/registry';
import { IJSNBFileHandler, RunCodeTab } from './notebook';
import { FileTypeHandler, JsModuleHandler, ImageFileHandler, TextFileHandler } from './fileviewer';
import { SimpleFileSystem ,LocalWindowSFS,TjsSfs} from 'partic2/CodeRunner/JsEnviron';
import { RegistryUI } from 'partic2/pxprpcClient/ui';
import { clone, GetCurrentTime, sleep,assert, GenerateRandomString, future, throwIfAbortError } from 'partic2/jsutils1/base';
import { tjsFrom } from 'partic2/tjsonpxp/tjs';
import { Invoker as jseioInvoker} from "partic2/pxprpcBinding/JseHelper__JseIo";
import { StdioShellProfile1 } from './stdioshell';
import {WindowComponent} from 'partic2/pComponentUi/window'
import {PointTrace} from 'partic2/pComponentUi/transform'
import { RemoteRunCodeContext } from 'partic2/CodeRunner/RemoteCodeContext';
import { LocalRunCodeContext, RunCodeContext } from 'partic2/CodeRunner/CodeContext';
import {appendFloatWindow,removeFloatWindow} from 'partic2/pComponentUi/window'
import { findRpcClientInfoFromClient } from './misclib';
import { lifecycle, path } from 'partic2/jsutils1/webutils'
const __name__='partic2/JsNotebook/workspace'




//treat TextFileHandler as the last default opener
let defaultFileTypeHandlers:FileTypeHandler[]=[new IJSNBFileHandler(),new JsModuleHandler(),
    new ImageFileHandler(),new StdioShellProfile1(),
    new TextFileHandler(),new DummyDirectoryHandler()]

class CreateFileTab extends TabInfoBase{
    ws?:Workspace
    async init(initval:Partial<CreateFileTab>){
        super.init({id:'internal://workspace create file',title:'create',...initval})
        return this;
    }

    async doCreate(h:FileTypeHandler){
        let fs=this.ws!.state.fs;
        let path=this.ws!.rref.fb.current!.state.currPath!;
        let newPath=await h.create!(path);
        this.ws!.onNewFileCreated(newPath);
    }
    renderPage() {
        return <div>
            {this.ws!.fileTypeHandlers.map(v=>('create' in v)?[<a onClick={()=>this.doCreate(v)} href="javascript:;">
                {v.title}
            </a>,<br/>]:[])}
        </div>
    }
}

let tabAttrSym=Symbol('tabAttrSym');

export class Workspace extends React.Component<{rpc?:ClientInfo,fs?:SimpleFileSystem,divClass?:string[],divStyle?:React.JSX.CSSProperties},{
    fs:SimpleFileSystem,initFileDir:string,panel12SplitX?:number}>{
    rref={
        fb:React.createRef<FileBrowser>(),
        tv:new ReactRefEx<TabView>(),
        panel1:React.createRef<HTMLDivElement>(),
        rpcRegistry:React.createRef<WindowComponent>()
    }
    fileTypeHandlers=clone(defaultFileTypeHandlers,1);
    fs?:SimpleFileSystem
    inited=new future<boolean>();
    constructor(props:any,ctx:any){
        super(props,ctx);
        this.fileTypeHandlers.forEach(v=>v.setWorkspace(this));
        this.setState({initFileDir:''});
    }
    initOpenedFiles:string[]=[]
    async loadProfile(){
        let moduleDataDir=(await this.fs!.dataDir())+'/www/'+__name__;
        let profileFile=moduleDataDir+'/serverProfile.json';
        let profile={currPath:moduleDataDir+'/workspace/1',openedFiles:[moduleDataDir+'/workspace/1/notebook.ijsnb']}
        try{
            assert(await this.fs?.filetype(profileFile)==='file');
            let data1=await this.fs!.readAll(profileFile);
            if(data1!=null && data1.length>0){
                profile={...profile,...JSON.parse(new TextDecoder().decode(data1))}
            }
        }catch(e:any){
            throwIfAbortError(e);
            await this.fs!.mkdir(profile.currPath);
            await this.fs!.writeAll(profileFile,new TextEncoder().encode(JSON.stringify(profile)));
            for(let t1 of profile.openedFiles){
                if((await this.fs!.filetype(t1))==='none'){
                    await this.fs!.mkdir(path.dirname(t1));
                    await this.fs!.writeAll(t1,new TextEncoder().encode(JSON.stringify({
                        "ver": 1,
                        "path": t1,
                        "cells": JSON.stringify({'cellList': [
                            {'cellInput': '//_ENV is the default "global" context for Code Cell \n_ENV',
                            'cellOutput': ['', null],
                            'key': 'rnd12rjykngi1ufte7uq'},
                            {'cellInput': '//Also globalThis are available \nglobalThis',
                            'cellOutput': ['', null],
                            'key': 'rnd1inpn4a83tgvabops'},
                            {'cellInput': '//"import" is also available as expected\nimport {BytesToHex} from \'partic2/jsutils1/base\'\nlet hex=BytesToHex(new Uint8Array([0x22,0x33,0x44]));\nconsole.info(hex)\nlet BytesFromHex=(await import(\'partic2/jsutils1/base\')).BytesFromHex\nconsole.info(BytesFromHex(hex))\n',
                            'cellOutput': ['', null],
                            'key': 'rnd1gn3dzsjben57zmdc'}],
                      'consoleOutput': {}})
                    })));
                }
            }
        }
        this.setState({initFileDir:profile.currPath})
        this.initOpenedFiles=profile.openedFiles;
    }
    async saveProfile(){
        let moduleDataDir=(await this.fs!.dataDir())+'/www/'+__name__;
        let openedFiles=[]
        for(let tab of this.rref.tv.current!.getTabs()){
            if(tabAttrSym in tab){
                openedFiles.push((tab as any)[tabAttrSym].filePath);
            }
        }
        let profile={
            currPath:this.rref.fb.current?.state.currPath,
            openedFiles
        }
        let profileFile=moduleDataDir+'/serverProfile.json';
        await this.fs!.writeAll(profileFile,new TextEncoder().encode(JSON.stringify(profile)))
    }
    onPauseListener=async ()=>{
        await this.saveProfile();
    }
    jseio?:jseioInvoker
    componentDidMount(): void {
        this.init();
        lifecycle.addEventListener('pause',this.onPauseListener);
    }
    componentWillUnmount(): void {
        lifecycle.removeEventListener('pause',this.onPauseListener);
    }
    async init(){
        if(this.inited.done){
            return;
        }
        if(this.props.fs==undefined){
            if(this.props.rpc!=undefined){
                await this.props.rpc.ensureConnected()
            }
            if(this.props.rpc==undefined){
                let t1=new LocalWindowSFS();
                await t1.ensureInited();
                this.fs=t1;
                this.setState({fs:t1});
            }else{
                try{
                    let fs1=new TjsSfs();
                    this.jseio=new jseioInvoker();
                    await this.jseio.useClient(this.props.rpc.client!);
                    fs1.from(await tjsFrom(this.jseio));
                    fs1.pxprpc=this.props.rpc;
                    await fs1.ensureInited();
                    this.fs=fs1;
                    this.setState({fs:fs1});
                }catch(e){
                    //fallback to localwindowsfs
                    let t1=new LocalWindowSFS();
                    await t1.ensureInited();
                    this.fs=t1;
                    this.setState({fs:t1});
                }
            }
        }else{
            this.fs=this.props.fs!
            this.setState({fs:this.props.fs!});
        }
        await this.loadProfile();
        this.inited.setResult(true);
        this.forceUpdate();
        for(let t1 of this.initOpenedFiles){
            await this.doOpenFileRequest(t1);
        }
    }
    async doOpenFileRequest(path:string){
        await this.inited.get();
        let lowercasePath=path.toLowerCase();
        for(let t1 of this.fileTypeHandlers){
            let matched=false;
            if(typeof t1.extension==='string'){
                if(lowercasePath.endsWith(t1.extension) && 'open' in t1)matched=true;
            }else{
                for(let t2 of t1.extension){
                    if(lowercasePath.endsWith(t2)){
                        matched=true;
                        break;
                    }
                }
            }
            if(matched){
                let t2=await t1.open!(path);
                (t2 as any)[tabAttrSym]={filePath:path};
                (await this.rref.tv.waitValid()).addTab(t2);
                (await this.rref.tv.waitValid()).openTab(t2.id);
                break;
            }
        }
    }
    async openNotebookFor(supportedContext:'local window'|ClientInfo|RemoteRunCodeContext|LocalRunCodeContext,notebookFile?:string){
        await this.inited.get();
        let moduleDataDir=(await this.fs!.dataDir())+'/www/'+__name__;
        if(notebookFile==undefined){
            notebookFile=moduleDataDir+'/workspace/1/notebook.ijsnb';
        }
        if((await this.fs!.filetype(notebookFile))==='none'){
            await this.fs!.mkdir(path.dirname(notebookFile));
            await this.fs!.writeAll(notebookFile,new TextEncoder().encode('{}'));
        }
        await this.doOpenFileRequest(notebookFile);
        for(let tab of  (await this.rref.tv.waitValid()).getTabs()){
            if(tab instanceof RunCodeTab && tab.path===notebookFile){
                await tab.inited.get();
                await tab.useCodeContext(supportedContext);
            }
        }
    }
    async onNewFileCreated(path:string){
        await this.rref.fb.current!.reloadFileInfo()
        await this.rref.fb.current!.selectFiles([path])
        this.rref.fb.current!.setAction('rename')
    }
    async doCreateFileRequest(dir:string){
        await this.inited.get();
        let t1=await new CreateFileTab().init({ws:this});
        (await this.rref.tv.waitValid()).addTab(t1);
        (await this.rref.tv.waitValid()).openTab(t1.id);
    }
    __panel12SpliterMove=new PointTrace({
        onMove:(curr,start)=>{
            this.setState({panel12SplitX:curr.x-start.x});
        }
    });
    render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined; }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChild {
        if(!this.inited.done){
            return null;
        }
        return <div className={[css.flexRow,...(this.props.divClass??[])].join(' ')} 
                    style={{width:'100%',height:'100%',...(this.props.divStyle??{})}} >
            <WindowComponent ref={this.rref.rpcRegistry} title='rpc registry'>
                <RegistryUI />
            </WindowComponent>
            <div style={{flexBasis:(this.state.panel12SplitX??302-2)+'px',flexShrink:'0'
                ,height:'100%',overflowY:'auto'}} ref={this.rref.panel1}>
                <a href="javascript:;" onClick={()=>this.rref.rpcRegistry.current?.active()}>RpcRegistry</a><span>&nbsp;&nbsp;</span>
                <div style={{flexGrow:1}}>
                <FileBrowser ref={this.rref.fb} sfs={this.state.fs} initDir={this.state.initFileDir} workspace={this}
            onOpenRequest={(path)=>this.doOpenFileRequest(path)} onCreateRequest={(dir)=>this.doCreateFileRequest(dir)}/>
                </div>
            </div>

            <div style={{flexBasis:'5px',flexShrink:'0',backgroundColor:'grey',cursor:'ew-resize'}} 
                onMouseDown={(ev)=>{
                    let x=this.rref.panel1.current?.getBoundingClientRect().left
                    this.__panel12SpliterMove.start({x:x??0,y:ev.clientY},true);
                    ev.preventDefault();
                }}
                onTouchStart={(ev)=>{
                    let x=this.rref.panel1.current?.getBoundingClientRect().left
                    this.__panel12SpliterMove.start({x:x??0,y:ev.touches[0].clientY},true);
                    ev.preventDefault();
                }}
            ></div>
            <div className={css.flexColumn} style={{flexGrow:'1',minWidth:0,flexShrink:'1'}}>
                <TabView ref={this.rref.tv}/>
            </div>
        </div>
    }
}

export let defaultOpenWorkspaceWindowFor=async function (supportedContext:'local window'|ClientInfo|RemoteRunCodeContext|LocalRunCodeContext,title?:string){
    let wsref=new ReactRefEx<Workspace>();
    if(supportedContext=='local window' || (supportedContext instanceof LocalRunCodeContext)){
        appendFloatWindow(<WindowComponent key={GenerateRandomString()} title={title}>
            <Workspace ref={wsref} divStyle={{backgroundColor:'white'}}/>
        </WindowComponent>)
    }else if(supportedContext instanceof ClientInfo){
        appendFloatWindow(<WindowComponent key={GenerateRandomString()} title={title}>
            <Workspace ref={wsref} rpc={supportedContext} divStyle={{backgroundColor:'white'}}/>
        </WindowComponent>)
    }else if(supportedContext instanceof RemoteRunCodeContext){
        let rpc=findRpcClientInfoFromClient(supportedContext.client1);
        assert(rpc!=null);
        appendFloatWindow(<WindowComponent key={GenerateRandomString()} title={title}>
            <Workspace ref={wsref} rpc={rpc!} divStyle={{backgroundColor:'white'}}/>
        </WindowComponent>)
    }
    (await wsref.waitValid()).openNotebookFor(supportedContext);
}

export async function setDefaultOpenWorkspaceWindowFor(openNotebook:typeof openWorkspaceWindowFor){
    defaultOpenWorkspaceWindowFor=openNotebook;
}

export async function openWorkspaceWindowFor(supportedContext:'local window'|ClientInfo|RemoteRunCodeContext|LocalRunCodeContext,title?:string){
    defaultOpenWorkspaceWindowFor(supportedContext,title);
}
