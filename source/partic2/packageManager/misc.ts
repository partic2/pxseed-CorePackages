
import {dirname,join as pathJoin} from 'path'
import {readdir,rm, rmdir} from 'fs/promises'
import { logger } from 'partic2/jsutils1/base';


export let __name__='partic2/packageManager/misc';

let log=logger.getLogger(__name__);

let wwwDir=pathJoin(dirname(dirname(dirname(__dirname))),'www');
let sourceDir=pathJoin(dirname(dirname(dirname(__dirname))),'source');

export async function cleanWWW(dir?:string){
    //clean .js .d.ts .tsbuildinfo .js.map and empty directory
    dir=dir??wwwDir;
    let children=await readdir(dir,{withFileTypes:true});
    let emptyDir=true;
    for(let t1 of children){
        if(t1.name.endsWith('.js') || t1.name.endsWith('.d.ts') || t1.name.endsWith('.tsbuildinfo') || t1.name.endsWith('.js.map')){
            log.debug(`delete ${pathJoin(dir,t1.name)}`)
            await rm(pathJoin(dir,t1.name))
        }else if(t1.isDirectory()){
            let r1=await cleanWWW(pathJoin(dir,t1.name));
            if(r1.emptyDir){
                log.debug(`delete ${pathJoin(dir,t1.name)}`)
                await rmdir(pathJoin(dir,t1.name))
            }else{
                emptyDir=false;
            }
        }else{
            emptyDir=false;
        }
    }
    return {emptyDir};
}