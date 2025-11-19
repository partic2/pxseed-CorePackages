

export let __inited__=(async ()=>{
    if(globalThis.tjs!==undefined){
        await import('./tjsentry')
    }else if(globalThis.process?.versions?.node!==undefined){
        let {__inited__}=await import('./nodeentry');
        await __inited__;
    }
    
})();

