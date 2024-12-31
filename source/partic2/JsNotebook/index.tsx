
import { DynamicPageCSSManager, GetUrlQueryVariable ,GetJsEntry, useDeviceWidth } from "partic2/jsutils1/webutils";
import { DomRootComponent, ReactRefEx, ReactRender } from "partic2/pComponentUi/domui";
import { ClientInfo, getRegistered, persistent } from "partic2/pxprpcClient/registry";
import { RegistryUI } from "partic2/pxprpcClient/ui";

import * as React from 'preact'
import { Workspace } from "./workspace";
import { WindowComponent, alert } from "partic2/pComponentUi/window";
import { getIconUrl } from "partic2/pxseedMedia1/index1";
import { CodeContextChooser, findRpcClientInfoFromClient } from "./misclib";
import { LocalRunCodeContext } from "partic2/CodeRunner/CodeContext";
import { RemoteRunCodeContext } from "../CodeRunner/RemoteCodeContext";


export let __name__='partic2/JsNotebook/index';



class ResourcePanel extends React.Component{
    render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined; }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChild {
        return <div>
            <RegistryUI/>
        </div>
    }
}

;(async ()=>{
    if(GetJsEntry()==__name__){
        useDeviceWidth();
        DynamicPageCSSManager.PutCss('body',['margin:0px'])
        let rpc=GetUrlQueryVariable('__rpc');
        await persistent.load();
        ReactRender(<CodeContextChooser onChoose={(rpc)=>{
            if(rpc=='local window' || (rpc instanceof LocalRunCodeContext)){
                ReactRender(<Workspace/>,DomRootComponent);
            }else if(rpc instanceof ClientInfo){
                ReactRender(<Workspace rpc={rpc}/>,DomRootComponent);
            }else if(rpc instanceof RemoteRunCodeContext){
                ReactRender(<Workspace rpc={findRpcClientInfoFromClient(rpc.client1)!}/>,DomRootComponent)
            }else{
                alert('Not support client');
            }
        }}/>,DomRootComponent);
        
    }
})();