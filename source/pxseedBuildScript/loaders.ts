import * as fs from 'fs/promises'
import {spawn} from 'child_process'
import {constants} from 'fs'
import {dirname,sep,basename,join as pathJoin, relative} from 'path'
import {glob} from 'tinyglobby'
import { readJson, runCommand } from './util'
import {processDirectory, type PxseedStatus} from './buildlib'

let sourceDir=pathJoin(dirname(dirname(__dirname)),'source');
let outputDir=pathJoin(dirname(dirname(__dirname)),'www')



export let pxseedBuiltinLoader={
    copyFiles:async function(dir:string,config:{include:string[],outDir?:string}){
        let outDir=config.outDir??dir.substring(sourceDir.length+1);
        outDir=pathJoin(outputDir,outDir);
        for(let subpath of await glob(config.include,{cwd:dir})){
            let dest=pathJoin(outDir,subpath);
            let src=pathJoin(dir,subpath);
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
                try{
                    await fs.mkdir(dirname(dest),{recursive:true});
                }catch(e){};
                await fs.copyFile(src,dest);
            }
        }
    },
    typescript:async function(dir:string,config:{include?:string[],exclude?:string[]},status:PxseedStatus){
        let tscPath=pathJoin(outputDir,'node_modules','typescript','bin','tsc');
        let sourceRootPath=dir.substring(sourceDir.length+1).split(sep).map(v=>'..').join('/');
        let include=config.include??["./**/*.ts","./**/*.tsx"];
        let files=await glob(include,{cwd:dir});
        let latestMtime=0;
        for(let t1 of files){
            let fileInfo=await fs.stat(pathJoin(dir,t1));
            let mtime=fileInfo.mtime.getTime();
            if(mtime>latestMtime)latestMtime=mtime;
        }
        if(status.lastSuccessBuildTime>latestMtime){
            console.info('typescript loader: No file modified since last build, skiped.')
            return;
        }
        let tsconfig={
            "compilerOptions": {
              "paths": {
                "*":[`${sourceRootPath}/*`,`${sourceRootPath}/../www/node_modules/*`]
              },
            },
            "extends":`${sourceRootPath}/tsconfig.base.json`,
            "include": include
        } as any;
        if(config.exclude!=undefined){
            tsconfig.exclude=config.exclude
        }
        await fs.writeFile(pathJoin(dir,'tsconfig.json'),new TextEncoder().encode(JSON.stringify(tsconfig)));
        let returnCode=await runCommand(`node ${tscPath} -p ${dir}`)
        if(returnCode!==0)status.currentBuildError.push('tsc failed.');
    },
    rollup:async function(dir:string,config:{entryModules:string[]}){
        let rollup=(await import('rollup')).rollup;
        let nodeResolve =(await import('@rollup/plugin-node-resolve')).default;
        let commonjs =(await import('@rollup/plugin-commonjs')).default;
        let json =(await import('@rollup/plugin-json')).default;
        let terser =(await import('@rollup/plugin-terser')).default;
        for(let mod of config.entryModules){
            let existed=false;
            try{
                await fs.access(pathJoin(outputDir,mod+'.js'),constants.R_OK);
                existed=true;
            }catch(e){
                existed=false
            }
            if(!existed){
                let task=await rollup({
                    input:[mod],
                    plugins:[nodeResolve({modulePaths:[pathJoin(outputDir,'node_modules')],browser:true}),commonjs(),json(),terser()],
                });
                await task.write({
                    file:pathJoin(outputDir,mod+'.js'),
                    format: 'amd'
                });
            }
        }
    },
    subpackage:async function(dir:string,config:{packages:string[]},status:PxseedStatus){
        status.subpackages.push(...config.packages);
    }
} as {[name:string]:(dir:string,config:any,status:PxseedStatus)=>Promise<void>}

