import { easyCallRemoteJsonFunction, getAttachedRemoteRigstryFunction, getPersistentRegistered, ServerHostWorker1RpcName } from 'partic2/pxprpcClient/registry';



export let __inited__=(async ()=>{
    let client1=await (await getPersistentRegistered(ServerHostWorker1RpcName))!.ensureConnected();
    await easyCallRemoteJsonFunction(client1,'partic2/packageManager/registry','sendOnStartupEventForAllPackages',[])
})();