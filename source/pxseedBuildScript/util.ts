
let cachedNodeCompatApi:{
    fs:typeof import('fs/promises'),
    path:typeof import('path'),
    wwwroot:string
}|null=null;

export async function getNodeCompatApi(){
    if(cachedNodeCompatApi!=null){
        return cachedNodeCompatApi;
    }
    if(globalThis.process?.versions?.node!=undefined){
        const fs=await import('fs/promises');
        const path=await import('path');
        cachedNodeCompatApi={fs,path,wwwroot:path.join(__dirname,'..')};
    }else{
        const {buildNodeCompatApiTjs}=await import('partic2/packageManager/nodecompat');
        const builtApi=await buildNodeCompatApiTjs();
        cachedNodeCompatApi={fs:builtApi.fs.promises as any,path:builtApi.path as any,wwwroot:builtApi.wwwroot}
    }
    return cachedNodeCompatApi
}


async function runCommand(cmd:string,opt?:{cwd?:string}){
    const {spawn}=await import('child_process');
    let runOpt=opt??{};
    let process=spawn(cmd,{shell:true,stdio:'inherit',...runOpt});
    return new Promise<number|null>((resolve=>{
        process.on('close',()=>resolve(process.exitCode));
    }))
}

async function readJson(path:string){
    const {fs}=await getNodeCompatApi();
    const {readFile, writeFile}=fs
    return JSON.parse(new TextDecoder().decode(await readFile(path)));
}


async function writeJson(path:string,obj:any){
    const {fs}=await getNodeCompatApi();
    const {readFile, writeFile}=fs
    await writeFile(path,new TextEncoder().encode(JSON.stringify(obj,undefined,2)));
}

async function runBuild(){
    const {dirname,join:pathJoin} =await import('path');
    let buildScriptPath=pathJoin(dirname(__dirname),'script','buildAll.js')
    await runCommand('node '+buildScriptPath)
}

async function *iterPath(path2:string,opt:{includeHidenFile?:boolean,cwd:string}):AsyncGenerator<string>{
    const {path,fs}=await getNodeCompatApi();
    for(let child of await fs.readdir(path.join(opt.cwd,path2),{withFileTypes:true})){
        if(!opt.includeHidenFile && child.name.startsWith('.')){
            continue
        }
        if(child.isDirectory()){
            yield* iterPath(path.join(path2,child.name),opt);
        }else{
            const p=path.join(path2,child.name);
            yield p;
        }
    }
}

export async function simpleGlob(include:string[],opt:{cwd:string,includeHidenFile?:boolean}){
    let matchRegexps:Array<Array<RegExp|'**'>>=[];
    for(let t1 of include){
        let pathPart=t1.split(/[\\/]/);
        let pathPartReg:Array<RegExp|'**'>=[];
        for(let t2 of pathPart){
            if(t2=='.'){
                continue
            }else if(t2=='..'){
                if(pathPartReg.length==0){
                    throw new Error('simple glob do not support ".." on the top level.');
                }
                pathPartReg.pop();
            }else if(t2=='**'){
                pathPartReg.push('**');
            }else{
                pathPartReg.push(new RegExp('^'+
                    t2.replace(/[\.\(\)]/g,(v)=>'\\'+v)
                        .replace(/\*/g,'.*')+
                    '$'));
            }
        }
        matchRegexps.push(pathPartReg);
    }
    
    let matchResult:string[]=[];
    for await(let t1 of iterPath('',{cwd:opt.cwd,includeHidenFile:opt.includeHidenFile})){
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
            matchResult.push(t1.replace(/\\/g,'/'));
        }
    }
    return matchResult;
}

export let console=globalThis.console;

export async function withConsole(c:typeof console,fn:()=>Promise<void>){
    console=c;
    try{
        await fn()
    }finally{
        console=globalThis.console;
    }
}

export let __internal__={
    runCommand,readJson,writeJson,runBuild
}