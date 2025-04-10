

import * as React from 'preact'
import { RpcExtendClient1 } from 'pxprpc/extend';
import { ClientInfo, getRegistered, listRegistered } from 'partic2/pxprpcClient/registry';
import { ReactRefEx, ReactRender } from 'partic2/pComponentUi/domui';
import { RegistryUI } from 'partic2/pxprpcClient/ui';
import { LocalRunCodeContext, RunCodeContext, registry } from 'partic2/CodeRunner/CodeContext';
import { RemoteRunCodeContext } from 'partic2/CodeRunner/RemoteCodeContext';
import { alert, appendFloatWindow, removeFloatWindow, WindowComponent } from 'partic2/pComponentUi/window';
import { sleep } from 'partic2/jsutils1/base';


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


export class CodeContextChooser extends React.Component<{onChoose:(rpc:ClientInfo|'local window'|RemoteRunCodeContext|LocalRunCodeContext)=>void},{}>{
    rref={
        registry:new ReactRefEx<RegistryUI>(),
        registryContainerDiv:new ReactRefEx<HTMLDivElement>()
    }
    render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined; }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChild {
        return <div>
        <h2>From...</h2>
        <a href="javascript:;" onClick={()=>this.props.onChoose('local window')}>Local Window</a>
        <h2>or <a href="javascript:;" onClick={async ()=>{
            let selected=(await this.rref.registry.waitValid()).getSelected();
            if(selected==null){
                alert('select at least one rpc client below.');
                (await this.rref.registryContainerDiv.waitValid()).style.border='solid red 2px';
                await sleep(1000);
                (await this.rref.registryContainerDiv.waitValid()).style.border='0px';
                return;
            }
            this.props.onChoose(getRegistered(selected)!);
        }}>Use RPC</a> below</h2>
        <div ref={this.rref.registryContainerDiv}>
            <RegistryUI ref={this.rref.registry}/>
        </div>
        <div>
            <h2>From RunCodeContext registry</h2>
            {registry.list().map(name=>
                <a href="javascript:;" 
                    onClick={()=>this.props.onChoose(registry.get(name) as RemoteRunCodeContext|LocalRunCodeContext)}>
                    {name}
                </a>
            )}
        </div>
        </div>
    }
}


export async function openCodeContextChooser(){
    return new Promise<ClientInfo|'local window'|RemoteRunCodeContext|LocalRunCodeContext|null>((resolve,reject)=>{
        let wnd2=<WindowComponent onClose={()=>{
            removeFloatWindow(wnd2);
            resolve(null);
        }} title='choose code context' >
            <div style={{backgroundColor:'white',padding:'1px'}}>
            <CodeContextChooser onChoose={(rpc)=>{
                resolve(rpc);
                removeFloatWindow(wnd2);
            }}/>
            </div>
        </WindowComponent>
        appendFloatWindow(wnd2);
    })
    
}