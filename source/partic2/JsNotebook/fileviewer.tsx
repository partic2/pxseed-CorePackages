
import { ReactRefEx, ReactRender, css } from 'partic2/pComponentUi/domui';
import * as React from 'preact'
import { SimpleFileSystem } from 'partic2/CodeRunner/JsEnviron';
import { TextEditor } from 'partic2/pComponentUi/texteditor';
import { WorkspaceContext } from './workspace';
import { DebounceCall, utf8conv } from 'partic2/CodeRunner/jsutils2';
import { ClientInfo, getPersistentRegistered, ServerHostRpcName, ServerHostWorker1RpcName } from 'partic2/pxprpcClient/registry';
import { openNewWindow } from 'partic2/pComponentUi/workspace';
import { GenerateRandomString } from '../jsutils1/base';




export class FileTypeHandlerBase{
    title: string='';
    extension: string[]=[];
    context?:WorkspaceContext
    async open(path:string):Promise<void>{}
}


class TextFileViewer extends React.Component<{context:WorkspaceContext,path:string},{}>{
    
    rref={inputArea:new ReactRefEx<TextEditor>()}
    action={} as Record<string,()=>Promise<void>>;

    onKeyDown(ev: React.TargetedKeyboardEvent<HTMLElement>){
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


interface StdioSource{
    readStdoutUtf8():Promise<string>;
    readStderrUtf8():Promise<string>;
    writeStdinUtf8(s:string):Promise<void>;
    close():Promise<void>;
    waitClosed():Promise<void>
}

class StdioConsole extends React.Component<{stdioSource:StdioSource},
    {outputs:string[],inputHistory:string[],inputHistoryIndex:number}>{
    rref={
        input:new ReactRefEx<TextEditor>(),
        output:new ReactRefEx<HTMLDivElement>()
    }
    protected readingOutputs=false;
    constructor(p:any,c:any){
        super(p,c);
        this.setState({outputs:[],inputHistory:[],inputHistoryIndex:-1});
    }
    componentDidMount(): void {
        if(this.readingOutputs)return;
        this.readingOutputs=true;
        this.props.stdioSource.waitClosed().then(()=>this.readingOutputs=false).catch(()=>{});
        (async ()=>{
            while(this.readingOutputs){
                let outtext=await this.props.stdioSource.readStdoutUtf8();
                this.pushOutputToOutputsBuffer(outtext);
            }
        })().catch((err:any)=>{
            this.pushOutputToOutputsBuffer(err.toString()+err.stack);
        });
        (async ()=>{
            while(this.readingOutputs){
                let outtext=await this.props.stdioSource.readStderrUtf8();
                this.pushOutputToOutputsBuffer(outtext);
            }
        })().catch((err:any)=>{
            this.pushOutputToOutputsBuffer(err.toString()+err.stack);
        });
    }
    componentWillUnmount(): void {
        this.readingOutputs=false;
    }
    debounceScrollOutputsToBottom=new DebounceCall(async ()=>{
        await new Promise(requestAnimationFrame);
        let div1=await this.rref.output.waitValid();
        div1.scrollTo({top:div1.scrollHeight,behavior:'smooth'});
    },50);
    pushOutputToOutputsBuffer(output:string){
        let buf=this.state.outputs.slice(Math.max(0,this.state.outputs.length-100))
        buf.push(output);
        this.setState({outputs:buf});
        this.debounceScrollOutputsToBottom.call();
    }
    async onInputKeyDown(ev:KeyboardEvent){
        if(ev.key=='Enter' && !ev.ctrlKey && !ev.altKey && !ev.shiftKey){
            let te=await this.rref.input.waitValid();
            let intext=te.getPlainText();
            let histIdx=this.state.inputHistoryIndex
            let hist=this.state.inputHistory.slice(Math.max(0,histIdx-30),histIdx+1);
            if(hist.at(-1)!==intext){
                hist.push(intext);
            }
            this.setState({inputHistory:hist,inputHistoryIndex:hist.length-1})
            this.pushOutputToOutputsBuffer(intext+'\n')
            try{
                await this.props.stdioSource.writeStdinUtf8(intext+'\n');
            }catch(err:any){
                this.pushOutputToOutputsBuffer(err.toString()+err.stack);
            }finally{
                await new Promise(requestAnimationFrame);
                te.setPlainText('');
            }
        }else if(ev.key=='ArrowUp'){
            let histIdx=this.state.inputHistoryIndex;
            if(histIdx>=0){
                let te=await this.rref.input.waitValid();
                te.setPlainText(this.state.inputHistory[histIdx]);
                this.setState({inputHistoryIndex:histIdx-1});
            }
        }else if(ev.key=='ArrowDown'){
            let histIdx=this.state.inputHistoryIndex+1;
            if(histIdx<this.state.inputHistory.length){
                let te=await this.rref.input.waitValid();
                te.setPlainText(this.state.inputHistory[histIdx]);
                this.setState({inputHistoryIndex:histIdx});
            }
        }
    }
    render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined; }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChildren {
        return <div className={[css.flexColumn].join(' ')} style={{width:'100%',height:'100%'}}>
            <div style={{whiteSpace:'pre-wrap',flexGrow:'1',flexShrink:'1',overflow:'auto'}}
                ref={this.rref.output} >{this.state.outputs.join('')}</div>
            <TextEditor divStyle={{flexGrow:'0',flexShrink:'0'}} ref={this.rref.input} 
                divAttr={{onKeyDown:(ev)=>this.onInputKeyDown(ev)}} divClass={[css.simpleCard]}/>
        </div>
    }
}

export async function openStdioConsoleWebui(stdioSource:StdioSource,opt:{title?:string}){
    let wh=await openNewWindow(<StdioConsole stdioSource={stdioSource}/>,{title:opt.title});
    await wh.waitClose();
    stdioSource.close();
}

export let __internal__={
    TextFileViewer,MediaFileViewer1,TextFileHandler,ImageFileHandler
}