import { getNodeCompatApi ,__internal__ as utilsi} from 'pxseedBuildScript/util';
import { ArrayBufferConcat, ArrayWrap2, GenerateRandomString, logger, requirejs } from 'partic2/jsutils1/base';
import { defaultHttpClient, getWWWRoot } from 'partic2/jsutils1/webutils';
import { Singleton } from 'partic2/CodeRunner/jsutils2';



let __name__=requirejs.getLocalRequireModule(require);
let log=logger.getLogger(__name__)

export let defaultGitClient=new Singleton(async ()=>{
    const {fs}=await getNodeCompatApi()
    globalThis.Buffer=(await import('buffer')).Buffer
    async function request(c:{
        onProgress?:any
        url:string,
        method?:string,
        headers?:Record<string,string>,
        body?:string|Uint8Array|AsyncIterableIterator<Uint8Array<ArrayBuffer>>
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
})

async function fetchGitPackageFromUrl(url:string,fetchDir?:string){
    const {fs,path,wwwroot}=await getNodeCompatApi();
    let {clone}=await import('isomorphic-git');
    let tempdir=fetchDir??path.join(wwwroot,...__name__.split('/'),'..','__temp',GenerateRandomString());
    try{
        await fs.access(tempdir);
        await fs.rm(tempdir,{recursive:true});
    }catch(e){
    };
    await fs.mkdir(tempdir,{recursive:true});
    await clone({...await defaultGitClient.get(),dir:tempdir,url,depth:1});
    return tempdir
}



async function fetchPackageFromUrl(url:string){
    const {fs,path,wwwroot}=await getNodeCompatApi();
    if(url.startsWith('pxseedjs:')){
        let url1=new URL(url);
        let pxseedjspath=url1.pathname;
        let t1=pxseedjspath.lastIndexOf('.');
        let moduleName=pxseedjspath.substring(0,t1);
        let functionName=pxseedjspath.substring(t1+1);
        return await (await import(moduleName))[functionName](url) as string;
    }if(url.startsWith('file://')){
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


async function publishPackage(dir:string){
    const {fs,path,wwwroot}=await getNodeCompatApi();
    let children=await fs.readdir(dir,{withFileTypes:true});
    if(children.find(v=>v.name=='pxseed.config.json')!=undefined){
        let {add,commit,push,listRemotes,currentBranch}=await import('isomorphic-git');;
        let remotes=await listRemotes({...await defaultGitClient.get(),dir})
        await add({...await defaultGitClient.get(),dir,filepath:'.'})
        await commit({...await defaultGitClient.get(),dir,message:'auto commit'})
        for(let t1 of remotes){
            let pushResult=await push({...await defaultGitClient.get(),dir,remote:t1.remote});
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

export async function initGitPackage(dir:string){
    const {fs,path,wwwroot}=await getNodeCompatApi();
    let {getRepoInfoFromPkgName} = await import('./registry')
    let children=await fs.readdir(dir,{withFileTypes:true});
    if(children.find(v=>v.name=='.git')!=undefined){
        return;
    }
    if(children.find(v=>v.name=='pxseed.config.json')!=undefined){
        let config=await utilsi.readJson(path.join(dir,'pxseed.config.json'))
        let name=config.name;
        let {init,addRemote}=await import('isomorphic-git');;
        await init({...await defaultGitClient.get(),dir});
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
            await addRemote({...await defaultGitClient.get(),dir,remote:remoteName[t1],url:repoUrls[t1]});
        }
    }
}

async function upgradeGitPackage(localPath:string){
    let git=await import('isomorphic-git');
    let gitClient=await defaultGitClient.get();
    let dir=localPath
    let {fetchHead}=await git.fetch({...gitClient,dir});
    await git.merge({...gitClient,dir,theirs:fetchHead!,fastForwardOnly:true});
    //FIXME: git merge add current content into stage, which prevent checkout if force=false.
    await git.checkout({...gitClient,dir,force:true});
}


export async function fetchPackage(nameOrUrl:string){
    const {fs,path,wwwroot}=await getNodeCompatApi();
    let tryResult=new Array<{source:string,error:Error}>();
    if(nameOrUrl.includes(':')){
        try{
            let localPath=await fetchPackageFromUrl(nameOrUrl);
            if(localPath!=undefined){
                return {localPath};
            }
        }catch(err:any){
            tryResult.push(err);
        }
    }else{
        let {getRepoInfoFromPkgName}=await import('./registry');
        let info=await getRepoInfoFromPkgName(nameOrUrl);
        for(let t1 of info.urls){
            try{
                let repoLocalPath=await fetchPackageFromUrl(t1);
                if(repoLocalPath==undefined)continue;
                let path2=info.path;
                return {localPath:path.join(repoLocalPath,...path2)};
            }catch(err:any){
                tryResult.push(err);
            }
        }
    }
    let err=new Error('Failed to fetch package.');
    (err as any).tryResult=tryResult;
    throw err;
}

export let __internal__={
    initGitPackage,upgradeGitPackage,fetchGitPackageFromUrl,publishPackage
}