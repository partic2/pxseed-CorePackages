
export function text2html(src:string){
    let lines=src.split(/\r?\n/).map(t1=>t1.replace(/[<>&"]/g,function(c){
        return {'<':'&lt;','>':'&gt;','&':'&amp','"':'&quot;'}[c]??''
    }));
    return lines.map(t1=>'<div>'+((t1==='')?'<br/>':t1)+'</div>').join('');
}
export function docNode2text(node:Node){
    let walker=globalThis.document.createTreeWalker(node,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);
    let textParts=[] as {node:Node|'phony',text:string}[]
    
    const isBlockElement=(e:Node)=>{
        if(e instanceof Element){
            return !getComputedStyle(e).display.includes('inline');
        }
        return false;
    }
    while(walker.nextNode()){
        if(walker.currentNode.previousSibling!=null && (
                isBlockElement(walker.currentNode.previousSibling) ||
                isBlockElement(walker.currentNode))){
            textParts.push({node:'phony',text:'\n'});
        }
        if(walker.currentNode instanceof HTMLBRElement && walker.currentNode.nextSibling!=null && !isBlockElement(walker.currentNode.nextSibling)){
            textParts.push({node:walker.currentNode,text:'\n'});
        }else if(walker.currentNode instanceof Text){
            let textData='';
            let parentElem=walker.currentNode.parentElement;
            if(parentElem!=undefined && getComputedStyle(parentElem).whiteSpace.startsWith('pre')){
                textData+=walker.currentNode.data
            }else{
                //trim charCode(32) and THEN replace charCode(160)
                textData+=walker.currentNode.data.replace(/\n|(^ +)|( +$)/g,'').replace(/\u00a0/g,' ');
            }
            if(walker.currentNode.nextSibling==null && textData.at(-1)=='\n'){
                textData=textData.substring(0,textData.length-1);
            }
            textParts.push({node:walker.currentNode,
                text:textData});
        }else{
            textParts.push({node:walker.currentNode,text:''});
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
