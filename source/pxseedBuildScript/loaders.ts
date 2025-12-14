

import { simpleGlob, getNodeCompatApi,__internal__ as utilsi,console } from './util'
import {type PxseedStatus} from './buildlib'



export let sourceDir=''
export let outputDir=''

export let inited=(async ()=>{
    const {path,wwwroot}=await getNodeCompatApi();
    sourceDir=path.join(wwwroot,'..','source');
    outputDir=wwwroot;
})();

export let pxseedBuiltinLoader={
    copyFiles:async function(dir:string,config:{include:string[],outDir?:string}){
        const {fs,path}=await getNodeCompatApi();
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
        for(let subpath of await simpleGlob(include,{cwd:dir})){
            let dest=path.join(outDir,subpath);
            let src=path.join(dir,subpath);
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
                    await fs.mkdir(path.join(dest,'..'),{recursive:true});
                }catch(e){};
                await fs.copyFile(src,dest);
            }
        }
    },
    typescript:async function(dir:string,config:{include?:string[],exclude?:string[],transpileOnly?:boolean},status:PxseedStatus){
        const {fs,path}=await getNodeCompatApi();
        let ts:typeof import('typescript')
        if(globalThis?.process?.versions?.node==undefined){
            //use non node typescript
            if(!config.transpileOnly){
                console.info('force use transpileOnly on non-node platform');
                config.transpileOnly=true;
            }
            const {getTypescriptModuleTjs}=await import('partic2/packageManager/nodecompat');
            ts=await getTypescriptModuleTjs();
            ts=(ts as any).default??ts
        }else{
            ts=await import('typescript');
            ts=(ts as any).default??ts
        }
        if(config.transpileOnly===true){
            let include=config.include??["./**/*.ts","./**/*.tsx"];
            let files=await simpleGlob(include,{cwd:dir});
            for(let t1 of files){
                let filePath=path.join(dir,t1)
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
                    let outputPath=path.join(outputDir,dir.substring(sourceDir.length+1).replace(/\\/g,'/'),t1.replace(/.tsx?$/,'.js'));
                    await fs.mkdir(path.join(outputPath,'..'),{recursive:true});
                    await fs.writeFile(outputPath,new TextEncoder().encode(transpiled));
                }
            }
        }else{
            let tscPath=path.join(outputDir,'..','npmdeps','node_modules','typescript','bin','tsc');
            let sourceRootPath=dir.substring(sourceDir.length+1).split(/[\\/]/).map(v=>'..').join('/');
            let include=config.include??["./**/*.ts","./**/*.tsx"];
            try{
                await fs.access(path.join(dir,'tsconfig.json'));
            }catch(err:any){
                if(err.code=='ENOENT'){
                    let tsconfig={
                        "compilerOptions": {
                        "paths": {
                            "*":[`${sourceRootPath}/*`,`${sourceRootPath}/../npmdeps/node_modules/*`]
                        },
                        },
                        "extends":`${sourceRootPath}/tsconfig.base.json`,
                        "include": include
                    } as any;
                    if(config.exclude!=undefined){
                        tsconfig.exclude=config.exclude
                    }
                    await fs.writeFile(path.join(dir,'tsconfig.json'),new TextEncoder().encode(JSON.stringify(tsconfig)));
                }else{
                    throw err;
                }
            }
            let files=await simpleGlob(include,{cwd:dir});
            let latestMtime=0;
            for(let t1 of files){
                let fileInfo=await fs.stat(path.join(dir,t1));
                let mtime=fileInfo.mtime.getTime();
                if(mtime>latestMtime)latestMtime=mtime;
            }
            if(status.lastSuccessBuildTime>latestMtime){
                console.info('typescript loader: No file modified since last build, skiped.')
                return;
            }
            let returnCode=await utilsi.runCommand(`node ${tscPath} -p ${dir}`)
            if(returnCode!==0)status.currentBuildError.push('tsc failed.');
        }
    },
    rollup:async function(dir:string,config:{entryModules:string[],compressed?:boolean}){
        const {fs,path}=await getNodeCompatApi();
        if(globalThis?.process?.versions?.node==undefined){
            //TODO: use cdn https://cdnjs.cloudflare.com/ and wrap amd custom?
            console.info('rollup are not supported yet on non-node platform');
        }
        for(let i1=0;i1<config.entryModules.length && i1<0xffff;i1++){
            let mod=config.entryModules[i1];
            let existed=false;
            try{
                await fs.access(path.join(outputDir,mod+'.js'));
                existed=true;
            }catch(e){
                existed=false
            }
            if(!existed){
                let rollup=(await import('rollup')).rollup;
                let nodeResolve =(await import('@rollup/plugin-node-resolve')).default;
                let commonjs =(await import('@rollup/plugin-commonjs')).default;
                let json =(await import('@rollup/plugin-json')).default;
                let terser =(await import('@rollup/plugin-terser')).default;
                let replacer=(await import('@rollup/plugin-replace')).default;
                console.info(`create bundle for ${mod}`);
                let plugins=[
                    nodeResolve({modulePaths:[path.join(outputDir,'..','npmdeps','node_modules')],browser:true,preferBuiltins:false}),
                    commonjs(),
                    json(),
                    //Slow the rollup, But some library need this.
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
                        // TODO:How to handle builtin node module?
                        /*
                        if((globalThis as any).requirejs.__nodeenv.require.resolve.paths(source)==null){
                            return true;
                        }
                        */
                        if(source!=mod && config.entryModules.includes(source)){
                            return true;
                        }
                        return false;
                    }
                });
                await task.write({
                    file:path.join(outputDir,mod+'.js'),
                    format: 'amd'
                });
            }
        }
    },
    subpackage:async function(dir:string,config:{packages:string[]},status:PxseedStatus){
        status.subpackages.push(...config.packages);
    }
} as {[name:string]:(dir:string,config:any,status:PxseedStatus)=>Promise<void>}

