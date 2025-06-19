import { ArrayWrap2, assert, DateDiff, GetCurrentTime, logger, sleep } from 'partic2/jsutils1/base';
import { RemoteRunCodeContext } from 'partic2/CodeRunner/RemoteCodeContext';

import { getPersistentRegistered, importRemoteModule, ServerHostRpcName, ServerHostWorker1RpcName } from 'partic2/pxprpcClient/registry'
import { GetPersistentConfig, SavePersistentConfig } from 'partic2/jsutils1/webutils';
import { Singleton } from '../CodeRunner/jsutils2';


let servShell:any=null;
export let __name__='partic2/packageManager/misc';
type ThisModuleType=typeof import('partic2/packageManager/misc');

let remoteModule={
    misc:new Singleton(async ()=>{
        return await importRemoteModule<typeof import('partic2/packageManager/misc')>(
            await (await getPersistentRegistered(ServerHostWorker1RpcName))!.ensureConnected(),'partic2/packageManager/misc');
    })
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
        let misc=await remoteModule.misc.get();
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

export async function processDirectoryContainFile(file:string):Promise<{sourceRoot:string,outputRoot:string}>{
    if(globalThis.process?.versions?.node!=undefined){
        let {dirname,join} = await import('path');
        let {access}=await import('fs/promises');
        let { processDirectory } =await import('pxseedBuildScript/buildlib');
        let sourceDir=join(dirname(dirname(dirname(__dirname))),'source');
        let splitPath=file.split(/[\\\/]/);
        let pkgPath:string|null=null;
        for(let t1 of ArrayWrap2.IntSequence(splitPath.length,-1)){
            try{
                await access(join(...splitPath.slice(0,t1),'pxseed.config.json'));
                pkgPath=join(...splitPath.slice(0,t1));
                break;
            }catch(e:any){
            }
        }
        if(pkgPath!=null){
            await processDirectory(pkgPath);
        }
        return {sourceRoot:sourceDir,outputRoot:join(dirname(sourceDir),'www')};
    }else{
        let misc=await remoteModule.misc.get();
        return await misc.processDirectoryContainFile(file);
    }
}