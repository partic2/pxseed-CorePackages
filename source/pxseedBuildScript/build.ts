import * as fs from 'fs/promises'
import {constants as fsConst} from 'fs'
import {dirname,sep,basename,join as pathJoin, relative} from 'path'
import { inited, pxseedBuiltinLoader } from './loaders';
import { processDirectory,cleanBuildStatus, sourceDir, outputDir } from './buildlib';
import {console} from './util'


;(async ()=>{
    await inited;
    let buildScriptAt=process.argv.indexOf('pxseedBuildScript/build');
    let command=process.argv[buildScriptAt+1]??'build'
    if(command=='build'){
        let buildDone=false;
        if(!buildDone){
            await processDirectory(sourceDir);
        }        
    }else if(command=='clean'){
        await cleanBuildStatus(outputDir);
    }else{
        console.error(`unknown command ${command}`)
    }
    
})();