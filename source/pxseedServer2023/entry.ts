import { GetUrlQueryVariable2 } from 'partic2/jsutils1/webutils';
import { SimpleHttpServerRouter, WebSocketServerConnection } from 'partic2/tjshelper/httpprot';
import { Io } from 'pxprpc/base';

let __inited__=(async ()=>{
    if(globalThis.tjs!==undefined){
        await import('./tjsentry')
    }else if(globalThis.process?.versions?.node!==undefined){
        let {__inited__}=await import('./nodeentry');
        await __inited__;
    }
    
})();

