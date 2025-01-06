import { requirejs } from "partic2/jsutils1/base";
import { BuildUrlFromJsEntryModule, GetUrlQueryVariable } from "partic2/jsutils1/webutils";
import { ServerHostRpcName, addClient, getRegistered, persistent } from "partic2/pxprpcClient/registry";
import { WebSocketIo } from "pxprpc/backend";




(async ()=>{
    await persistent.load();
    let url=requirejs.getConfig().baseUrl as string;
    if(url.endsWith('/'))url=url.substring(0,url.length-1);
    let slashAt=url.lastIndexOf('/');
    let pxseedBase=slashAt>=0?url.substring(0,slashAt):'';
    let pxprpcUrl=(pxseedBase+'/pxprpc/0').replace(/^http/,'ws');
    let key=GetUrlQueryVariable('__pxprpcKey');
    if(key!=null){
        pxprpcUrl+='?key='+key;
    }
    let wstest:WebSocketIo
    try{
        wstest=await new WebSocketIo().connect(pxprpcUrl);
        wstest.close();
        await addClient(pxprpcUrl,ServerHostRpcName);
    }catch(e){}
    
    await persistent.save()
    window.open(BuildUrlFromJsEntryModule('partic2/packageManager/webui'),'_self');
})();
