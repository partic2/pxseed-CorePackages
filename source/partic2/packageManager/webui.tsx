import { BuildUrlFromJsEntryModule, GetJsEntry, useDeviceWidth,path } from "partic2/jsutils1/webutils";
import { ReactRender, DomRootComponent } from "partic2/pComponentUi/domui";
import { requirejs } from "partic2/jsutils1/base";
import { setBaseWindowView } from "partic2/pComponentUi/workspace";
import * as React from 'preact'

const __name__=requirejs.getLocalRequireModule(require);


;(async ()=>{
    if(GetJsEntry()==__name__){
        //To support multi-desktop
        setBaseWindowView(<iframe style={{verticalAlign:'top',width:'100%',height:'100%',padding:'0px',border:'0px'}} 
            src={BuildUrlFromJsEntryModule('partic2/packageManager/webui2')}/>)
        document.body.style.overflow='hidden';
    }
})()