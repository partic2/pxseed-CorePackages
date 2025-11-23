import { ReactRefEx } from 'partic2/pComponentUi/domui';
import * as React from 'preact';
import {  __internal__ as filebrowseri } from './filebrowser';
import { openNewWindow } from 'partic2/pComponentUi/workspace';
import { ClientInfo, createIoPipe, easyCallRemoteJsonFunction } from 'partic2/pxprpcClient/registry';
import { __internal__ as notebooki } from './notebook';
import { FileTypeHandlerBase } from './fileviewer';
import { __internal__ as filevieweri } from './fileviewer';
import { SimpleFileSystem ,TjsSfs, defaultFileSystem, ensureDefaultFileSystem} from 'partic2/CodeRunner/JsEnviron';
import { tjsFrom } from 'partic2/tjshelper/tjsonjserpc';
import { path } from 'partic2/jsutils1/webutils'
import { utf8conv } from 'partic2/CodeRunner/jsutils2';
import './workerinit'
import { RpcExtendClient1, RpcExtendServer1 } from 'pxprpc/extend';
import { Client, Server } from 'pxprpc/base';

const __name__='partic2/JsNotebook/workspace'





export class WorkspaceContext{
    constructor(public rpc:ClientInfo){}
    //optional property.
    fs:SimpleFileSystem|null=null;
    wwwroot:string|null=null;
    filehandler=new Array<FileTypeHandlerBase>();
    startupProfile:{
        currPath:string,
        openedFiles:string[]
    }|null=null;
    async ensureInited(){
        if(this.fs==null){
            if(this.rpc instanceof notebooki.LoopbackRpcClient||this.rpc.url.startsWith('webworker:')||this.rpc.url.startsWith('serviceworker:')){
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
    openNewWindow:typeof openNewWindow=async function(vnode,options){
        return openNewWindow(vnode,options);
    }
    async start(){
        await this.ensureInited();
        let {FileBrowser}=filebrowseri
        let rref={
            fb:new ReactRefEx<InstanceType<typeof FileBrowser>>()
        }
        this.openNewWindow(<FileBrowser context={this} ref={rref.fb}/>,{title:'JS Notebook File Browser'})
        let fb=await rref.fb.waitValid();
        if(this.startupProfile==null){
            let profileFile=await this.fs!.readAll(path.join(this.wwwroot!,__name__,'serverProfile.json'));
            if(profileFile!=null){
                this.startupProfile=JSON.parse(utf8conv(profileFile));
            }
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
            await this.fs!.writeAll(path.join(this.wwwroot!,__name__,'serverProfile.json'),utf8conv(JSON.stringify(this.startupProfile)));
        }
        await fb.DoFileOpen(this.startupProfile.currPath);
        for(let t1 of this.startupProfile.openedFiles){
            await fb.DoFileOpen(t1);
        }
    }
}



export let defaultOpenWorkspaceWindowFor=async function (supportedContext:'local window'|ClientInfo){
    if(supportedContext==='local window'){
        supportedContext=new notebooki.LoopbackRpcClient('local window','loopback:local window');
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
