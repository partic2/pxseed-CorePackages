import { easyCallRemoteJsonFunction, getAttachedRemoteRigstryFunction, getPersistentRegistered, ServerHostWorker1RpcName } from 'partic2/pxprpcClient/registry';
import { requirejs } from 'partic2/jsutils1/base';

let __name__=requirejs.getLocalRequireModule(require);

export let _blockedStaticFiles:Record<string,any>={};

async function packageManagerFileBlocker(path:string){
    let pathPart=path.split(/\/+/).filter(t1=>t1!=='').slice(1);
    let blocked:Record<string,any>|number=_blockedStaticFiles;
    for(let t1 of pathPart){
        blocked=(blocked as Record<string,any>)[t1];
        if(blocked===undefined){
            return false;
        }else if(blocked===1){
            return true;
        } 
    }
    return false;
}

export function __blockHttpAccessToStaticFileInWWW(path:string){
    let pathPart=path.split(/\/+/);
    let t1=_blockedStaticFiles;
    for(let t3=0;t3<pathPart.length-1;t3++){
        let t2=pathPart[t3];
        if(t1[t2]===undefined){
            t1[t2]={};
        }else if(t1[t2]===1){
            return;
        }
        t1=t1[t2];
    }
    t1[pathPart.at(-1)!]=1;
}

export let __inited__=(async ()=>{
    let {blockStaticFileAccessIf}=await import('pxseedServer2023/pxseedhttpserver')
    blockStaticFileAccessIf.set(__name__+'.fileBlocker',packageManagerFileBlocker)
    let client1=await (await getPersistentRegistered(ServerHostWorker1RpcName))!.ensureConnected();
    await easyCallRemoteJsonFunction(client1,'partic2/packageManager/registry','sendOnStartupEventForAllPackages',[])
})();