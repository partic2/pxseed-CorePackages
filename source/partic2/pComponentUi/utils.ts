export function text2html(src:string){
    let text2=src.replace(/[<>&"\u0020]/g,function(c){
        return {'<':'&lt;','>':'&gt;','&':'&amp','"':'&quot;','\u0020':'&nbsp;'}[c]??''
    }).replace(/\n/g,'<br/>');
    text2=text2.replace(/<br\/>$/,'<div><br/></div>')
    return text2;
}
export function docNode2text(node:Node){
    let walker=document.createTreeWalker(node,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);
    let textParts=[] as {node:Node,text:string}[]
    while(walker.nextNode()){
        if(walker.currentNode instanceof HTMLDivElement || walker.currentNode instanceof HTMLParagraphElement){
            // Empty div without text, ignored
            // <br/> in <div/>, insert '\n' when handle <br/>
            if(walker.currentNode.textContent==''){
                textParts.push({node:walker.currentNode,text:''});
            }else if(textParts.length==0){
                textParts.push({node:walker.currentNode,text:''});
            }else{
                for(let t1=textParts.length-1;t1>=0;t1--){
                    if(textParts[t1].text=='\n'){
                        textParts.push({node:walker.currentNode,text:''});
                        break;
                    }else if(textParts[t1].text!=''){
                        textParts.push({node:walker.currentNode,text:'\n'});
                        break;
                    }
                }
            }
        }else if(walker.currentNode instanceof HTMLBRElement){
            textParts.push({node:walker.currentNode,text:'\n'});
        }else if(walker.currentNode instanceof Text){
            let prev=walker.currentNode.previousSibling;
            let textData='';
            if(prev!=null){
                if(prev instanceof HTMLDivElement || prev instanceof HTMLParagraphElement){
                    textData+='\n';
                }
            }
            if(textData==' '){
                 textData='';
            }else{
                //trim charCode(32) and THEN replace charCode(160)
                textData+=walker.currentNode.data.replace(/\n|(^ +)|( +$)/g,'').replace(/\u00a0/g,' ');
            }
            textParts.push({node:walker.currentNode,
                text:textData});
        }
    }
    return {textParts,node,
        concat:function(){return this.textParts.map(v=>v.text).join('')},
        nodeFromTextOffset(textOffset:number):{node:Node|null,offset:number}{
            let offset=0;
            for(let t1=0;t1<this.textParts.length;t1++){
                let nextOffset=offset+this.textParts[t1].text.length;
                if(nextOffset>=textOffset){
                    //need verify
                    if(this.textParts[t1].node instanceof Text){
                        return {node:this.textParts[t1].node,offset:textOffset-offset}
                    }else if(t1<this.textParts.length-1){
                        return {node:this.textParts[t1+1].node,offset:0}
                    }else{
                        return {node:this.textParts[t1].node,offset:0}
                    }
                }else{
                    offset=nextOffset;
                }
            }
            return {node:null,offset:-1};
        },
        textOffsetFromNode(node:Node,offset:number):number{
            if(this.node==node && offset==0){
                return 0;
            }
            if(!(this.node instanceof Text) && offset!=0){
                node=node.childNodes.item(offset);
                offset=0;
            }
            let offset2=0;
            for(let t1=0;t1<this.textParts.length;t1++){
                let part=textParts[t1];
                if(part.node!=node){
                    offset2+=part.text.length;
                }else if(part.node instanceof Text){
                    offset2+=offset;
                    break;
                }else{
                    for(let t2=t1;t2<this.textParts.length;t2++){
                        let part2=this.textParts[t2].text;
                        if(part2!=''){
                            offset2+=part2.length;
                            break;
                        }
                    }
                    break;
                }
            }
            return offset2;
        }
    }
}
 


export async function GetCookieNamed(name:string) {
    if (document.cookie.length > 0) {
        let begin = document.cookie.indexOf(name + "=");
        if (begin !== -1) {
            begin += name.length + 1;
            let end = document.cookie.indexOf(";", begin);
            if (end === -1) end = document.cookie.length;
            return decodeURIComponent(document.cookie.substring(begin, end));
        }
    }
    return null;
}

export async function PutCookie(name:string,value:string,maxAge?:number,path?:string){
    let cookieString=`${name}=${value};`
    if(maxAge!=undefined){
        cookieString+=`max-age=${maxAge};`
    }
    if(path!=undefined){
        cookieString+=`path=${path};`
    }
    document.cookie=cookieString;
}
