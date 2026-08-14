
import { pxseedBuiltinLoader ,sourceDir,outputDir, inited} from './loaders';
import { getNodeCompatApi, __internal__ as utili,console, mutex, simpleGlob } from './util';

export {sourceDir,outputDir}



export interface PxseedConfig{
    name:string,
    loaders:{
        name:string,
        [k:string]:any
    }[],
    clean?:{
        include?:string[],
        excludeRegexp?:string[]
    }
    description?:string,
    extra?:{
        [handleModule:string]:any
    }
}


export interface PxseedStatus{
    lastBuildTime:number,
    lastSuccessBuildTime:number,
    lastBuildError:string[],
    currentBuildError:string[],
    subpackages:string[],
    loadersData:Record<string,any>,
    pxseedConfig:PxseedConfig
}

function makeDefaultStatus():Partial<PxseedStatus>{
    return {
        lastBuildTime:1,
        lastSuccessBuildTime:1,
        lastBuildError:[],
        currentBuildError:[],
        subpackages:[],
        loadersData:{}
    }
}

export async function getWWWLastBuildTime(){
    const {fs,path}=await getNodeCompatApi();
    let buildstatusFile=path.join(outputDir,'pxseedBuildScript','data','buildstatus.json');
    let status:any={};
    try{
        status=await utili.readJson(buildstatusFile);
    }catch(err){}
    return status.WWWLastBuildTime??0;
}
//Concurrent file issue if used in multi-thread.
export async function setWWWLastBuildTime(time?:number){
    const {fs,path}=await getNodeCompatApi();
    let buildstatusFile=path.join(outputDir,'pxseedBuildScript','data','buildstatus.json');
    let status:any={};
    try{
        status=await utili.readJson(buildstatusFile);
    }catch(err){}
    status.WWWLastBuildTime=time??new Date().getTime();
    await utili.writeJson(buildstatusFile,status);
}


export async function processDirectoryInRecursive(dir:string,context?:any){
    await inited;
    context=context??{};
    context._ensuredPackages=context._ensuredPackages??new Set<string>();
    let startTime=new Date().getTime();
    const {fs,path}=await getNodeCompatApi();
    console.info(`enter ${dir}`);
    let children=await fs.readdir(dir,{withFileTypes:true});
    let hasPxseedConfig=false;
    if(children.find(v=>v.name=='pxseed.config.json')){
        hasPxseedConfig=true;
        console.info('pxseed.config.json found');
    }
    if(!hasPxseedConfig){
        for(let child of children){
            if(child.isDirectory()){
                try{
                    await processDirectoryInRecursive(path.join(dir,child.name),context);
                }catch(err:any){
                    console.warn('recursive pxseed process failed.'+err.toString()+'\n'+err.stack)
                };
            }
        }
    }else{
        let pxseedConfig=await utili.readJson(path.join(dir,'pxseed.config.json')) as PxseedConfig;
        let pstat:PxseedStatus=makeDefaultStatus() as PxseedStatus;
        try{
            Object.assign(pstat,await utili.readJson(path.join(outputDir,...pxseedConfig.name.split('/'),'.pxseed.status.json')))
        }catch(err){}
        pstat.pxseedConfig=pxseedConfig;
        let loaders=pxseedConfig.loaders;
        for(let loaderConfig of loaders){
            try{
                if(loaderConfig.name==='ensure'){
                    let packages=loaderConfig.packages as string[]|undefined;
                    if(packages!=undefined){
                        for(let p1 of packages){
                            if(!context._ensuredPackages.has(p1)){
                                await processDirectoryInRecursive(path.join(sourceDir,p1),context);
                                context._ensuredPackages.add(p1);
                            }
                        }
                    }
                }else if(loaderConfig.name.startsWith('pxseedjs:')){
                    let pathname=new URL(loaderConfig.name).pathname;
                    let delim=pathname.lastIndexOf('.');
                    let moduleName=pathname.substring(0,delim);
                    let funcName=pathname.substring(delim+1);
                    try{
                        let mod=await import(moduleName);
                        await mod[funcName](dir,loaderConfig,pstat);
                    }catch(e:any){
                        pstat.currentBuildError.push(`Failed to load module with message ${e.toString()}`);
                        throw e;
                    };
                }else{
                    await pxseedBuiltinLoader[loaderConfig.name](dir,loaderConfig,pstat);
                }
            }catch(e){
                pstat.currentBuildError.push(`loader "${loaderConfig.name}" failed with error ${String(e)}`);
            }
        }
        if(pstat.subpackages.length>0){
            for(let t1 of pstat.subpackages){
                await processDirectoryInRecursive(path.join(dir,t1),context);
            }
            //Don't save ".subpackages" to file.
            pstat.subpackages=[];
        }
        pstat.lastBuildTime=startTime;
        pstat.lastBuildError=pstat.currentBuildError;
        if(pstat.lastBuildError.length==0){
            pstat.lastSuccessBuildTime=pstat.lastBuildTime;
        }else{
            console.info('build failed.')
            console.info(pstat.lastBuildError)
        }
        pstat.currentBuildError=[];
        await fs.mkdir(path.join(outputDir,...pxseedConfig.name.split('/')),{recursive:true});
        await utili.writeJson(path.join(outputDir,...pxseedConfig.name.split('/'),'.pxseed.status.json'),pstat);
    }
}

let buildmutex=new mutex();

export async function processDirectory(dir:string){
    await buildmutex.exec(async ()=>{
        try{
            await setWWWLastBuildTime();
        }finally{
            await processDirectoryInRecursive(dir);
        }
    });
}

export async function cleanPackage(pkgOutDir:string){
    await inited;
    const {fs,path}=await getNodeCompatApi();
    let statusJson=await utili.readJson(path.join(pkgOutDir,'.pxseed.status.json'));
    let pxseedConfig=statusJson.pxseedConfig;
    if(pxseedConfig!=undefined && pxseedConfig.clean!=undefined){
        let cleanConfig=pxseedConfig.clean;
        if(cleanConfig.include!=undefined){
            let excludeRegexp:RegExp[]=[];
            if(cleanConfig.excludeRegexp!=undefined){
                excludeRegexp=cleanConfig.excludeRegexp.map((v:string)=>new RegExp(v));
            }
            for(let t1 of await simpleGlob(cleanConfig.include,{cwd:pkgOutDir})){
                if(excludeRegexp.some((v:RegExp)=>v.test(t1))){continue;}
                await fs.rm(path.join(pkgOutDir,t1));
            }
        }
    }
}

export async function cleanBuildStatus(dir:string){
    await inited;
    const {fs,path}=await getNodeCompatApi();
    let children=await fs.readdir(dir,{withFileTypes:true});
    if(children.some(t1=>t1.name=='.pxseed.status.json')){
        try{
            await cleanPackage(dir);
            await fs.rm(path.join(dir,'.pxseed.status.json'));
        }catch(err){
            console.warn(err);
        }
    }else{
        for(let t1 of children){
            if(t1.isDirectory()){
                await cleanBuildStatus(path.join(dir,t1.name));
            }
        }
    }
}

