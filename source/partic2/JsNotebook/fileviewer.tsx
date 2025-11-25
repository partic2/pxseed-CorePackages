
import { ReactRefEx, ReactRender, css } from 'partic2/pComponentUi/domui';
import * as React from 'preact'
import { SimpleFileSystem } from 'partic2/CodeRunner/JsEnviron';
import { openNewWindow } from 'partic2/pComponentUi/workspace';
import { TextEditor } from 'partic2/pComponentUi/texteditor';
import { WorkspaceContext } from './workspace';
import { utf8conv } from 'partic2/CodeRunner/jsutils2';




export class FileTypeHandlerBase{
    title: string='';
    extension: string[]=[];
    context?:WorkspaceContext
    async open(path:string):Promise<{waitClose?:()=>Thenable<void>}>{return {}}
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
        return await openNewWindow(<TextFileViewer context={this.context!} path={path}/>,{
            title:'Text File:'+path.substring(path.lastIndexOf('/')+1)
        });
    }
}


class ImageFileHandler extends FileTypeHandlerBase{
    title:string='png file'
    extension=['.png','.jpg','.jpeg','.webp','.gif'];
    async open(path: string){
        return await openNewWindow(<MediaFileViewer1 context={this.context!} path={path} mediaType='image'/>,{
            title:'Image File:'+path.substring(path.lastIndexOf('/')+1)
        })
    }
}

export let __internal__={
    TextFileViewer,MediaFileViewer1,TextFileHandler,ImageFileHandler
}