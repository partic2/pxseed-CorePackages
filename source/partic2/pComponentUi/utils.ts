export function text2html(src:string){
    let text2=src.replace(/[<>&"\u0020]/g,function(c){
        return {'<':'&lt;','>':'&gt;','&':'&amp','"':'&quot;','\u0020':'\u00a0'}[c]??''
    }).replace(/\n/g,'<br/>');
    return text2;
}
export function docNode2text(node:Node){
    let walker=document.createTreeWalker(node,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);
    let textParts=[] as {node:Node,text:string}[]
    while(walker.nextNode()){
        if(walker.currentNode instanceof HTMLDivElement || walker.currentNode instanceof HTMLBRElement || walker.currentNode instanceof HTMLParagraphElement){
            if(walker.currentNode instanceof HTMLBRElement && walker.currentNode.parentNode!.childNodes.length==1){
                // only one br in div, ignored.
            }if(walker.currentNode.previousSibling==null){
                // The first block element, ignored.
            }else{
                textParts.push({node:walker.currentNode,text:'\n'});
            }
        }else if(walker.currentNode instanceof Text){
            let prev=walker.currentNode.previousSibling;
            let textData='';
            if(prev!=null){
                if(prev instanceof HTMLDivElement || prev instanceof HTMLParagraphElement){
                    textData+='\n';
                }else if(prev instanceof Text){
                    textData+=' ';
                }
            }
            textData+=walker.currentNode.data.replace(/\n|(^ +)|( +$)/g,'').replace(/\u00a0/g,' ');
            //trim charCode(32) and THEN replace charCode(160)
            textParts.push({node:walker.currentNode,
                text:textData});
        }
    }
    return {textParts,concat:function(){return this.textParts.map(v=>v.text).join('')}}
}
export function docNodePositionFromTextOffset(node:Node,textOffset:number):{node:Node|null,offset:number}{
    let {textParts}=docNode2text(node)
    let offset=0;
    for(let t1=0;t1<textParts.length;t1++){
        let nextOffset=offset+textParts[t1].text.length;
        if(nextOffset>=textOffset){
            //need verify
            if(textParts[t1].node instanceof Text){
                return {node:textParts[t1].node,offset:textOffset-offset}
            }else{
                return {node:textParts[t1].node,offset:0}
            }
        }else{
            offset=nextOffset;
        }
    }
    return {node:null,offset:-1};
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
