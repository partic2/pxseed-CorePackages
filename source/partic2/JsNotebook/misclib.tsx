

import * as React from 'preact'


export class DefaultActionBar extends React.Component<{action:{[name:string]:()=>Promise<void>}},{}>{
    processKeyEvent(evt:React.JSX.TargetedKeyboardEvent<HTMLElement>){
        if(evt.code==='KeyS' && evt.ctrlKey){
            if('save' in this.props.action){
                this.props.action.save()
                evt.preventDefault();
            }
        }
    }
    render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined; }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChild {
        let btn=[] as {id:string,label:string}[];
        for(let name in this.props.action){
            if(name==='save'){
                btn.push({id:'save',label:'Save(Ctrl+S)'})
            }else{
                btn.push({id:name,label:name})
            }
        }
        return btn.map(v=>[<span>&nbsp;&nbsp;</span>,<a href="javascript:;" onClick={(ev)=>this.props.action[v.id]()}>{v.label}</a>,<span>&nbsp;&nbsp;</span>])
    }
}