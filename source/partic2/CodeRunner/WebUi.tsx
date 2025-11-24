
import { GenerateRandomString, GetCurrentTime, assert, sleep } from 'partic2/jsutils1/base';
import { FloatLayerComponent, ReactRefEx, css as css1 } from 'partic2/pComponentUi/domui';
import { CodeContextEvent, ConsoleDataEventData, RunCodeContext } from './CodeContext';
import * as React from 'preact'
import { DynamicPageCSSManager, globalInputState, GlobalInputStateTracer } from 'partic2/jsutils1/webutils';
import { TextEditor } from 'partic2/pComponentUi/texteditor';
import { DelayOnceCall,CodeContextRemoteObjectFetcher, fromSerializableObject, inspectCodeContextVariable, CodeCompletionItem, toSerializableObject } from './Inspector';
import { ObjectViewer } from './Component1';
import { text2html } from 'partic2/pComponentUi/utils';
import { FlattenArraySync } from './jsutils2';
import {appendFloatWindow,removeFloatWindow, WindowComponent, WindowsList, WindowsListContext} from 'partic2/pComponentUi/window'


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
    onTooltips?:(vnode:React.VNode|null)=>void,
    divStyle?:React.CSSProperties,
    divProps?:React.AllCSSProperties
}
interface CodeCellStats{
    //Serializable object
    cellOutput:any,
    resultVariable:string|null,
    codeCompleteCandidate:(CodeCompletionItem[])|null,
    tooltip:React.VNode,
    extraTooltips:string|null,
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
        this.setState({codeCompleteCandidate:null,focusin:false,extraTooltips:null});
    }
    async runCode(){
        this.props.onTooltips?.(null);
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
        },()=>{
            this.props.onTooltips?.(<div>
                {this.state.extraTooltips?<div dangerouslySetInnerHTML={{__html:this.state.extraTooltips}}></div>:null}
                {this.renderCodeComplete()}
            </div>)
        });
    },200);
    protected requestUpdateTooltips=new DelayOnceCall(async ()=>{
        this.props.onTooltips?.(<div>
            {this.state.extraTooltips?<div dangerouslySetInnerHTML={{__html:this.state.extraTooltips}}></div>:null}
            {this.renderCodeComplete()}
        </div>)
    },100)
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
                    this.setState({codeCompleteCandidate:[]});
                    this.requestUpdateTooltips.call();
                }
            }
            ev.preventDefault();
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
        this.requestUpdateTooltips.call()
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
        if(this.state.codeCompleteCandidate!=null){
            return <div style={{display:'flex',flexDirection:'column',maxHeight:'300px'}}>
                {this.state.codeCompleteCandidate.map(v=>{
                    return <div>
                    <a href="javascript:;" onClick={()=>this.insertCodeComplete(v)}>{v.candidate}</a>
                    </div>
                })}
            </div>
        }
    }
    protected async doOnFocusChange(focusin:boolean){
        if(this.props.onFocusChange!=undefined){
            this.props.onFocusChange(focusin);
        }
        if(focusin){
            //avoid click event failed.
            await sleep(100);
            this.setState({focusin:true});
        }else{
            //wait to check focus really move out
            await sleep(500);
            if(document.activeElement==null || 
                (this.rref.container.current!=null &&
                (document.activeElement.compareDocumentPosition(
                    this.rref.container.current!)&Node.DOCUMENT_POSITION_CONTAINS)===0)){
                this.setState({focusin:false})
            }
            this.setState({codeCompleteCandidate:[]})
            this.props.onTooltips?.(null);
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
    protected prepareRender(){
    }
    render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined; }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChild {
        this.prepareRender();
        return <div style={{display:'flex',flexDirection:'column',position:'relative',...this.props.divStyle}} ref={this.rref.container} 
            onFocusOut={()=>this.doOnFocusChange(false)} onFocusIn={()=>{this.doOnFocusChange(true)}} 
            {...this.props.divProps} >
            <TextEditor ref={this.rref.codeInput} divAttr={{onKeyDown:(ev)=>this.onCellKeyDown(ev)}}
            onInput={(target,inputData)=>this.onCellInput(target,inputData)} divClass={[css.inputCell]} />
            {this.state.focusin?<div style={{position:'relative',display:'flex',justifyContent:'end'}}>
                <div style={{position:'absolute',backgroundColor:'white',maxWidth:'50%',wordBreak:'break-all'}}>
                <div>{this.renderActionButton()}</div>
            </div></div>:null}
            {this.props.onTooltips?null:<div>
                {this.state.extraTooltips?<div dangerouslySetInnerHTML={{__html:this.state.extraTooltips}}></div>:null}
                {this.renderCodeComplete()}
            </div>}
            <div style={{overflow:'auto'}}>
                <ObjectViewer object={this.state.cellOutput} name={''} />
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
            lastFocusCellKey:string,
            cellTooltips:null|{content:React.VNode,left:number,top:number,maxWidth:number,maxHeight:number},
            padBottomCell:number
        }>{
    priv__initCellValue:{input:string,output:[any,string|undefined]}[]|null=null;
    protected lastRunCellKey:string='';
    constructor(prop:any,ctx:any){
        super(prop,ctx);
        this.resetState();
        this.setState({cellTooltips:null,padBottomCell:0});
    }
    __currentCodeContext:RunCodeContext|null=null;
    rref={
        container:new ReactRefEx<HTMLDivElement>()
    }
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
    onCellTooltips(node:React.VNode|null,cell: { ref: ReactRefEx<CodeCell>; key: string; }){
        if(cell.ref.current!=null){
            if(node==null){
                this.setState({cellTooltips:null});
                return
            }
            let inputCoor=cell.ref.current.getInputCaretCoordinate();
            if(inputCoor!=null && cell.ref.current.rref.container.current!=null){
                let {offsetTop,offsetLeft}=cell.ref.current.rref.container.current;
                let left=inputCoor.left+offsetLeft
                let top=inputCoor.bottom+offsetTop+2;
                let maxWidth=this.rref.container.current!.clientWidth-left-20;
                let maxHeight=this.rref.container.current!.clientHeight-top;
                if(maxHeight<200){
                    maxHeight=maxHeight+200-this.state.padBottomCell;
                    this.setState({padBottomCell:200});
                }
                if(maxWidth<150){
                    left=left+maxWidth-150;
                    maxWidth=150;
                }
                this.setState({cellTooltips:{left,top,maxWidth,maxHeight,content:node}});
            }
        }
    }
    renderCellTooltips(){
        if(this.state.cellTooltips==null)return null;
        let css2:React.CSSProperties={
            position:'absolute',zIndex:600,
            left:this.state.cellTooltips.left+'px',maxWidth:this.state.cellTooltips.maxWidth+'px',
            top:this.state.cellTooltips.top+'px',maxHeight:this.state.cellTooltips.maxHeight+'px',
            overflow:'auto',
            backgroundColor:'white'}
        return <div style={css2}>
            {this.state.cellTooltips.content}
        </div>
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
                        this.setState({padBottomCell:0})
                    }}
                    onFocusChange={(focusin)=>{
                        if(focusin){
                            this.setState({lastFocusCellKey:v.key});
                        }
                    }}
                    onTooltips={(node)=>this.onCellTooltips(node,v)}
                    divStyle={cellCssStyle}
                    {...this.props.cellProps}
                />];
                if(v.key in this.state.consoleOutput){
                    r.push(<div style={{wordBreak:'break-all'}} dangerouslySetInnerHTML={{__html:text2html(this.state.consoleOutput[v.key].content)}}></div>)
                }
                return r;
            }))}
            {<div style={{height:this.state.padBottomCell+'px'}}></div>}
            {this.renderCellTooltips()}
            </div>:
            <div style={{width:'100%',overflow:'auto',position:'relative'}} ref={this.rref.container}><pre>{this.state.error}</pre>
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