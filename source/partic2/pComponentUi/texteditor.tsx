
import { partial } from 'partic2/jsutils1/base';
import * as React from 'preact'
import { docNode2text, docNodePositionFromTextOffset, text2html } from './utils';
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

    protected onInputHandler(ev: React.JSX.TargetedEvent<HTMLDivElement,InputEvent>){
        let ch=ev.data;
        if(ev.inputType=='insertParagraph'||(ev.inputType=='insertText' && ch==null)){
            ch='\n';
        }
        this.props.onInput?.(this,{char:ch,text:ev.dataTransfer?.getData('text/plain')??null,type:ev.inputType});
    }
    protected onPasteHandler(text:string){
        this.insertText(text);
        this.rref.div1.current!.addEventListener('click',()=>{},)
    }
    render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined; }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChild {
        return <div contentEditable={true} ref={this.rref.div1} onInput={(ev)=>this.onInputHandler(ev as any)} 
        style={{wordBreak:'break-all',overflowWrap:'word-break',...this.props.divStyle}}
        className={(this.props.divClass??[]).join(' ')}
        onPaste={(ev)=>{this.onPasteHandler(ev.clipboardData!.getData('text/plain'));ev.preventDefault()}}
        onBlur={(ev)=>this.onBlurHandler(ev)} onFocus={(ev)=>this.onFocusHandler(ev)}
        {...this.props.divAttr}> </div>
    }
    //insertText,deleteText will change Selection, but It's not guaranteed in future.
    insertText(text:string){
        if(this.savedSelection!=undefined){
            window.getSelection()?.setBaseAndExtent(
                this.savedSelection.anchorNode!,this.savedSelection.anchorOffset!,
                this.savedSelection.focusNode!,this.savedSelection.focusOffset!);
        }
        this.savedSelection=undefined;
        //replace it?
        document.execCommand('insertText',false,text)
    }
    deleteText(count:number){
        if(this.savedSelection!=undefined){
            window.getSelection()?.setBaseAndExtent(
                this.savedSelection.anchorNode!,this.savedSelection.anchorOffset!,
                this.savedSelection.focusNode!,this.savedSelection.focusOffset!);
        }
        this.savedSelection=undefined;
        for(let t1=0;t1<count;t1++){
            document.execCommand('delete')
        }
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
    getTextCaretOffset(){
        let exp1=this.getCaretPart('backward');
        let caret=docNode2text(exp1.cloneContents()).concat().length;
        return caret;
    }
    setTextCaretOffset(offset:number|'start'|'end'){
        let sel=window.getSelection();
        if(sel==null)return;
        if(typeof offset === 'number'){
            let pos=this.positionFromTextOffset(offset)
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
    positionFromTextOffset(textOffset:number):{node:Node|null,offset:number}{
        return docNodePositionFromTextOffset(this.rref.div1.current!,textOffset);
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
    getCaretPart(direction:'forward'|'backward'){
        let sel:typeof this.savedSelection;
        if(this.savedSelection!=undefined){
            sel=this.savedSelection;
        }else{
            sel=window.getSelection()!;
        }
        let rng1=new Range()
        rng1.selectNodeContents(this.rref.div1.current!);
        if(direction==='forward'){
            rng1.setStart(sel!.focusNode!,sel!.focusOffset);
        }else{
            rng1.setEnd(sel!.focusNode!,sel!.focusOffset);
        }
        return rng1;
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