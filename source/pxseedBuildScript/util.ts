
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


export class mutex{
    protected locked:boolean=false;
    protected unlockCb:Array<()=>void>=[];
    constructor(){
    }
    public async lock(){
        var that=this;
        if(this.locked){
            return new Promise<void>(function(resolve,reject){
                that.unlockCb.push(resolve);
            });
        }else{
            this.locked=true;
            return;
        }
    }
    public async unlock(){
        if(this.unlockCb.length>0){
            this.unlockCb.shift()!();
        }else{
            this.locked=false;
        }
    }
    public async tryLock(){
        if(!this.locked){
            this.locked=true;
            return true;
        }else{
            return false;
        }
    }
    public async exec<T>(fn:()=>Promise<T>){
        await this.lock();
        try{
            return await fn();
        }finally{
            await this.unlock()
        }
    }
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


async function writeJson(jsonPath:string,obj:any){
    const {fs,path}=await getNodeCompatApi();
    const {readFile, writeFile}=fs
    let dir=path.dirname(jsonPath);
    await fs.mkdir(dir,{recursive:true});
    await writeFile(jsonPath,new TextEncoder().encode(JSON.stringify(obj)));
}

async function runBuild(){
    const {dirname,join:pathJoin} =await import('path');
    let buildScriptPath=pathJoin(dirname(__dirname),'script','buildAll.js')
    await runCommand('node '+buildScriptPath)
}

//Glob by Deepseek
import type { Dirent } from 'node:fs';
export async function simpleGlob(include: string[], opt: { cwd: string, exclude?: string[] }) {
    let { fs, path } = await getNodeCompatApi();

    type Pattern = string[];

    const segmentRegexCache = new Map<string, RegExp>();

    function compileSegment(segment: string): RegExp {
        const cached = segmentRegexCache.get(segment);
        if (cached) return cached;

        let source = '^';
        for (const ch of segment) {
            if (ch === '*') {
                source += '[^/]*';
            } else if (ch === '?') {
                source += '[^/]';
            } else {
                source += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            }
        }
        source += '$';

        const regex = new RegExp(source);
        segmentRegexCache.set(segment, regex);
        return regex;
    }

    function segmentMatches(pathSegment: string, patternSegment: string): boolean {
        if (patternSegment === '*') return true;
        return compileSegment(patternSegment).test(pathSegment);
    }

    function parsePattern(pattern: string): Pattern {
        return pattern.split('/').filter((s) => s.length > 0 && s !== '.');
    }

    function matchesPattern(pathSegments: string[], pattern: Pattern): boolean {
        const n = pathSegments.length;
        const m = pattern.length;
        const memo = new Map<number, boolean>();

        const go = (i: number, j: number): boolean => {
            if (j === m) return i === n;

            const key = i * (m + 1) + j;
            const cached = memo.get(key);
            if (cached !== undefined) return cached;

            let result: boolean;
            if (pattern[j] === '**') {
                result = go(i, j + 1) || (i < n && go(i + 1, j));
            } else {
                result = i < n && segmentMatches(pathSegments[i], pattern[j]) && go(i + 1, j + 1);
            }

            memo.set(key, result);
            return result;
        };

        return go(0, 0);
    }


    function canBePrefix(pathSegments: string[], pattern: Pattern): boolean {
        const n = pathSegments.length;
        const m = pattern.length;
        const memo = new Map<number, boolean>();

        const go = (i: number, j: number): boolean => {
            if (i === n) return true; // all directory segments consumed so far
            if (j === m) return false; // pattern exhausted, path is not

            const key = i * (m + 1) + j;
            const cached = memo.get(key);
            if (cached !== undefined) return cached;

            let result: boolean;
            if (pattern[j] === '**') {
                result = go(i, j + 1) || go(i + 1, j);
            } else {
                result = segmentMatches(pathSegments[i], pattern[j]) && go(i + 1, j + 1);
            }

            memo.set(key, result);
            return result;
        };

        return go(0, 0);
    }
    function excludedDir(pathSegments: string[], pattern: Pattern): boolean {
        const n = pathSegments.length;
        const m = pattern.length;
        const memo = new Map<number, boolean>();

        const go = (i: number, j: number): boolean => {
            if (i === n) {
                // Directory path fully matched. Anything left in the pattern must be "**",
                // meaning the whole subtree is excluded too.
                for (let k = j; k < m; k++) {
                    if (pattern[k] !== '**') return false;
                }
                return true;
            }
            if (j === m) return false;

            const key = i * (m + 1) + j;
            const cached = memo.get(key);
            if (cached !== undefined) return cached;

            let result: boolean;
            if (pattern[j] === '**') {
                result = go(i, j + 1) || go(i + 1, j);
            } else {
                result = segmentMatches(pathSegments[i], pattern[j]) && go(i + 1, j + 1);
            }

            memo.set(key, result);
            return result;
        };

        return go(0, 0);
    }

    async function glob({ include, exclude, cwd }: { include: string[], exclude: string[], cwd: string }): Promise<string[]> {
        const includePatterns = include.map(parsePattern).filter((p) => p.length > 0);
        const excludePatterns = exclude.map(parsePattern).filter((p) => p.length > 0);

        if (includePatterns.length === 0) return [];

        const results: string[] = [];

        const walk = async (absDir: string, relSegments: string[]): Promise<void> => {
            let entries: Dirent[];
            try {
                entries = await fs.readdir(absDir, { withFileTypes: true });
            } catch {
                return;
            }

            for (const entry of entries) {
                const name = entry.name;
                const childRel = relSegments.concat(name);
                const childAbs = path.join(absDir, name);

                if (entry.isDirectory()) {
                    if (excludePatterns.some((p) => excludedDir(childRel, p))) continue;
                    if (!includePatterns.some((p) => canBePrefix(childRel, p))) continue;

                    await walk(childAbs, childRel);
                } else if (entry.isFile()) {
                    if (excludePatterns.some((p) => matchesPattern(childRel, p))) continue;
                    if (includePatterns.some((p) => matchesPattern(childRel, p))) {
                        results.push(childRel.join('/'));
                    }
                }
            }
        };

        await walk(cwd, []);

        results.sort();
        return results;
    }
    return glob({include,exclude:opt.exclude??[],cwd:opt.cwd});
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