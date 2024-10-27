
import { DynamicPageCSSManager, GetUrlQueryVariable ,GetJsEntry, useDeviceWidth } from "partic2/jsutils1/webutils";
import { DomRootComponent, ReactRender } from "partic2/pComponentUi/domui";
import { getRegistered, persistent } from "partic2/pxprpcClient/registry";
import { RegistryUI } from "partic2/pxprpcClient/ui";

import * as React from 'preact'
import { Workspace } from "./workspace";
import { WindowComponent } from "partic2/pComponentUi/window";
import { getIconUrl } from "partic2/pxseedMedia1/index1";


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
        ReactRender(<div>
            <h2>From...</h2>
            <a href="javascript:;" onClick={()=>{
                ReactRender(<div style={{width:'99vw',height:'98vh'}}><Workspace/></div>,DomRootComponent)
            }}>Local Window</a>
            <h2>or</h2>
            <RegistryUI onSelectConfirm={(selected)=>{
                if(selected!==null){
                    ReactRender(<div style={{width:'99vw',height:'98vh'}}><Workspace rpc={selected}/></div>,DomRootComponent)
                }
            }}/>
            </div>,DomRootComponent);
    }
})();