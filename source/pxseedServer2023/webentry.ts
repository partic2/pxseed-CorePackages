import { requirejs } from "partic2/jsutils1/base";
import { BuildUrlFromJsEntryModule, GetJsEntry, GetUrlQueryVariable, GetUrlQueryVariable2 } from "partic2/jsutils1/webutils";
import { ServerHostRpcName, addClient, getRegistered, persistent } from "partic2/pxprpcClient/registry";
import { WebSocketIo } from "pxprpc/backend";
import { Io } from "pxprpc/base";

export const __name__=requirejs.getLocalRequireModule(require);

export async function getPxseedUrl(){
    let pxseedBaseUrl=requirejs.getConfig().baseUrl as string;
    if(pxseedBaseUrl.endsWith('/'))pxseedBaseUrl=pxseedBaseUrl.substring(0,pxseedBaseUrl.length-1);
    let slashAt=pxseedBaseUrl.lastIndexOf('/');
    let pxseedBase=slashAt>=0?pxseedBaseUrl.substring(0,slashAt):'';
    let pxprpcUrl=(pxseedBase+'/pxprpc/0').replace(/^http/,'ws');
    let wsPipeUrl=(pxseedBase+'/ws/pipe').replace(/^http/,'ws');
    return {pxseedBaseUrl,pxprpcUrl,wsPipeUrl};
}

export async function connectWsPipe(id:string):Promise<Io>{
    let {wsPipeUrl}=await getPxseedUrl();
    return new WebSocketIo().connect(wsPipeUrl+`?id=${id}`);
}

export async function updatePxseedServerConfig(){
    await persistent.load();
    let {pxprpcUrl}=await getPxseedUrl();
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
}

(async ()=>{
    if(GetJsEntry()==__name__){
        await updatePxseedServerConfig();
        let redirectJsEntry=GetUrlQueryVariable('__redirectjsentry');
        if(redirectJsEntry==null){
            redirectJsEntry='partic2/packageManager/webui'
        }else{
            redirectJsEntry=decodeURIComponent(redirectJsEntry);
        }
        window.open(BuildUrlFromJsEntryModule(redirectJsEntry),'_self');
    }
})();
