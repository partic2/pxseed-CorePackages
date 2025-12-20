
import { ArrayBufferConcat, ArrayWrap2, GenerateRandomString, GetCurrentTime, IamdeeScriptLoader, assert, future, mutex, requirejs, throwIfAbortError } from "partic2/jsutils1/base";
import { CKeyValueDb, getWWWRoot, kvStore, path } from "partic2/jsutils1/webutils";
import type {} from 'partic2/tjshelper/txikijs'
import { ClientInfo } from "partic2/pxprpcClient/registry";
import type { LocalRunCodeContext } from "./CodeContext";
import { type CodeCompletionContext } from "./Inspector";
import { RpcExtendClient1 } from "pxprpc/extend";
import { utf8conv } from "./jsutils2";
import { buildTjs } from "partic2/tjshelper/tjsbuilder";

//treat both slash and back slash as sep
function dirname2(path:string){
    for(let t1=path.length-1;t1>=0;t1--){
        let ch=path.charAt(t1);
        if('\\/'.includes(ch)){
            return path.substring(0,t1);
        }
    }
    return '';
}

class MountFileEntry{
    //pxseed url for mounted fs, eg:  "pxseedjs:your/module/name.asynchronizedBuilder?param=xxx"
    //asynchronizedBuilder:async function asynchronizedBuilder(url:string):Promise<SimpleFileSystem>
    constructor(public builder:string){}
    fs?:SimpleFileSystem
    toJSON(){
        return this.builder;
    }
    async ensureFs(){
        if(this.fs==undefined){
            let {pathname,protocol}=new URL(this.builder);
            assert(protocol=='pxseedjs:');
            let delim=pathname.lastIndexOf('.');
            this.fs=await ((await import(pathname.substring(0,delim)))[pathname.substring(delim+1)])(this.builder);
        }
        await this.fs!.ensureInited();
    }
}

export interface FileEntry{
    name:string
    type:'dir'|'file',
    size?:number,
    mtime:number,
    children?:FileEntry[],
    dataKey?:Array<{key:string,size:number}>|string,
    mountFs?:MountFileEntry|string
}
export interface SimpleFileSystem{
    ensureInited():Promise<void>;
    writeAll(path:string,data:Uint8Array):Promise<void>;
    readAll(path:string):Promise<Uint8Array|null>;
    read(path:string,offset:number,buf:Uint8Array):Promise<number>;
    write(path:string,offset:number,buf:Uint8Array):Promise<number>;
    delete2(path:string):Promise<void>;
    listdir(path:string):Promise<{name:string,type:'dir'|'file'}[]>;
    filetype(path:string):Promise<'dir'|'file'|'none'>;
    mkdir(path:string):Promise<void>;
    rename(path:string,newPath:string):Promise<void>;
    dataDir():Promise<string>;
    stat(path:string):Promise<{atime:Date,mtime:Date,ctime:Date,birthtime:Date,size:number}>;
    truncate(path:string,newSize:number):Promise<void>;
}

export class TjsSfs implements SimpleFileSystem{
    
    impl?:typeof tjs
    
    protected dummyRootDir:[string,tjs.StatResult][]=[];
    //is windows base(C:\... D:\...) path?
    protected winbasepath=false;
    from(impl:typeof tjs){
        this.impl=impl;
    }
    inited=false;
    mtx=new mutex();
    async ensureInited(): Promise<void> {
        await this.mtx.lock();
        try{
            if(this.inited)return;
            if(this.impl==undefined){
                throw new Error('call from() first.');
            }
            try{
                await this.impl.stat('C:\\');
                this.winbasepath=true;
            }catch(e:any){
                throwIfAbortError(e);
            }
            this.inited=true;
        }finally{
            await this.mtx.unlock();
        }
    }
    async writeAll(path: string, data: Uint8Array): Promise<void> {
        let dirname=dirname2(path);
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
                let write=await file.write(new Uint8Array(data.buffer,offset,sizemax),offset);
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
            path='/';
        }
        if(path.startsWith('/') && this.winbasepath){
            if(path.length<=3){
                path=path.substring(1)+'\\';
            }else{
                path=path.substring(1);
            }
        }
        return path;
    }
    async listdir(path: string): Promise<{ name: string; type: 'dir'|'file' }[]> {
        if((path==='/' || path==='') && this.winbasepath){
            if(this.dummyRootDir.length===0){
                for(let t1 of 'CDEFGHIJKMN'){
                    try{
                        this.dummyRootDir.push([t1+':',await this.impl!.stat(t1+':\\')]);
                    }catch(e){
                    }
                }
            }
            return this.dummyRootDir.map(v=>({name:v[0],type:'dir'}))
        }
        path=this.pathConvert(path);
        let files=[] as { name: string; type: 'dir'|'file'; }[];
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
        await this.impl!.makeDir(path,{recursive:true});
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
        path=this.pathConvert(path);
        let fh=await this.impl!.open(path,'r+');
        try{
            let len=await fh.read(buf,offset);
            if(len===null){
                len=0;
            }
            return len;
        }finally{
            fh.close();
        }
    }
    async write(path:string, offset:number, buf: Uint8Array): Promise<number> {
        path=this.pathConvert(path);
        let fh:tjs.FileHandle;
        try{
            fh=await this.impl!.open(path,'r+');
        }catch(err){
            fh=await this.impl!.open(path,'w');
        }
        try{
            let len=await fh.write(buf,offset);
            return len;
        }finally{
            fh.close();
        }
    }
    async stat(path:string){
        path=this.pathConvert(path);
        let statRes=await this.impl!.stat(path);
        return {atime:statRes.atim,mtime:statRes.mtim,ctime:statRes.ctim,birthtime:statRes.birthtim,size:statRes.size};
    }
    async truncate(path:string,newSize: number): Promise<void> {
        path=this.pathConvert(path);
        let f=await this.impl!.open(path,'r+');
        try{
            await f.truncate(newSize);
        }finally{
            await f.close();
        }
    }
}

export async function getSimpleFileSystemFromPxprpc(pxprpc:RpcExtendClient1){
    //check if jseio is supported
    let checkFunc=await pxprpc.getFunc('JseHelper.JseIo.open');
    if(checkFunc!=null){
        checkFunc.free();
        let {tjsFrom}=await import('partic2/tjshelper/tjsonjserpc');
        let {Invoker}=await import('partic2/pxprpcBinding/JseHelper__JseIo');
        let inv=new Invoker();
        await inv.useClient(pxprpc);
        let fs=new TjsSfs();
        fs.from(await tjsFrom(inv));
        return fs;                                                  
    }
}

class LWSFSInternalError extends Error{}

export class LocalWindowSFS implements SimpleFileSystem{
    db?: CKeyValueDb;
    root?:FileEntry;
    lastModified=0;
    //For compatibility. fs module is in partic2/JsNotebook in early day.
    dbname='partic2/JsNotebook/filebrowser/sfs';

    constructor(){}
    
    pxprpc?: ClientInfo | undefined;
    throwIfNotInternalError(err:any){
        if(!(err instanceof LWSFSInternalError)){
            throw err;
        }
    }
    mtx=new mutex();
    async ensureInited(){
        //XXX: race condition
        await this.mtx.lock();
        try{
            if(this.db==undefined){
                this.db=await kvStore(this.dbname)
                this.root=await this.db.getItem('lwsfs/1');
                if(this.root==undefined){
                    this.root={name:'',type:'dir',children:[],mtime:GetCurrentTime().getTime()}
                    await this.saveChange();
                }
                this.lastModified=(await this.db!.getItem('lwsfs/modifiedAt')??0) as number;
            }
        }finally{
            await this.mtx.unlock()
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
                if(curobj.mountFs==null){
                    let t1=curobj.children!.find(v=>v.name===name);
                    if(t1===undefined){
                        if(opt.createParentDirectories){
                            t1={type:'dir',children:[],name,mtime:GetCurrentTime().getTime()};
                            curobj.children!.push(t1);
                        }else{
                            throw new LWSFSInternalError(path2.slice(0,i1).join('/')+' is not a directory')
                        }
                    }
                    curobj=t1;
                }else{
                    if(typeof curobj.mountFs==='string'){
                        curobj.mountFs=new MountFileEntry(curobj.mountFs);
                        await curobj.mountFs.ensureFs();
                    }
                    return {
                        entry:curobj,
                        restPath:path2.slice(i1+1)
                    }
                }
            }else if(curobj.type==='file'){
                throw new Error(path2.slice(0,i1+1).join('/')+' is not a directory')
            }
        }
        if(typeof curobj.mountFs==='string'){
            curobj.mountFs=new MountFileEntry(curobj.mountFs);
            await curobj.mountFs.ensureFs();
        }
        return {
            entry:curobj
        };
    }
    async writeAll(path:string,data:Uint8Array){
        let path2=this.pathSplit(path);
        let lookupResult=await this.lookupPathDir(path2.slice(0,path2.length-1),{createParentDirectories:true});
        if(lookupResult.restPath==undefined && lookupResult.entry.mountFs==null){
            let parent=lookupResult.entry;
            let found=parent.children!.find(v=>v.name===path2[path2.length-1]);
            let dataKey=GenerateRandomString();
            if(found!=undefined){
                found.mtime=GetCurrentTime().getTime();
                if(typeof found.dataKey==='string'){
                    await this.db!.delete(found.dataKey);
                }else{
                    for(let t1 of found.dataKey!){
                        await this.db!.delete(t1.key);
                    }
                }
                found.dataKey=[{key:dataKey,size:data.length}];
            }else{
                found={type:'file',name:path2[path2.length-1],dataKey:[{key:dataKey,size:data.length}],mtime:GetCurrentTime().getTime()}
                parent.children!.push(found);
            }
            found.size=data.length;
            await this.db!.setItem(dataKey,data);
            await this.saveChange();
        }else{
            await (lookupResult.entry.mountFs as MountFileEntry).fs!.writeAll([...(lookupResult.restPath??[]),path2.at(-1)!].join('/'),data)
        }
        
    }
    async readAll(path:string){
        let path2=this.pathSplit(path);
        try{
            let lookupResult=await this.lookupPathDir(path2.slice(0,path2.length-1),{createParentDirectories:false});
            if(lookupResult.restPath==undefined && lookupResult.entry.mountFs==null){
                let parent=lookupResult.entry;
                let found=parent.children!.find(v=>v.name===path2[path2.length-1]);
                if(found==undefined || found.type!=='file'){
                    return null
                }else{
                    if(typeof found.dataKey==='string'){
                        return await this.db!.getItem(found.dataKey!) as Uint8Array;
                    }else{
                        return new Uint8Array(ArrayBufferConcat(await Promise.all(found.dataKey!.map(t1=>this.db!.getItem(t1.key)))));
                    }
                }
            }else{
                return await (lookupResult.entry.mountFs as MountFileEntry).fs!.readAll([...(lookupResult.restPath??[]),path2.at(-1)!].join('/'))
            }
        }catch(e:any){
            this.throwIfNotInternalError(e);
            return null;
        }
    }
    async delete2(path:string){
        let path2=this.pathSplit(path);
        let lookupResult=await this.lookupPathDir(path2.slice(0,path2.length-1),{createParentDirectories:false});
        if(lookupResult.restPath==undefined && lookupResult.entry.mountFs==null){
            let parent=lookupResult.entry;
            let found=parent.children!.findIndex(v=>v.name===path2[path2.length-1]);
            if(found>=0){
                let [fe]=parent.children!.splice(found,1);
                if(fe.dataKey!=undefined){
                    if(typeof fe.dataKey==='string'){
                        await this.db!.delete(fe.dataKey);
                    }else{
                        await Promise.all(fe.dataKey.map(t1=>this.db!.delete(t1.key)));
                    }
                }
            }
            await this.saveChange()
        }else{
            await (lookupResult.entry.mountFs as MountFileEntry).fs!.delete2([...(lookupResult.restPath??[]),path2.at(-1)!].join('/'))
        }
    }
    async saveChange(){
        this.lastModified=GetCurrentTime().getTime();
        await this.db!.setItem('lwsfs/1',this.root);
        await this.db!.setItem('lwsfs/modifiedAt',this.lastModified)
    }
    async listdir(path:string){
        let path2=this.pathSplit(path);
        let lookupResult=await this.lookupPathDir(path2,{createParentDirectories:false});
        if(lookupResult.restPath==undefined && lookupResult.entry.mountFs==null){
            return lookupResult.entry.children!.map(v=>v);
        }else{
            return (lookupResult.entry.mountFs as MountFileEntry).fs!.listdir([...(lookupResult.restPath??[])].join('/'))
        }
        
    }
    async mkdir(path:string){
        let path2=this.pathSplit(path);
        let lookupResult=await this.lookupPathDir(path2,{createParentDirectories:true});
        if(lookupResult.restPath==undefined && lookupResult.entry.mountFs==null){
        }else{
            return (lookupResult.entry.mountFs as MountFileEntry).fs!.mkdir([...(lookupResult.restPath??[])].join('/'))
        }
        await this.saveChange();
    }
    //Don't create directory automatically
    async filetype(path:string):Promise<'dir'|'file'|'none'>{
        let path2=this.pathSplit(path);
        try{
            if(path==''){
                return this.root!.type;
            }
            let lookupResult=await this.lookupPathDir(path2.slice(0,path2.length-1),{createParentDirectories:false});
            if(lookupResult.restPath==undefined && lookupResult.entry.mountFs==null){
                let parent=lookupResult.entry;
                let found=parent.children!.find(v=>v.name===path2[path2.length-1]);
                return found===undefined?'none':found.type;
            }else{
                return (lookupResult.entry.mountFs as MountFileEntry).fs!.filetype([...(lookupResult.restPath??[]),path2.at(-1)!].join('/'))
            }
        }catch(e){
            this.throwIfNotInternalError(e);
            return 'none'
        }
    }
    async rename(path:string,newPath:string){
        let path2=this.pathSplit(path);
        let newPath2=this.pathSplit(newPath);
        let parent=await this.lookupPathDir(path2.slice(0,path2.length-1),{createParentDirectories:false})
        let newParent=await this.lookupPathDir(newPath2.slice(0,path2.length-1),{createParentDirectories:true});
        if(parent.restPath==undefined && newParent.restPath==undefined && parent.entry.mountFs==null && newParent.entry.mountFs==null){
            let foundIndex=parent.entry.children!.findIndex(v=>v.name==path2[path2.length-1]);
            let [t1]=parent.entry.children!.splice(foundIndex,1);
            t1.name=newPath2[newPath2.length-1];
            newParent.entry.children!.push(t1);
            await this.saveChange();
        }else if(parent.entry==newParent.entry){
            await (parent.entry.mountFs as MountFileEntry).fs!.rename(
                [parent.restPath??[],path2.at(-1)].join('/'),
                [newParent.restPath??[],path2.at(-1)].join('/'))
        }else{
            throw new Error('Cross filesystem rename is not supported');
        }
    }
    async dataDir(): Promise<string> {
        return ''
    }
    
    async read(path: string, offset: number, buf: Uint8Array): Promise<number> {
        assert(buf.length>0);
        let path2=this.pathSplit(path);
        let lookupResult=await this.lookupPathDir(path2.slice(0,path2.length-1),{createParentDirectories:false});
        if(lookupResult.entry.mountFs==null){
            let entry=lookupResult.entry.children!.find(t1=>t1.name==path2.at(-1));
            let datas=new Array<{key:string,size:number}>();
            if(typeof entry!.dataKey==='string'){
                datas.push({key:entry!.dataKey,size:entry!.size!})
            }else{
                datas=entry!.dataKey!
            }
            let pos=0;
            let blk=0;
            for(blk=0;blk<datas.length;blk++){
                if(pos+datas[blk].size>offset){
                    break;
                }
                pos+=datas[blk].size;
            }
            let len=Math.min(datas[blk].size-(offset-pos),buf.byteLength);
            if(len<=0)return 0;
            let bufsrc=await this.db!.getItem(datas[blk].key);
            buf.set(new Uint8Array(bufsrc.buffer,offset-pos,len));
            return len;
        }else{
            return await (lookupResult.entry.mountFs as MountFileEntry).fs!.read([...(lookupResult.restPath??[]),path2.at(-1)!].join('/'),offset,buf);
        }
    }
    async write(path: string, offset: number, buf: Uint8Array): Promise<number> {
        assert(buf.length>0);
        let path2=this.pathSplit(path);
        let lookupResult=await this.lookupPathDir(path2.slice(0,path2.length-1),{createParentDirectories:true});
        if(lookupResult.entry.mountFs==null){
            let entry=lookupResult.entry.children!.find(t1=>t1.name==path2.at(-1));
            if(entry==undefined){
                let newEntry={
                    type:'file',name:path2[path2.length-1],
                    dataKey:[{key:GenerateRandomString(),size:offset}],
                    mtime:GetCurrentTime().getTime(),
                    size:offset
                }
                await this.db!.setItem(newEntry.dataKey[0].key,new Uint8Array(newEntry.dataKey[0].size))
                entry=newEntry as any;
                lookupResult.entry.children!.push(entry!);
            }
            let datas=new Array<{key:string,size:number}>();
            if(typeof entry!.dataKey==='string'){
                datas.push({key:entry!.dataKey,size:entry!.size!})
            }else{
                datas=entry!.dataKey!
            }
            if(offset>entry!.size!){
                this.truncate(path,offset);
            }
            let pos=0,blk=0,endblk=0,startblk=0,startpos=0,endpos=0;
            for(blk=0;blk<datas.length;blk++){
                if(pos+datas[blk].size>offset){
                    break;
                }
                pos+=datas[blk].size;
            }
            startblk=blk;
            startpos=pos;
            for(;blk<datas.length;blk++){
                if(pos+datas[blk].size>offset+buf.byteLength){
                    break;
                }
                pos+=datas[blk].size;
            }
            endblk=blk;
            endpos=pos;
            let newDatas=new Array<{key:string,size:number}>();
            for(let t1=0;t1<startblk;t1++){
                newDatas.push(datas[t1]);
            }
            if(startpos<offset){
                let newKey=GenerateRandomString();
                let startblk2=await this.db!.getItem(datas[startblk].key) as Uint8Array;
                await this.db!.setItem(newKey,startblk2.slice(0,offset-startpos));
                newDatas.push({key:newKey,size:offset-startpos});
            }
            {
                let newKey=GenerateRandomString();
                await this.db!.setItem(newKey,buf.slice());
                newDatas.push({key:newKey,size:buf.length});
            }
            if(endblk<datas.length){
                if(endpos<offset+buf.byteLength){
                    let newKey=GenerateRandomString();
                    let endblk2=await this.db!.getItem(datas[endblk].key) as Uint8Array;
                    let blkSplice=offset+buf.byteLength-endpos
                    await this.db!.setItem(newKey,endblk2.slice(blkSplice,endblk2.byteLength));
                    newDatas.push({key:newKey,size:endblk2.byteLength-blkSplice});
                    await this.db!.delete(datas[endblk].key);
                }else{
                    newDatas.push(datas[endblk]);
                }
            }
            for(let t1=endblk+1;t1<datas.length;t1++){
                newDatas.push(datas[t1]);
            }
            for(let t1=startblk;t1<endblk;t1++){
                await this.db!.delete(datas[t1].key);
            }
            entry!.dataKey=newDatas;
            entry!.size=entry!.dataKey.reduce((prev,curr)=>prev+curr.size,0);
            await this.saveChange();
            return buf.byteLength;
        }else{
            return await (lookupResult.entry.mountFs as MountFileEntry).fs!.write([...(lookupResult.restPath??[]),path2.at(-1)!].join('/'),offset,buf);
        }
    }
    async stat(path: string): Promise<{ atime: Date; mtime: Date; ctime: Date; birthtime: Date; size: number; }> {
        let path2=this.pathSplit(path);
        try{
            let lookupResult=await this.lookupPathDir(path2.slice(0,path2.length-1),{createParentDirectories:false});
            if(lookupResult.entry.mountFs==null){
                let parent=lookupResult.entry;
                let found=parent.children!.find(v=>v.name===path2[path2.length-1]);
                if(found==undefined){
                    throw new Error(`${path} can't be read.`);
                }else{
                    let mtimDat=new Date(found.mtime);
                    return {atime:mtimDat,mtime:mtimDat,ctime:mtimDat,birthtime:mtimDat,size:found.size??0};
                }
            }else{
                return (lookupResult.entry.mountFs as MountFileEntry).fs!.stat([...(lookupResult.restPath??[]),path2.at(-1)!].join('/'))
            }
        }catch(e){
            this.throwIfNotInternalError(e);
            throw new Error(`${path} can't be read.`);
        }
    }
    async truncate(path: string, newSize: number): Promise<void> {
        let path2=this.pathSplit(path);
        try{
            let lookupResult=await this.lookupPathDir(path2.slice(0,path2.length-1),{createParentDirectories:false});
            if(lookupResult.entry.mountFs==null){
                assert(lookupResult.entry.type=='file',`incorrect file type for ${path}`);
                let datas=new Array<{key:string,size:number}>();
                if(typeof lookupResult.entry.dataKey==='string'){
                    datas.push({key:lookupResult.entry.dataKey,size:lookupResult.entry.size!});
                }else{
                    datas=lookupResult.entry.dataKey!;
                }
                if(lookupResult.entry.size!<newSize){
                    let newBlk={key:GenerateRandomString(),size:newSize-lookupResult.entry.size!}
                    await this.db!.setItem(newBlk.key,new Uint8Array(newBlk.size));
                    datas.push(newBlk);
                }else if(lookupResult.entry.size!>newSize){
                    let pos=0;
                    let t1=-1;
                    for(t1=0;t1<datas.length;t1++){
                        if(pos+datas[t1].size>newSize){
                            break;
                        }
                    }
                    let data1=await this.db!.getItem(datas[t1].key) as Uint8Array;
                    await this.db!.setItem(datas[t1].key,data1.slice(0,newSize-pos));
                    lookupResult.entry.dataKey=datas.slice(0,t1);
                }
                lookupResult.entry.size=newSize;
            }else{
                (lookupResult.entry.mountFs as MountFileEntry).fs!.truncate([...(lookupResult.restPath??[]),path2.at(-1)].join('/'),newSize)
            }
        }catch(e){
            this.throwIfNotInternalError(e);
        }
    }
}

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

import type * as nodefsmodule from 'fs/promises'
import type * as nodepathmodule from 'path'


export class NodeSimpleFileSystem implements SimpleFileSystem{
    
    
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
    mtx=new mutex();
    async ensureInited(): Promise<void> {
        await this.mtx.lock();
        try{
            this.nodefs=await import('fs/promises');
            this.nodepath=await import('path')
            try{
                await this.nodefs!.stat('c:\\');
                this.winbasepath=true;
            }catch(e:any){
                throwIfAbortError(e);
            }
        }finally{
            await this.mtx.unlock();
        }
        
    }
    async writeAll(path: string, data: Uint8Array): Promise<void> {
        path=this.pathConvert(path);
        let parent=this.nodepath!.dirname(path);
        if(await this.filetype(parent)==='none'){
            await this.mkdir(parent);
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
    async listdir(path: string): Promise<{ name: string; type: 'dir'|'file'; }[]> {
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
        return dirname2(getWWWRoot());
    }
    async read(path: string, offset: number, buf: Uint8Array): Promise<number> {
        path=this.pathConvert(path);
        let fh=await this.nodefs!.open(path,'r+');
        try{
            let r=await fh.read(buf,0,buf.byteLength,offset);
            return r.bytesRead;
        }finally{
            fh.close();
        }
    }
    async write(path: string, offset: number, buf: Uint8Array): Promise<number> {
        path=this.pathConvert(path);
        let parent=this.nodepath!.dirname(path);
        if(await this.filetype(parent)==='none'){
            await this.mkdir(parent);
        }
        let fh=await this.nodefs!.open(path,'r+');
        try{
            let r=await fh.write(buf,0,buf.byteLength,offset);
            return r.bytesWritten;
        }finally{
            fh.close();
        }
    }
    async stat(path: string): Promise<{ atime: Date; mtime: Date; ctime: Date; birthtime: Date; size: number; }> {
        path=this.pathConvert(path);
        return this.nodefs!.stat(path);
    }
    async truncate(path: string, newSize: number): Promise<void> {
        path=this.pathConvert(path);
        await this.nodefs!.truncate(path,newSize);
    }
}

export class DirAsRootFS implements SimpleFileSystem{
    pxprpc?: ClientInfo | undefined;
    constructor(public fs:SimpleFileSystem,public rootDir:string){
        if(!this.rootDir.endsWith('/')){
            this.rootDir+='/';
        }
    }
    async ensureInited(): Promise<void> {
        return await this.fs.ensureInited();
    }
    protected pConvertPath(path:string){
        if(path.startsWith('/')){
            return this.rootDir+path.substring(1);
        }else{
            return this.rootDir+path;
        }
    }
    async writeAll(path: string, data: Uint8Array): Promise<void> {
        return this.fs.writeAll(this.pConvertPath(path),data);
    }
    async readAll(path: string): Promise<Uint8Array | null> {
        return this.fs.readAll(this.pConvertPath(path));
    }
    async read(path: string, offset: number, buf: Uint8Array): Promise<number> {
        return this.fs.read(this.pConvertPath(path),offset,buf);
    }
    async write(path: string, offset: number, buf: Uint8Array): Promise<number> {
        return this.fs.write(this.pConvertPath(path),offset,buf);
    }
    async delete2(path: string): Promise<void> {
        return this.fs.delete2(this.pConvertPath(path));
    }
    async listdir(path: string): Promise<{ name: string; type: 'dir'|'file'; }[]> {
        return this.fs.listdir(this.pConvertPath(path));
    }
    async filetype(path: string): Promise<"dir" | "file" | "none"> {
        return this.fs.filetype(this.pConvertPath(path));
    }
    async mkdir(path: string): Promise<void> {
        return this.fs.mkdir(this.pConvertPath(path));
    }
    async rename(path: string, newPath: string): Promise<void> {
        return this.fs.rename(this.pConvertPath(path),this.pConvertPath(newPath));
    }
    async dataDir(): Promise<string> {
        return '';
    }
    async stat(path: string): Promise<{ atime: Date; mtime: Date; ctime: Date; birthtime: Date; size: number; }> {
        return this.fs.stat(this.pConvertPath(path));
    }
    async truncate(path: string, newSize: number): Promise<void> {
        return this.fs.truncate(this.pConvertPath(path),newSize);
    }
    
}

class SimpleFileSystemDataSource implements UnderlyingSource<Uint8Array>{
    constructor(public fs:SimpleFileSystem,public path:string){}
    public readPos=0;
    public readBuffer=new Uint8Array(64*1024);
    async pull(controller: ReadableStreamController<Uint8Array>): Promise<void>{
        let bytesRead=await this.fs.read(this.path,this.readPos,this.readBuffer);
        if(bytesRead==0){
            controller.close();
            return;
        }
        this.readPos+=bytesRead;
        controller.enqueue(this.readBuffer.slice(0,bytesRead));
    }
}
export function getFileSystemReadableStream(fs:SimpleFileSystem,path:string,initialSeek?:number){
    let dataSource=new SimpleFileSystemDataSource(fs,path);
    if(initialSeek!=undefined)dataSource.readPos=initialSeek;
    return new ReadableStream(dataSource)
}
class SimpleFileSystemDataSink implements UnderlyingSink<Uint8Array>{
    public writePos=0;
    constructor(public fs:SimpleFileSystem,public path:string){}
    async write(chunk: Uint8Array, controller: WritableStreamDefaultController): Promise<void>{
        await this.fs.write(this.path,this.writePos,chunk);
    }
}
export function getFileSysteWritableStream(fs:SimpleFileSystem,path:string,initialSeek?:number){
    let dataSink=new SimpleFileSystemDataSink(fs,path);
    if(initialSeek!=undefined)dataSink.writePos=initialSeek;
    return new WritableStream(dataSink)
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

interface CodeContextEnvInitVar{
    fs:{
        simple?:SimpleFileSystem,
        codePath?:string,
        loadScript:(path:string)=>Promise<void>
    },
    //import all members of module into _ENV
    import2env:(moduleName:string)=>Promise<void>,
    globalThis:typeof globalThis
}

//Used in workerinit.createRunCodeContextConnectorForNotebookFile
export async function initNotebookCodeEnv(_ENV:any,opt?:{codePath?:string}){
    await ensureDefaultFileSystem();
    let fs:CodeContextEnvInitVar['fs']={
        simple: defaultFileSystem!,
        codePath: opt?.codePath,
        loadScript:async function(path:string){
            assert(this.simple!=undefined);
            if(path.startsWith('.')){
                assert(this.codePath!=undefined )
                path=dirname2(this.codePath)+path.substring(1);
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
    _ENV.fs.loadScript[CustomFunctionParameterCompletionSymbol]=makeFunctionCompletionWithFilePathArg0(path.dirname(_ENV.fs.codePath??''));
    if(_ENV.fs.simple!=undefined){
        _ENV.fs.simple.readAll[CustomFunctionParameterCompletionSymbol]=makeFunctionCompletionWithFilePathArg0(undefined);
        _ENV.fs.simple.writeAll[CustomFunctionParameterCompletionSymbol]=makeFunctionCompletionWithFilePathArg0(undefined);
        _ENV.fs.simple.listdir[CustomFunctionParameterCompletionSymbol]=makeFunctionCompletionWithFilePathArg0(undefined);
        _ENV.fs.simple.filetype[CustomFunctionParameterCompletionSymbol]=makeFunctionCompletionWithFilePathArg0(undefined);
        _ENV.fs.simple.delete2[CustomFunctionParameterCompletionSymbol]=makeFunctionCompletionWithFilePathArg0(undefined);
    }
    _ENV.globalThis=globalThis;
}
