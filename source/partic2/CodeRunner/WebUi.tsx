
import { GenerateRandomString, assert, sleep } from 'partic2/jsutils1/base';
import { ReactRefEx, css as css1 } from 'partic2/pComponentUi/domui';
import { CodeContextEvent, ConsoleDataEventData, RunCodeContext } from './CodeContext';
import * as React from 'preact'
import { DynamicPageCSSManager } from 'partic2/jsutils1/webutils';
import { TextEditor } from 'partic2/pComponentUi/texteditor';
import { DelayOnceCall,CodeContextRemoteObjectFetcher, fromSerializableObject, inspectCodeContextVariable, CodeCompletionItem, toSerializableObject } from './Inspector';
import { ObjectViewer } from './Component1';
import { text2html } from 'partic2/pComponentUi/utils';
import { FlattenArraySync } from './jsutils2';



export var css={
    inputCell:GenerateRandomString(),
    outputCell:GenerateRandomString(),
}

export interface CodeCellProps{
    codeContext:RunCodeContext,
    customBtns?:{label:string,cb:()=>Promise<any>}[],
    onRun?:()=>void,
    onClearOutputs?:()=>void,

    //How to run code with key shortcut, default value:'Ctl+Ent'. use Ctrl+Enter for new line in 'Enter' mode.
    runCodeKey?:'Ctl+Ent'|'Enter'
    //To be used in code cell list.
    onFocusChange?:(focusin:boolean)=>void,
    focusin:boolean|'auto'
}
interface CodeCellStats{
    //Serializable object
    cellOutput:any,
    resultVariable:string|null,
    codeCompleteCandidate:(CodeCompletionItem[])|null,
    tooltip:string
    focusin:boolean
}


DynamicPageCSSManager.PutCss('.'+css.outputCell,['overflow:auto']);
DynamicPageCSSManager.PutCss('.'+css.inputCell,[
    'display:inline-block','border:solid black 2px','margin:2px','padding:2px','background-color:white',
    'font-family:monospace'
]);

function countBracket(s:string){
    let bracketMatch=0;
    bracketMatch+=(s.match(/\{/g)?.length??0)-(s.match(/\}/g)?.length??0);
    bracketMatch+=(s.match(/\(/g)?.length??0)-(s.match(/\)/g)?.length??0);
    bracketMatch+=(s.match(/\[/g)?.length??0)-(s.match(/\]/g)?.length??0);
    return bracketMatch;
}

export class CodeCell extends React.Component<CodeCellProps,CodeCellStats>{
    rref={
        codeInput:new ReactRefEx<TextEditor>(),
        container:new ReactRefEx<HTMLDivElement>()
    }
    constructor(props:any,ctx:any){
        super(props,ctx);
        this.setState({codeCompleteCandidate:null,focusin:false})
    }
    async runCode(){
        this.props.onRun?.();
        try{
            this.setState({cellOutput:'Running...'});
            let resultVariable=this.state.resultVariable??('__result_'+GenerateRandomString());
            let runStatus=await this.props.codeContext.runCode(this.getCellInput(),resultVariable);
            if(runStatus.err===null){
                let cellOutput=await inspectCodeContextVariable(new CodeContextRemoteObjectFetcher(this.props.codeContext),[resultVariable],{maxDepth:1});
                this.setState({cellOutput,resultVariable});
            }else{
                let err=runStatus.err;
                this.setState({cellOutput:err,resultVariable:null});
            }
        }catch(e){
            let err=e as Error
            this.setState({cellOutput:{message:err.message,stack:err.stack}});
        }
        this.setState({codeCompleteCandidate:[]})
    }
    protected requestCodeComplete=new DelayOnceCall(async ()=>{
        this.setState({
            codeCompleteCandidate:await this.props.codeContext.codeComplete(
                this.getCellInput(),
                this.rref.codeInput.current!.getTextCaretOffset())
        });
    },300);
    protected getRunCodeKey(){
        return this.props.runCodeKey??'Ctl+Ent';
    }
    protected async onCellKeyDown(ev: React.JSX.TargetedKeyboardEvent<HTMLDivElement>){
        if(ev.code==='Enter'){
            if(this.getRunCodeKey()==='Ctl+Ent' && ev.ctrlKey){
                this.onBtnRun();
            }
            if(this.getRunCodeKey()=='Enter'){
                if(ev.ctrlKey){
                    //prevent trigger input('\n').Is there better way?
                    this.rref.codeInput.current?.insertText('\n');
                }else{
                    let fullText=(await this.rref.codeInput.waitValid()).getPlainText();
                    if(countBracket(fullText)==0){
                        await new Promise(resolve=>requestAnimationFrame(resolve));
                        this.rref.codeInput.current?.setPlainText(fullText);
                        this.runCode();
                        return;
                    }
                }
            }
        }else if(ev.code=='Tab'){
            if(this.state.codeCompleteCandidate!=null){
                if(this.state.codeCompleteCandidate.length>0){
                    this.insertCodeComplete(this.state.codeCompleteCandidate[0]);
                }
            }
            ev.preventDefault();
        }
    }
    protected onCellInput(editor:TextEditor,inputData: { char: string | null; text: string | null; type:string}){
        if(inputData.char!=null&&inputData.char.search(/[a-zA-Z_\.\/]/)>=0){
            this.requestCodeComplete.call();
        }
        if(inputData.char=='\n'){
            let fullText=editor.getPlainText();
            let backwardText=fullText.substring(0,editor.getTextCaretOffset()).split('\n');
            if(backwardText.length>1){
                let lastLine=backwardText.at(-2)!;
                let leadingSpace=lastLine.match(/^ */)?.at(0)??'';
                //count braket
                if(countBracket(lastLine)>0){
                    leadingSpace+='  '
                }
                editor.insertText(leadingSpace)
            }
        }
    }
    getCellInput(){
        let t1=this.rref.codeInput.current!.getPlainText()
        return t1;
    }
    getCellOutput(){
        return [this.state.cellOutput,this.state.resultVariable??null];
    }
    setCellInput(input:string){
        this.rref.codeInput.current!.setPlainText(input);
    }
    setCellOutput(output:any,resultVariable?:string|null){
        this.setState({cellOutput:output,resultVariable});
    }
    protected insertCodeComplete(cc:CodeCompletionItem){
        let caret=this.rref.codeInput.current!.getTextCaretOffset();
        let delCount=caret-cc.replaceRange[0];
        this.rref.codeInput.current!.deleteText(delCount);
        this.rref.codeInput.current!.insertText(cc.candidate);
    }
    protected renderCodeComplete(){
        if(this.state.codeCompleteCandidate!=null && this.state.focusin){
            return <div style={{display:'flex',flexDirection:'row',flexWrap:'wrap'}}>
                {this.state.codeCompleteCandidate.map(v=>{
                    return [<span>&nbsp;&nbsp;</span>,
                    <a href="javascript:;" onClick={()=>this.insertCodeComplete(v)}>{v.candidate}({v.type})</a>,
                    <span>&nbsp;&nbsp;</span>]
                })}
            </div>
        }
    }
    protected async doOnFocusChange(focusin:boolean){
        if(this.props.onFocusChange!=undefined){
            this.props.onFocusChange(focusin);
        }
        if(this.props.focusin==='auto'){
            if(focusin){
                //avoid click event failed.
                await sleep(200);
                this.setState({focusin:true})
            }else{
                //wait to check focus realy move out
                await sleep(500);
                if(document.activeElement==null || 
                    (this.rref.container.current!=null &&
                    (document.activeElement.compareDocumentPosition(
                        this.rref.container.current!)&Node.DOCUMENT_POSITION_CONTAINS)===0)){
                    this.setState({focusin:false})
                }
            }
        }
    }
    protected async onBtnRun(){
        this.runCode();
    }
    protected async onBtnClearOutputs(){
        if(this.state.resultVariable!=null){
            try{
                await this.props.codeContext.jsExec(
                    `delete codeContext.localScope['${this.state.resultVariable}']`)
            }catch(e){};
        }
        this.props.onClearOutputs?.();
        this.setCellOutput('',null);
    }
    protected renderActionButton(){
        let result=[]
        if(this.state.focusin){
            if(this.props.customBtns!=undefined){
                for(let t1 of this.props.customBtns){
                    result.push(<a href="javascript:;" onClick={()=>t1.cb()}>{t1.label}</a>)
                }
            }
            result.push(<a href="javascript:;" onClick={()=>this.onBtnRun()}>Run({this.getRunCodeKey()})</a>)
            result.push(<a href="javascript:;" onClick={()=>this.onBtnClearOutputs()}>ClearOutputs</a>)
        }
        result=result.map(v=>[<span>&nbsp;&nbsp;</span>,v,<span>&nbsp;&nbsp;</span>])
        return result
    }
    protected renderTooltip(){
        if(this.state.tooltip!=undefined){
            return <div dangerouslySetInnerHTML={{__html:this.state.tooltip}}>
            </div>
        }else{
            return null;
        }
    }
    protected prepareRender(){
        if(this.props.focusin!=='auto'){
            if(this.state.focusin!==this.props.focusin){
                this.setState({focusin:this.props.focusin})
            }
        }
    }
    render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined; }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChild {
        this.prepareRender();
        return <div style={{display:'flex',flexDirection:'column'}} ref={this.rref.container} onFocusOut={()=>this.doOnFocusChange(false)}
            onFocusIn={()=>{this.doOnFocusChange(true)}}>
            <TextEditor ref={this.rref.codeInput} divAttr={{onKeyDown:(ev)=>this.onCellKeyDown(ev)}}
            onInput={(target,inputData)=>this.onCellInput(target,inputData)} divClass={[css.inputCell]} />
            <div>{this.renderActionButton()}</div>
            <div>{this.renderCodeComplete()}</div>
            <div>{this.renderTooltip()}</div>
            <div style={{overflow:'auto'}}>
                <ObjectViewer object={this.state.cellOutput} name={''} />
            </div>
        </div>
    }
    async setAsEditTarget(){
        (await this.rref.codeInput.waitValid()).setTextCaretOffset('end');
    }
    async close(){
        if(this.state.resultVariable!=null){
            try{
                await this.props.codeContext.jsExec(
                    `delete codeContext.localScope['${this.state.resultVariable}']`)
            }catch(e){};
        }
    }
}

export class DefaultCodeCellList extends React.Component<
        {
            codeContext:RunCodeContext,
            onRun?:(cellKey:string)=>void,
            onCellListChange?:()=>void,
            cellProps?:{runCodeKey?:'Ctl+Ent'|'Enter'}
        },{
            list:{ref:ReactRefEx<CodeCell>,key:string}[],
            consoleOutput:{[cellKey:string]:{content:string}},
            error:string|null,
            codeContext:RunCodeContext|null,
            lastFocusCellKey:string
        }>{
    priv__initCellValue:{input:string,output:[any,string|undefined]}[]|null=null;
    protected lastRunCellKey:string='';
    constructor(prop:any,ctx:any){
        super(prop,ctx);
        this.resetState();
    }
    __currentCodeContext:RunCodeContext|null=null;
    beforeRender(){
        if(this.props.codeContext!==this.state.codeContext){
            if(this.state.codeContext!=null){
                this.state.codeContext.event.removeEventListener('console.data',this.onConsoleData as any);
            }
            this.props.codeContext.event.addEventListener('console.data',this.onConsoleData as any);
            this.setState({codeContext:this.props.codeContext});
        }
    }
    async newCell(afterCellKey:string){
        let pos=this.state.list.findIndex(v=>v.key==afterCellKey);
        if(pos<0)pos=this.state.list.length-1;
        let newKey=GenerateRandomString();
        this.state.list.splice(pos+1,0,{ref:new ReactRefEx<CodeCell>(),key:newKey});
        await new Promise<void>(resolve=>this.forceUpdate(resolve));
        this.props.onCellListChange?.();
        return newKey;
    }
    async setCurrentEditing(cellKey:string){
        let cell2=this.state.list.find(v=>v.key==cellKey);
        if(cell2!=undefined && cell2.ref.current!=undefined){
            await cell2.ref.current.setAsEditTarget()
        }
    }
    async deleteCell(cellKey:string){
        let pos=this.state.list.findIndex(v=>v.key==cellKey);
        try{
            await this.state.list[pos].ref.current?.close();
        }catch(e){};
        if(pos>=0){
            this.state.list.splice(pos,1);
            await new Promise<void>(resolve=>this.forceUpdate(resolve));
        }
        this.props.onCellListChange?.();
    }
    async runCell(cellKey:string){
        let cell=this.state.list.find(v=>v.key==cellKey);
        assert(cell!=undefined);
        cell!.ref.current!.runCode();
    }
    async setCellInput(cellKey:string,input:string){
        let cell=this.state.list.find(v=>v.key==cellKey);
        assert(cell!=undefined);
        cell!.ref.current!.setCellInput(input);
    }
    clearConsoleOutput(key:string){
        delete this.state.consoleOutput[key];
        this.forceUpdate();
    }
    resetState(){
        this.priv__initCellValue=null;
        this.lastRunCellKey='';
        this.setState({
            list:[{ref:new ReactRefEx<CodeCell>(),key:GenerateRandomString()}],
            consoleOutput:{},
            error:null,
            codeContext:null,
            lastFocusCellKey:''
        });
        this.forceUpdate();
    }
    getCellList(){
        return this.state.list;
    }
    render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined; }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChild {
        this.beforeRender();
        return (this.state.codeContext!=null && this.state.error==null)?<div style={{width:'100%',overflowX:'auto'}}>
            {FlattenArraySync(this.state.list.map((v,index1)=>{
                let r=[<CodeCell ref={v.ref} key={v.key} 
                codeContext={this.state.codeContext!} customBtns={[
                    {label:'New',cb:()=>this.newCell(v.key)},
                    {label:'Del',cb:()=>this.deleteCell(v.key)}
                ]} onClearOutputs={()=>this.clearConsoleOutput(v.key)}
                    onRun={async ()=>{this.lastRunCellKey=v.key;this.props.onRun?.(v.key)}}
                    onFocusChange={(focusin)=>{if(focusin)this.setState({lastFocusCellKey:v.key})}}
                    focusin={this.state.lastFocusCellKey==v.key}
                    {...this.props.cellProps}
                />];
                if(v.key in this.state.consoleOutput){
                    r.push(<div style={{wordBreak:'break-all'}} dangerouslySetInnerHTML={{__html:text2html(this.state.consoleOutput[v.key].content)}}></div>)
                }
                return r;
            }))}
            </div>:
            <div style={{width:'100%',overflow:'auto'}}><pre>{this.state.error}</pre>
            <a href="javascript:;" onClick={()=>this.resetState()}>Reset</a>
            </div>
    }
    componentDidUpdate(){
        if(this.priv__initCellValue!==null && this.state.codeContext!=null){
            this.priv__initCellValue.forEach((val,index)=>{
                this.state.list[index].ref.current!.setCellInput(val.input);
                val.output[0]=fromSerializableObject(
                    val.output[0],{fetcher:new CodeContextRemoteObjectFetcher(this.state.codeContext!),accessPath:[val.output[1]??'']});
                this.state.list[index].ref.current!.setCellOutput(...val.output);
            })
            this.priv__initCellValue=null;
        }
    }
    saveTo():string{
        let saved={
            cellList:this.state.list.map((cell,index)=>({
                cellInput:cell.ref.current!.getCellInput(),
                cellOutput:cell.ref.current!.getCellOutput(),
                key:cell.key
            })),
            consoleOutput:this.state.consoleOutput
        }
        return JSON.stringify(toSerializableObject(saved,{}));
    }
    protected async validLoadFromData(data:string):Promise<any>{
        let loaded=JSON.parse(fromSerializableObject(data,{}));
        for(let t1 of loaded.cellList){
            assert(typeof(t1.cellInput)==='string');
            assert(t1.cellOutput.length==2);
            assert(typeof(t1.cellOutput[1])==='string'||t1.cellOutput[1]===null);
            assert(typeof(t1.key)==='string');
        }
        return loaded;
    }
    async loadFrom(data:string){
        try{
            let loaded=await this.validLoadFromData(data);
            let cellList=(loaded.cellList as {cellInput:string,cellOutput:[any,string|undefined],key:string}[]);
            while(this.state.list.length<cellList.length){
                this.state.list.push({ref:new ReactRefEx<CodeCell>(),key:GenerateRandomString()});
            }
            let consoleOutput={} as typeof this.state.consoleOutput;
            for(let k1 in loaded.consoleOutput){
                let index=cellList.findIndex(v=>v.key===k1);
                if(index>=0){
                    consoleOutput[this.state.list[index].key]=loaded.consoleOutput[k1];
                }
            }
            this.priv__initCellValue=cellList.map(v=>({input:v.cellInput,output:v.cellOutput}));
            this.setState({consoleOutput})
            this.forceUpdate();
        }catch(e:any){
            this.setState({error:e.message+'\n'+(e.stack??'')})
        }
    }
    protected onConsoleData=(event:CodeContextEvent<ConsoleDataEventData>)=>{
        let index=this.state.list.findIndex(v=>v.key===this.lastRunCellKey);
        if(index<0)index=0;
        let cell=this.state.list[index];
        if(!(cell.key in this.state.consoleOutput)){
            this.state.consoleOutput[cell.key]={content:''};
        }
        this.state.consoleOutput[cell.key].content+=`[${event.data?.level??''}]:${event.data?.message??''}\n`
        this.forceUpdate();
    }
}


export let CodeCellList=DefaultCodeCellList;
export type CodeCellList=DefaultCodeCellList;

export function setCodeCellListImpl(ccl:{new():DefaultCodeCellList}){
    CodeCellList=ccl;
}