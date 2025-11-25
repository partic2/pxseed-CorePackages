import { ReactRefEx } from 'partic2/pComponentUi/domui';
import * as React from 'preact';
import {  __internal__ as filebrowseri } from './filebrowser';
import { openNewWindow } from 'partic2/pComponentUi/workspace';
import { ClientInfo, createIoPipe, easyCallRemoteJsonFunction, getPersistentRegistered, ServerHostWorker1RpcName } from 'partic2/pxprpcClient/registry';
import { __internal__ as notebooki } from './notebook';
import { FileTypeHandlerBase } from './fileviewer';
import { __internal__ as filevieweri } from './fileviewer';
import { SimpleFileSystem ,TjsSfs, defaultFileSystem, ensureDefaultFileSystem} from 'partic2/CodeRunner/JsEnviron';
import { tjsFrom } from 'partic2/tjshelper/tjsonjserpc';
import { path } from 'partic2/jsutils1/webutils'
import { DebounceCall, utf8conv } from 'partic2/CodeRunner/jsutils2';
import './workerinit'
import {__internal__ as workeriniti} from './workerinit'
import { RpcExtendClient1, RpcExtendServer1 } from 'pxprpc/extend';
import { Client, Server } from 'pxprpc/base';
import { SimpleReactForm1, ValueCheckBox } from 'partic2/pComponentUi/input';
import {prompt} from 'partic2/pComponentUi/window'
import { assert } from 'partic2/jsutils1/base';
const __name__='partic2/JsNotebook/workspace'





export class WorkspaceContext{
    constructor(public rpc:ClientInfo){}
    //optional property.
    fs:SimpleFileSystem|null=null;
    wwwroot:string|null=null;
    filehandler=new Array<FileTypeHandlerBase>();

    //startupProfile is store to save and recover the workspace status.
    startupProfile:{
        currPath:string,
        openedFiles:string[]
    }|null=null;
    saveStartupProfile=async ()=>{}

    async ensureInited(){
        if(this.fs==null){
            if(this.rpc instanceof workeriniti.LoopbackRpcClient||this.rpc.url.startsWith('webworker:')||this.rpc.url.startsWith('serviceworker:')){
                await ensureDefaultFileSystem();
                this.fs=defaultFileSystem;
                if(this.wwwroot==null)this.wwwroot='/www';
            }else{
                let tjssfs1=new TjsSfs();
                let tjs=await tjsFrom(await this.rpc!.ensureConnected());
                tjssfs1.from(tjs);
                await tjssfs1.ensureInited();
                this.fs=tjssfs1;
            }
        }
        if(this.wwwroot==null){
            this.wwwroot=await easyCallRemoteJsonFunction(await this.rpc!.ensureConnected(),'partic2/jsutils1/webutils','getWWWRoot',[]);
        }
        for(let t1 of this.filehandler){
            t1.context=this;
        }
        if(this.filehandler.length==0){
            this.filehandler.push(new notebooki.IJSNBFileHandler(),new filevieweri.ImageFileHandler(),
            new filevieweri.ImageFileHandler(),new filevieweri.TextFileHandler())
        }
    }
    async useRemoteFileAsStartupProfileStore(path2:string){
        let profileFile:Uint8Array|null=null;
        try{profileFile=await this.fs!.readAll(path2);}catch(err){};
        if(profileFile!=null){
            try{
                this.startupProfile=JSON.parse(utf8conv(profileFile));
            }catch(err){
                //bad profile file, create new.
            };
        }
        let saveStartupProfile=new DebounceCall(async ()=>{
                await this.fs!.writeAll(path2,utf8conv(JSON.stringify(this.startupProfile)));
            },500);
        if(profileFile!=null){
            try{
                this.startupProfile=JSON.parse(utf8conv(profileFile));
            }catch(err){
                //bad profile file
            };
        }
        this.saveStartupProfile=async ()=>{await saveStartupProfile.call()}
    }
    openNewWindow:typeof openNewWindow=async function(vnode,options){
        return openNewWindow(vnode,options);
    }
    fileBrowser=filebrowseri.FileBrowser
    async start(){
        await this.ensureInited();
        let FileBrowser=this.fileBrowser
        let rref={
            fb:new ReactRefEx<InstanceType<typeof FileBrowser>>()
        }
        this.openNewWindow(<FileBrowser context={this} ref={rref.fb}/>,{title:'JS Notebook File Browser',layoutHint:__name__+'.FileBrowser'})
        let fb=await rref.fb.waitValid();
        
        if(this.startupProfile==null){
            await this.useRemoteFileAsStartupProfileStore(path.join(this.wwwroot!,__name__,'serverProfile.json'))
        }
        if(this.startupProfile==null){
            let currPath=path.join(this.wwwroot!,__name__,'workspace/1');
            let t1=path.join(currPath,'notebook.ijsnb');
            this.startupProfile={currPath,openedFiles:[t1]};
            if(await this.fs!.filetype(t1)==='none'){
                await this.fs!.writeAll(t1,utf8conv(JSON.stringify({
                    "ver": 1,
                    "path": t1,
                    "cells": JSON.stringify({'cellList': [
                        {'cellInput': '//_ENV is the default "global" context for Code Cell \n_ENV',
                        'cellOutput': ['', null],
                        'key': 'rnd12rjykngi1ufte7uq'},
                        {'cellInput': '//Also globalThis are available \nglobalThis',
                        'cellOutput': ['', null],
                        'key': 'rnd1inpn4a83tgvabops'},
                        {'cellInput': `//"import" is also available as expected
import * as jsutils2  from 'partic2/CodeRunner/jsutils2'
u8=jsutils2.u8hexconv(new Uint8Array([11,22,33]))
console.info(u8)
console.info(Array.from(jsutils2.u8hexconv(u8)))`,
                        'cellOutput': ['', null],
                        'key': 'rnd1gn3dzsjben57zmdc'}],
                    'consoleOutput': {}})
                })))
            }
            await this.saveStartupProfile()
        }
        await fb.DoFileOpen(this.startupProfile!.currPath);
        //Clone and clear, to avoid recursive open and save window.
        let toOpen=[...this.startupProfile!.openedFiles];
        this.startupProfile.openedFiles.length=0;
        for(let t1 of toOpen){
            await fb.DoFileOpen(t1);
        }
    }
}

async function openJSNotebookFirstProfileWorkspace(opt:{
    defaultStartupScript?:string,
    defaultRpc?:string
}){
    class NotebookOnlyFileBrowser extends filebrowseri.FileBrowser{
        async DoNew(): Promise<void> {
            let form1=new ReactRefEx<SimpleReactForm1>();
            let dlg=await prompt(<div><SimpleReactForm1 ref={form1}>
                {form1=><div>
                    <div>Directory:<ValueCheckBox ref={form1.getRefForInput('isDir')}/></div>
                    <div>name:<input type="text" ref={form1.getRefForInput('name')} /></div>
                    </div>}
            </SimpleReactForm1>
            </div>,'New');
            (await form1.waitValid()).value={isDir:false,name:"untitled.ijsnb"}
            if(await dlg.response.get()=='ok'){
                let {isDir,name}=(await form1.waitValid()).value;
                if(isDir){
                    await this.props.context.fs!.mkdir(path.join((this.state.currPath??''),name));
                }else if(name.endsWith('.ijsnb')){
                    await this.props.context.fs!.writeAll(path.join((this.state.currPath??''),name),utf8conv(JSON.stringify({
                        rpc:opt.defaultRpc,startupScript:opt.defaultStartupScript
                    })))
                }else{
                    await this.props.context.fs!.writeAll(path.join((this.state.currPath??''),name),new Uint8Array(0));
                }
                await this.reloadFileInfo();
            }
            dlg.close();
        }
    }
    let rpc1=await getPersistentRegistered(opt.defaultRpc??ServerHostWorker1RpcName);
    assert(rpc1!=null,'rpc not found.');
    let workspace=new WorkspaceContext(rpc1);
    await workspace.ensureInited();
    workspace.fileBrowser=NotebookOnlyFileBrowser;
    return workspace;
}

let defaultOpenWorkspaceWindowFor=async function (supportedContext:'local window'|ClientInfo){
    if(supportedContext==='local window'){
        supportedContext=new workeriniti.LoopbackRpcClient('local window','loopback:local window');
    }
    let workspace=new WorkspaceContext(supportedContext);
    await workspace.ensureInited()
    await workspace.start();
}

export async function setDefaultOpenWorkspaceWindowFor(openNotebook:typeof openWorkspaceWindowFor){
    defaultOpenWorkspaceWindowFor=openNotebook;
}

export async function openWorkspaceWindowFor(supportedContext:'local window'|ClientInfo){
    defaultOpenWorkspaceWindowFor(supportedContext);
}

export let openWorkspaceWithProfile={
    openJSNotebookFirstProfileWorkspace
}
