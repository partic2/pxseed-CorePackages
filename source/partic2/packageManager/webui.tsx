import { BuildUrlFromJsEntryModule, GetJsEntry, useDeviceWidth,path, GetPersistentConfig } from "partic2/jsutils1/webutils";
import { ReactRender, DomRootComponent } from "partic2/pComponentUi/domui";
import { requirejs } from "partic2/jsutils1/base";
import { setBaseWindowView } from "partic2/pComponentUi/workspace";
import * as React from 'preact'

const __name__=requirejs.getLocalRequireModule(require);


let config:{packageManagerWebuiEntry?:string}={};

;(async ()=>{
    if(GetJsEntry()==__name__){
        config=await GetPersistentConfig(__name__);
        config.packageManagerWebuiEntry=config.packageManagerWebuiEntry??'partic2/packageManager/webui2'
        //To support multi-desktop
        setBaseWindowView(<iframe style={{verticalAlign:'top',width:'100%',height:'100%',padding:'0px',border:'0px'}} 
            src={BuildUrlFromJsEntryModule(config.packageManagerWebuiEntry!)}/>)
        document.body.style.overflow='hidden';
    }
})()


export function navigateWindowToThisWebui(urlarg?:string){
    window.open(BuildUrlFromJsEntryModule(__name__,urlarg),'_self')
}