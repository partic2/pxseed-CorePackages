
import {PxseedConfig, PxseedStatus, cleanBuildStatus, processDirectory, sourceDir} from 'pxseedBuildScript/buildlib'
import {defaultHttpClient, getWWWRoot, kvStore, path} from 'partic2/jsutils1/webutils'
import {ArrayBufferConcat, ArrayWrap2, GenerateRandomString, assert, logger, requirejs, throwIfAbortError} from 'partic2/jsutils1/base'
import { getNodeCompatApi, __internal__ as utilsi, withConsole } from 'pxseedBuildScript/util';
import { defaultFileSystem, ensureDefaultFileSystem, getSimpleFileSysteNormalizedWWWRoot } from 'partic2/CodeRunner/JsEnviron';
import { NotebookFileData, runNotebook } from 'partic2/JsNotebook/workerinit';
import { CodeCellListData } from 'partic2/CodeRunner/Inspector';
import { ServerHostWorker1RpcName } from 'partic2/pxprpcClient/registry';
import {defaultGitClient, fetchPackage, __internal__ as pkgfetcheri} from './pkgfetcher'

export let __name__=requirejs.getLocalRequireModule(require);

let log=logger.getLogger(__name__);

export let listener={
    onBuild:new Array<{module:string,func:string}>(),
    onInstall:new Array<{module:string,func:string}>(),
    onUninstall:new Array<{module:string,func:string}>(),
}


async function copyFilesNewer(destDir:string,srcDir:string,ignore?:(name:string,path:string)=>boolean,maxDepth?:number){
    if(maxDepth==undefined){
        maxDepth=20;
    }
    if(maxDepth==0){
        return;
    }
    const {fs,path}=await getNodeCompatApi()
    await fs.mkdir(destDir,{recursive:true});
    let children=await fs.readdir(srcDir,{withFileTypes:true});
    try{
        await fs.access(destDir)
    }catch(e){
        await fs.mkdir(destDir,{recursive:true});
    }
    for(let t1 of children){
        if(ignore!=undefined && ignore(t1.name,srcDir+'/'+t1.name)){
            continue;
        }
        if(t1.isDirectory()){
            await copyFilesNewer(path.join(destDir,t1.name),path.join(srcDir,t1.name),ignore,maxDepth-1);
        }else{
            let dest=path.join(destDir,t1.name);
            let src=path.join(srcDir,t1.name);
            let needCopy=false;
            try{
                let dfile=await fs.stat(dest);
                let sfile2=await fs.stat(src);
                if(dfile.mtimeMs<sfile2.mtimeMs){
                    needCopy=true;
                }
            }catch(e){
                needCopy=true;
            }
            if(needCopy){
                await fs.mkdir(path.dirname(dest),{recursive:true});
                await fs.copyFile(src,dest);
            }
        }
    }
}


let corePackFiles=[
    ['copysource'],
    ['npmdeps'],
    ['pxseed-cli'],
    ['script'],
    ['source','pxseedBuildScript'],
    ['source','pxseedServer2023'],
    ['source','pxprpc'],
    ['source','.gitignore'],
    ['source','tsconfig.base.json'],
    ['source','partic2','CodeRunner'],
    ['source','partic2','JsNotebook'],
    ['source','partic2','jsutils1'],
    ['source','partic2','nodehelper'],
    ['source','partic2','pComponentUi'],
    ['source','partic2','packageManager'],
    ['source','partic2','pxprpcBinding'],
    ['source','partic2','pxprpcClient'],
    ['source','partic2','pxseedMedia1'],
    ['source','partic2','tjshelper']
];


export async function UpgradeCorePackages(){
    const {fs,path,wwwroot}=await getNodeCompatApi()
    let pxseedCorePath=path.join(wwwroot,'..');
    let err:Error|null=null;
    try{
        await pkgfetcheri.upgradeGitPackage(pxseedCorePath);
    }catch(e:any){
        log.info('UpgradeCorePackages:git pull failed with '+e.toString());
        err=e;
    }
    if(err!=null){
        err=null;
        let gitcache=path.join(wwwroot,__name__,'/corepkg-gitcache');
        try{
            await fs.rm(gitcache,{recursive:true});
        }catch(err){};
        let repoInfos=await getRepoInfoFromPkgName('partic2/CorePackages');
        let fetchDone=false;
        for(let url of repoInfos.urls){
            try{
                await pkgfetcheri.fetchGitPackageFromUrl(url,gitcache);
                fetchDone=true;
                break
            }catch(e:any){
                log.info('UpgradeCorePackages:Fetch failed for url '+url+','+e.toString())
            }
        }
        log.info('UpgradeCorePackages:Fetch successfully.');
        if(fetchDone){
            try{
                await fs.rm(path.join(pxseedCorePath,'.git'),{recursive:true});
            }catch(err){};
            await copyFilesNewer(path.join(pxseedCorePath,'.git'),path.join(gitcache,'.git'),undefined,30);
            let git=await import('isomorphic-git');
            await git.checkout({...await defaultGitClient.get(),dir:pxseedCorePath,force:true});
            await fs.rm(gitcache,{recursive:true});
        }else{
            log.error('Fetch failed for all url.');
            throw new Error('UpgradeCorePackages:Fetch failed for all url');
        }
    }
    if(err===null){
        for(let t1 of corePackFiles){
            if(t1[0]==='source'){
                let joinedPath=path.join(pxseedCorePath,...t1);
                let t2=await fs.stat(joinedPath);
                if(t2.isDirectory()){
                    try{
                        await processDirectory(joinedPath)
                    }catch(err:any){
                        log.error('processDirectory failed with '+err.toString());
                    }
                }
            }
        }
    }
    try{
        await updatePackagesDatabase();
    }catch(err){}
}


export async function packPxseedForPxseedLoader(){
    const {fs,path,wwwroot}=await getNodeCompatApi()
    let pxseedRoot=path.join(wwwroot,'..').replace(/\\/g,'/');
    let outputRoot=path.join(wwwroot,__name__,'pxseedPack4PxseedLoader').replace(/\\/g,'/');
    await copyFilesNewer(outputRoot+'/pxseed',pxseedRoot,(name,path)=>{
        path=path.replace(/\\/g,'/');
        if(name=='.git'){
            return true;
        }
        return [pxseedRoot+'/npmdeps/node_modules',
                pxseedRoot+'/www/node_modules',
                outputRoot].includes(path)
    });
    await fs.writeFile(path.join(outputRoot,'index.html'),new TextEncoder().encode(String.raw`
    <!DOCTYPE html>
    <html>
    <head>
        <script>
            window.onload=function(){
                document.getElementById("uainfo").innerHTML=navigator.userAgent
                document.getElementById("viewinfo").innerHTML=''+window.innerWidth+"X"+window.innerHeight
                window.open('pxseed/www/index.html?__jsentry=partic2%2FpackageManager%2Fwebui','_self')
            }
        </script>
    </head>
    <body>
        <div>
            this is entry at assets/res/index.html
        </div>
        <div>
            userAgent:<span id="uainfo">
            </span>
        </div>
        view:<span id="viewinfo">
    
        </span>
    </body>
    </html>
`))

}


export interface PackageManagerOption{
    //provide webui entry
    webui?:{
        entry:string,
        icon?:string,
        label:string
    },
    //intercept the default upgrade action.
    onUpgrade?:{
        module:string,
        //type upgradeHandlerFunc=(moduleName:string,pkgDir:string)=>Promise<void>
        func:string
    },
    //intercept the default publish action.
    onPublish?:{
        module:string,
        //type publishHandlerFunc=(moduleName:string,pkgDir:string)=>Promise<void>
        func:string
    },
    onInstalled?:{
        module:string,
        //type installHandlerFunc=(moduleName:string)=>void
        func:string
    },
    onServerStartup?:{
        module:string,
        //type serverStartupHandler=()=>void
        func:string
    },
    onWebuiStartup?:{
        module:string,
        //type webuiStartupHandler=()=>void, this function will run in web scope.
        func:string
    }
    dependencies?:string[],
    repositories?:{
        [name:string]:string[]
    }
}



let pkgdbName=__name__+'/pkgdb';

function getPMOptFromPcfg(config:PxseedConfig):PackageManagerOption|null{
    if(config.options && (__name__ in config.options)){
        return config.options[__name__];
    }else{
        return null;
    }
}

interface RepoConfig{
    version:number
    repositories?:{
        scope?:{[name:string]:string[]}
    }
};
let initRepoConfig:RepoConfig={
    version:1,
    repositories:{scope:{
        'partic2':[
            'https://gitee.com/partic/pxseed-${subname}.git',
            'https://github.com/partic2/pxseed-${subname}.git'
        ],
        'pxprpc':[
            'https://gitee.com/partic/pxseed-pxprpc.git',
            'https://github.com/partic2/pxseed-pxprpc.git'
        ],
        'pxseedBuildScript':[
            'https://gitee.com/partic/pxseed-pxseedBuildScript.git',
            'https://github.com/partic2/pxseed-pxseedBuildScript.git'
        ],
        'pxseedServer2023':[
            'https://gitee.com/partic/pxseed-pxseedServer2023.git',
            'https://github.com/partic2/pxseed-pxseedServer2023.git'
        ]
    }}
}

let RepositoriesRegistry={
    ensureRepoCfg:async function(){
        let pkgdb=await kvStore(pkgdbName);
        let repoCfg=await pkgdb.getItem('repo') as RepoConfig|null;
        if(repoCfg==null){
            repoCfg=initRepoConfig;
            await pkgdb.setItem('repo',repoCfg);
        }
        assert(repoCfg.version<=1,'version not support');
        if(repoCfg.repositories==undefined){
            repoCfg.repositories=initRepoConfig.repositories
        }
        if(repoCfg.repositories!.scope==undefined){
            repoCfg.repositories!.scope=initRepoConfig.repositories?.scope;
        }
        await pkgdb.setItem('repo',repoCfg);
        return repoCfg;
    },
    getScopeRepo:async function(scopeName:string){
        let repoCfg=await this.ensureRepoCfg();
        return await repoCfg.repositories?.scope?.[scopeName]
    },
    setScopeRepo:async function(scopeName:string,repos:string[]){
        let repoCfg=await this.ensureRepoCfg();
        repoCfg.repositories!.scope![scopeName]=repos;
        let pkgdb=await kvStore(pkgdbName);
        await pkgdb.setItem('repo',repoCfg);
    }
}

export async function updatePackagesDatabase(pkgNameOrPxseedConfig?:string|PxseedConfig){
    const {fs,path,wwwroot}=await getNodeCompatApi();
    if(pkgNameOrPxseedConfig==undefined){
        for await(let pkg of listPackages()){
            try{
                await updatePackagesDatabase(pkg);
            }catch(err:any){
                log.error(err.toString()+err.stack)
            }
        }
    }else{
        let pxseedConfig:PxseedConfig;
        if(typeof pkgNameOrPxseedConfig==='string'){
            pxseedConfig=(await getPxseedConfigForPackage(pkgNameOrPxseedConfig))!;
        }else{
            pxseedConfig=pkgNameOrPxseedConfig;
        }
        let pkgConfig=getPMOptFromPcfg(pxseedConfig);
        if(pkgConfig?.repositories !=undefined){
            for(let scopeName in pkgConfig.repositories){
                let toMerge=pkgConfig.repositories![scopeName];
                assert(toMerge instanceof Array);
                let repos=new Set(await RepositoriesRegistry.getScopeRepo(scopeName));
                for(let t1 of toMerge){
                    if(t1.charAt(0)==='!'){
                        repos.delete(t1.substring(1));
                    }else{
                        repos.add(t1);
                    }
                }
                await RepositoriesRegistry.setScopeRepo(scopeName,Array.from(repos))
            }
        }
    }
}

async function getSourceDirForPackage(pkgname:string){
    const {fs,path,wwwroot}=await getNodeCompatApi();
    return path.join(wwwroot,'..','source',...pkgname.split('/'))
}

async function getOutputDirForPakcage(pkgname:string){
    const {fs,path,wwwroot}=await getNodeCompatApi();
    return path.join(wwwroot,...pkgname.split('/'))
}

export async function installLocalPackage(path2:string){
    const {fs,path,wwwroot}=await getNodeCompatApi();
    let pxseedConfig=await utilsi.readJson(path.join(path2,"pxseed.config.json")) as PxseedConfig;
    let pkgname=pxseedConfig.name as string;
    let destDir=await getSourceDirForPackage(pkgname);
    await fs.mkdir(destDir,{recursive:true});
    if(path2!=destDir){
        await copyFilesNewer(destDir,path2);
    }
    let pkgConfig=getPMOptFromPcfg(pxseedConfig);
    if(pkgConfig?.dependencies!=undefined){
        for(let dep of pkgConfig.dependencies){
            let config=await getPxseedConfigForPackage(dep);
            if(config==null){
                try{
                    await installPackage(dep);
                }catch(e:any){
                    log.error(e.toString()+e.stack)
                }
            }
        }
    }
    await buildPackageAndNotfiy(pkgname);
    await updatePackagesDatabase(pxseedConfig);
    if(pkgConfig!=null){
        if(pkgConfig.onInstalled!=undefined){
            try{
                (await import(pkgConfig.onInstalled.module))[pkgConfig.onInstalled.func]();
            }catch(e){};
        }
    }
    listener.onInstall.forEach((l)=>import(l.module).then(m=>m[l.func](pkgname)).catch(()=>{}));
}



export async function getUrlTemplateFromScopeName(scopeName:string){
    return RepositoriesRegistry.getScopeRepo(scopeName);
}

export async function getRepoInfoFromPkgName(pkgFullName:string){
    let parts=pkgFullName.split('/');
    let [scope,subname]=parts.slice(0,2) as [string,string?];
    let path=parts.slice(2);
    subname=subname??'';
    let repos=await RepositoriesRegistry.getScopeRepo(scope);
    function *iterUrl(){
        if(repos==undefined){
            return
        }
        for(let t1 of repos){
            try{
                let url:string=new Function('fullname','subname','scope','return `'+t1+'`')(pkgFullName,subname,scope);
                yield url;
            }catch(e){
            }
        }
    }
    return {
        scope:scope,subname:subname,path:path,urls:Array.from(iterUrl())
    }
}


export async function buildPackageAndNotfiy(pkgName:string){
    let { processDirectory } =await import('pxseedBuildScript/buildlib');
    let {path,wwwroot}=await getNodeCompatApi();
    let records:any[][]=[];
    let wrapConsole={...globalThis.console};
    wrapConsole.debug=(...msg:any[])=>records.push(msg);
    wrapConsole.info=(...msg:any[])=>records.push(msg);
    wrapConsole.warn=(...msg:any[])=>records.push(msg);
    wrapConsole.error=(...msg:any[])=>records.push(msg);
    let buildPath=await getSourceDirForPackage(pkgName);
    await withConsole(wrapConsole,()=>processDirectory(buildPath));
    listener.onBuild.forEach((l)=>{import(l.module).then(m=>m[l.func](pkgName)).catch(()=>{})});
    try{
        await updatePackagesDatabase(pkgName);
    }catch(err){}
    return records.map(t1=>t1.join(' ')).join('\n');
}

export async function uninstallPackage(pkgname:string){
    const {fs,path,wwwroot}=await getNodeCompatApi();
    let dir1=await getSourceDirForPackage(pkgname);
    await cleanBuildStatus(dir1)
    await fs.rm(dir1,{recursive:true});
    listener.onUninstall.forEach((l)=>import(l.module).then(m=>m[l.func](pkgname)));
}

export async function getPxseedConfigForPackage(pkgname:string):Promise<PxseedConfig | null>{
    const {fs,path,wwwroot}=await getNodeCompatApi();
    let statusFile=path.join(await getOutputDirForPakcage(pkgname),'.pxseed.status.json');
    try{
        await fs.access(statusFile);
        return (await utilsi.readJson(statusFile) as PxseedStatus).pxseedConfig;
    }catch(e){
        return null;
    }
}

async function *listPackagesInDirectory(dir:string):AsyncGenerator<{path:string,config:PxseedConfig}>{
    const {fs,path,wwwroot}=await getNodeCompatApi();
    let children=await fs.readdir(dir,{withFileTypes:true});
    if(children.find(t1=>t1.name=='.pxseed.status.json')){
        yield {path:dir,config:(await utilsi.readJson(path.join(dir,'.pxseed.status.json'))).pxseedConfig};
    }else{
        for(let t1 of children){
            if(t1.isDirectory()){
                yield *listPackagesInDirectory(path.join(dir,t1.name));
            }
        }
    }
}


export async function *listPackages():AsyncGenerator<PxseedConfig>{
    const {fs,path,wwwroot}=await getNodeCompatApi();
    for await(let t1 of listPackagesInDirectory(wwwroot)){
        yield t1.config;
    }
}

export async function listPackagesArray(filterString:string){
    let arr:PxseedConfig[]=[];
    let filterFunc:(name:string,config:PxseedConfig,pmopt:PackageManagerOption|undefined)=>boolean;
    if(filterString.startsWith('javascript:')){
        filterFunc=new Function('name','config','pmopt',filterString.substring('javascript:'.length+1)) as any;
    }else{
        filterFunc=(()=>{
            let keywords=filterString.split(/\s+/);
            return (name,config,pmopt)=>{
                for(let kw of keywords){
                    if(name.includes(kw)){
                        return true;
                    }
                    if(config.description!=undefined && config.description.includes(kw)){
                        return true;
                    }
                    if(pmopt!=undefined && kw in pmopt){
                        return true;
                    }
                }
                return false;
            }
        })()
    }
    for await(let t1 of listPackages()){
        if(filterFunc(t1.name,t1,t1.options?.[__name__])){
            arr.push(t1);
        };
    }
    return arr;
}

export async function upgradePackage(pkgname:string){
    const {fs,path,wwwroot}=await getNodeCompatApi();
    let pkgdir=await getSourceDirForPackage(pkgname)
    let pxseedConfig=await utilsi.readJson(path.join(pkgdir,'pxseed.config.json')) as PxseedConfig;
    let pmopt=getPMOptFromPcfg(pxseedConfig);
    if(pmopt?.onUpgrade!=undefined){
        await (await import(pmopt.onUpgrade.module))[pmopt.onUpgrade.func](pkgname,pkgdir);
    }else{
        await fs.access(path.join(pkgdir,'.git'));
        await pkgfetcheri.upgradeGitPackage(pkgdir);
        await installLocalPackage(pkgdir);
    }
}

export async function installPackage(source:string){
    const {fs,path,wwwroot}=await getNodeCompatApi();
    let installProcessed=false;
    let sourceDir=path.join(wwwroot,'..','source');
    if(source.startsWith('npm:')){
        let packageJson=await utilsi.readJson(path.join(path.dirname(sourceDir),'npmdeps','package.json')) as {
            dependencies:{[pkg:string]:string}
        };
        //TODO: npm version check
        let t1=source.substring(4);
        let versionSep=t1.lastIndexOf('@');
        if(versionSep<=0){
            versionSep=t1.length;
        }
        let pkgName=t1.substring(0,versionSep);
        if(packageJson.dependencies[pkgName]==undefined){
            log.info('install npm package '+pkgName);
            if(globalThis.process?.versions?.node==undefined){
                throw new Error('npm depdendencies are only support on node.js platform')
            }
            let returnCode=await utilsi.runCommand(`npm i ${pkgName}`,{cwd:path.join(path.dirname(sourceDir),'npmdeps')})
            if(returnCode!==0)log.error('install npm package failed.');
        }
        installProcessed=true;
    }else{
        let existed=false;
        try{
            await fs.access(path.join(sourceDir,source,'pxseed.config.json'));
            existed=true;
        }catch(e){existed=false;}
        if(existed){
            try{
                await upgradePackage(source)
                installProcessed=true;
            }catch(err){
                log.info('upgrade failed.'+err);
            }
        }
        if(!installProcessed){
            try{
                let fetchResult=await fetchPackage(source);
                await installLocalPackage!(fetchResult.localPath);
                installProcessed=true;
            }catch(err){
                log.info('install failed.'+err)
            };
        }
    }
    if(!installProcessed){
        throw new Error(`Can not handle url:${source}`)
    }
}

export async function createPackageTemplate1(pxseedConfig:PxseedConfig){
    const {fs,path,wwwroot}=await getNodeCompatApi();
    let pkgloc=path.join(sourceDir,pxseedConfig.name);
    try{
        await fs.access(pkgloc);
        throw new Error('package is existed.')
    }catch(e:any){
    }
    await fs.mkdir(pkgloc,{recursive:true});
    await fs.mkdir(path.join(pkgloc,'assets'));
    await utilsi.writeJson(path.join(pkgloc,'pxseed.config.json'),pxseedConfig);
    await fs.writeFile(path.join(pkgloc,'.gitignore'),
`.*
!.gitignore
tsconfig.json
`);
    if(pxseedConfig.options?.[__name__]!=undefined){
        let opt=pxseedConfig.options[__name__] as PackageManagerOption;
        if(opt.webui?.entry!=undefined && opt.webui.entry!=''){
            let entryMod=opt.webui.entry;
            if(entryMod.startsWith(pxseedConfig.name+'/')){
                let entModPath=path.join(sourceDir,...entryMod.split('/'))+'.tsx';
                await fs.mkdir(path.dirname(entModPath),{recursive:true});
                await fs.writeFile(entModPath,`
import * as React from 'preact'
import { openNewWindow } from 'partic2/pComponentUi/workspace'
import { requirejs } from 'partic2/jsutils1/base';
import { GetJsEntry } from 'partic2/jsutils1/webutils';
import { setBaseWindowView } from 'partic2/pComponentUi/workspace';

const __name__=requirejs.getLocalRequireModule(require);

//Open from packageManager.
export function main(args:string){
    if(args=='webui'){
        openNewWindow(<div>WebUI Demo</div>);
    }
}

//Optinal support when module is open from url directly. like http://xxxx/pxseed/index.html?__jsentry=<moduleName>
(async ()=>{
    if(__name__==GetJsEntry()){
        setBaseWindowView(<div>WebUI Demo</div>);
    }
})();
`)}
        }
    }
    await installLocalPackage(pkgloc);
    await pkgfetcheri.initGitPackage(pkgloc);
}

export async function unloadPackageModules(pkg:string){
    for(let mid in await requirejs.getDefined()){
        if(mid.startsWith(pkg+'/')){
            await requirejs.undef(mid);
        }
    }
}


export async function exportPackagesInstallation(){
    let repos=await RepositoriesRegistry.ensureRepoCfg();   
    let pkgs=[];
    for await(let t1 of listPackages()){
        pkgs.push(t1.name);
    }
    return {repos,pkgs};
}


export async function importPackagesInstallation(installationInfo:{repos:RepoConfig,pkgs:string[]}){
    const {fs,path,wwwroot}=await getNodeCompatApi();
    let {repos,pkgs}=installationInfo;
    for(let name in repos.repositories!.scope){
        let repoUrls=repos.repositories!.scope[name];
        await RepositoriesRegistry.setScopeRepo(name,repoUrls);
    }
    for(let pkg of pkgs){
        try{
            let existed=false;
            try{
                fs.access(path.join(sourceDir,...pkg.split('/')));
                existed=true;
            }catch(e){}
            if(!existed){
                let fetchResult=await fetchPackage(pkg);
                assert(fetchResult!=null);
                await installLocalPackage(fetchResult.localPath!);
            }
        }catch(e:any){
            log.warning(`importPackagesInstallation install package ${pkg} failed.`+e.toString())
        };
    }
}

export async function cleanPackageInstallCache(){
    const {fs,path,wwwroot}=await getNodeCompatApi();
    await fs.rm(path.join(wwwroot,...__name__.split('/'),'..','__temp'),{recursive:true});
}

export async function getPackageListeners(eventType:'onServerStartup'|'onWebuiStartup'):Promise<Array<{module:string,func:string}>>{
    let result=new Array<{module:string,func:string}>()
    for await (let pkg of listPackages()){
        let pmopt=getPMOptFromPcfg(pkg);
        if(pmopt!=null){
            if(pmopt[eventType]!=null){
                try{
                    result.push(pmopt[eventType]);
                }catch(err){};
            }
        }
    }
    return result;
}

export async function sendOnStartupEventForAllPackages(){
    await Promise.allSettled((await getPackageListeners('onServerStartup')).map(t1=>import(t1.module).then(t2=>t2[t1.func]())));
    await ensureDefaultFileSystem();
    let startupNotebook=getSimpleFileSysteNormalizedWWWRoot()+'/'+path.join(__name__,'..','notebook','startup.ijsnb');
    if(await defaultFileSystem!.filetype(startupNotebook)=='none'){
        let nbd=new NotebookFileData();
        let ccld=new CodeCellListData();
        ccld.cellList.push({cellInput:`//All cells in this notebook will be executed when server(and packageManager) started.`,cellOutput:[null,''],key:GenerateRandomString()});
        nbd.setCellsData(ccld);
        nbd.rpc=ServerHostWorker1RpcName;
        await defaultFileSystem!.writeAll(startupNotebook,nbd.dump());
    }else{
        await runNotebook(startupNotebook,'all cells');
    }
}
