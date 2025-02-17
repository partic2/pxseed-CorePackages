
import { ArrayWrap2, GenerateRandomString, GetCurrentTime, assert, future, requirejs, throwIfAbortError } from "partic2/jsutils1/base";
import { CKeyValueDb, getWWWRoot, kvStore, path } from "partic2/jsutils1/webutils";
import type {} from '@txikijs/types/src/index'
import { ClientInfo } from "partic2/pxprpcClient/registry";
import {path as lpath} from 'partic2/jsutils1/webutils'
import type { LocalRunCodeContext } from "./CodeContext";



export interface FileEntry{
    name:string
    type:'dir'|'file',
    children?:FileEntry[],
    dataKey?:string
}
export interface SimpleFileSystem{
    //optional rpc to enable further control
    pxprpc?:ClientInfo;
    ensureInited():Promise<void>;
    writeAll(path:string,data:Uint8Array):Promise<void>;
    readAll(path:string):Promise<Uint8Array|null>;
    read(path:string,offset:number,buf:Uint8Array):Promise<number>;
    write(path:string,offset:number,buf:Uint8Array):Promise<number>;
    delete2(path:string):Promise<void>;
    listdir(path:string):Promise<{name:string,type:string}[]>;
    filetype(path:string):Promise<'dir'|'file'|'none'>;
    mkdir(path:string):Promise<void>;
    rename(path:string,newPath:string):Promise<void>;
    dataDir():Promise<string>;
}


export class TjsSfs implements SimpleFileSystem{
    
    
    impl?:typeof tjs
    pxprpc?:ClientInfo
    
    protected dummyRootDir:[string,tjs.StatResult][]=[];
    //is windows base(C:\... D:\...) path?
    protected winbasepath=false;
    from(impl:typeof tjs){
        this.impl=impl;
    }
    async ensureInited(): Promise<void> {
        if(this.impl==undefined){
            throw new Error('call from() first.');
        }
        try{
            await this.impl.stat('c:\\');
            this.winbasepath=true;
        }catch(e){}
    }
    async writeAll(path: string, data: Uint8Array): Promise<void> {
        let dirname=lpath.dirname(path);
        if(await this.filetype(dirname)!=='dir'){
            await this.mkdir(dirname);
        }
        path=this.pathConvert(path);
        let file=await this.impl!.open(path,'w');
        try{
            let offset=0;
            for(let times=0;offset<data.byteLength && times<4000;times++){
                let sizemax=4*1024*1024;
                if(data.length-offset<sizemax){
                    sizemax=data.length-offset;
                }
                let write=await file.write(new Uint8Array(data,offset,sizemax),offset);
                offset+=write;
            }
        }finally{
            await file.close();
        }
    }
    async readAll(path: string): Promise<Uint8Array | null> {
        path=this.pathConvert(path);
        return await this.impl!.readFile(path);
    }
    async delete2(path: string): Promise<void> {
        path=this.pathConvert(path);
        await this.impl!.remove(path);
    }
    protected pathConvert(path:string):string{
        if(path===''){
            return '/';
        }
        if(path.startsWith('/') && this.winbasepath){
            if(path.length<=3){
                return path.substring(1)+'\\';
            }else{
                return path.substring(1);
            }
        }else{
            return path;
        }
    }
    async listdir(path: string): Promise<{ name: string; type: string; }[]> {
        if((path==='/' || path==='') && this.winbasepath){
            if(this.dummyRootDir.length===0){
                for(let t1 of 'cdefghijklmn'){
                    try{
                        this.dummyRootDir.push([t1+':',await this.impl!.stat(t1+':\\')]);
                    }catch(e){
                    }
                }
            }
            return this.dummyRootDir.map(v=>({name:v[0],type:'dir'}))
        }
        path=this.pathConvert(path);
        let files=[] as { name: string; type: string; }[];
        for await (let child of await this.impl!.readDir(path)){
            files.push({name:child.name,type:child.isDirectory?'dir':'file'})
        }
        return files;
    }
    async filetype(path: string): Promise<"dir" | "file" | "none"> {
        path=this.pathConvert(path);
        try{
            let st=await this.impl!.stat(path);
            return st.isDirectory?'dir':'file'
        }catch(e){
            return 'none';
        }
    }
    async mkdir(path: string): Promise<void> {
        path=this.pathConvert(path);
        await this.impl!.makeDir(path);
    }
    async rename(path: string, newPath: string): Promise<void> {
        path=this.pathConvert(path);
        newPath=this.pathConvert(newPath);
        await this.impl!.rename(path,newPath);
    }
    async dataDir(): Promise<string> {
        //note homedir is Application specified, not the user home normally.
        //maybe we should use another function name.
        let datadir=this.impl!.homeDir.replace(/\\/g,'/');
        if(!datadir.startsWith('/')){
            datadir='/'+datadir;
        }
        return datadir
    }
    async read(path:string,offset: number, buf: Uint8Array): Promise<number> {
        let fh=await this.impl!.open(path,'r+');
        try{
            let len=await fh.read(buf,offset);
            if(len===null){
                throw new Error('EOF reached');
            }
            return len;
        }finally{
            fh.close();
        }
    }
    async write(path:string, offset:number, buf: Uint8Array): Promise<number> {
        let fh=await this.impl!.open(path,'r+');
        try{
            let len=await fh.write(buf,offset);
            return len;
        }finally{
            fh.close();
        }
    }
}

export class LocalWindowSFS implements SimpleFileSystem{
    db?: CKeyValueDb;
    root?:FileEntry;
    lastModified=0;
    //For compatibility. fs module is in partic2/JsNotebook in early day.
    dbname='partic2/JsNotebook/filebrowser/sfs';

    constructor(){}
    
    pxprpc?: ClientInfo | undefined;
    async ensureInited(){
        //XXX: race condition
        if(this.db==undefined){
            this.db=await kvStore(this.dbname)
            this.root=await this.db.getItem('lwsfs/1');
            if(this.root==undefined){
                this.root={name:'',type:'dir',children:[]}
                await this.saveChange();
            }
            this.lastModified=(await this.db!.getItem('lwsfs/modifiedAt')??0) as number;
        }
    }
    
    pathSplit(path:string){
        //remove empty name
        return path.split(/[\/\\]/).filter(v=>v!='');
    }
    protected async lookupPathDir(path2:string[],opt:{createParentDirectories?:boolean}){
        //_ensureRootCacheLatest()
        let lastModified=(await this.db!.getItem('lwsfs/modifiedAt')??0) as number;
        if(this.lastModified<lastModified){
            this.root=await this.db!.getItem('lwsfs/1');
            this.lastModified=lastModified;
        }

        let curobj:FileEntry=this.root!;
        for(let i1=0;i1<path2.length;i1++){
            let name=path2[i1];
            if(curobj.type==='dir'){
                let t1=curobj.children!.find(v=>v.name===name);
                if(t1===undefined){
                    if(opt.createParentDirectories){
                        t1={type:'dir',children:[],name};
                        curobj.children!.push(t1);
                    }else{
                        throw new Error(path2.slice(0,i1).join('/')+' is not a directory')
                    }
                }
                curobj=t1;
            }else if(curobj.type==='file'){
                throw new Error(path2.slice(0,i1+1).join('/')+' is not a directory')
            }
        }
        return curobj;
    }
    async writeAll(path:string,data:Uint8Array){
        let path2=this.pathSplit(path);
        let parent=await this.lookupPathDir(path2.slice(0,path2.length-1),{createParentDirectories:true});
        let found=parent.children!.find(v=>v.name===path2[path2.length-1]);
        let dataKey=GenerateRandomString();
        if(found==undefined){
            parent.children!.push({type:'file',name:path2[path2.length-1],dataKey})
        }else{
            dataKey=found.dataKey!;
        }
        await this.db!.setItem(dataKey,data);
        await this.saveChange();
    }
    async readAll(path:string){
        let path2=this.pathSplit(path);
        try{
            let parent=await this.lookupPathDir(path2.slice(0,path2.length-1),{createParentDirectories:false});
            let found=parent.children!.find(v=>v.name===path2[path2.length-1]);
            if(found==undefined || found.type!=='file'){
                return null
            }else{
                return await this.db!.getItem(found.dataKey!) as Uint8Array;
            }
        }catch(e){
            return null;
        }
    }
    async delete2(path:string){
        let path2=this.pathSplit(path);
        let parent=await this.lookupPathDir(path2.slice(0,path2.length-1),{createParentDirectories:false});
        let found=parent.children!.findIndex(v=>v.name===path2[path2.length-1]);
        if(found>=0){
            let [fe]=parent.children!.splice(found,1);
            if(fe.dataKey!=undefined){
                this.db!.delete(fe.dataKey);
            }
        }
        await this.saveChange()
    }
    async saveChange(){
        this.lastModified=GetCurrentTime().getTime();
        await this.db!.setItem('lwsfs/1',this.root);
        await this.db!.setItem('lwsfs/modifiedAt',this.lastModified)
    }
    async listdir(path:string){
        let path2=this.pathSplit(path);
        let dir1=await this.lookupPathDir(path2,{createParentDirectories:false});
        return dir1.children!.map(v=>v);
    }
    async mkdir(path:string){
        let path2=this.pathSplit(path);
        await this.lookupPathDir(path2,{createParentDirectories:true});
        await this.saveChange();
    }
    //Don't create directory automatically
    async filetype(path:string):Promise<'dir'|'file'|'none'>{
        let path2=this.pathSplit(path);
        try{
            if(path==''){
                return this.root!.type;
            }
            let parent=await this.lookupPathDir(path2.slice(0,path2.length-1),{createParentDirectories:false});
            let found=parent.children!.find(v=>v.name===path2[path2.length-1]);
            return found===undefined?'none':found.type;
        }catch(e){
            return 'none'
        }
    }
    async rename(path:string,newPath:string){
        let path2=this.pathSplit(path);
        let newPath2=this.pathSplit(newPath);
        let parent=await this.lookupPathDir(path2.slice(0,path2.length-1),{createParentDirectories:false})
        let newParent=await this.lookupPathDir(newPath2.slice(0,path2.length-1),{createParentDirectories:true});
        let foundIndex=parent.children!.findIndex(v=>v.name==path2[path2.length-1]);
        let [t1]=parent.children!.splice(foundIndex,1);
        t1.name=newPath2[newPath2.length-1];
        newParent.children!.push(t1);
        await this.saveChange();
    }
    async dataDir(): Promise<string> {
        return ''
    }
    //TODO:Seek read/write still read entire file. We need implement FilePart in kv db.
    async read(path: string, offset: number, buf: Uint8Array): Promise<number> {
        let entire=await this.readAll(path);
        if(entire===null){
            throw new Error(`${path} can't be read.`);
        }
        if(offset>=entire?.length){
            throw new Error('EOF reached');
        }
        let len=Math.min(offset,length);
        buf.set(new Uint8Array(entire,offset,len));
        return len;
    }
    async write(path: string, offset: number, buf: Uint8Array): Promise<number> {
        let entire=await this.readAll(path);
        if(entire===null){
            throw new Error(`${path} can't be read.`);
        }
        if(offset+buf.byteLength>=entire?.length){
            let t2=new Uint8Array(offset+buf.byteLength);
            t2.set(entire);
            entire=t2;
        }
        entire.set(buf,offset);
        await this.writeAll(path,buf);
        return buf.byteLength;
    }
}

import type * as nodefsmodule from 'fs/promises'
import type * as nodepathmodule from 'path'
import { type CodeCompletionContext } from "./Inspector";

class NodeSimpleFileSystem implements SimpleFileSystem{
    pxprpc?: ClientInfo | undefined;
    nodefs?:typeof nodefsmodule;
    nodepath?:typeof nodepathmodule;
    //is windows base(C:\... D:\...) path? like `TjsSfs` do.
    //Maybe it is not good to use different path convention between node native and SimpleFileSystem.
    winbasepath=false;
    pathConvert(path:string){
        //For windows 
        if(path===''){
            return '/';
        }
        if(path.startsWith('/') && this.winbasepath){
            if(path.length<=3){
                return path.substring(1)+'\\';
            }else{
                return path.substring(1);
            }
        }else{
            return path;
        }
    }
    async ensureInited(): Promise<void> {
        this.nodefs=await import('fs/promises');
        this.nodepath=await import('path')
        try{
            await this.nodefs!.stat('c:\\');
            this.winbasepath=true;
        }catch(e){}
    }
    async writeAll(path: string, data: Uint8Array): Promise<void> {
        path=this.pathConvert(path);
        let parent=this.nodepath!.dirname(path);
        if(await this.filetype(parent)==='none'){
            this.mkdir(parent);
        }
        await this.nodefs!.writeFile(path,data);
    }
    async readAll(path: string): Promise<Uint8Array | null> {
        path=this.pathConvert(path);
        return await this.nodefs!.readFile(path);
    }
    async delete2(path: string): Promise<void> {
        path=this.pathConvert(path);
        await this.nodefs!.rm(path,{recursive:true});
    }
    async listdir(path: string): Promise<{ name: string; type: string; }[]> {
        let dummyRootDir:[string,{isDirectory:()=>boolean}][]=[];
        if((path==='/' || path==='') && this.winbasepath){
            if(dummyRootDir.length===0){
                for(let t1 of 'cdefghijklmn'){
                    try{
                        dummyRootDir.push([t1+':',await this.nodefs!.stat(t1+':\\')]);
                    }catch(e){
                    }
                }
            }
            return dummyRootDir.map(v=>({name:v[0],type:'dir'}))
        }
        path=this.pathConvert(path);
        let dirinfo=await this.nodefs!.readdir(path,{withFileTypes:true});
        return dirinfo.map(ent=>({name:ent.name,type:ent.isDirectory()?'dir':'file'}));
    }
    async filetype(path: string): Promise<"dir" | "file" | "none"> {
        path=this.pathConvert(path);
        try{
            let ent=await this.nodefs!.stat(path);
            return ent.isDirectory()?'dir':'file';
        }catch(e:any){
            throwIfAbortError(e);
            return 'none';
        }
    }
    async mkdir(path: string): Promise<void> {
        path=this.pathConvert(path);
        await this.nodefs!.mkdir(path,{recursive:true});
    }
    async rename(path: string, newPath: string): Promise<void> {
        path=this.pathConvert(path);
        await this.nodefs!.rename(path,newPath);
    }
    async dataDir(): Promise<string> {
        return lpath.dirname(getWWWRoot().replace(/\\/,'/'));
    }
    async read(path: string, offset: number, buf: Uint8Array): Promise<number> {
        let fh=await this.nodefs!.open(path,'r+');
        let r=await fh.read(buf,0,buf.byteLength,offset);
        return r.bytesRead;
    }
    async write(path: string, offset: number, buf: Uint8Array): Promise<number> {
        let fh=await this.nodefs!.open(path,'r+');
        let r=await fh.write(buf,0,buf.byteLength,offset);
        return r.bytesWritten;
    }   
}


class RequirejsResourceProvider{
    rootPath:string='www';
    constructor(public fs:SimpleFileSystem){};
    handler=async (modName: string, url: string)=>{
        await this.fs.ensureInited();
        let {baseUrl}=requirejs.getConfig();
        let fileName=url.substring(baseUrl.length)
        let data=await this.fs.readAll(this.rootPath+'/'+fileName)
        if(data!=null){
            return new TextDecoder().decode(data);
        }
        return null;
    }
}

export let installedRequirejsResourceProvider=[] as {rootPath:string,fs:SimpleFileSystem,handler:any}[];

export async function installRequireProvider(fs:SimpleFileSystem,rootPath?:string){
    let provider=new RequirejsResourceProvider(fs);
    if(rootPath!=undefined){
        provider.rootPath=rootPath;
    }
    requirejs.addResourceProvider(provider.handler);
    installedRequirejsResourceProvider.push(provider);
    return provider.handler;
}

interface CodeContextEnvInitVar{
    fs:{
        simple?:SimpleFileSystem,
        codePath?:string,
        env:'unknown'|'node'|'browser',
        loadScript:(path:string)=>Promise<void>
    },
    //import all members of module into _ENV
    import2env:(moduleName:string)=>Promise<void>,
    globalThis:typeof globalThis
}
/* Usage: Run below code in CodeContext to init CodeContext _ENV
    ```javascript
    await (await import('partic2/CodeRunner/JsEnviron')).initCodeEnv(_ENV,{currentDirectory:'xxx'});
    ```
    Then these variable list in CodeContextEnvInitVar will be set to _ENV
*/
export async function initCodeEnv(_ENV:any,opt?:{codePath?:string}){
    let env:'unknown'|'node'|'browser'='unknown'
    if(globalThis.process?.versions?.node!=undefined){
        env='node'
    }else if(globalThis.navigator!=undefined){
        env='browser'
    }
    let simplefs=undefined as SimpleFileSystem|undefined;
    if(installedRequirejsResourceProvider.length>0){
        simplefs=installedRequirejsResourceProvider[0].fs
    }else if(env==='node'){
        simplefs=new NodeSimpleFileSystem();
        await simplefs.ensureInited();
    }
    let fs:CodeContextEnvInitVar['fs']={
        simple: simplefs,
        codePath: opt?.codePath,
        env: env,
        loadScript:async function(path:string){
            assert(this.simple!=undefined);
            if(path.startsWith('.')){
                assert(this.codePath!=undefined )
                path=lpath.dirname(this.codePath)+path.substring(1);
            }
            let jsbin=await this.simple.readAll(path);
            if(jsbin==null){
                throw new Error('File not existed');
            }
            let js=new TextDecoder().decode(jsbin);
            let cc=_ENV.__priv_codeContext as LocalRunCodeContext;
            let savedCodePath=this.codePath;
            this.codePath=path;
            await cc.runCode(js);
            this.codePath=savedCodePath;
        }
    };
    _ENV.fs=fs;
    _ENV.import2env=async (moduleName:string)=>{
        let mod=await requirejs.promiseRequire<Record<string,unknown>>(moduleName);
        for(let [k1,v1] of Object.entries(mod)){
            _ENV[k1]=v1;
        }
    }
    let {CustomFunctionParameterCompletionSymbol,importNameCompletion,makeFunctionCompletionWithFilePathArg0}=(await import('./Inspector'));
    _ENV.import2env[CustomFunctionParameterCompletionSymbol]=async (context:CodeCompletionContext)=>{
        let param=context.code.substring(context.funcParamStart!,context.caret);
        let importName2=param.match(/\(\s*(['"])([^'"]+)$/);
        if(importName2!=null){
            let replaceRange:[number,number]=[context.funcParamStart!+param.lastIndexOf(importName2[1])+1,0];
            replaceRange[1]=replaceRange[0]+importName2[2].length;
            let importName=importName2[2];
            let t1=await importNameCompletion(importName);
            context.completionItems.push(...t1.map(v=>({type:'literal',candidate:v,replaceRange})))
        }
    }
    _ENV.fs.loadScript[CustomFunctionParameterCompletionSymbol]=makeFunctionCompletionWithFilePathArg0(path.dirname(_ENV.fs.codePath));
    if(_ENV.fs.simple!=undefined){
        _ENV.fs.simple.readAll[CustomFunctionParameterCompletionSymbol]=makeFunctionCompletionWithFilePathArg0(undefined);
        _ENV.fs.simple.writeAll[CustomFunctionParameterCompletionSymbol]=makeFunctionCompletionWithFilePathArg0(undefined);
        _ENV.fs.simple.listdir[CustomFunctionParameterCompletionSymbol]=makeFunctionCompletionWithFilePathArg0(undefined);
        _ENV.fs.simple.filetype[CustomFunctionParameterCompletionSymbol]=makeFunctionCompletionWithFilePathArg0(undefined);
        _ENV.fs.simple.delete2[CustomFunctionParameterCompletionSymbol]=makeFunctionCompletionWithFilePathArg0(undefined);
    }
    _ENV.globalThis=globalThis;
}




