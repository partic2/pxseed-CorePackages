
import * as React from 'preact'
var ReactDOM=React

import {ArrayWrap2, GenerateRandomString, GetBlobArrayBufferContent, GetCurrentTime} from 'partic2/jsutils1/base'
import {CKeyValueDb, DynamicPageCSSManager,selectFile} from 'partic2/jsutils1/webutils'
import { ReactRender, css } from 'partic2/pComponentUi/domui'
import { SimpleFileSystem,FileEntry, LocalWindowSFS } from 'partic2/CodeRunner/JsEnviron'
import { FileTypeHandler, FileTypeHandlerBase } from './fileviewer'
import { TabInfo } from 'partic2/pComponentUi/workspace'


var __name__='partic2/JsNotebook/filebrowser'


interface FileProp{
    path:string,
    name:string,
    type:'dir'|'file',
    selected:boolean,
    onOpenRequest?:(path:string)=>void,
    onSelectChange?:(path:string,selected:boolean)=>void
}


export class File extends React.Component<FileProp,{}>{
    public constructor(props?:FileProp,ctx?:any){
        super(props,ctx);
    }
    lastSelectTime?:Date
    protected onClick(ev: React.JSX.TargetedMouseEvent<HTMLDivElement>){
        if(this.lastSelectTime!=undefined && GetCurrentTime().getTime()-this.lastSelectTime.getTime()<500){
            //Dblclick
            this.props.onOpenRequest?.(this.props.path);
            ev.preventDefault();
        }else{
            this.props.onSelectChange?.(this.props.path,!this.props.selected);
        }
        this.lastSelectTime=GetCurrentTime();
    }
    public render(){
        let cls=[css.selectable]
        if(this.props.selected){
            cls.push(css.selected)
        }
        return (<div className={cls.join(' ')} onClick={(ev)=>this.onClick(ev)}> 
            [{this.props.type.charAt(0).toUpperCase()}]{this.props.name}
        </div>)
    }
}


export class DummyDirectoryHandler extends FileTypeHandlerBase{
    title: string='directory';
    extension: string='.#NOEXTENSION';
    async create(dir: string): Promise<string> {
        let path=await this.getUnusedFilename(dir,'');
        let fs=this.workspace!.fs!
        await fs.mkdir(path);
        return path;
    }
}

interface FileBrowserState{
    currPath?:string,
    childrenFile:{name:string,type:string}[],
    errorMsg:string,
    selectedFiles:Set<string>,
    action:'main-menu'|'rename',
    filterText:string,
    textInput1:string
};

export class FileBrowser extends React.Component<{
    sfs:SimpleFileSystem,initDir:string,
    onCreateRequest:(dir:string)=>void
    onOpenRequest:(path:string)=>void}
    ,FileBrowserState>{
    public constructor(props?: any | undefined, context?: any){
        super(props,context)
        this.setState({
            currPath:this.props.initDir,childrenFile:[],
            selectedFiles:new Set(),
            action:'main-menu',
            filterText:''
        });
    }
    componentDidMount(): void {
        this.doFileOpen(this.state.currPath??this.props.initDir)
    }
    public getParentPath(){
        var delim=this.state.currPath!.lastIndexOf('/')
        if(delim<0){
            return ''
        }else{
            return this.state.currPath!.substring(0,delim);
        }
    }
    async doFileOpen(path:string){
        let filetype=await this.props.sfs.filetype(path);
        if(filetype=='dir'){
            let newPath=path;
            let children
            try{
                children=await this.props.sfs.listdir(newPath);
            }catch(e1){
                newPath='';
                children=await this.props.sfs.listdir(newPath);
            }
            this.setState({
                currPath:newPath,
                childrenFile:children
            })
        }else if(filetype=='file'){
            this.props.onOpenRequest(path);
        }
        
    }
    onSelectChange(path:string,selected:boolean){
        if(selected){
            this.setState({selectedFiles:new Set([path])})
        }else{
            //this.state.selectedFiles.delete(path)
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
            onOpenRequest={(path)=>this.doFileOpen(path)}/>
        });
    }
    async DoCreateFile(isDir:boolean){
        try{
            let name=this.input1Ref.current!.value;
            if(isDir){
                await this.props.sfs.mkdir(this.state.currPath+'/'+name);
            }else{
                await this.props.sfs.writeAll(this.state.currPath+'/'+name,new Uint8Array(0));
            }
            this.setState({action:'main-menu'})
            this.reloadFileInfo();
        }catch(e){
            this.setState({
                errorMsg:(e as Error).toString()
            })
        }
    }
    async selectFiles(path:string[]){
        return new Promise<void>((resolve,reject)=>{
            this.setState({selectedFiles:new Set(path)},resolve)
        });
    }
    setAction(action:'main-menu'|'rename'){
        let path=this.state.selectedFiles.values().next().value;
        path=path!.substring(path!.lastIndexOf('/')+1)
        if(action==='rename'){
            this.setState({
                action:'rename',textInput1:path
            })
        }else{
            this.setState({action})
        }
    }
    async DoRenameTo(){
        if(this.state.selectedFiles.size<1){
            this.setState({errorMsg:'No file selected'})
            return;
        }
        let path=Array.from(await this.state.selectedFiles)[0]
        let newPath=this.state.currPath+'/'+this.input1Ref.current!.value;
        await this.props.sfs.rename(path,newPath);
        this.setState({action:'main-menu'})
        await this.reloadFileInfo();
    }
    async reloadFileInfo(){
        this.doFileOpen(this.state.currPath!);
    }
    async DoDelete(){
        for(let f1 of Array.from(this.state.selectedFiles)){
            this.props.sfs.delete2(f1)
        }
        this.reloadFileInfo();
    }
    async DoUpload(){
        let selected=await selectFile()
        if(selected!=null){
            for(let t1=0;t1<selected.length;t1++){
                let data=await GetBlobArrayBufferContent(selected.item(t1)!);
                let name=selected.item(t1)!.name;
                await this.props.sfs.writeAll(this.state.currPath+'/'+name,new Uint8Array(data!)!)
            }
        }
        await this.reloadFileInfo();
    }
    input1Ref=React.createRef<HTMLInputElement>();
    filterRef=React.createRef<HTMLInputElement>();
    public renderAction(){
        if(this.state.action=='main-menu'){
            return <div>
                <a href="javascript:;" onClick={()=>this.props.onCreateRequest?.(this.state.currPath!)}>New</a>&emsp;
                <a href="javascript:;" onClick={()=>this.setAction('rename')}>Rename</a>&emsp;
                <a href="javascript:;" onClick={()=>this.DoDelete()}>Delete</a><br/>
                <a href="javascript:;" onClick={()=>this.DoUpload()}>Upload</a>
            </div>
        }else if(this.state.action=='rename'){
            return <div class={[css.simpleCard].join(' ')}>
                name:<input type="text" style={{flexGrow:1}} ref={this.input1Ref} value={this.state.textInput1}
                onChange={(ev)=>this.setState({textInput1:(ev.target as HTMLInputElement).value})}/><br/>
                <a href="javascript:;" onClick={()=>this.setState({action:'main-menu'})}>Cancel</a>&emsp;
                <a href="javascript:;" onClick={()=>this.DoRenameTo()}>Rename</a>
            </div>
        }
    }
    public onFilterChange(filterText:string){
        this.setState({filterText})
    }
    protected filesContainer=React.createRef();
    public render(){
        return (<div className={css.flexColumn} style={{height:'100%'}}>
            <div style={{color:'red'}}>{this.state.errorMsg}</div>
            <div style={{wordBreak:'break-all'}}>{this.state.currPath}</div>
            {this.renderAction()}
            <input type='text' placeholder='filter' onInput={(ev)=>this.onFilterChange((ev.target as HTMLInputElement).value)}></input>
            <div style={{flexGrow:1,flexShrink:1}} ref={this.filesContainer}>
                <File path={this.getParentPath()} name=".." onOpenRequest={(path)=>this.doFileOpen(path)}
                    onSelectChange={(path,selected)=>this.onSelectChange(path,selected)}
                    selected={this.state.selectedFiles.has(this.getParentPath())} type='dir'/>
                {this.renderFiles()}
            </div>
        </div>)
    }
}
