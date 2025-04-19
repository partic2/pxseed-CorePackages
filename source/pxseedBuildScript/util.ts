
import {spawn} from 'child_process'
import{dirname,join as pathJoin} from 'path'
import {readFile, writeFile} from 'fs/promises'

export let buildScriptPath=pathJoin(dirname(__dirname),'script','buildAll.js')


export async function runCommand(cmd:string,opt?:{cwd?:string}){
    let runOpt=opt??{};
    let process=spawn(cmd,{shell:true,stdio:'inherit',...runOpt});
    return new Promise<number|null>((resolve=>{
        process.on('close',()=>resolve(process.exitCode));
    }))
}

export async function readJson(path:string){
    return JSON.parse(new TextDecoder().decode(await readFile(path)));
}


export async function writeJson(path:string,obj:any){
    await writeFile(path,new TextEncoder().encode(JSON.stringify(obj,undefined,2)));
}

export async function runBuild(){
    await runCommand('node '+buildScriptPath)
}
