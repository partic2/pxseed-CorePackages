import { ArrayWrap2, assert, DateDiff, future, GetCurrentTime, logger, mutex, requirejs, sleep, throwIfAbortError } from 'partic2/jsutils1/base';
import { RemoteRunCodeContext } from 'partic2/CodeRunner/RemoteCodeContext';

import { defaultHttpClient, GetPersistentConfig, getWWWRoot, SavePersistentConfig } from 'partic2/jsutils1/webutils';
import { DebounceCall, Singleton, utf8conv } from 'partic2/CodeRunner/jsutils2';
import { buildTjs } from 'partic2/tjshelper/tjsbuilder';
import { getNodeCompatApi, withConsole } from 'pxseedBuildScript/util';
import { defaultFileSystem, ensureDefaultFileSystem, getSimpleFileSysteNormalizedWWWRoot, simpleFileSystemHelper } from 'partic2/CodeRunner/JsEnviron';
import { buildPackageAndNotfiy, listener } from './registry';


export let __name__='partic2/packageManager/misc';


export async function cleanWWW(dir:string|null){
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


export async function findPxseedPackageContainFile(file:string):Promise<{
    sourceRoot:string,outputRoot:string,
    pkgName:string|null,pkgPath:string|null
}>{
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
        pkgName=pkgPath.substring(sourceDir.length+1).replace(/\\/g,'/');
    }
    return {sourceRoot:sourceDir,outputRoot:join(dirname(sourceDir),'www'),pkgName,pkgPath};
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
    console.info(msg);
}


async function addSystemStartupCommandWindows(name:string,cmd:string){
    let tjs1=await buildTjs();
    let dir1=`${tjs1.env['APPDATA']}\\Microsoft\\Windows\\Start Menu\\Programs\\Startup`;
    let file1=await tjs1.open(`${dir1}\\pxseed-${name}.bat`,'w');
    try{
        await file1.write(utf8conv(cmd));
    }finally{
        file1.close().catch(()=>{});
    }
}
async function addSystemStartupCommandLinux(name:string,cmd:string){
    let tjs1=await buildTjs();
    let dir1=`${tjs1.env['HOME']}/.config/autostart`
    const desktopFile = [
    '[Desktop Entry]',
    'Type=Application',
    'Version=1.0',
    `Name=pxseed-${name}`,
    `Comment=pxseed-${name} startup script`,
    `Exec=${cmd}`,
    'StartupNotify=false',
    'Terminal=false'
  ].join('\n')
    let file1=await tjs1.open(`${dir1}/pxseed-${name}.desktop`,'w');
    try{
        await file1.write(utf8conv(desktopFile));
    }finally{
        file1.close().catch(()=>{});
    }
    await tjs1.chmod(`${dir1}/pxseed-${name}.desktop`,0o777);
}

export async function addSystemStartupCommand(name:string,cmd:string){
    let tjs=await buildTjs();
    let platform=tjs.system.platform;
    if(platform==='windows'){
        await addSystemStartupCommandWindows(name,cmd);
    }else if(platform==='linux'){
        await addSystemStartupCommandLinux(name,cmd);
    }else{
        throw new Error('Unsupported platform');
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

let buildWatcher={
    event:new future<Array<{event:string,pkgName:string}>>(),
    fsw:null as null|{close:()=>void},
    pendingBuildingTask:new Set<string>()
}


export async function buildPackageContainFile(file:string):Promise<{
    sourceRoot:string,outputRoot:string,
    pkgName:string|null,pkgPath:string|null
}>{
    let r=await findPxseedPackageContainFile(file);
    if(r.pkgName!=null){
        await buildPackageAndNotfiy(r.pkgName);
    }
    return r;
}

export function __miscBuildFunctionEventListener(pkgName:string){
    buildWatcher.event.setResult([{event:'build',pkgName}]);
    buildWatcher.event=new future();
}

export async function waitBuildWatcherEvent(){
    if(listener.onBuild.find(t1=>t1.module===__name__)==undefined){
        listener.onBuild.push({module:__name__,function:'__miscBuildFunctionEventListener'})
    }
    return buildWatcher.event.get();
}

let fileSystemWatcherAutoBuildDebounceCall=new DebounceCall(async ()=>{
    let copy=Array.from(buildWatcher.pendingBuildingTask);
    buildWatcher.pendingBuildingTask.clear();
    for(let t1 of copy){
        await buildPackageAndNotfiy(t1);
    }
},1000);

export async function startFileSystemWatcherAutoBuild(){
    if(buildWatcher.fsw==null){
        let nfs=await import('fs');
        let {fs,path,wwwroot}=await getNodeCompatApi();
        let sourceRoot=path.join(wwwroot,'..','source');
        buildWatcher.fsw=nfs.watch(sourceRoot,{recursive:true},async (ev,fn)=>{
            if(fn!=null && fn.match(/[\\\/]\./)==null){
                let {pkgName}=await findPxseedPackageContainFile(path.join(sourceRoot,fn));
                if(pkgName!=null){
                    buildWatcher.pendingBuildingTask.add(pkgName);
                    await fileSystemWatcherAutoBuildDebounceCall.call();
                }
            }
        });
    }
}

export async function stopFileSystemWatcherAutoBuild(){
    if(buildWatcher.fsw!=null){
        buildWatcher.fsw.close();
        buildWatcher.fsw=null;
    }
}