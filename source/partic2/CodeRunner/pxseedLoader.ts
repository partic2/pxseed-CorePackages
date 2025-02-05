
import path from 'path';
import { PxseedStatus } from 'pxseedBuildScript/buildlib'
import {sourceDir,outputDir} from 'pxseedBuildScript/loaders'
import {glob} from 'tinyglobby'
import fs from 'fs/promises'
import { addAwaitHook } from './CodeContext';

//Await hook
//pxseedjs:partic2/CodeRunner/pxseedLoader.addAwaitHookLoader
export async function addAwaitHookLoader(dir:string,cfg:{jsDir?:string},status:PxseedStatus){
    let tplVar={
        sourceRoot:sourceDir,outputRoot:outputDir,
        packageSource:dir,packageOutput:outputDir+'/'+dir.substring(sourceDir.length+1)
    }
    let jsDir=cfg.jsDir;
    function applyTemplate(source:string,tpl:Record<string,string>){
        let vars=Object.keys(tpl);
        let result=(new Function(...vars,'return `'+source+'`;'))(...vars.map(p=>tpl[p]))
        return result;
    }
    if(jsDir==undefined){
        jsDir=outputDir+'/'+dir.substring(sourceDir.length+1)
    }else{
        jsDir=applyTemplate(jsDir,tplVar) as string;
    }
    let jsFiles=await glob(['**/*.js'],{cwd:jsDir});
    for(let t1 of jsFiles){
        let fullPath=path.join(jsDir,t1);
        if((await fs.stat(fullPath)).mtimeMs>status.lastSuccessBuildTime){
            let sourceCode=new TextDecoder().decode(await fs.readFile(fullPath));
            let modified=addAwaitHook(sourceCode);
            await fs.writeFile(fullPath,new TextEncoder().encode(modified));
        }
    }
}