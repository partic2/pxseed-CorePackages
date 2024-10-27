

import {dirname,join as pathJoin} from 'path'
import {readdir,readFile,writeFile,mkdir, access, copyFile,stat} from 'fs/promises'
import {constants as fsConst} from 'fs'

export let __name__='partic2/packageManager/registry';


import {PxseedConfig, processDirectory} from 'pxseedBuildScript/buildlib'
import {getWWWRoot, kvStore} from 'partic2/jsutils1/webutils'
import {ArrayWrap2, GenerateRandomString, assert, logger} from 'partic2/jsutils1/base'
import {copy,remove} from 'fs-extra'
import { platform } from 'os';

let log=logger.getLogger(__name__);

function mustNoSuchFileError(err:any){
    if(err.toString().indexOf('no such file')<0){
        throw err;
    }
}

async function copyFilesNewer(destDir:string,srcDir:string){
    let children=await readdir(srcDir,{withFileTypes:true});
    try{
        await access(destDir)
    }catch(e){
        mustNoSuchFileError(e);
        mkdir(destDir,{recursive:true});
    }
    for(let t1 of children){
        if(t1.name=='.git'){
            continue;
        }
        if(t1.isDirectory()){
            copyFilesNewer(pathJoin(destDir,t1.name),pathJoin(srcDir,t1.name));
        }else{
            let dest=pathJoin(destDir,t1.name);
            let src=pathJoin(srcDir,t1.name);
            let needCopy=false;
            try{
                let dfile=await stat(dest);
                let sfile2=await stat(src);
                if(dfile.mtimeMs<sfile2.mtimeMs){
                    needCopy=true;
                }
            }catch(e){
                needCopy=true;
            }
            if(needCopy){
                await mkdir(dirname(dest),{recursive:true});
                await copyFile(src,dest);
            }
        }
    }
}

async function fetchCorePackages(){
    let gitcache=pathJoin(getWWWRoot(),__name__,'/corepkg-gitcache');
    let {simpleGit}=await import('simple-git');
    try{
        await access(pathJoin(gitcache,'.git'));
        let git=simpleGit(gitcache);
        for(let t1 of await git.getRemotes()){
            try{
                log.info((await git.pull(t1.name)).remoteMessages.all.join('\n'));
                break;
            }catch(e:any){
                log.info(e.toString());
            }
        }
        return
    }catch(e){
        mustNoSuchFileError(e);
    }
    let repoInfos=await getRepoInfoFromPkgName('partic2/CorePackages');
    let ok=false;
    for(let url of repoInfos.urls){
        try{
            await fetchGitRepositoryFromUrl(url,gitcache);
            ok=true;
            break
        }catch(e:any){
            log.info(e.toString())
        }
    }
    if(!ok){
        throw new Error('No valid repository for CorePackages');
    }
}

export async function CorePackagesUpgradeHandler(moduleName:string){
    assert(moduleName=='partic2/packageManager');
    let gitcache=pathJoin(getWWWRoot(),__name__,'/corepkg-gitcache');
    await fetchCorePackages();
    //copyFile to pxseed dir
    await copyFilesNewer(pathJoin(sourceDir,'..'),gitcache);
}

export async function CorePackagePublishHandler(moduleName:string){
    assert(moduleName=='partic2/packageManager');
    let gitcache=pathJoin(getWWWRoot(),__name__,'/corepkg-gitcache');
    await fetchCorePackages();
    let corePackDirs=[
        ['copysource'],
        ['script'],
        ['npmdeps'],
        ['source','pxseedBuildScript'],
        ['source','pxseedServer2023'],
        ['source','pxprpc'],
        ['source','partic2','CodeRunner'],
        ['source','partic2','JsNotebook'],
        ['source','partic2','jsutils1'],
        ['source','partic2','nodehelper'],
        ['source','partic2','packageManager'],
        ['source','partic2','pComponentUi'],
        ['source','partic2','pxprpcBinding'],
        ['source','partic2','pxprpcClient'],
        ['source','partic2','pxseedMedia1'],
        ['source','partic2','tjsonpxp']
    ];
    let corePackFiles=[
        ['source','.gitignore'],
        ['source','tsconfig.base.json']
    ]
    for(let t1 of corePackDirs){
        await copyFilesNewer(pathJoin(gitcache,...t1),pathJoin(sourceDir,...t1))
    }
    for(let t1 of corePackFiles){
        await copyFile(pathJoin(gitcache,...t1),pathJoin(sourceDir,...t1))
    }

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
        function:string
    },
    //intercept the default publish action.
    onPublish?:{
        module:string,
        //type publishHandlerFunc=(moduleName:string,pkgDir:string)=>Promise<void>
        function:string
    },
    onInstalled?:{
        module:string,
        //type installHandlerFunc=(moduleName:string)=>void
        function:string
    },
    dependencies?:string[],
    repositories?:{
        [name:string]:string[]
    }
}



let sourceDir=pathJoin(dirname(dirname(dirname(__dirname))),'source');
let pkgdbName=__name__+'/pkgdb';

async function readJson(...path:string[]){
    return JSON.parse(new TextDecoder().decode(await readFile(pathJoin(...path))));
}

function getPMOptFromPcfg(config:PxseedConfig):PackageManagerOption|null{
    if(config.options && (__name__ in config.options)){
        return config.options[__name__];
    }else{
        return null;
    }
}

export async function fillNameDependOnPath(path?:string){
    path=path??sourceDir;
    let children=await readdir(path,{withFileTypes:true});
    if(children.find(v=>v.name=='pxseed.config.json')!=undefined){
        let result=await readJson(path,'pxseed.config.json');
        result.name=path.substring(sourceDir.length+1).replace(/\\/g,'/');
        await writeFile(pathJoin(path,'pxseed.config.json'),new TextEncoder().encode(JSON.stringify(result,undefined,'  ')));
    }else{
        for(let ch of children){
            if(ch.isDirectory()){
                fillNameDependOnPath(pathJoin(path,ch.name))
            }
        }
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
        return await repoCfg.repositories!.scope![scopeName]
    },
    setScopeRepo:async function(scopeName:string,repos:string[]){
        let repoCfg=await this.ensureRepoCfg();
        repoCfg.repositories!.scope![scopeName]=repos;
        let pkgdb=await kvStore(pkgdbName);
        await pkgdb.setItem('repo',repoCfg);
    }
}


export async function installLocalPackage(path:string){
    
    let pxseedConfig=await readJson(path,"pxseed.config.json");
    let pkgname=pxseedConfig.name as string;
    let destDir=await getSourceDirForPackage(pkgname);
    await mkdir(destDir,{recursive:true});
    if(path!=destDir){
        await copy(path,destDir);
    }
    let pkgConfig=getPMOptFromPcfg(pxseedConfig);
    if(pkgConfig!=null){
        if(pkgConfig.repositories !=undefined){
            for(let scopeName in pkgConfig.repositories){
                let toMerge=pkgConfig.repositories![scopeName];
                let repos=new Set(await RepositoriesRegistry.getScopeRepo(scopeName));
                for(let t1 of toMerge){
                    if(t1.charAt(0)=='!'){
                        repos.delete(t1.substring(1));
                    }else{
                        repos.add(t1);
                    }
                }
                await RepositoriesRegistry.setScopeRepo(scopeName,Array.from(repos))
            }
        }
        let pkgdb=await kvStore(pkgdbName);
        await pkgdb.setItem('pkg-'+pkgname,pkgConfig);
        if(pkgConfig.dependencies!=undefined){
            for(let dep of pkgConfig.dependencies){
                let config=await getPxseedConfigForPackage(dep);
                if(config==null){
                    try{
                        await installPackage(dep);
                    }catch(e:any){
                        log.error(e.toString())
                    }
                }
            }
        }
    }
    await processDirectory(destDir);
    if(pkgConfig!=null){
        if(pkgConfig.onInstalled!=undefined){
            try{
                (await import(pkgConfig.onInstalled.module))[pkgConfig.onInstalled.function]();
            }catch(e){};
        }
    }
}

export async function fetchGitRepositoryFromUrl(url:string,fetchDir?:string){
    let {simpleGit}=await import('simple-git');
    let tempdir=fetchDir??pathJoin(__dirname,'__temp',GenerateRandomString());
    try{
        
        await access(tempdir,fsConst.F_OK);
        await remove(tempdir);
    }catch(e){
        mustNoSuchFileError(e);
    };
    await mkdir(tempdir,{recursive:true});
    let git=simpleGit(tempdir);
    log.info(await git.clone(url,tempdir));
    return tempdir
}

export async function fetchRepositoryFromUrl(url:string){
    if(url.startsWith('file://')){
        let filePath=url.substring(7);
        if(platform().includes('win32')){
            filePath=filePath.substring(1).replace(/\//g,'\\');
        }
        return filePath;
    }else if(url.endsWith('.git')){
        return await fetchGitRepositoryFromUrl(url);
    }
}

export async function getRepoInfoFromPkgName(pkgFullName:string){
    let parts=pkgFullName.split('/');
    let [scope,subname]=parts.slice(0,2) as [string,string?];
    let path=parts.slice(2);
    subname=subname??'';
    let repos=await RepositoriesRegistry.getScopeRepo(scope);
    function *iterUrl(){
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

export async function fetchRepository(name:string){
    let info=await getRepoInfoFromPkgName(name);
    for(let t1 of info.urls){
        try{
            let repoLocalPath=await fetchRepositoryFromUrl(t1);
            if(repoLocalPath==undefined)continue;
            let path=info.path;
            return pathJoin(repoLocalPath,...path);
        }catch(e){
            log.debug(`fetchRepository from ${t1} failed.`)
        }
    }
}

export async function removePackage(pkgname:string){
    remove(pathJoin(sourceDir,...pkgname.split('/')))
    let pkgdb=await kvStore(pkgdbName);
    await pkgdb.delete('pkg-'+pkgname);
}

export async function upgradeGitPackage(localPath:string){
    let {simpleGit}=await import('simple-git');
    let git=simpleGit(localPath);
    await git.pull(['--rebase']);
}

export async function upgradePackage(pkgname:string){
    let pkgdir=pathJoin(sourceDir,...pkgname.split('/'));
    let pxseedConfig=await readJson(pathJoin(pkgdir,'pxseed.config.json')) as PxseedConfig;
    let pmopt=getPMOptFromPcfg(pxseedConfig);
    if(pmopt?.onUpgrade!=undefined){
        await (await import(pmopt.onUpgrade.module))[pmopt.onUpgrade.function](pkgname,pkgdir);
    }else{
        try{
            await access(pathJoin(pkgdir,'.git'),fsConst.F_OK);
            await upgradeGitPackage(pkgdir);
        }catch(e){};
    }
}


export async function publishPackage(dir:string){
    let children=await readdir(dir,{withFileTypes:true});
    if(children.find(v=>v.name=='pxseed.config.json')!=undefined){
        let {simpleGit}=await import('simple-git');
        let git=simpleGit(dir);
        let remotes=await git.getRemotes();
        await git.add('.');
        await git.commit('auto commit');
        let currentBranch=(await git.branch()).current;
        for(let t1 of remotes){
            let pushResult=await git.push(t1.name,currentBranch);
            log.debug(JSON.stringify(pushResult));
        }
    }else{
        for(let t1 of children){
            if(t1.isDirectory()){
                publishPackage(pathJoin(dir,t1.name));
            }
        }
    }
}


export async function initGitRepo(dir:string){
    let children=await readdir(dir,{withFileTypes:true});
    if(children.find(v=>v.name=='.git')!=undefined){
        return;
    }
    if(children.find(v=>v.name=='pxseed.config.json')!=undefined){
        let config=await readJson(pathJoin(dir,'pxseed.config.json'))
        let name=config.name;
        let {simpleGit}=await import('simple-git');
        let git=simpleGit(dir);
        await git.init();
        await writeFile(pathJoin(dir,'.gitignore'),new TextEncoder().encode('/.pxseed.status.json'));
        let repo=await getRepoInfoFromPkgName(name);
        let remoteName=[];
        let repoUrls=Array.from(repo.urls);
        for(let t1 of repoUrls){
            let t2=t1.match(/.+?\/\/(.+?)\//)
            if(t2==null){
                remoteName.push('repo'+(remoteName.length+1));
            }else if(remoteName.indexOf(t2[1])>=0){
                remoteName.push(t2[1]+(remoteName.length+1));
            }else{
                remoteName.push(t2[1]);
            }
        }
        for(let t1 of ArrayWrap2.IntSequence(0,remoteName.length)){
            await git.addRemote(remoteName[t1],repoUrls[t1]);
        }
    }else{
        for(let t1 of children){
            if(t1.isDirectory()){
                await initGitRepo(pathJoin(dir,t1.name));
            }
        }
    }
}

export async function getSourceDirForPackage(pkgname:string){
    return pathJoin(sourceDir,...pkgname.split('/'))
}

export async function getPxseedConfigForPackage(pkgname:string):Promise<PxseedConfig | null>{
    let configFile=pathJoin(await getSourceDirForPackage(pkgname),'pxseed.config.json');
    try{
        await access(configFile);
        return await readJson(configFile) as PxseedConfig;
    }catch(e){
        mustNoSuchFileError(e);
        return null;
    }
}

async function *listPackagesInternal(dir:string):AsyncGenerator<any>{
    let children=await readdir(dir,{withFileTypes:true});
    if(children.find(t1=>t1.name=='pxseed.config.json')){
        yield await readJson(pathJoin(dir,'pxseed.config.json'));
    }else{
        for(let t1 of children){
            if(t1.isDirectory()){
                yield *listPackagesInternal(pathJoin(dir,t1.name));
            }
        }
    }
}


export async function *listPackages():AsyncGenerator<PxseedConfig>{
    yield *listPackagesInternal(sourceDir);
}

export async function listPackagesArray(filterString:string){
    let arr=[];
    for await(let t1 of listPackages()){
        if(filterString=='' || t1.name.indexOf(filterString)>=0){
            arr.push(t1);
        }
    }
    return arr;
}

export async function installPackage(source:string){
    let localPath=undefined as string|undefined;
    if(source.indexOf(':')>=0){
        localPath=await fetchRepositoryFromUrl!(source)
    }else{
        localPath=await fetchRepository!(source);
    }
    if(localPath==undefined){
        throw new Error(`Can not handle url:${source}`)
    }else{
        await installLocalPackage!(localPath);
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
    let {repos,pkgs}=installationInfo;
    for(let name in repos.repositories!.scope){
        let repoUrls=repos.repositories!.scope[name];
        await RepositoriesRegistry.setScopeRepo(name,repoUrls);
    }
    for(let pkg of pkgs){
        try{
            let existed=false;
            try{
                access(pathJoin(sourceDir,...pkg.split('/')),fsConst.F_OK);
                existed=true;
            }catch(e){}
            if(!existed){
                let localPath=await fetchRepository(pkg);
                assert(localPath!=null);
                await installLocalPackage(localPath!);
            }
        }catch(e:any){
            log.warning(`importPackagesInstallation install package ${pkg} failed.`+e.toString())
        };
    }
}