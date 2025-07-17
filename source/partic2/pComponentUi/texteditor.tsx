
import { partial } from 'partic2/jsutils1/base';
import * as React from 'preact'
import { docNode2text, text2html } from './utils';
import { ReactEventTarget, ReactRefEx } from './domui';

export interface TextEditorProps{
    onFocus?:(target:TextEditor)=>void,onBlur?:(target:TextEditor)=>void
    onInput?:(target:TextEditor,inputData:{char:string|null,text:string|null,type:string})=>void, 
    divClass?:string[]
    divStyle?:React.JSX.CSSProperties,
    divAttr?:React.JSX.DOMAttributes<HTMLDivElement>
}
export class TextEditor extends ReactEventTarget<TextEditorProps,{}>{
    rref={div1:new ReactRefEx<HTMLDivElement>()};
    protected undoHistory:string[]=[];
    protected undoHistoryCurrent=0;
    pushHistory(){
        let currText=this.getPlainText();
        if(currText==this.undoHistory.at(this.undoHistoryCurrent))return;
        if(this.undoHistoryCurrent>=this.undoHistory.length-1){
            this.undoHistory.push(currText);
            if(this.undoHistory.length>10){
                this.undoHistory.unshift();
            }
            this.undoHistoryCurrent=this.undoHistory.length-1;
        }else{
            this.undoHistoryCurrent++;
            this.undoHistory[this.undoHistoryCurrent]=currText;
        }
    }
    textUndo(){
        if(this.undoHistoryCurrent==0){
            return;
        }
        if(this.undoHistoryCurrent>=this.undoHistory.length-1){
            this.pushHistory();
            this.undoHistoryCurrent--;
        }
        let last=this.undoHistory[this.undoHistoryCurrent];
        this.undoHistoryCurrent--;
        this.setPlainText(last);
        this.setTextCaretOffset('end');
    }
    textRedo(){
        if(this.undoHistoryCurrent>=this.undoHistory.length-1){
            return;
        }
        this.undoHistoryCurrent++;
        let last=this.undoHistory[this.undoHistoryCurrent];
        this.setPlainText(last);
    }
    protected onInputHandler(ev: React.JSX.TargetedEvent<HTMLDivElement,InputEvent>){
        let ch=ev.data;
        if(ev.inputType=='insertParagraph'||(ev.inputType=='insertText' && ch==null)){
            ch='\n';
        }
        if(/[^0-9a-zA-Z]/.test(ch??'')){
            this.pushHistory();
        }
        this.props.onInput?.(this,{char:ch,text:ev.dataTransfer?.getData('text/plain')??null,type:ev.inputType});
    }
    protected onPasteHandler(text:string){
        this.insertText(text);
        this.rref.div1.current!.addEventListener('click',()=>{},)
    }
    protected onKeyDownHandler(ev:React.JSX.TargetedKeyboardEvent<HTMLDivElement>){
        if(this.props.divAttr?.onKeyDown!=undefined){
            this.props.divAttr.onKeyDown(ev);
        }
        if(ev.defaultPrevented){
            return;
        }
        if(ev.key.toLowerCase()=='z' && ev.ctrlKey){
            ev.preventDefault();
            if(ev.shiftKey){
                this.textRedo();
            }else{
                this.textUndo();
            }
        }
    }
    render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined; }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChild {
        return <div contentEditable={true} ref={this.rref.div1} onInput={(ev)=>this.onInputHandler(ev as any)}
        style={{wordBreak:'break-all',overflowWrap:'word-break',...this.props.divStyle}}
        className={(this.props.divClass??[]).join(' ')}
        onPaste={(ev)=>{this.onPasteHandler(ev.clipboardData!.getData('text/plain'));ev.preventDefault()}}
        onBlur={(ev)=>this.onBlurHandler(ev)} onFocus={(ev)=>this.onFocusHandler(ev)}
        {...this.props.divAttr} onKeyDown={(ev)=>this.onKeyDownHandler(ev)}> </div>
    }
    //insertText,deleteText will change Selection, but It's not guaranteed in future.
    insertText(text:string){
        let fullText=this.getPlainText();
        let offset=this.getTextCaretOffset();
        this.rref.div1.current!.innerHTML=text2html(fullText.substring(0,offset)+text+fullText.substring(offset));
        this.setTextCaretOffset(offset+text.length);
    }
    deleteText(count:number){
        let offset=this.getTextCaretOffset();
        let fullText=this.getPlainText();
        let newText=fullText.substring(0,Math.max(0,offset-count))+fullText.substring(offset);
        this.setPlainText(newText);
        this.setTextCaretOffset(Math.max(0,offset-count))
    }
    protected savedSelection?:{anchorNode:Node|null,anchorOffset:number,focusNode:Node|null,focusOffset:number}
    protected onBlurHandler(ev: React.JSX.TargetedFocusEvent<HTMLDivElement>){
        //save selection for execCommand
        let sel=window.getSelection();
        if(sel!=null){
            this.savedSelection=partial(sel,['anchorNode','anchorOffset','focusNode','focusOffset']) as any;
        }
        (this.props.divAttr?.onBlur as any|undefined)?.bind(ev.currentTarget)?.(ev.currentTarget);
        this.props?.onBlur?.(this);
    }
    protected onFocusHandler(ev: React.JSX.TargetedFocusEvent<HTMLDivElement>){
        this.savedSelection=undefined;
        (this.props.divAttr?.onFocus as any|undefined)?.bind(ev.currentTarget)?.(ev.currentTarget);
        this.props.onFocus?.(this);
    }
    getHtml(){
        return this.rref.div1.current?.innerHTML;
    }
    setHtml(html:string){
        if(this.rref.div1.current){
            this.rref.div1.current.innerHTML=html;
        }
    }
    getPlainText(){
        if(this.rref.div1.current==null)return '';
        return docNode2text(this.rref.div1.current!).concat();
    }
    setPlainText(text:string){
        this.setHtml(text2html(text))
    }
    getTextCaretOffset(){
        let sel=document.getSelection();
        let textParts=docNode2text(this.rref.div1.current!);
        if(sel?.focusNode==null){
            return 0;
        }
        return textParts.textOffsetFromNode(sel.focusNode,sel.focusOffset)
    }
    getTextCaretSelectedRange(){
        let sel=document.getSelection();
        let textParts=docNode2text(this.rref.div1.current!);
        if(sel?.focusNode==null){
            return 0;
        }
        let focusPos=textParts.textOffsetFromNode(sel.focusNode,sel.focusOffset);
        let anchorPos=textParts.textOffsetFromNode(sel.anchorNode!,sel.anchorOffset);
        return [focusPos,anchorPos];
    }
    setTextCaretOffset(offset:number|'start'|'end'){
        let sel=window.getSelection();
        let textParts=docNode2text(this.rref.div1.current!);
        if(sel==null)return;
        if(typeof offset === 'number'){
            let pos=textParts.nodeFromTextOffset(offset)
            sel.setPosition(pos.node,pos.offset)
        }else if(offset=='start'){
            let rng1=new Range()
            rng1.selectNodeContents(this.rref.div1.current!);
            sel.setPosition(rng1.startContainer,rng1.startOffset);
        }else if(offset=='end'){
            let rng1=new Range()
            rng1.selectNodeContents(this.rref.div1.current!);
            sel.setPosition(rng1.endContainer,rng1.endOffset);
        }
    }
    setTextCaretSelectedRange(anchorPos:number,focusPos:number){
        let sel=window.getSelection();
        let textParts=docNode2text(this.rref.div1.current!);
        if(sel==null)return;
        let anchor=textParts.nodeFromTextOffset(anchorPos);
        let focus=textParts.nodeFromTextOffset(focusPos);
        sel.setPosition(anchor.node,anchor.offset);
        if(focus.node!=null){
            sel.extend(focus.node,focus.offset)
        }
    }
    scrollToBottom(){
        this.rref.div1.current!.scrollTop=this.rref.div1.current!.scrollHeight;
    }
}

export class PlainTextEditorInput extends TextEditor{
    get value(){
        return this.getPlainText();
    }
    set value(v:string){
        this.setPlainText(v);
    }
    protected onBlurHandler(ev: React.JSX.TargetedFocusEvent<HTMLDivElement>): void {
        super.onBlurHandler(ev);
        this.dispatchEvent(new Event('change'));
    }
}