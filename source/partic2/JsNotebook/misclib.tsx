

import * as React from 'preact'
import { RpcExtendClient1 } from 'pxprpc/extend';
import { listRegistered } from 'partic2/pxprpcClient/registry';


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
                btn.push({id:name,label:'Save(Ctrl+S)'})
            }else if(name==='reload'){
                btn.push({id:name,label:'Reload'})
            }else if(name==='reloadCodeWorker'){
                btn.push({id:name,label:'Reload Code Worker'})
            }else{
                btn.push({id:name,label:name})
            }
        }
        return btn.map(v=>[<span>&nbsp;&nbsp;</span>,<a href="javascript:;" onClick={(ev)=>this.props.action[v.id]()}>{v.label}</a>,<span>&nbsp;&nbsp;</span>])
    }
}

export function findRpcClientInfoFromClient(client:RpcExtendClient1){
    for(let t1 of listRegistered()){
        if(t1[1].client===client){
            return t1[1];
        }
    }
    return null;
}


