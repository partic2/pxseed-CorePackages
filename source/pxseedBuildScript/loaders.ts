

import { simpleGlob, getNodeCompatApi,__internal__ as utilsi,console } from './util'
import {type PxseedStatus} from './buildlib'
import type {CompilerOptions} from 'typescript'


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
    typescript:async function(dir:string,config:{include?:string[],createTsConfig?:boolean},status:PxseedStatus){
        const {fs,path}=await getNodeCompatApi();
        let ts:typeof import('typescript')

        const {getTypescriptModuleTjs}=await import('partic2/packageManager/nodecompat');
        ts=await getTypescriptModuleTjs();
        ts=(ts as any).default??ts
        
        let include=config.include??["./**/*.ts","./**/*.tsx"];
        let files=await simpleGlob(include,{cwd:dir});
        for(let t1 of files){
            try{
                if(t1.endsWith('.d.ts')||t1.endsWith('.d.tsx'))continue;
                let filePath=path.join(dir,t1)
                let fileInfo=await fs.stat(filePath);
                let mtime=fileInfo.mtime.getTime();
                let moduleName=dir.substring(sourceDir.length+1).replace(/\\/g,'/')+'/'+t1.replace(/.tsx?$/,'')
                moduleName=moduleName.replace(/\/\/+/g,'/')
                let baseCompileOption:CompilerOptions={target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.AMD,esModuleInterop:false,moduleResolution:ts.ModuleResolutionKind.Node10}
                if(mtime>status.lastSuccessBuildTime){
                    console.info('typescript transpile '+t1);
                    let transpiled='';
                    if(t1.endsWith('.ts')){
                        transpiled=ts.transpile(
                            new TextDecoder().decode(await fs.readFile(filePath)),
                            {...baseCompileOption},
                            filePath,
                            [],
                            moduleName
                        );
                    }else if(t1.endsWith('.tsx')){
                        transpiled=ts.transpile(
                            new TextDecoder().decode(await fs.readFile(filePath)),
                            {...baseCompileOption,jsx:ts.JsxEmit.React},
                            filePath,
                            [],
                            moduleName
                        );
                    }
                    let outputPath=path.join(outputDir,dir.substring(sourceDir.length+1).replace(/\\/g,'/'),t1.replace(/.tsx?$/,'.js'));
                    await fs.mkdir(path.join(outputPath,'..'),{recursive:true});
                    await fs.writeFile(outputPath,new TextEncoder().encode(transpiled));
                }
            }catch(err:any){
                status.currentBuildError.push('typescript transpile error:file:'+t1+' message:'+err.toString());
            }
        }
        if(config.createTsConfig??true){
            try{
                await fs.access(path.join(dir,'tsconfig.json'));
            }catch(err:any){
                let sourceRootPath=dir.substring(sourceDir.length+1).split(/[\\/]/).map(v=>'..').join('/');
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
                    await fs.writeFile(path.join(dir,'tsconfig.json'),new TextEncoder().encode(JSON.stringify(tsconfig)));
                }else{
                    throw err;
                }
            }
        }
    },
    subpackage:async function(dir:string,config:{packages:string[]},status:PxseedStatus){
        status.subpackages.push(...config.packages);
    }
} as {[name:string]:(dir:string,config:any,status:PxseedStatus)=>Promise<void>}

