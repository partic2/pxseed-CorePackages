export function text2html(src:string){
    let lines=src.split('\n').map(t1=>t1.replace(/[<>&"\u0020]/g,function(c){
        return {'<':'&lt;','>':'&gt;','&':'&amp','"':'&quot;','\u0020':'&nbsp;'}[c]??''
    }));
    return lines.map(t1=>'<div>'+((t1==='')?'<br/>':t1)+'</div>').join('');
}
export function docNode2text(node:Node){
    let walker=document.createTreeWalker(node,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);
    let textParts=[] as {node:Node|'phony',text:string}[]
    while(walker.nextNode()){
        if(walker.currentNode instanceof HTMLDivElement || walker.currentNode instanceof HTMLParagraphElement){
            if(walker.currentNode.previousSibling==null){
                textParts.push({node:walker.currentNode,text:''});
            }else if(walker.currentNode.previousSibling instanceof HTMLBRElement){
                textParts.push({node:walker.currentNode,text:''});
            }else{
                textParts.push({node:'phony',text:'\n'});
                textParts.push({node:walker.currentNode,text:''});
            }
        }else if(walker.currentNode instanceof HTMLBRElement){
            if(walker.currentNode.previousSibling!=null){
                textParts.push({node:walker.currentNode,text:'\n'});
            }else{
                textParts.push({node:walker.currentNode,text:''});
            }
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
                let curNode=this.textParts[t1].node;
                if(nextOffset>=textOffset && curNode!=='phony'){
                    if(curNode instanceof Text){
                        return {node:curNode,offset:textOffset-offset}
                    }else{
                        return {node:curNode,offset:0}
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
            if(!(node instanceof Text) && offset!=0){
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
