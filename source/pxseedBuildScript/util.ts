
export async function getNodeCompatApi(){
    const fs:typeof import('fs/promises')=await import('fs/promises');
    const {join:pathJoin}=await import('path');
    return {fs,pathJoin};
}


export async function runCommand(cmd:string,opt?:{cwd?:string}){
    const {spawn}=await import('child_process');
    let runOpt=opt??{};
    let process=spawn(cmd,{shell:true,stdio:'inherit',...runOpt});
    return new Promise<number|null>((resolve=>{
        process.on('close',()=>resolve(process.exitCode));
    }))
}

export async function readJson(path:string){
    const {readFile, writeFile}=await import('fs/promises');
    return JSON.parse(new TextDecoder().decode(await readFile(path)));
}


export async function writeJson(path:string,obj:any){
    const {readFile, writeFile}=await import('fs/promises');
    await writeFile(path,new TextEncoder().encode(JSON.stringify(obj,undefined,2)));
}

export async function runBuild(){
    const {dirname,join:pathJoin} =await import('path');
    let buildScriptPath=pathJoin(dirname(__dirname),'script','buildAll.js')
    await runCommand('node '+buildScriptPath)
}

async function *iterPath(cwd:string,path:string):AsyncGenerator<string>{
    const {readdir}=await import('fs/promises');
    const {join:pathJoin} =await import('path');
    for(let child of await readdir(pathJoin(cwd,path),{withFileTypes:true})){
        if(child.isDirectory()){
            yield* iterPath(cwd,pathJoin(path,child.name));
        }else{
            const p=pathJoin(path,child.name);
            yield p;
        }
    }
}

export async function simpleGlob(include:string[],opt:{cwd:string}){
    let matchRegexps:Array<Array<RegExp|'**'>>=[];
    for(let t1 of include){
        let pathPart=t1.split(/[\\/]/);
        let pathPartReg:Array<RegExp|'**'>=[];
        for(let t2 of pathPart){
            if(t2=='.')continue;
            if(t2=='..'){
                if(pathPartReg.length==0){
                    throw new Error('simple glob do not support ".." on the top level.');
                }
                pathPartReg.pop();
            }else if(t2=='**'){
                pathPartReg.push('**');
            }else{
                pathPartReg.push(new RegExp(t2.replace(/\./g,'\\.').replace(/\*/g,'.*')));
            }
        }
        matchRegexps.push(pathPartReg);
    }
    
    let matchResult:string[]=[];
    for await(let t1 of iterPath(opt.cwd,'')){
        let matched=false;
        const pathPart=t1.split(/[\\/]/);
        for(let t2 of matchRegexps){
            let pathPartMatched=true;
            let doubleStar=t2.indexOf('**');
            if(doubleStar<0)doubleStar=t2.length;
            for(let t3=0;t3<doubleStar;t3++){
                if(!(t2[t3] as RegExp).test(pathPart[t3])){
                    pathPartMatched=false;
                    break;
                }
            }
            if(pathPartMatched){
                for(let t3=t2.length-1;t3>doubleStar;t3--){
                    if(!(t2[t3] as RegExp).test(pathPart[pathPart.length-(t2.length-t3)])){
                        pathPartMatched=false;
                        break;
                    }
                }
            }
            if(pathPartMatched){
                matched=true;
                break;
            }
        }
        if(matched){
            matchResult.push(t1);
        }
    }
    return matchResult;
}