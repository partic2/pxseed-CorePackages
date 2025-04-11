import { BuildUrlFromJsEntryModule, GetJsEntry, useDeviceWidth,path } from "partic2/jsutils1/webutils";
import { ReactRender, DomRootComponent } from "partic2/pComponentUi/domui";
import { requirejs } from "partic2/jsutils1/base";


const __name__=requirejs.getLocalRequireModule(require);


;(async ()=>{
    if(GetJsEntry()==__name__){
        await (await import('./webui2')).renderPackagePanel();
    }
})()