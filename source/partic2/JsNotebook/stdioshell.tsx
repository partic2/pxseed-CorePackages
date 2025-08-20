


import { TextEditor } from 'partic2/pComponentUi/texteditor';
import * as React from 'preact'
import { stdout } from 'process';
import { FileTypeHandlerBase } from './fileviewer';
import { TabInfo, TabInfoBase } from 'partic2/pComponentUi/workspace';
import type { Workspace } from './workspace';
import { tjsFrom } from 'partic2/tjshelper/tjsonjserpc';
import { ArrayBufferConcat, copy, GetCurrentTime, partial, WaitUntil } from 'partic2/jsutils1/base';
import { css, FloatLayerComponent } from 'partic2/pComponentUi/domui';
import { prompt } from 'partic2/pComponentUi/window';
import { SimpleReactForm1 } from 'partic2/pComponentUi/input';

/* simple shell pipe stdio */

interface StdioShellProps{
    cmdline?:string,
    ws:Workspace,
    onProfileChange?:(profile:Partial<StdioShellTab>)=>void
}
interface StdioShellStats{
    exitCode?:number,
    procAlive:boolean,
    process?:tjs.Process,
    stdoutBuffer:Uint8Array[],
}

export class StdioShell extends React.Component<StdioShellProps,StdioShellStats>{
    rref={
        stdout:React.createRef<TextEditor>(),
        stdin:React.createRef<TextEditor>(),
    }
    inputHistory:string[]=[];
    currentUseHistory:number=-1;
    constructor(p:StdioShellProps,c:any){
        super(p,c)
        this.state={
            stdoutBuffer:[],procAlive:true
        }
        this.startProcess(this.props.cmdline);
    }
    protected async startProcess(cmdline?:string){
        try{
            let tjs=await tjsFrom(await this.props.ws.props.rpc!.ensureConnected());
            if(cmdline==undefined){
                cmdline='sh';
                if(tjs.system.platform=='windows'){
                    cmdline='cmd';
                }
            }else{
                this.props.onProfileChange?.({cmdline});
            }
            let process=tjs.spawn(cmdline,{stdin:'pipe',stdout:'pipe',stderr:'pipe'});
            this.setState({process,stdoutBuffer:[],procAlive:true});
            await WaitUntil(()=>this.state.procAlive,100,1000);
            this.updateOutputText();
            await Promise.race([(async ()=>{
                let buf=new Uint8Array(512);
                while(this.state.procAlive){
                    let count=await process.stdout!.read(buf);
                    if(count==null){
                        break;
                    }
                    this.state.stdoutBuffer.push(buf.slice(0,count));
                    this.updateOutputText();
                }
            })(),(async ()=>{
                let buf=new Uint8Array(512);
                while(this.state.procAlive){
                    let count=await process.stderr!.read(buf);
                    if(count==null){
                        break;
                    }
                    this.state.stdoutBuffer.push(buf.slice(0,count));
                    this.updateOutputText();
                }
            })(),(async ()=>{
                let result=await process.wait();
                this.setState({exitCode:result.exit_status,procAlive:false});
            })()]);
        }catch(e){
            this.state.stdoutBuffer.push(new TextEncoder().encode((e as any).toString()));
            this.updateOutputText();
        };
        if(this.state.procAlive){
            this.setState({procAlive:false});
        }
    }
    protected async updateOutputText(){
        let allBuf=ArrayBufferConcat(this.state.stdoutBuffer);
        this.rref.stdout.current!.setPlainText(new TextDecoder().decode(allBuf));
        this.setState({stdoutBuffer:[new Uint8Array(allBuf,0,allBuf.byteLength)]});
        this.rref.stdout.current!.scrollToBottom()
    }
    protected async openSwitchProcessDialog(){
        let v:any={};
        let p=await prompt(<SimpleReactForm1 onChange={newVal=>v=newVal}>{
            (form)=><div>command:<input type="text" ref={form.getRefForInput('command')}/><br/></div>
            }</SimpleReactForm1>
                ,'switch process');
        if(await p.answer.get()=='ok'){
            let {command}=v;
            this.startProcess(command)
        }else{
            p.close();
        }
        
    }
    protected async onStdInAreaKeyDown(ev: React.JSX.TargetedKeyboardEvent<HTMLDivElement>){
        if(ev.code=='ArrowUp'){
            if(this.currentUseHistory<this.inputHistory.length-1){
                this.currentUseHistory++;
                this.rref.stdin.current!.setPlainText(this.inputHistory[this.currentUseHistory])
                this.rref.stdin.current!.setTextCaretOffset('end');
            }
            ev.preventDefault();
        }else if(ev.code=='ArrowDown'){
            if(this.currentUseHistory>0){
                this.currentUseHistory--;
                this.rref.stdin.current!.setPlainText(this.inputHistory[this.currentUseHistory])
                this.rref.stdin.current!.setTextCaretOffset('end');
            }
            ev.preventDefault();
        }else if(ev.code=='Enter'){
            let bufTxt=this.rref.stdin.current!.getPlainText();
            this.inputHistory.unshift(bufTxt);
            this.currentUseHistory=-1;
            await this.state.process!.stdin!.write(new TextEncoder().encode(bufTxt+'\n'));
            this.rref.stdin.current!.setPlainText('');
            ev.preventDefault();
        }
    }
    render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined; }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChild {
        return <div className={css.flexColumn}>
            <TextEditor ref={this.rref.stdout} divStyle={{flexShrink:'1',overflowY:'scroll'}} divClass={[css.simpleCard]}/>
            <TextEditor ref={this.rref.stdin} divClass={[css.simpleCard]}
                divAttr={{onKeyDown:(ev)=>this.onStdInAreaKeyDown(ev)}}/>
            <div>
            <a onClick={()=>this.openSwitchProcessDialog()} href={'javascript:;'}>&nbsp;&nbsp;Switch process&nbsp;&nbsp;</a>
            <span>{this.state.procAlive?'process alive':('process stopped with code '+this.state.exitCode)}</span>
            </div>
        </div>
    }
}
class StdioShellTab extends TabInfoBase{
    cmdline?:string
    workspace?:Workspace
    tjs?:typeof tjs;
    process?:tjs.Process;
    opener?:StdioShellProfile1;
    path?:string;
    async init(initval: Partial<StdioShellTab>): Promise<this> {
        super.init(initval);
        return this;
    }
    protected async saveProfile(){
        if(this.path!=undefined){
            await this.workspace!.fs!.writeAll(this.path,new TextEncoder().encode(JSON.stringify(partial(this,['cmdline']))))
        }
    }
    renderPage(): React.ComponentChild {
        return <StdioShell ws={this.workspace!} cmdline={this.cmdline} onProfileChange={(profile)=>{
            for(let k in profile){
                (this as any)[k]=(profile as any)[k]
            }
            this.saveProfile();
        }}/>
    }
}
export class StdioShellProfile1 extends FileTypeHandlerBase{
    title: string='stdio shell'
    extension: string | string[]='.siosp1'
    async create(dir:string):Promise<string>{
        let path=await this.getUnusedFilename(dir,this.extension as string);
        this.workspace!.fs!.writeAll(path,new TextEncoder().encode(JSON.stringify({})))
        return path;
    }
    async open(path:string):Promise<TabInfo>{
        let data=await this.workspace!.fs!.readAll(path);
        let tab=new StdioShellTab();
        tab.workspace=this.workspace;
        let config={title:'StdioShell',opener:this,path}
        if(data!=null){
            copy(JSON.parse(new TextDecoder().decode(data)),config,1);
            tab.init(config);
        }else{
            tab.init(config)
        }
        return tab;
        
    }

}