
import { GenerateRandomString, GetCurrentTime, assert, requirejs, sleep } from 'partic2/jsutils1/base';
import { FloatLayerComponent, ReactRefEx, css as css1 } from 'partic2/pComponentUi/domui';
import { CodeContextEvent, ConsoleDataEventData, RunCodeContext } from './CodeContext';
import * as React from 'preact'
import { DynamicPageCSSManager, globalInputState, GlobalInputStateTracer } from 'partic2/jsutils1/webutils';
import { TextEditor } from 'partic2/pComponentUi/texteditor';
import { CodeContextRemoteObjectFetcher, fromSerializableObject, inspectCodeContextVariable, CodeCompletionItem, toSerializableObject, CodeCellListData } from './Inspector';
import { ObjectViewer } from './Component1';
import { text2html } from 'partic2/pComponentUi/utils';
import { FlattenArraySync,DebounceCall, ThrottleCall } from './jsutils2';

let __name__=requirejs.getLocalRequireModule(require);

export var css={
    inputCell:GenerateRandomString(),
    outputCell:GenerateRandomString(),
}

export interface CodeCellProps{
    codeContext:RunCodeContext,
    customBtns?:{label:string,cb:()=>Promise<any>}[],
    onRun?:()=>void,
    onClearOutputs?:()=>void,
    onInputChange?:(target:CodeCell)=>void,
    //How to run code with key shortcut, default value:'Ctl+Ent'. use Ctrl+Enter for new line in 'Enter' mode.
    runCodeKey?:'Ctl+Ent'|'Enter'
    //To be used in code cell list.
    onFocusChange?:(focusin:boolean)=>void,
    divStyle?:React.CSSProperties,
    inputClass?:string[],
    divAttr?:React.HTMLAttributes<HTMLDivElement>
}
interface CodeCellStats{
    //Serializable object
    cellOutput:any,
    resultVariable:string|null,
    codeCompleteCandidate:(CodeCompletionItem[])|null,
    extraTooltips:string|null,
    focusin:boolean,
    errorCatched:string|null,
    focusingCompletionCandidate:number
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
        container:new ReactRefEx<HTMLDivElement>(),
        focusingCompletionCandidateDiv:new ReactRefEx<HTMLDivElement>,
        tooltipsDiv:new ReactRefEx<HTMLDivElement>
    }
    constructor(props:any,ctx:any){
        super(props,ctx);
        this.setState({codeCompleteCandidate:null,focusin:false,extraTooltips:null,errorCatched:null,focusingCompletionCandidate:0});
    }
    async runCode(){
        this.props.onRun?.();
        try{
            this.setState({cellOutput:'Running...'});
            let resultVariable=this.state.resultVariable??('__result_'+GenerateRandomString());
            let runStatus=await this.codeContext!.runCode(this.getCellInput(),resultVariable);
            if(runStatus.err===null && runStatus.stringResult!=null){
                let cellOutput=runStatus.stringResult;
                this.setState({cellOutput,resultVariable});
            }else{
                let cellOutput=await inspectCodeContextVariable(new CodeContextRemoteObjectFetcher(this.codeContext!),[resultVariable],{maxDepth:1});
                this.setState({cellOutput,resultVariable,errorCatched:runStatus.err});
            }
        }catch(e){
            let err=e as Error
            this.setState({cellOutput:{message:err.message,stack:err.stack}});
        }
        this.setState({codeCompleteCandidate:[]})
    }
    protected ensureCandidateScroll=new ThrottleCall(async ()=>{
        let focusDiv=await this.rref.focusingCompletionCandidateDiv.waitValid();
        let tooltips=await this.rref.tooltipsDiv.waitValid();
        if(focusDiv.offsetTop<tooltips.scrollTop || focusDiv.offsetTop>tooltips.scrollTop+tooltips.offsetHeight){
            tooltips.scrollTo({behavior:'smooth',top:focusDiv.offsetTop});
        }
    },300);
    protected renderTooltipsContent(){
        if(this.state.extraTooltips==null && this.state.codeCompleteCandidate==null)return null;
        let coor=this.getInputCaretCoordinate();
        if(coor==null)return null;
        return <div style={{position:'absolute',left:coor?.left,top:coor.bottom,zIndex:'1',overflow:'auto',maxHeight:'300px',backgroundColor:'white',border:'solid black 1px'}} ref={this.rref.tooltipsDiv}>
                {this.state.extraTooltips?<div dangerouslySetInnerHTML={{__html:this.state.extraTooltips}}></div>:null}
                {(()=>{
                    if(this.state.codeCompleteCandidate!=null){
                        return <div style={{display:'flex',flexDirection:'column'}} tabIndex={0}>
                            {this.state.codeCompleteCandidate.map((v,idx)=>{
                                let className=[];
                                let ref:ReactRefEx<HTMLDivElement>|null=null;
                                if(idx===this.state.focusingCompletionCandidate){
                                    className.push(css1.selected);
                                    ref=this.rref.focusingCompletionCandidateDiv;
                                }
                                return <div ref={ref} className={className.join(' ')} onClick={()=>{
                                    this.insertCodeComplete(v);
                                }}>
                                    {v.candidate}
                                </div>
                            })}
                        </div>
                    }else{
                        return null;
                    }
                })()}
            </div>;
    }
    protected requestCodeComplete=new DebounceCall(async ()=>{
        this.setState({
            codeCompleteCandidate:await this.codeContext!.codeComplete(
                this.getCellInput(),
                this.rref.codeInput.current!.getTextCaretOffset())
        });
    },200);
    protected getRunCodeKey(){
        return this.props.runCodeKey??'Ctl+Ent';
    }
    protected async onCellKeyDown(ev: React.TargetedKeyboardEvent<HTMLDivElement>){
        if(ev.code==='Enter'){
            if(this.getRunCodeKey()==='Ctl+Ent' && ev.ctrlKey){
                this.onBtnRun();
            }
            if(this.getRunCodeKey()=='Enter'){
                if(ev.ctrlKey){
                    //prevent trigger input('\n').Is there better way?
                    this.rref.codeInput.current?.insertText('\n');
                    this.props.onInputChange?.(this);
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
                    this.insertCodeComplete(this.state.codeCompleteCandidate[this.state.focusingCompletionCandidate]);
                }
            }
            ev.preventDefault();
        }else if(ev.code=='ArrowUp' && this.state.codeCompleteCandidate!=null && this.state.codeCompleteCandidate.length>0){
            let nextFocus=this.state.focusingCompletionCandidate-1;
            if(nextFocus<0){
                nextFocus+=this.state.codeCompleteCandidate.length
            }
            this.setState({focusingCompletionCandidate:nextFocus});
            ev.preventDefault();
            await new Promise(requestAnimationFrame)
            this.ensureCandidateScroll.call();
        }else if(ev.code=='ArrowDown' && this.state.codeCompleteCandidate!=null && this.state.codeCompleteCandidate.length>0){
            let nextFocus=this.state.focusingCompletionCandidate+1;
            if(nextFocus>=this.state.codeCompleteCandidate.length){
                nextFocus-=this.state.codeCompleteCandidate.length
            }
            this.setState({focusingCompletionCandidate:nextFocus});
            ev.preventDefault();
            await new Promise(requestAnimationFrame)
            this.ensureCandidateScroll.call();
        }
    }
    protected onCellInput(editor:TextEditor,inputData: { char: string | null; text: string | null; type:string}){
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
        if((inputData.char!=null&&inputData.char.search(/[a-zA-Z_\.\/]/)>=0)||inputData.type==='deleteContentBackward'){
            this.requestCodeComplete.call();
        }
        this.props.onInputChange?.(this);
    }
    getCellInput(){
        let t1=this.rref.codeInput.current!.getPlainText()
        return t1;
    }
    getCellOutput():[any,string|null]{
        return [this.state.cellOutput,this.state.resultVariable??null];
    }
    setCellInput(input:string){
        this.rref.codeInput.current!.setPlainText(input);
    }
    setCellOutput(output:any,resultVariable?:string|null){
        this.setState({cellOutput:output,resultVariable});
    }
    protected resetTooltips(){
        this.setState({focusingCompletionCandidate:0,codeCompleteCandidate:null,extraTooltips:null});
    }
    protected insertCodeComplete(cc:CodeCompletionItem){
        let caret=this.rref.codeInput.current!.getTextCaretOffset();
        let delCount=caret-cc.replaceRange[0];
        this.rref.codeInput.current!.deleteText(delCount);
        this.rref.codeInput.current!.insertText(cc.candidate);
        this.props.onInputChange?.(this);
        this.resetTooltips();
    }
    protected __focusIn:'cell'|'blur'='blur';
    protected async doOnFocusChange(focusin:boolean,ev:React.TargetedFocusEvent<HTMLDivElement>){
        if(this.props.onFocusChange!=undefined){
            this.props.onFocusChange(focusin);
        }
        if(focusin){
            this.setState({focusin:true});
            this.__focusIn='cell';
        }else{
            //wait to check focus really move out
            this.__focusIn='blur';
            await sleep(100);
            if(this.__focusIn=='blur'){
                this.resetTooltips();
                this.setState({focusin:false})
            }
        }
    }
    protected async onBtnRun(){
        this.runCode();
    }
    protected async onBtnClearOutputs(){
        if(this.state.resultVariable!=null){
            this.codeContext!.jsExec(
                `delete codeContext.localScope['${this.state.resultVariable}']`).catch(()=>{})
        }
        this.props.onClearOutputs?.();
        this.setCellOutput('',null);
    }
    protected renderActionButton(){
        let result=[]
        if(this.props.customBtns!=undefined){
            for(let t1 of this.props.customBtns){
                result.push(<a href="javascript:;" onClick={()=>t1.cb()}>{t1.label}</a>)
            }
        }
        result.push(<a href="javascript:;" onClick={()=>this.onBtnRun()}>Run({this.getRunCodeKey()})</a>)
        result.push(<a href="javascript:;" onClick={()=>this.onBtnClearOutputs()}>ClearOutputs</a>)
        result=result.map(v=>[<span>&nbsp;&nbsp;</span>,v,<span>&nbsp;&nbsp;</span>])
        return result
    }
    codeContext?:RunCodeContext
    codeContextCallMethodEvent=async (ev:CodeContextEvent)=>{
        let {module,functionName,argv}=ev.data;
        (await import(module))[functionName](...argv,{codeCell:this,codeContext:this.codeContext})
    }
    protected beforeRender(){
        if(this.codeContext!=this.props.codeContext){
            if(this.codeContext!=undefined){
                this.codeContext.event.removeEventListener(`${__name__}.CodeCell.callWebuiFunction`,this.codeContextCallMethodEvent);
            }
            this.codeContext=this.props.codeContext;
            this.codeContext.event.addEventListener(`${__name__}.CodeCell.callWebuiFunction`,this.codeContextCallMethodEvent);
        }
    }
    render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined; }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChild {
        this.beforeRender();
        return <div style={{display:'flex',flexDirection:'column',position:'relative',...this.props.divStyle}} ref={this.rref.container} 
                {...this.props.divAttr}
                onFocusIn={(ev)=>{
                    this.props.divAttr?.onFocusIn?.(ev);
                    if(!ev.defaultPrevented){
                        this.doOnFocusChange(true,ev);
                    }
                }}
                onFocusOut={(ev)=>{
                    this.props.divAttr?.onFocusOut?.(ev);
                    if(!ev.defaultPrevented){
                        this.doOnFocusChange(false,ev);
                    }
                }}
            >
            <TextEditor ref={this.rref.codeInput} divAttr={{onKeyDown:(ev)=>this.onCellKeyDown(ev),onClick:()=>{
                if(this.state.codeCompleteCandidate!=null || this.state.extraTooltips!=null){
                    this.resetTooltips();
                }
            }}}
            onInput={(target,inputData)=>this.onCellInput(target,inputData)} divClass={[css.inputCell,...(this.props.inputClass??[])]} />
            {this.state.focusin?<div style={{position:'relative',display:'flex',justifyContent:'end'}}>
                <div style={{position:'absolute',backgroundColor:'white',maxWidth:'50%',wordBreak:'break-all'}}>
                <div>{this.renderActionButton()}</div>
            </div></div>:null}
            {this.renderTooltipsContent()}
            <div>{this.state.errorCatched!=null?'THROW:':null}</div>
            <div style={{overflow:'auto'}}>
                <ObjectViewer object={this.state.cellOutput} name={''} codeContext={this.codeContext!} variableName={this.state.resultVariable??undefined} />
            </div>
        </div>
    }
    getInputCaretCoordinate(){
        let codeInput=this.rref.codeInput.current;
        if(codeInput==null || codeInput.rref.div1.current==null)return null;
        let coor=codeInput.getCoordinateByTextOffset(codeInput.getTextCaretOffset());
        if(coor==null)return null;
        let {offsetLeft,offsetTop}=codeInput.rref.div1.current;
        coor.left+=offsetLeft;
        coor.top+=offsetTop;
        coor.bottom+=offsetTop
        return coor;
    }
    async setAsEditTarget(){
        (await this.rref.codeInput.waitValid()).setTextCaretOffset('end');
    }
    async close(){
        if(this.state.resultVariable!=null){
            try{
                await this.codeContext!.jsExec(
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
            cellProps?:{runCodeKey?:'Ctl+Ent'|'Enter',inputClass?:string[],onInputChange?:(target:CodeCell)=>void}
        },{
            list:{ref:ReactRefEx<CodeCell>,key:string}[],
            consoleOutput:{[cellKey:string]:{content:string}},
            error:string|null,
            codeContext:RunCodeContext|null,
            lastFocusCellKey:string,
            padBottomCell:number
        }>{
    private __initCellValue:{input:string,output:[any,string|null]}[]|null=null;
    protected lastRunCellKey:string='';
    constructor(prop:any,ctx:any){
        super(prop,ctx);
        this.resetState();
        this.setState({padBottomCell:300});
    }
    protected __currentCodeContext:RunCodeContext|null=null;
    rref={
        container:new ReactRefEx<HTMLDivElement>()
    }
    beforeRender(){
        if(this.props.codeContext!==this.state.codeContext){
            if(this.state.codeContext!=null){
                this.state.codeContext.event.removeEventListener('console.data',this.onConsoleData as any);
            }
            this.props.codeContext!.event.addEventListener('console.data',this.onConsoleData as any);
            this.setState({codeContext:this.props.codeContext!});
        }
    }
    async newCell(afterCellKey:string){
        let pos=this.state.list.findIndex(v=>v.key==afterCellKey);
        if(pos<0){
            pos=this.state.list.length-1;
        }
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
        this.__initCellValue=null;
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
        return (this.state.codeContext!=null && this.state.error==null)?<div style={{width:'100%',overflowX:'auto',position:'relative'}} ref={this.rref.container}>
            {FlattenArraySync(this.state.list.map((v,index1)=>{
                let cellCssStyle:React.AllCSSProperties={};
                if(this.state.lastFocusCellKey===v.key){
                    cellCssStyle.zIndex=100;
                }
                let r=[<CodeCell ref={v.ref} key={v.key} 
                codeContext={this.state.codeContext!} customBtns={[
                    {label:'New',cb:()=>this.newCell(v.key)},
                    {label:'Del',cb:()=>this.deleteCell(v.key)}
                ]} onClearOutputs={()=>this.clearConsoleOutput(v.key)}
                    onRun={async ()=>{
                        this.lastRunCellKey=v.key;this.props.onRun?.(v.key);
                    }}
                    onFocusChange={(focusin)=>{
                        if(focusin){
                            this.setState({lastFocusCellKey:v.key});
                        }
                    }}
                    divStyle={cellCssStyle}
                    {...this.props.cellProps}
                />];
                if(v.key in this.state.consoleOutput){
                    r.push(<div style={{wordBreak:'break-all'}} dangerouslySetInnerHTML={{__html:text2html(this.state.consoleOutput[v.key].content)}}></div>)
                }
                return r;
            }))}
            {<div style={{height:this.state.padBottomCell+'px'}}></div>}
            </div>:
            <div style={{width:'100%',overflow:'auto',position:'relative'}} ref={this.rref.container}><pre>{this.state.error}</pre>
            <a href="javascript:;" onClick={()=>this.resetState()}>Reset</a>
            </div>
    }
    componentDidUpdate(){
        if(this.__initCellValue!==null && this.state.codeContext!=null){
            this.__initCellValue.forEach((val,index)=>{
                this.state.list[index].ref.current!.setCellInput(val.input);
                val.output[0]=fromSerializableObject(
                    val.output[0],{fetcher:new CodeContextRemoteObjectFetcher(this.state.codeContext!),accessPath:[val.output[1]??'']});
                this.state.list[index].ref.current!.setCellOutput(...val.output);
            })
            this.__initCellValue=null;
        }
    }
    saveTo():string{
        let cellData=new CodeCellListData();
        cellData.cellList=this.state.list.map((cell,index)=>({
                cellInput:cell.ref.current!.getCellInput(),
                cellOutput:cell.ref.current!.getCellOutput(),
                key:cell.key
            }));
        cellData.consoleOutput=this.state.consoleOutput;
        return cellData.saveTo();
    }
    async loadFrom(data:string){
        try{
            let cellData=new CodeCellListData();
            cellData.loadFrom(data);;
            while(this.state.list.length<cellData.cellList.length){
                this.state.list.push({ref:new ReactRefEx<CodeCell>(),key:GenerateRandomString()});
            }
            let consoleOutput={} as typeof this.state.consoleOutput;
            for(let k1 in cellData.consoleOutput){
                let index=cellData.cellList.findIndex(v=>v.key===k1);
                if(index>=0){
                    consoleOutput[this.state.list[index].key]=cellData.consoleOutput[k1];
                }
            }
            this.__initCellValue=cellData.cellList.map(v=>({input:v.cellInput,output:v.cellOutput}));
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