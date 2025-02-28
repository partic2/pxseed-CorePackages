import * as fs from 'fs/promises'
import {constants as fsConst} from 'fs'
import {dirname,sep,basename,join as pathJoin, relative} from 'path'
import { pxseedBuiltinLoader ,sourceDir,outputDir} from './loaders';
import { readJson, writeJson } from './util';

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
    console.log(`enter ${dir}`);
    let children=await fs.readdir(dir,{withFileTypes:true});
    let hasPxseedConfig=false;
    if(children.find(v=>v.name=='pxseed.config.json')){
        hasPxseedConfig=true;
        console.log('pxseed.config.json found');
    }
    if(!hasPxseedConfig){
        for(let child of children){
            if(child.isDirectory()){
                await processDirectory(pathJoin(dir,child.name));
            }
        }
    }else{
        let pxseedConfig=await readJson(pathJoin(dir,'pxseed.config.json')) as PxseedConfig;
        let pstat:PxseedStatus;
        if(children.find(v=>v.name=='.pxseed.status.json')){
            pstat=await readJson(pathJoin(dir,'.pxseed.status.json'));
            pstat={...makeDefaultStatus(),...pstat};
        }else{
            pstat={...makeDefaultStatus()}
        }
        let loaders=pxseedConfig.loaders;
        for(let loaderConfig of loaders){
            try{
                //Experimental.
                if(loaderConfig.name==='ensure'){
                    let packages=loaderConfig.packages as string[]|undefined;
                    if(packages!=undefined){
                        for(let p1 of packages){
                            await processDirectory(pathJoin(sourceDir,p1));
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
                await processDirectory(pathJoin(dir,t1));
            }
            //Don't save to file.
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
        await writeJson(pathJoin(dir,'.pxseed.status.json'),pstat);
    }
}


export async function cleanBuildStatus(dir:string){
    let children=await fs.readdir(dir,{withFileTypes:true});
    for(let t1 of children){
        if(t1.isDirectory()){
            await cleanBuildStatus(pathJoin(dir,t1.name))
        }else if(t1.name=='.pxseed.status.json'){
            await fs.rm(pathJoin(dir,t1.name));
        }
    }
}

export async function cleanJsFiles(dir:string){
    let children=await fs.readdir(dir,{withFileTypes:true});
    for(let t1 of children){
        if(t1.isDirectory() && !t1.isSymbolicLink()){
            await cleanJsFiles(pathJoin(dir,t1.name));
        }else if(t1.name.endsWith('.js') || t1.name.endsWith('.js.map')){
            await fs.rm(pathJoin(dir,t1.name))
        }
    }
    children=await fs.readdir(dir,{withFileTypes:true});
    try{
        if(children.length==0){
            await fs.rmdir(dir);
        }
    }catch(e){}
}
