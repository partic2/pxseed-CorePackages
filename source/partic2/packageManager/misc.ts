import { assert, DateDiff, GetCurrentTime, logger, sleep } from 'partic2/jsutils1/base';
import { RemoteRunCodeContext } from 'partic2/CodeRunner/RemoteCodeContext';
import { CodeContextShell } from 'partic2/CodeRunner/CodeContext';

import { getPersistentRegistered, ServerHostRpcName } from 'partic2/pxprpcClient/registry'
import { GetPersistentConfig, SavePersistentConfig } from 'partic2/jsutils1/webutils';


let servShell:any=null;
export let __name__='partic2/packageManager/misc';
type ThisModuleType=typeof import('partic2/packageManager/misc');

async function getServerShell():Promise<{shell:CodeContextShell,misc:ThisModuleType}>{
    //may reload server so not worker.
    let client1=await getPersistentRegistered(ServerHostRpcName);
    assert(client1!=null);
    if(servShell==null){
        let shell=new CodeContextShell(new RemoteRunCodeContext(await client1.ensureConnected()));
        let misc=(await shell.importModule<typeof import('partic2/packageManager/misc')>('partic2/packageManager/misc','misc1')).toModuleProxy();
        servShell={shell,misc};
    }
    return servShell;
}

export async function cleanWWW(dir?:string){
    //Client side missing.

    let {dirname,join} = await import('path')
    let {readdir,rm, rmdir}=await import('fs/promises')


    let log=logger.getLogger(__name__);

    let wwwDir=join(dirname(dirname(dirname(__dirname))),'www');
    let sourceDir=join(dirname(dirname(dirname(__dirname))),'source');


    //clean .js .d.ts .tsbuildinfo .js.map and empty directory
    dir=dir??wwwDir;
    let children=await readdir(dir,{withFileTypes:true});
    let emptyDir=true;
    for(let t1 of children){
        if(t1.name.endsWith('.js') || t1.name.endsWith('.d.ts') || t1.name.endsWith('.tsbuildinfo') || t1.name.endsWith('.js.map')){
            log.debug(`delete ${join(dir,t1.name)}`)
            await rm(join(dir,t1.name))
        }else if(t1.isDirectory()){
            let r1=await cleanWWW(join(dir,t1.name));
            if(r1.emptyDir){
                log.debug(`delete ${join(dir,t1.name)}`)
                await rmdir(join(dir,t1.name))
            }else{
                emptyDir=false;
            }
        }else{
            emptyDir=false;
        }
    }
    return {emptyDir};
}

let config1:undefined|{
    lastCodeUpateTime?:number
}=undefined;

export async function ensureCodeUpdated(opt:{reload?:boolean}){
    if(globalThis.process?.versions?.node!=undefined){
        let {dirname,join} = await import('path')
        let { processDirectory } =await import('pxseedBuildScript/buildlib');
        config1=await GetPersistentConfig(__name__);
        if(config1!.lastCodeUpateTime==undefined){
            config1!.lastCodeUpateTime=0;
        }
        if(DateDiff(GetCurrentTime(),new Date(config1!.lastCodeUpateTime),'second')>20){
            let sourceDir=join(dirname(dirname(dirname(__dirname))),'source');
            await processDirectory(sourceDir);
            config1!.lastCodeUpateTime=GetCurrentTime().getTime();
            await SavePersistentConfig(__name__);
        }
        if(opt.reload==true){
            let serverConfig=await import('pxseedServer2023/entry');
            if(serverConfig.config.subprocessIndex!=undefined){
                (async ()=>{
                    await sleep(100);
                    let clientFunc=await import('pxseedServer2023/clientFunction');
                    clientFunc.restartSubprocessSelf()
                })()
            }
        }
    }else{
        let {misc}=await getServerShell();
        config1=await GetPersistentConfig(__name__);
        if(config1!.lastCodeUpateTime==undefined){
            config1!.lastCodeUpateTime=0;
        }
        if(DateDiff(GetCurrentTime(),new Date(config1!.lastCodeUpateTime),'second')>20){
            await misc.ensureCodeUpdated(opt);
            config1!.lastCodeUpateTime=GetCurrentTime().getTime();
            await SavePersistentConfig(__name__);
            if(opt.reload==true){
                await sleep(300);
                window.location.reload();
            }
        }
    }
}