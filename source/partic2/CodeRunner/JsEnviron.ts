import { IamdeeScriptLoader, requirejs } from 'partic2/jsutils1/base';
import { LocalWindowSFS, SimpleFileSystem, TjsSfs } from './FileSystem';
import { utf8conv } from './jsutils2';
import { getWWWRoot } from 'partic2/jsutils1/webutils';
import { buildTjs } from 'partic2/tjshelper/tjsbuilder';


export * from './FileSystem'

export let defaultFileSystem:SimpleFileSystem|null=null;
export async function ensureDefaultFileSystem(){
    if(defaultFileSystem===null){
        if(globalThis.location?.protocol.startsWith('http')){
            defaultFileSystem=new LocalWindowSFS();
        }else{
            let tjs1=await buildTjs();
            let t1=new TjsSfs();
            t1.from(tjs1);
            defaultFileSystem=t1;
        }
        await defaultFileSystem.ensureInited()
    }
}
export function setDefaultFileSystem(fs:SimpleFileSystem){
    defaultFileSystem=fs;
}


class CSimpleFileSystemScriptLoader implements IamdeeScriptLoader{
    constructor(public providers:Array<{fs:SimpleFileSystem,rootPath:string}>){}
    loadModule(moduleId: string, url: string, done: (err: Error | null) => void): void {
        this.loadModuleAsync(moduleId,url).then(()=>done(null),(err)=>done(err));
    }
    currentDefining:string|null=null;
    getDefiningModule(): string | null {
        return this.currentDefining;
    }
    async loadModuleAsync(moduleId: string, url: string){
        url=moduleId;
        if(!url.endsWith('.js'))url=url+'.js'
        for(let t1 of this.providers){
            let data=await t1.fs.readAll(t1.rootPath+'/'+url);
            if(data!=null){
                this.currentDefining=moduleId;
                try{new Function(utf8conv(data))();}finally{
                    this.currentDefining=null;
                    return;
                }
            }
        }
        throw new Error(`module ${moduleId} not found by CSimpleFileSystemScriptLoader`)
    }
}


let simpleFileSystemScriptLoader:CSimpleFileSystemScriptLoader|null=null;
export let installedRequirejsResourceProvider:Array<{fs:SimpleFileSystem,rootPath:string}>=[];
export async function installRequireProvider(fs:SimpleFileSystem,rootPath?:string){
    if(simpleFileSystemScriptLoader==null){
        simpleFileSystemScriptLoader=new CSimpleFileSystemScriptLoader(installedRequirejsResourceProvider);
        requirejs.addScriptLoader(simpleFileSystemScriptLoader,true);
    }
    installedRequirejsResourceProvider.push({fs,rootPath:rootPath??'www'});
    return {fs,rootPath:rootPath??'www'}
}

export function getSimpleFileSysteNormalizedWWWRoot(){
    let wwwroot=getWWWRoot().replace(/\\/g,'/');
    if(!wwwroot.startsWith('/')){
        wwwroot='/'+wwwroot;
    }
    return wwwroot;
}
