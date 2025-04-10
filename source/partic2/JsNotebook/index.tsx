
import { DynamicPageCSSManager, GetUrlQueryVariable ,GetJsEntry, useDeviceWidth } from "partic2/jsutils1/webutils";
import { DomRootComponent, ReactRefEx, ReactRender } from "partic2/pComponentUi/domui";
import { ClientInfo, getRegistered, persistent } from "partic2/pxprpcClient/registry";
import { RegistryUI } from "partic2/pxprpcClient/ui";

import * as React from 'preact'
import { Workspace } from "./workspace";
import { WindowComponent, alert, appendFloatWindow } from "partic2/pComponentUi/window";
import { getIconUrl } from "partic2/pxseedMedia1/index1";
import { CodeContextChooser, findRpcClientInfoFromClient } from "./misclib";
import { LocalRunCodeContext } from "partic2/CodeRunner/CodeContext";
import { RemoteRunCodeContext } from "partic2/CodeRunner/RemoteCodeContext";
import { Task, future } from "partic2/jsutils1/base";
import {openNewWindow} from 'partic2/pComponentUi/workspace'



export let __name__='partic2/JsNotebook/index';



class MainView extends React.Component<{},{rpc:any}>{
    renderChooser(){
        return <div style={{border:'solid 1px black'}}><CodeContextChooser onChoose={async (rpc)=>{this.setState({rpc})}}/></div>
    }
    renderWorkerspace(){
        let rpc=this.state.rpc;
        if(rpc=='local window' || (rpc instanceof LocalRunCodeContext)){
            return <Workspace divStyle={{height:'100%'}}/>;
        }else if(rpc instanceof ClientInfo){
            return <Workspace divStyle={{height:'100%'}} rpc={rpc}/>
        }else if(rpc instanceof RemoteRunCodeContext){
            return <Workspace divStyle={{height:'100%'}} rpc={findRpcClientInfoFromClient(rpc.client1)!}/>
        }else{
            alert('Not support client');
        }
    }
    render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined; }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChild {
        return <div style={{backgroundColor:'white',margin:'0px'}}>
            {this.state.rpc==undefined?this.renderChooser():this.renderWorkerspace()}
        </div>
    }
}


export function *main(command:string){
    if(command=='webui'){
        openNewWindow(<MainView/>,{title:'JS Notebook'});
    }
}

;(async ()=>{
    if(GetJsEntry()==__name__){
        useDeviceWidth();
        DynamicPageCSSManager.PutCss('body',['margin:0px'])
        let rpc=GetUrlQueryVariable('__rpc');
        await persistent.load();
        ReactRender(MainView,DomRootComponent);
        
    }
})();