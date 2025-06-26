import * as fs from 'fs/promises'
import {constants} from 'fs'
import {dirname,sep,basename,join as pathJoin, relative} from 'path'
import {glob} from 'tinyglobby'
import { readJson, runCommand } from './util'
import {type PxseedStatus} from './buildlib'



export let sourceDir=pathJoin(dirname(dirname(__dirname)),'source');
export let outputDir=pathJoin(dirname(dirname(__dirname)),'www')

export let pxseedBuiltinLoader={
    copyFiles:async function(dir:string,config:{include:string[],outDir?:string}){
        let tplVar={
            sourceRoot:sourceDir,outputRoot:outputDir,
            packageSource:dir,packageOutput:outputDir+'/'+dir.substring(sourceDir.length+1)
        }
        function applyTemplate(source:string,tpl:Record<string,string>){
            let vars=Object.keys(tpl);
            let result=(new Function(...vars,'return `'+source+'`;'))(...vars.map(p=>tpl[p]))
            return result;
        }
        let outDir=config.outDir??'${packageOutput}';
        outDir=applyTemplate(outDir,tplVar);
        let include:string[]=[]
        for(let t1 of config.include){
            include.push(applyTemplate(t1,tplVar));
        }
        for(let subpath of await glob(include,{cwd:dir})){
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
    typescript:async function(dir:string,config:{include?:string[],exclude?:string[],transpileOnly?:boolean},status:PxseedStatus){
        if(config.transpileOnly===true){
            let ts=(await import('typescript'));
            ts=(ts.default??ts) as any;
            let include=config.include??["./**/*.ts","./**/*.tsx"];
            let files=await glob(include,{cwd:dir});
            for(let t1 of files){
                let filePath=pathJoin(dir,t1)
                let fileInfo=await fs.stat(filePath);
                let mtime=fileInfo.mtime.getTime();
                let moduleName=dir.substring(sourceDir.length+1).replace(/\\/g,'/')+'/'+t1.replace(/.tsx?$/,'')
                moduleName=moduleName.replace(/\/\/+/g,'/')
                if(mtime>status.lastBuildTime){
                    console.info('typescript transpile '+t1);
                    let transpiled='';
                    if(t1.endsWith('.ts')){
                        transpiled=ts.transpile(
                            new TextDecoder().decode(await fs.readFile(filePath)),
                            {target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.AMD,esModuleInterop:false},
                            filePath,
                            [],
                            moduleName
                        );
                    }else if(t1.endsWith('.tsx')){
                        transpiled=ts.transpile(
                            new TextDecoder().decode(await fs.readFile(filePath)),
                            {target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.AMD,esModuleInterop:false,jsx:ts.JsxEmit.React},
                            filePath,
                            [],
                            moduleName
                        );
                    }
                    let outputPath=pathJoin(outputDir,dir.substring(sourceDir.length+1).replace(/\\/g,'/'),t1.replace(/.tsx?$/,'.js'));
                    await fs.mkdir(dirname(outputPath),{recursive:true});
                    await fs.writeFile(outputPath,new TextEncoder().encode(transpiled));
                }
            }
        }else{
            let tscPath=pathJoin(outputDir,'node_modules','typescript','bin','tsc');
            let sourceRootPath=dir.substring(sourceDir.length+1).split(sep).map(v=>'..').join('/');
            let include=config.include??["./**/*.ts","./**/*.tsx"];
            try{
                await fs.access(pathJoin(dir,'tsconfig.json'));
            }catch(err:any){
                if(err.code=='ENOENT'){
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
                }else{
                    throw err;
                }
            }
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
            let returnCode=await runCommand(`node ${tscPath} -p ${dir}`)
            if(returnCode!==0)status.currentBuildError.push('tsc failed.');
        }
    },
    rollup:async function(dir:string,config:{entryModules:string[],compressed?:boolean}){
        let rollup=(await import('rollup')).rollup;
        let nodeResolve =(await import('@rollup/plugin-node-resolve')).default;
        let commonjs =(await import('@rollup/plugin-commonjs')).default;
        let json =(await import('@rollup/plugin-json')).default;
        let terser =(await import('@rollup/plugin-terser')).default;
        let replacer=(await import('@rollup/plugin-replace')).default
        for(let i1=0;i1<config.entryModules.length && i1<0xffff;i1++){
            let mod=config.entryModules[i1];
            let existed=false;
            try{
                await fs.access(pathJoin(outputDir,mod+'.js'),constants.R_OK);
                existed=true;
            }catch(e){
                existed=false
            }
            if(!existed){
                console.info(`create bundle for ${mod}`);
                let plugins=[
                    nodeResolve({modulePaths:[pathJoin(outputDir,'node_modules')],browser:true}),
                    commonjs(),
                    json(),
                    //Slow the rollup, But "React" need this.
                    replacer({
                        'process.env.NODE_ENV': JSON.stringify('production')
                    })
                ];
                if(config.compressed!==false){
                    plugins.push(terser());
                }
                let task=await rollup({
                    input:[mod],
                    plugins,
                    external:(source: string, importer: string | undefined, isResolved: boolean):boolean|null => {
                        if((globalThis as any).requirejs.__nodeenv.require.resolve.paths(source)==null){
                            return true;
                        }else if(source.endsWith('/')){
                            //Some import like 'process/', Don't make it external.
                            return false;
                        }else if(source!=mod && config.entryModules.includes(source)){
                            return true;
                        }
                        return false;
                    }
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

