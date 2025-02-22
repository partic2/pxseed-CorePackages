
import { ReactRender, css } from 'partic2/pComponentUi/domui';
import * as React from 'preact'
import { SimpleFileSystem } from 'partic2/CodeRunner/JsEnviron';
import { TabInfo, TabInfoBase } from 'partic2/pComponentUi/workspace';
import { TextEditor } from 'partic2/pComponentUi/texteditor';
import { DefaultActionBar } from './misclib';
import type { Workspace } from './workspace';



export interface FileTypeHandler{
    title:string
    extension:string|string[]
    setWorkspace:(workspace:Workspace)=>void
    //return path
    create?:(dir:string)=>Promise<string>
    open?:(path:string)=>Promise<TabInfo>
}

export class FileTypeHandlerBase implements FileTypeHandler{
    title: string='';
    extension: string | string[]=[];
    workspace?:Workspace
    setWorkspace(workspace: Workspace){
        this.workspace=workspace;
    }
    async getUnusedFilename(dir:string,suffix:string){
        for(let t1=1;t1<100;t1++){
            let testname=dir+'/'+'untitled'+t1.toString()+suffix
            if(await this.workspace!.fs!.filetype(testname)=='none'){
                return testname;
            }
        }
        throw new Error('no available file name');
    }
}



export class TextFileViewer extends TabInfoBase{
    rref={inputArea:React.createRef<TextEditor>(),actionBar:React.createRef<DefaultActionBar>()}
    fs?:SimpleFileSystem
    path?:string
    initLoad:boolean=true;
    action={} as Record<string,()=>Promise<void>>;
    async init(initval:Partial<TextFileViewer>){
        await super.init(initval)
        this.action.save=async ()=>{
            let content=this.rref.inputArea.current!.getPlainText();
            let data=new TextEncoder().encode(content);
            await this.fs!.writeAll(this.path!,data);
        }
        return this;
    }
    async doLoad(){
        let data=await this.fs!.readAll(this.path!);
        data=data??new Uint8Array(0);
        this.rref.inputArea.current!.setPlainText(new TextDecoder().decode(data))
    }
    onKeyDown(ev: React.JSX.TargetedKeyboardEvent<HTMLElement>){
        this.rref.actionBar.current?.processKeyEvent(ev);
    }
    renderPage(){
        return <div className={css.flexColumn} style={{flexGrow:'1'}} onKeyDown={(ev)=>this.onKeyDown(ev)}>
        <div><DefaultActionBar action={this.action} ref={this.rref.actionBar} /></div>
        <TextEditor ref={(refObj)=>{
            this.rref.inputArea.current=refObj;
            if(this.initLoad){
                this.doLoad();
                this.initLoad=false;
            }
        }} divClass={[css.simpleCard]}/>
        </div>
    }
}



export class MediaFileViewerTab extends TabInfoBase{
    rref={actionBar:React.createRef<DefaultActionBar>()}
    fs?:SimpleFileSystem
    path?:string
    mediaType?:'image'|'audio'|'video'
    initLoad:boolean=true;
    action={} as Record<string,()=>Promise<void>>
    async init(initval:Partial<MediaFileViewerTab>){
        await super.init(initval);
        await this.doLoad();
        return this;
    }
    protected dataUrl?:string
    async doLoad(){
        let data=await this.fs!.readAll(this.path!);
        data=data??new Uint8Array(0);
        this.dataUrl=URL.createObjectURL(new Blob([data]));
        this.requestPageViewUpdate();
    }
    async onClose(): Promise<boolean> {
        if(this.dataUrl!=undefined){
            URL.revokeObjectURL(this.dataUrl);
        }
        return true;
    }
    onKeyDown(ev: React.JSX.TargetedKeyboardEvent<HTMLElement>){
        this.rref.actionBar.current?.processKeyEvent(ev);
    }
    renderMedia(){
        if(this.dataUrl==undefined)return;
        if(this.mediaType==='image'){
            return <img src={this.dataUrl}/>
        }else if(this.mediaType==='audio'){
            return <audio src={this.dataUrl}/>
        }else if(this.mediaType==='video'){
            return <video src={this.dataUrl}/>
        }
    }
    renderPage(){
        return <div className={css.flexColumn} style={{flexGrow:'1'}} onKeyDown={(ev)=>this.onKeyDown(ev)}>
        <div><DefaultActionBar action={this.action} ref={this.rref.actionBar} /></div>
        {this.renderMedia()}
        </div>
    }
}

export class TextFileHandler extends FileTypeHandlerBase{
    title: string='text file';
    extension: string='';
    async create(dir: string): Promise<string> {
        let fs=this.workspace!.fs!
        let path=await this.getUnusedFilename(dir,'.txt')
        await fs.writeAll(path,new Uint8Array(0))
        return path;
    }
    async open(path: string): Promise<TabInfo> {
        let fs=this.workspace!.fs!
        let t1=new TextFileViewer();
        let t2=await t1.init({
            id:'file://'+path,
            title:path.substring(path.lastIndexOf('/')+1),
            fs:fs,path:path
        })
        return t2
    }
}

export class JsModuleHandler extends FileTypeHandlerBase{
    title: string= 'js module(amd)';
    extension:string= '.js';
    async create(dir: string): Promise<string> {
        let fs=this.workspace!.fs!;
        let path=await this.getUnusedFilename(dir,'.js');
        await fs.writeAll(path,new TextEncoder().encode("define(['require','exports','module'],function(require,exports,module){\n\n})"))
        return path;
    }
    async open(path: string): Promise<TabInfo> {
        return new TextFileViewer().init({
            id:'file://'+path,
            title:path.substring(path.lastIndexOf('/')+1),
            fs:this.workspace!.fs!,path:path
        });
    }
}

export class ImageFileHandler extends FileTypeHandlerBase{
    title:string='png file'
    extension=['.png','.jpg','.jpeg','.webp','.gif'];
    async open(path: string): Promise<TabInfo> {
        let fs=this.workspace!.fs!;
        return new MediaFileViewerTab().init({
            id:'file://'+path,
            title:path.substring(path.lastIndexOf('/')+1),
            fs:fs,path:path,
            mediaType:'image'
        });
    }
}

