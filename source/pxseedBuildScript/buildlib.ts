
import { pxseedBuiltinLoader ,sourceDir,outputDir, inited} from './loaders';
import { getNodeCompatApi, __internal__ as utili,console } from './util';

export {sourceDir,outputDir}

export interface PxseedStatus{
    lastBuildTime:number,
    lastSuccessBuildTime:number,
    lastBuildError:string[],
    currentBuildError:string[],
    subpackages:string[]
}
let PxseedStatusDefault:PxseedStatus={
    lastBuildTime:1,
    lastSuccessBuildTime:1,
    lastBuildError:[],
    currentBuildError:[],
    subpackages:[]
}


export interface PxseedConfig{
    name:string,
    loaders:{
        name:string,
        [k:string]:any
    }[],
    description?:string,
    options?:{
        [handleModule:string]:any
    }
}

declare var requirejs:any

function makeDefaultStatus():PxseedStatus{
    return {...PxseedStatusDefault,lastBuildError:[],currentBuildError:[],subpackages:[]}
}



export async function processDirectory(dir:string){
    await inited;
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
                    await processDirectory(path.join(dir,child.name));
                }catch(err:any){
                    console.warn('recursive pxseed process failed.'+err.toString()+'\n'+err.stack)
                };
            }
        }
    }else{
        let pxseedConfig=await utili.readJson(path.join(dir,'pxseed.config.json')) as PxseedConfig;
        let pstat:PxseedStatus={...makeDefaultStatus()};
        try{
            if(children.find(v=>v.name=='.pxseed.status.json')){
                Object.assign(pstat,await utili.readJson(path.join(dir,'.pxseed.status.json')))
            }
        }catch(err){}
        let loaders=pxseedConfig.loaders;
        for(let loaderConfig of loaders){
            try{
                //Experimental.
                if(loaderConfig.name==='ensure'){
                    let packages=loaderConfig.packages as string[]|undefined;
                    if(packages!=undefined){
                        for(let p1 of packages){
                            await processDirectory(path.join(sourceDir,p1));
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
                await processDirectory(path.join(dir,t1));
            }
            //Don't save ".subpackages" to file.
            pstat.subpackages=[];
        }
        pstat.lastBuildTime=new Date().getTime();
        pstat.lastBuildError=pstat.currentBuildError;
        if(pstat.lastBuildError.length==0){
            pstat.lastSuccessBuildTime=pstat.lastBuildTime;
        }else{
            console.info('build failed.')
            console.info(pstat.lastBuildError)
        }
        pstat.currentBuildError=[];
        await utili.writeJson(path.join(dir,'.pxseed.status.json'),pstat);
    }
}


export async function cleanBuildStatus(dir:string){
    await inited;
    const {fs,path}=await getNodeCompatApi();
    let children=await fs.readdir(dir,{withFileTypes:true});
    for(let t1 of children){
        if(t1.isDirectory()){
            await cleanBuildStatus(path.join(dir,t1.name))
        }else if(t1.name=='.pxseed.status.json'){
            await fs.rm(path.join(dir,t1.name));
        }
    }
}

export async function cleanJsFiles(dir:string){
    await inited;
    const {fs,path}=await getNodeCompatApi();
    let children=await fs.readdir(dir,{withFileTypes:true});
    for(let t1 of children){
        if(t1.isDirectory() && !t1.isSymbolicLink()){
            await cleanJsFiles(path.join(dir,t1.name));
        }else if(t1.name.endsWith('.js') || t1.name.endsWith('.js.map')){
            await fs.rm(path.join(dir,t1.name))
        }
    }
    children=await fs.readdir(dir,{withFileTypes:true});
    try{
        if(children.length==0){
            await fs.rmdir(dir);
        }
    }catch(e){}
}
