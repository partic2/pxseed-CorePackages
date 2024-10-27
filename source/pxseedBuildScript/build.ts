import * as fs from 'fs/promises'
import {constants as fsConst} from 'fs'
import {dirname,sep,basename,join as pathJoin, relative} from 'path'
import { pxseedBuiltinLoader } from './loaders';
import { processDirectory,cleanBuildStatus } from './buildlib';

let sourceDir=pathJoin(dirname(dirname(__dirname)),'source');
let outputDir=pathJoin(dirname(dirname(__dirname)),'www')


;(async ()=>{
    let buildScriptAt=process.argv.indexOf('pxseedBuildScript/build');
    let command=process.argv[buildScriptAt+1]??'build'
    if(command=='build'){
        let buildDone=false;
        try{
            await fs.access(pathJoin(sourceDir,'pxseed.build-hint.json'),fsConst.R_OK);
            let buildHint=JSON.parse(new TextDecoder().decode(await fs.readFile(pathJoin(sourceDir,'pxseed.build-hint.json'))));
            if('use' in buildHint){
                buildHint=buildHint.profiles[buildHint.use];
            }
            if(buildHint.includeDir && buildHint.includeDir.indexOf('*')<0){
                console.log('only process directory in buildHint.includeDir',buildHint.includeDir)
                for(let subdir of buildHint.includeDir){
                    await processDirectory(pathJoin(sourceDir,subdir));
                }
                buildDone=true;
            }
        }catch(e:any){
            if(e.toString().indexOf('no such file or directory')<0){
                console.warn(e);
            }
        };
        if(!buildDone){
            await processDirectory(sourceDir);
        }
    }else if(command=='clean'){
        await cleanBuildStatus(sourceDir)
    }else{
        console.error(`unknown command ${command}`)
    }
    
})();