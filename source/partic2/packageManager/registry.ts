
import {PxseedConfig, processDirectory, sourceDir} from 'pxseedBuildScript/buildlib'
import {defaultHttpClient, getWWWRoot, kvStore} from 'partic2/jsutils1/webutils'
import {ArrayBufferConcat, ArrayWrap2, GenerateRandomString, assert, logger, requirejs} from 'partic2/jsutils1/base'
import { getNodeCompatApi, readJson, runCommand, writeJson } from 'pxseedBuildScript/util';

export let __name__=requirejs.getLocalRequireModule(require);

let log=logger.getLogger(__name__);

export async function getGitClientConfig(){
    const {fs}=await getNodeCompatApi()
    globalThis.Buffer=(await import('buffer')).Buffer
    async function request(c:{
        onProgress?:any
        url:string,
        method?:string,
        headers?:Record<string,string>,
        body?:string|Uint8Array|AsyncIterableIterator<Uint8Array>
        }) {
        c.method=c.method??'GET';
        c.headers=c.headers??{};
        if(typeof c.body==='object' && (Symbol.asyncIterator in c.body )){
            let bodyPart:{
                buffer: ArrayBuffer;
                byteLength: number;
                byteOffset: number;
            }[]=[];
            for await (let t1 of c.body){
                bodyPart.push(t1);
            }
            c.body=new Uint8Array(ArrayBufferConcat(bodyPart));
        }
        if(getWWWRoot().startsWith('http')){
            let wwwrootUrl=new URL(getWWWRoot());
            let targetUrl=new URL(c.url);
            c.url=wwwrootUrl.protocol+'//'+wwwrootUrl.host+'/corsBuster/'+encodeURIComponent(targetUrl.protocol+'//'+targetUrl.host)+targetUrl.pathname+targetUrl.search;
        }
        const res = await defaultHttpClient.fetch(c.url, { method:c.method,headers: c.headers, body:c.body })
        let body:any=res.body==null?null:function(stream:ReadableStream){
            const reader = stream.getReader()
            return {
                next() {
                return reader.read()
                },
                return() {
                reader.releaseLock()
                return {}
                },
                [Symbol.asyncIterator]() {
                return this
                },
            }
        }(res.body);
        
        // convert Header object to ordinary JSON
        let headers:Record<string,string> = {}
        res.headers.forEach((key,value)=>{
            headers[key] = value
        })
        return {
            url: res.url,
            method: c.method,
            statusCode: res.status,
            statusMessage: res.statusText,
            body,
            headers: headers,
        }
    };
    
    return {fs:{promises:fs},http:{request}}
}

async function copyFilesNewer(destDir:string,srcDir:string,ignore?:(name:string,path:string)=>boolean,maxDepth?:number){
    if(maxDepth==undefined){
        maxDepth=20;
    }
    if(maxDepth==0){
        return;
    }
    const {fs,path}=await getNodeCompatApi()
    fs.mkdir(destDir,{recursive:true});
    let children=await fs.readdir(srcDir,{withFileTypes:true});
    try{
        await fs.access(destDir)
    }catch(e){
        fs.mkdir(destDir,{recursive:true});
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


async function fetchCorePackages(){
    const {fs,path,wwwroot}=await getNodeCompatApi()
    let gitcache=path.join(wwwroot,__name__,'/corepkg-gitcache');
    let {listRemotes,pull}=await import('isomorphic-git');
    try{
        await fs.access(path.join(gitcache,'.git'));
        for(let t1 of await listRemotes({...await getGitClientConfig(),dir:gitcache})){
            try{
                await pull({...await getGitClientConfig(),dir:gitcache,author:{name:'anonymous',email:'anonymous'}});
                break;
            }catch(e:any){
                log.info(e.toString());
            }
        }
        return
    }catch(e){
    }
    let repoInfos=await getRepoInfoFromPkgName('partic2/CorePackages');
    let ok=false;
    for(let url of repoInfos.urls){
        try{
            await fetchGitPackageFromUrl(url,gitcache);
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
    const {fs,path,wwwroot}=await getNodeCompatApi()
    let gitcache=path.join(wwwroot,__name__,'/corepkg-gitcache');
    await fetchCorePackages();
    //copyFile to pxseed dir
    await copyFilesNewer(path.join(wwwroot,'..'),gitcache,(name)=>name=='.git');
}

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
    ['source','partic2','tjshelper']
];
let corePackFiles=[
    ['source','.gitignore'],
    ['source','tsconfig.base.json']
]

export async function CorePackagePublishHandler(moduleName:string){
    assert(moduleName=='partic2/packageManager');
    const {fs,path,wwwroot}=await getNodeCompatApi()
    let gitcache=path.join(wwwroot,__name__,'/corepkg-gitcache');
    await fetchCorePackages();
    
    let sourceDir=path.join(wwwroot,'..','source');
    for(let t1 of corePackDirs){
        await copyFilesNewer(path.join(gitcache,...t1),path.join(sourceDir,...t1))
    }
    for(let t1 of corePackFiles){
        await fs.copyFile(path.join(sourceDir,...t1),path.join(gitcache,...t1))
    }
}

export async function packPxseedForXplatj(){
    const {fs,path,wwwroot}=await getNodeCompatApi()
    let pxseedRoot=path.join(wwwroot,'..').replace(/\\/g,'/');
    let outputRoot=path.join(wwwroot,__name__,'pxseedPack4Xplatj').replace(/\\/g,'/');
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



let pkgdbName=__name__+'/pkgdb';

function getPMOptFromPcfg(config:PxseedConfig):PackageManagerOption|null{
    if(config.options && (__name__ in config.options)){
        return config.options[__name__];
    }else{
        return null;
    }
}

export async function fillNameDependOnPath(path2?:string){
    const {fs,path,wwwroot}=await getNodeCompatApi();
    let sourceDir=path.join(wwwroot,'..','source')
    path2=path2??sourceDir;
    let children=await fs.readdir(path2,{withFileTypes:true});
    if(children.find(v=>v.name=='pxseed.config.json')!=undefined){
        let result=await readJson(path.join(path2,'pxseed.config.json'));
        result.name=path2.substring(sourceDir.length+1).replace(/\\/g,'/');
        await fs.writeFile(path.join(path2,'pxseed.config.json'),new TextEncoder().encode(JSON.stringify(result,undefined,'  ')));
    }else{
        for(let ch of children){
            if(ch.isDirectory()){
                fillNameDependOnPath(path.join(path2,ch.name))
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
        return await repoCfg.repositories?.scope?.[scopeName]
    },
    setScopeRepo:async function(scopeName:string,repos:string[]){
        let repoCfg=await this.ensureRepoCfg();
        repoCfg.repositories!.scope![scopeName]=repos;
        let pkgdb=await kvStore(pkgdbName);
        await pkgdb.setItem('repo',repoCfg);
    }
}


export async function installLocalPackage(path2:string){
    const {fs,path,wwwroot}=await getNodeCompatApi();
    let pxseedConfig=await readJson(path.join(path2,"pxseed.config.json"));
    let pkgname=pxseedConfig.name as string;
    let destDir=await getSourceDirForPackage(pkgname);
    await fs.mkdir(destDir,{recursive:true});
    if(path2!=destDir){
        await copyFilesNewer(destDir,path2);
    }
    let pkgConfig=getPMOptFromPcfg(pxseedConfig);
    if(pkgConfig!=null){
        if(pkgConfig.repositories !=undefined){
            for(let scopeName in pkgConfig.repositories){
                let toMerge=pkgConfig.repositories![scopeName];
                assert(toMerge instanceof Array);
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

export async function fetchGitPackageFromUrl(url:string,fetchDir?:string){
    const {fs,path,wwwroot}=await getNodeCompatApi();
    let {clone}=await import('isomorphic-git');
    let tempdir=fetchDir??path.join(wwwroot,...__name__.split('/'),'..','__temp',GenerateRandomString());
    try{
        
        await fs.access(tempdir);
        await fs.rm(tempdir);
    }catch(e){
    };
    await fs.mkdir(tempdir,{recursive:true});
    await clone({...await getGitClientConfig(),dir:tempdir,url})
    return tempdir
}


export async function fetchPackageFromUrl(url:string){
    const {fs,path,wwwroot}=await getNodeCompatApi();
    if(url.startsWith('file://')){
        let filePath=url.substring(7);
        if(/[a-zA-Z]:/.test(wwwroot)){
            //windows path format
            filePath=filePath.substring(1)
        }
        return filePath;
    }else if(url.endsWith('.git')){
        return await fetchGitPackageFromUrl(url);
    }
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

export async function fetchPackage(name:string){
    const {fs,path,wwwroot}=await getNodeCompatApi();
    let info=await getRepoInfoFromPkgName(name);
    for(let t1 of info.urls){
        try{
            let repoLocalPath=await fetchPackageFromUrl(t1);
            if(repoLocalPath==undefined)continue;
            let path2=info.path;
            return path.join(repoLocalPath,...path2);
        }catch(e:any){
            log.debug(`fetchPackage from ${t1} failed. `+e.toString());
        }
    }
}

export async function uninstallPackage(pkgname:string){
    const {fs,path,wwwroot}=await getNodeCompatApi();
    await fs.rm(path.join(wwwroot,'..','source',...pkgname.split('/')),{recursive:true});
    let pkgdb=await kvStore(pkgdbName);
    await pkgdb.delete('pkg-'+pkgname);
}

export async function upgradeGitPackage(localPath:string){
    let git=await import('isomorphic-git');
    let gitClient=await getGitClientConfig();
    let dir=localPath
    let {fetchHead}=await git.fetch({...gitClient,dir});
    await git.merge({...gitClient,dir,theirs:fetchHead!,fastForwardOnly:true});
    //FIXME: git merge add current content into stage, which prevent checkout if force=false.
    await git.checkout({...gitClient,dir,force:true});
}

export async function upgradePackage(pkgname:string){
    const {fs,path,wwwroot}=await getNodeCompatApi();
    let pkgdir=path.join(path.join(wwwroot,'..','source'),...pkgname.split('/'));
    let pxseedConfig=await readJson(path.join(pkgdir,'pxseed.config.json')) as PxseedConfig;
    let pmopt=getPMOptFromPcfg(pxseedConfig);
    if(pmopt?.onUpgrade!=undefined){
        await (await import(pmopt.onUpgrade.module))[pmopt.onUpgrade.function](pkgname,pkgdir);
    }else{
        let upgradeMode='reinstall';
        try{
            await fs.access(path.join(pkgdir,'.git'));
            upgradeMode='git pull'
        }catch(e){};
        if(upgradeMode=='git pull'){
            await upgradeGitPackage(pkgdir);
        }else if(upgradeMode=='reinstall'){
            await uninstallPackage(pkgname);
            await installPackage(pkgname,{upgrade:false});
        }else{
            throw new Error('Unsupported upgrade mode '+upgradeMode)
        }
    }
}


export async function publishPackage(dir:string){
    const {fs,path,wwwroot}=await getNodeCompatApi();
    let children=await fs.readdir(dir,{withFileTypes:true});
    if(children.find(v=>v.name=='pxseed.config.json')!=undefined){
        let {add,commit,push,listRemotes,currentBranch}=await import('isomorphic-git');;
        let remotes=await listRemotes({...await getGitClientConfig(),dir})
        await add({...await getGitClientConfig(),dir,filepath:'.'})
        await commit({...await getGitClientConfig(),dir,message:'auto commit'})
        for(let t1 of remotes){
            let pushResult=await push({...await getGitClientConfig(),dir,remote:t1.remote});
            log.debug(JSON.stringify(pushResult));
        }
    }else{
        for(let t1 of children){
            if(t1.isDirectory()){
                publishPackage(path.join(dir,t1.name));
            }
        }
    }
}


export async function initGitRepo(dir:string){
    const {fs,path,wwwroot}=await getNodeCompatApi();
    let children=await fs.readdir(dir,{withFileTypes:true});
    if(children.find(v=>v.name=='.git')!=undefined){
        return;
    }
    if(children.find(v=>v.name=='pxseed.config.json')!=undefined){
        let config=await readJson(path.join(dir,'pxseed.config.json'))
        let name=config.name;
        let {init,addRemote}=await import('isomorphic-git');;
        await init({...await getGitClientConfig(),dir});
        await fs.writeFile(path.join(dir,'.gitignore'),new TextEncoder().encode('/.pxseed.status.json'));
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
            await addRemote({...await getGitClientConfig(),dir,remote:remoteName[t1],url:repoUrls[t1]});
        }
    }else{
        for(let t1 of children){
            if(t1.isDirectory()){
                await initGitRepo(path.join(dir,t1.name));
            }
        }
    }
}

export async function getSourceDirForPackage(pkgname:string){
    const {fs,path,wwwroot}=await getNodeCompatApi();
    return path.join(wwwroot,'..','source',...pkgname.split('/'))
}

export async function getPxseedConfigForPackage(pkgname:string):Promise<PxseedConfig | null>{
    const {fs,path,wwwroot}=await getNodeCompatApi();
    let configFile=path.join(await getSourceDirForPackage(pkgname),'pxseed.config.json');
    try{
        await fs.access(configFile);
        return await readJson(configFile) as PxseedConfig;
    }catch(e){
        return null;
    }
}

async function *listPackagesInternal(dir:string):AsyncGenerator<any>{
    const {fs,path,wwwroot}=await getNodeCompatApi();
    let children=await fs.readdir(dir,{withFileTypes:true});
    if(children.find(t1=>t1.name=='pxseed.config.json')){
        yield await readJson(path.join(dir,'pxseed.config.json'));
    }else{
        for(let t1 of children){
            if(t1.isDirectory()){
                yield *listPackagesInternal(path.join(dir,t1.name));
            }
        }
    }
}


export async function *listPackages():AsyncGenerator<PxseedConfig>{
    const {fs,path,wwwroot}=await getNodeCompatApi();
    yield *listPackagesInternal(path.join(wwwroot,'..','source'));
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

const defaultInstallOption={
    upgrade:true
}

export async function installPackage(source:string,opt?:Partial<typeof defaultInstallOption>){
    opt={...defaultInstallOption,...opt};
    const {fs,path,wwwroot}=await getNodeCompatApi();
    let installProcessed=false;
    let sourceDir=path.join(wwwroot,'..','source');
    if(source.indexOf(':')>=0){
        if(source.startsWith('npm:')){
            let packageJson=await readJson(path.join(path.dirname(sourceDir),'npmdeps','package.json')) as {
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
                const {runCommand}=await import('pxseedBuildScript/util')
                let returnCode=await runCommand(`npm i ${pkgName}`,{cwd:path.join(path.dirname(sourceDir),'npmdeps')})
                if(returnCode!==0)log.error('install npm package failed.');
                //Should we abort?
            }
            installProcessed=true;
        }else{
            let localPath=await fetchPackageFromUrl!(source);
            if(localPath!=undefined){
                await installLocalPackage!(localPath);
                installProcessed=true;
            }
        }
    }else{
        let existed=false;
        try{
            await fs.access(path.join(sourceDir,source));
            existed=true;
        }catch(e){
            existed=false;
        }
        if(existed){
            if(opt.upgrade){
                await upgradePackage(source)
                let localPath=path.join(sourceDir,source);
                await installLocalPackage!(localPath); 
            }
            installProcessed=true;
        }else{
            let localPath=await fetchPackage(source);
            if(localPath!=undefined){
                await installLocalPackage!(localPath);
                installProcessed=true;
            }
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
    await writeJson(path.join(pkgloc,'pxseed.config.json'),pxseedConfig);
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
    await initGitRepo(pkgloc);
}

export async function unloadPackageModules(pkg:string){
    for(let mid in await requirejs.getDefined()){
        if(mid.startsWith(pkg+'/')){
            requirejs.undef(mid);
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
                let localPath=await fetchPackage(pkg);
                assert(localPath!=null);
                await installLocalPackage(localPath!);
            }
        }catch(e:any){
            log.warning(`importPackagesInstallation install package ${pkg} failed.`+e.toString())
        };
    }
}