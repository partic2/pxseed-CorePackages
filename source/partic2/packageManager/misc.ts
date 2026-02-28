import { ArrayWrap2, assert, DateDiff, GetCurrentTime, logger, requirejs, sleep, throwIfAbortError } from 'partic2/jsutils1/base';
import { RemoteRunCodeContext } from 'partic2/CodeRunner/RemoteCodeContext';

import { getPersistentRegistered, importRemoteModule, ServerHostRpcName, ServerHostWorker1RpcName } from 'partic2/pxprpcClient/registry'
import { defaultHttpClient, GetPersistentConfig, getWWWRoot, SavePersistentConfig } from 'partic2/jsutils1/webutils';
import { Singleton, utf8conv } from 'partic2/CodeRunner/jsutils2';
import { buildTjs } from 'partic2/tjshelper/tjsbuilder';
import { getNodeCompatApi } from 'pxseedBuildScript/util';
import { defaultFileSystem, ensureDefaultFileSystem, getSimpleFileSysteNormalizedWWWRoot, simpleFileSystemHelper } from 'partic2/CodeRunner/JsEnviron';


export let __name__='partic2/packageManager/misc';

let remoteModule={
    misc:new Singleton(async ()=>{
        return await importRemoteModule(
            await (await getPersistentRegistered(ServerHostWorker1RpcName))!.ensureConnected(),'partic2/packageManager/misc') as typeof import('partic2/packageManager/misc');
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
            let serverConfig=await import('pxseedServer2023/pxseedhttpserver');
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


export async function getServerWWWRoot():Promise<string>{
    if(globalThis.location?.protocol==undefined || !globalThis.location.protocol.startsWith('http')){
        return getWWWRoot()
    }else{
        let misc=await remoteModule.misc.get();
        return await misc.getServerWWWRoot();
    }
}

export async function processDirectoryContainFile(file:string):Promise<{sourceRoot:string,outputRoot:string,pkgName:string|null}>{
    if(globalThis.process?.versions?.node!=undefined){
        let {fs,path,wwwroot}=await getNodeCompatApi()
        let {dirname,join} = path;
        let {access}=fs;
        let { processDirectory } =await import('pxseedBuildScript/buildlib');
        let sourceDir=join(dirname(dirname(dirname(__dirname))),'source');
        let splitPath=file.split(/[\\\/]/);
        let pkgPath:string|null=null;
        for(let t1 of ArrayWrap2.IntSequence(splitPath.length,-1)){
            try{
                let testConfig=join(...splitPath.slice(0,t1),'pxseed.config.json');
                if(wwwroot.startsWith('/')){
                    testConfig='/'+testConfig;
                }
                await access(testConfig);
                pkgPath=join(testConfig,'..');
                break;
            }catch(e:any){
            }
        }
        let pkgName=null;
        if(pkgPath!=null){
            await processDirectory(pkgPath);
            pkgName=pkgPath.substring(sourceDir.length+1).replace(/\\/g,'/');
        }
        return {sourceRoot:sourceDir,outputRoot:join(dirname(sourceDir),'www'),pkgName};
    }else{
        let misc=await remoteModule.misc.get();
        return await misc.processDirectoryContainFile(file);
    }
}


async function findBrowserExecutableWin32():Promise<{type:'gecko'|'chromium',exePath:string}|null>{
    let tjs=await buildTjs();
    let {fs,path}=await getNodeCompatApi()
    let chromiumPath=[['Google', 'Chrome', 'Application', 'chrome.exe'],['Chromium', 'Application', 'chrome.exe'],['Microsoft', 'Edge', 'Application', 'msedge.exe']];
    let geckoPath=[['Mozilla Firefox', 'firefox.exe']]
    let ProgramFilePrefix=Array.from(new Set([tjs.env['LOCALAPPDATA'],tjs.env['PROGRAMFILES'],tjs.env['PROGRAMFILES(X86)']].filter(t1=>t1!=undefined)));
    for(let t1 of ProgramFilePrefix){
        let existed=false;
        for(let tpath of chromiumPath){
            let exePath=path.join(t1,...tpath);
            await tjs.stat(exePath).then(()=>existed=true,()=>existed=false);
            if(existed){
                return {type:'chromium',exePath};
            }
        }
        for(let tpath of geckoPath){
            let exePath=path.join(t1,...tpath);
            await tjs.stat(exePath).then(()=>existed=true,()=>existed=false);
            if(existed){
                return {type:'gecko',exePath};
            }
        }
    }
    return null;
}
async function findBrowserExecutabeLinux():Promise<{type:'gecko'|'chromium',exePath:string}|null>{
    //Check PATH environment variable
    let tjs=await buildTjs();
    let {fs,path}=await getNodeCompatApi();
    let paths=(tjs.env['PATH']??'').split(':');
    let chromiumName=['google-chrome','chromium','microsoft-edge'];
    let geckoName=['firefox'];
    for(let tpath of paths){
        let existed=false;
        for(let tname of chromiumName){
            let exePath=path.join(tpath,tname);
            await tjs.stat(exePath).then(()=>existed=true,()=>existed=false);
            if(existed){
                return {type:'chromium',exePath};
            }
        }
        for(let tname of geckoName){
            let exePath=path.join(tpath,tname);
            await tjs.stat(exePath).then(()=>existed=true,()=>existed=false);
            if(existed){
                return {type:'chromium',exePath};
            }
        }
    }
    return null;
}


export async function findBrowserExecutable():Promise<{type:'gecko'|'chromium',exePath:string}|null>{
    let tjs=await buildTjs();
    let platform=tjs.system.platform;
    if(platform==='windows'){
        return await findBrowserExecutableWin32();
    }else if(platform==='linux'){
        return await findBrowserExecutabeLinux();
    }else{
        //Unsupport yet;
        return null;
    }
}

export async function openUrlInBrowser(url:string,opts?:{appMode?:boolean}){
    let browser=await findBrowserExecutable();
    assert(browser!==null,"Can't found an available browser.");
    let tjs=await buildTjs();
    let args=[browser.exePath]
    if(opts?.appMode===true && browser.type=='chromium'){
        args.push('--app='+url);
    }else{
        //TODO: Firefox appMode support.
        args.push(url);
    }
    tjs.spawn(args);
}

export async function serverConsoleLog(msg:string){
    if(globalThis.location?.protocol==undefined || !globalThis.location.protocol.startsWith('http')){
        console.info(msg);
    }else{
        let misc=await remoteModule.misc.get();
        await misc.serverConsoleLog(msg);
    }
}

//Patch files in PXSEED_HOME from remote patch file.
export async function patchPxseedServerFiles(patchIndexUrl:string){
    let resp=await defaultHttpClient.fetch(patchIndexUrl);
    let {path}=await import('partic2/jsutils1/webutils')
    assert(resp.ok);
    let patchIndex:{
        fetchRoot:string,
        files:Array<{path:string,lastModified:number}>,
    }=await resp.json();
    let fetchIndexRootUrl=new URL(patchIndexUrl);
    if(patchIndex.fetchRoot.startsWith('.')){
        fetchIndexRootUrl.pathname=path.join(fetchIndexRootUrl.pathname,'..',patchIndex.fetchRoot)
    }else if(patchIndex.fetchRoot.startsWith('/')){
        fetchIndexRootUrl.pathname=patchIndex.fetchRoot;
    }else{
        fetchIndexRootUrl=new URL(patchIndex.fetchRoot);
    }
    await ensureDefaultFileSystem();
    let fs=defaultFileSystem!;
    let pxseedHome=path.join(getSimpleFileSysteNormalizedWWWRoot(),'..');
    for(let t1 of patchIndex.files){
        try{
            let needUpdate=true;
            if(t1.lastModified>0){
                try{
                    let statRes=await fs.stat(pxseedHome+'/'+t1.path);
                    if(statRes.mtime.getTime()>=t1.lastModified)needUpdate=false;
                }catch(err:any){throwIfAbortError(err)};
            }
            if(needUpdate){
                let url2=new URL(fetchIndexRootUrl);
                url2.pathname+='/'+t1.path;
                let file1=await defaultHttpClient.fetch(url2.toString())
                if(file1.ok && file1.body!=null){
                    await file1.body.pipeTo(simpleFileSystemHelper.getFileSystemWritableStream(fs,pxseedHome+'/'+t1.path))
                }
            }
        }catch(err:any){
            console.error(err);
            throwIfAbortError(err);
        }
    }
}

//Generate patch files from patchDir relative the PXSEED_HOME
export async function generatePxseedServerFilesPatch(patchDir:string[]){
    let {path}=await import('partic2/jsutils1/webutils')
    await ensureDefaultFileSystem();
    let fs=defaultFileSystem!;
    let pxseedHome=path.join(getSimpleFileSysteNormalizedWWWRoot(),'..');
    let patchIndex={
        fetchRoot:'../../../..',
        files:new Array<{path:string,lastModified:number}>,
    }
    async function iterDir(dir:string,depth:number){
        if(depth==0)return;
        let children=await fs.listdir(dir);
        for(let t1 of children){
            if(t1.name.startsWith('.'))continue
            let fullpath=dir+'/'+t1.name
            if(t1.type==='dir'){
                await iterDir(fullpath,depth-1);
            }else{
                patchIndex.files.push({path:fullpath.substring(pxseedHome.length+1),lastModified:(await fs.stat(fullpath)).mtime.getTime()})
            }
        }
    }
    for(let t1 of patchDir){
        await iterDir(pxseedHome+'/'+t1,30);
    }
    await fs.writeAll(pxseedHome+'/www/'+__name__+'/PxseedServerFilesPatch.json',utf8conv(JSON.stringify(patchIndex)))
}