
import { DynamicPageCSSManager, GetUrlQueryVariable ,GetJsEntry, useDeviceWidth } from "partic2/jsutils1/webutils";
import { DomRootComponent, ReactRefEx, ReactRender } from "partic2/pComponentUi/domui";
import { ClientInfo, getRegistered, persistent } from "partic2/pxprpcClient/registry";
import { RegistryUI } from "partic2/pxprpcClient/ui";

import * as React from 'preact'
import { WindowComponent, alert, appendFloatWindow } from "partic2/pComponentUi/window";
import { getIconUrl } from "partic2/pxseedMedia1/index1";
import { __internal__ as notebooki } from "./notebook";
import { LocalRunCodeContext } from "partic2/CodeRunner/CodeContext";
import { RemoteRunCodeContext } from "partic2/CodeRunner/RemoteCodeContext";
import { Task, future } from "partic2/jsutils1/base";
import {openNewWindow, setBaseWindowView} from 'partic2/pComponentUi/workspace'
import { openWorkspaceWindowFor } from "./workspace";



export let __name__='partic2/JsNotebook/index';

let {RpcChooser}=notebooki;


class MainView extends React.Component<{}>{
    renderChooser(){
        return <div style={{border:'solid 1px black'}}><RpcChooser onChoose={async (rpc)=>{this.openWorkspaceForRpc(rpc)}}/></div>
    }
    openWorkspaceForRpc(rpc:any){
        if(rpc=='local window'){
            return openWorkspaceWindowFor('local window');
        }else if(rpc instanceof ClientInfo){
            return openWorkspaceWindowFor(rpc)
        }else{
            alert('Unsupported client');
        }
    }
    render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined; }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChild {
        return this.renderChooser()
    }
}


export function *main(command:string){
    if(command=='webui'){
        openNewWindow(<MainView/>,{title:'JS Notebook RPC Chooser'});
    }
}

;(async ()=>{
    if(GetJsEntry()==__name__){
        useDeviceWidth();
        DynamicPageCSSManager.PutCss('body',['margin:0px'])
        let rpc=GetUrlQueryVariable('__rpc');
        await persistent.load();
        setBaseWindowView(<MainView/>)
    }
})();