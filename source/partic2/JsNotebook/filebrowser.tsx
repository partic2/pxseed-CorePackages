
import * as React from 'preact'
var ReactDOM=React

import {ArrayWrap2, GenerateRandomString, GetBlobArrayBufferContent, GetCurrentTime} from 'partic2/jsutils1/base'
import {CKeyValueDb, DynamicPageCSSManager,path,selectFile} from 'partic2/jsutils1/webutils'
import { ReactRefEx, ReactRender, css } from 'partic2/pComponentUi/domui'
import { SimpleFileSystem,FileEntry, LocalWindowSFS } from 'partic2/CodeRunner/JsEnviron'
import { FileTypeHandlerBase } from './fileviewer'
import { WorkspaceContext } from './workspace'
import { alert, confirm, prompt } from 'partic2/pComponentUi/window'
import { TextEditor } from 'partic2/pComponentUi/texteditor'
import { SimpleReactForm1, ValueCheckBox } from '../pComponentUi/input'


var __name__='partic2/JsNotebook/filebrowser'


interface FileProp{
    path:string,
    name:string,
    type:'dir'|'file',
    selected:boolean,
    onOpenRequest?:(path:string)=>void,
    onSelectChange?:(path:string,selected:boolean)=>void
}


class File extends React.Component<FileProp,{}>{
    public constructor(props?:FileProp,ctx?:any){
        super(props,ctx);
    }
    lastSelectTime:Date|null=null
    protected onClick(ev: React.TargetedMouseEvent<HTMLDivElement>){
        if(this.lastSelectTime!=null && GetCurrentTime().getTime()-this.lastSelectTime.getTime()<500){
            //Dblclick
            this.lastSelectTime=null;
            this.props.onOpenRequest?.(this.props.path);
        }else{
            this.props.onSelectChange?.(this.props.path,!this.props.selected);
            this.lastSelectTime=GetCurrentTime();
        }
    }
    public render(){
        let cls=[css.selectable]
        if(this.props.selected){
            cls.push(css.selected)
        }
        return (<div className={cls.join(' ')} onClick={(ev)=>this.onClick(ev)} onDblClick={(ev)=>ev.preventDefault()}> 
            [{this.props.type.charAt(0).toUpperCase()}]{this.props.name}
        </div>)
    }
}


interface FileBrowserState{
    currPath?:string,
    childrenFile:{name:string,type:string}[],
    selectedFiles:Set<string>,
    filterText:string,
    textInput1:string
};

class FileBrowser extends React.Component<{context:WorkspaceContext},FileBrowserState>{
    public constructor(props?: any | undefined, context?: any){
        super(props,context)
        this.setState({childrenFile:[],
            selectedFiles:new Set(),
            filterText:'',currPath:''
        });
    }
    public getParentPath(){
        var delim=this.state.currPath!.lastIndexOf('/')
        if(delim<0){
            return ''
        }else{
            return this.state.currPath!.substring(0,delim);
        }
    }
    async DoFileOpen(path:string){
        let filetype=await this.props.context.fs!.filetype(path);
        if(filetype=='dir'){
            let newPath=path;
            let children
            try{
                children=await this.props.context.fs!.listdir(newPath);
            }catch(e1){
                newPath='';
                children=await this.props.context.fs!.listdir(newPath);
            }
            this.state.selectedFiles.clear();
            this.setState({
                currPath:newPath,
                childrenFile:children
            })
            if(this.props.context.startupProfile!=undefined){
                this.props.context.startupProfile.currPath=path;
                await this.props.context.saveStartupProfile();
            }
        }else if(filetype=='file'){
            let selectedHandle:FileTypeHandlerBase|null=null;
            for(let t1 of this.props.context.filehandler){
                for(let t2 of t1.extension){
                    if(path.endsWith(t2)){
                        selectedHandle=t1
                        break;
                    }
                }
                if(selectedHandle!=null)break;
            }
            if(selectedHandle==null){
                alert('No handler for such file extension.');
            }else{
                let handleTask=await selectedHandle.open(path);
                if(handleTask.waitClose!=undefined){
                    (async ()=>{
                        if(this.props.context.startupProfile!=null){
                            this.props.context.startupProfile!.openedFiles.push(path);
                            await this.props.context.saveStartupProfile();
                            await handleTask.waitClose!();
                            let removeAt=this.props.context.startupProfile!.openedFiles.indexOf(path);
                            this.props.context.startupProfile!.openedFiles.splice(removeAt);
                            await this.props.context.saveStartupProfile();
                        }
                    })();
                }
            }
        }
        
    }
    onSelectChange(path:string,selected:boolean){
        if(selected){
            this.setState({selectedFiles:new Set([path])})
        }
    }
    public renderFiles(){
        let parentPath=this.state.currPath;
        let files=this.state.childrenFile;
        if(this.state.filterText!==''){
            files=files.filter((v=>v.name.indexOf(this.state.filterText)>=0))
        }
        return files.map((v)=>{
            let path=parentPath+'/'+v.name
            return <File path={path} 
            name={v.name} type={v.type as any} selected={this.state.selectedFiles.has(path)}
            onSelectChange={(path,selected)=>this.onSelectChange(path,selected)}
            onOpenRequest={(path)=>this.DoFileOpen(path)}/>
        });
    }
    async selectFiles(path:string[]){
        return new Promise<void>((resolve,reject)=>{
            this.setState({selectedFiles:new Set(path)},resolve)
        });
    }
    async _askForFileName(initname:string):Promise<string|null>{
        let newFileNameInput=new ReactRefEx<HTMLInputElement>();
        let dlg=await prompt(<div>
            <input type='text' ref={newFileNameInput} style={{width:'100%',minWidth:'200px'}} value={initname}/>
        </div>,'Input file name...')
        let newFileName=null;
        if((await dlg.response.get())=='ok'){
            newFileName=(await newFileNameInput.waitValid()).value;
        }
        dlg.close();
        return newFileName;
    }
    async DoRenameTo(){
        if(this.state.selectedFiles.size<1){
            await alert('No file selected');
            return;
        }
        let path=Array.from(await this.state.selectedFiles)[0];
        let newFileName=await this._askForFileName(path.substring(path.lastIndexOf('/')+1));
        if(newFileName!=null){
            let newPath=this.state.currPath+'/'+newFileName;
            await this.props.context.fs!.rename(path,newPath);
        }
        await this.reloadFileInfo();
    }
    async reloadFileInfo(){
        this.DoFileOpen(this.state.currPath!);
    }
    async DoDelete(){
        let ans=await confirm(`Delete ${this.state.selectedFiles.size} files permenantly?`)
        if(ans=='cancel'){
            return;
        }
        for(let f1 of this.state.selectedFiles){
            await this.props.context.fs!.delete2(f1)
        }
        await this.reloadFileInfo();
    }
    async DoUpload(){
        let selected=await selectFile()
        if(selected!=null){
            for(let t1=0;t1<selected.length;t1++){
                let data=await GetBlobArrayBufferContent(selected.item(t1)!);
                let name=selected.item(t1)!.name;
                await this.props.context.fs!.writeAll(this.state.currPath+'/'+name,new Uint8Array(data!)!)
            }
        }
        await this.reloadFileInfo();
    }
    _clipboardFile={
        paths:[] as string[],
        mode:'copy' as 'copy'|'cut'
    }
    _clipboardIsCut=false;
    async DoCopy(){
        this._clipboardFile.paths.splice(0,this._clipboardFile.paths.length);
        this._clipboardFile.paths.push(...this.state.selectedFiles);
        this._clipboardFile.mode='copy'
    }
    async DoCut(){
        this._clipboardFile.paths.splice(0,this._clipboardFile.paths.length);
        this._clipboardFile.paths.push(...this.state.selectedFiles);
        this._clipboardFile.mode='cut'
    }
    async DoPaste(){
        if(this._clipboardFile.mode==='cut'){
            for(let t1 of this._clipboardFile.paths){
                let name=t1.substring(t1.lastIndexOf('/')+1);
                await this.props.context.fs!.rename(t1,(this.state.currPath??'')+'/'+name);
            }
        }else{
            const copyFileAndDir=async (src:string,dst:string)=>{
                if(await this.props.context.fs!.filetype(src)=='dir'){
                    let children=await this.props.context.fs!.listdir(src);
                    this.props.context.fs!.mkdir(dst)
                    for(let t1 of children){
                        await copyFileAndDir([src,t1.name].join('/'),[dst,t1.name].join('/'));
                    }
                }else{
                    if(src==dst){
                        dst+='_Copy';
                    }
                    //XXX:Not suitable for large file.
                    let t1=await this.props.context.fs!.readAll(src);
                    if(t1!=null){
                        await this.props.context.fs!.writeAll(dst,t1);
                    }
                }
            }
            for(let t1 of this._clipboardFile.paths){
                let name=t1.substring(t1.lastIndexOf('/')+1);
                await copyFileAndDir(t1,(this.state.currPath??'')+'/'+name);
            }
        }
        this.reloadFileInfo();
    }
    async DoNew(){
        let form1=new ReactRefEx<SimpleReactForm1>();
        let dlg=await prompt(<div><SimpleReactForm1 ref={form1}>
            {form1=><div>
                <div>Directory:<ValueCheckBox ref={form1.getRefForInput('isDir')}/></div>
                <div>name:<input type="text" ref={form1.getRefForInput('name')} /></div>
                </div>}
        </SimpleReactForm1>
        </div>,'New');
        (await form1.waitValid()).value={isDir:false,name:"untitled"}
        if(await dlg.response.get()=='ok'){
            let {isDir,name}=(await form1.waitValid()).value;
            if(isDir){
                await this.props.context.fs!.mkdir(path.join((this.state.currPath??''),name));
            }else{
                
            }
            await this.reloadFileInfo();
        }
        dlg.close();
    }
    filterRef=React.createRef<HTMLInputElement>();
    public renderAction(){
        return <div>
            <a href="javascript:;" onClick={()=>this.DoNew()}>New</a>&emsp;
            <a href="javascript:;" onClick={()=>this.DoRenameTo()}>Rename</a>&emsp;
            <a href="javascript:;" onClick={()=>this.DoDelete()}>Delete</a>&emsp;
            <a href="javascript:;" onClick={()=>this.DoUpload()}>Upload</a>&emsp;
            <a href="javascript:;" onClick={()=>this.DoCopy()}>Copy</a>&emsp;
            <a href="javascript:;" onClick={()=>this.DoCut()}>Cut</a>&emsp;
            <a href="javascript:;" onClick={()=>this.DoPaste()}>Paste</a>&emsp;
        </div>

    }
    public onFilterChange(filterText:string){
        this.setState({filterText})
    }
    protected filesContainer=React.createRef();
    protected async promptForCurrentPath(){
        let newPathInput=new ReactRefEx<TextEditor>();
        let dlg=await prompt(<TextEditor divClass={[css.simpleCard]} divStyle={{minWidth:300}} ref={newPathInput}/>,'Jump to');
        (await newPathInput.waitValid()).setPlainText(this.state.currPath??'');
        if(await dlg.response.get()==='ok'){
            this.DoFileOpen(await (await newPathInput.waitValid()).getPlainText());
        }
        dlg.close();
    }
    public render(){
        return (<div className={css.flexColumn} style={{height:'100%'}}>
            <div style={{wordBreak:'break-all'}} className={[css.simpleCard].join(' ')}>
                <a href="javascript:;" onClick={()=>this.promptForCurrentPath()}>{this.state.currPath}</a>
            </div>
            {this.renderAction()}
            <input type='text' placeholder='filter' onInput={(ev)=>this.onFilterChange((ev.target as HTMLInputElement).value)}></input>
            <div style={{flexGrow:1,flexShrink:1}} ref={this.filesContainer}>
                <File path={this.getParentPath()} name=".." onOpenRequest={(path)=>this.DoFileOpen(path)}
                    onSelectChange={(path,selected)=>this.onSelectChange(path,selected)}
                    selected={this.state.selectedFiles.has(this.getParentPath())} type='dir'/>
                {this.renderFiles()}
            </div>
        </div>)
    }
}

export let __internal__={
    FileBrowser
}