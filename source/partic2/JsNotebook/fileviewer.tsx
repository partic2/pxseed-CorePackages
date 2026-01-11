
import { ReactRefEx, ReactRender, css } from 'partic2/pComponentUi/domui';
import * as React from 'preact'
import { SimpleFileSystem } from 'partic2/CodeRunner/JsEnviron';
import { TextEditor } from 'partic2/pComponentUi/texteditor';
import { WorkspaceContext } from './workspace';
import { utf8conv } from 'partic2/CodeRunner/jsutils2';
import { ClientInfo, getPersistentRegistered, ServerHostRpcName, ServerHostWorker1RpcName } from 'partic2/pxprpcClient/registry';
import { openNewWindow } from 'partic2/pComponentUi/workspace';




export class FileTypeHandlerBase{
    title: string='';
    extension: string[]=[];
    context?:WorkspaceContext
    async open(path:string):Promise<void>{}
}


class TextFileViewer extends React.Component<{context:WorkspaceContext,path:string},{}>{
    
    rref={inputArea:new ReactRefEx<TextEditor>()}
    action={} as Record<string,()=>Promise<void>>;

    onKeyDown(ev: React.JSX.TargetedKeyboardEvent<HTMLElement>){
        if(ev.key==='KeyS'&&ev.ctrlKey){
            this.doSave();
            ev.preventDefault();
        }
    }
    async doSave(){
        await this.props.context.fs!.writeAll(this.props.path,utf8conv((await this.rref.inputArea.waitValid()).getPlainText()))
    }
    async componentDidMount() {
        let data=await this.props.context.fs!.readAll(this.props.path);
        data=data??new Uint8Array(0);
        this.rref.inputArea.current!.setPlainText(new TextDecoder().decode(data))
    }
    render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined; }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChildren {
        return <div className={css.flexColumn} style={{flexGrow:'1'}} onKeyDown={(ev)=>this.onKeyDown(ev)}>
        <div><a onClick={()=>this.doSave()} href="javascript:;">Save</a></div>
        <TextEditor ref={this.rref.inputArea} divClass={[css.simpleCard]}/>
        </div>
    }
}



class MediaFileViewer1 extends React.Component<{context:WorkspaceContext,path:string,mediaType:string},{dataUrl?:string}>{
    rref={}
    async doLoad(){
        let data=await this.props.context.fs!.readAll(this.props.path);
        data=data??new Uint8Array(0);
        let dataUrl=URL.createObjectURL(new Blob([data]));
        this.setState({dataUrl})
    }
    renderMedia(){
        if(this.state.dataUrl==undefined)return;
        if(this.props.mediaType==='image'){
            return <img src={this.state.dataUrl}/>
        }else if(this.props.mediaType==='audio'){
            return <audio src={this.state.dataUrl}/>
        }else if(this.props.mediaType==='video'){
            return <video src={this.state.dataUrl}/>
        }
    }
    render(){
        return <div className={css.flexColumn} style={{flexGrow:'1'}}>
        {this.renderMedia()}
        </div>
    }
}

class TextFileHandler extends FileTypeHandlerBase{
    title: string='text file';
    extension=[''];
    async open(path: string) {
        await this.context!.openNewWindowForFile({
            vnode:<TextFileViewer context={this.context!} path={path}/>,
            title:'Text File:'+path.substring(path.lastIndexOf('/')+1),
            filePath:path
        });
    }
}


class ImageFileHandler extends FileTypeHandlerBase{
    title:string='png file'
    extension=['.png','.jpg','.jpeg','.webp','.gif'];
    async open(path: string){
        await this.context!.openNewWindowForFile({
            vnode:<MediaFileViewer1 context={this.context!} path={path} mediaType='image'/>,
            title:'Image File:'+path.substring(path.lastIndexOf('/')+1),
            filePath:path
        });
    }
}

class ProcessStdioViewer extends React.Component<{id:string,rpc:ClientInfo},{text:Array<{type:'stderr'|'stdout'|'stdin',data:string}>}>{
    rref={
        input:new ReactRefEx<TextEditor>()
    }
    onInputKeyDown(ev:React.TargetedKeyboardEvent<HTMLDivElement>){
        console.info('key press',ev.key);
    }
    render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined; }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChildren {
        return <div style={{backgroundColor:'white',whiteSpace:'pre-wrap',minWidth:'250px'}}>
            <div>{this.state.text.map((t1)=>{
                let style:React.CSSProperties={}
                if(t1.type=='stderr')style.color='red';
                if(t1.type=='stdin')style.color='green';
                if(t1.type=='stdout')style.color='black';
                return <span style={style}>{t1.data}</span>
            })}</div>
            <div><TextEditor ref={this.rref.input} divAttr={{onKeyDown:(ev)=>this.onInputKeyDown(ev)}}/></div>
        </div>
    }
}

export async function openViewerForStdioSource(id:string,nbctx?:{rpc?:ClientInfo}){
    let rpc=nbctx?.rpc??(await getPersistentRegistered(ServerHostWorker1RpcName))!;
    openNewWindow(<ProcessStdioViewer id={id} rpc={rpc}/>)
}

export let __internal__={
    TextFileViewer,MediaFileViewer1,TextFileHandler,ImageFileHandler
}