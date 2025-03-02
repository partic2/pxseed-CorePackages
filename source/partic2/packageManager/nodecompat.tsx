
import type { Dirent,StatsBase } from 'fs';
import type {readFile,writeFile,unlink,readdir,mkdir,rmdir,stat,lstat,readlink,symlink,chmod} from 'fs/promises'
import { SimpleFileSystem } from 'partic2/CodeRunner/JsEnviron';
import { assert } from 'partic2/jsutils1/base';
import {path} from 'partic2/jsutils1/webutils'


//node compatible fs, To used in isomorphic-git

class NodeFsCompatDirent implements Dirent{
    constructor(public fileType:string,public name:string,public path:string){};
    isFile(): boolean {return this.fileType=='file'}
    isDirectory(): boolean {return this.fileType=='dir'}
    isBlockDevice(): boolean {return false;}
    isCharacterDevice(): boolean {return false}
    isSymbolicLink(): boolean {return false}
    isFIFO(): boolean {return false}
    isSocket(): boolean {return false}
}
class NodeFsCompatStats extends NodeFsCompatDirent implements StatsBase<number>{
    dev: number=0;ino: number=0;
    mode: number=0o777;
    nlink: number=0;uid: number=0;gid: number=0;rdev: number=0;
    size: number=0;
    blksize: number=0;blocks: number=0;
    get atimeMs(){return this.atime.getTime()};
    get mtimeMs(){return this.mtime.getTime()};
    get ctimeMs(){return this.ctime.getTime()};
    get birthtimeMs(){return this.birthtime.getTime()};
    atime: Date=new Date(0);
    mtime: Date=new Date(0);
    ctime: Date=new Date(0);
    birthtime: Date=new Date(0);
}
export class NodeFsAdapter{
    constructor(public wrapped:SimpleFileSystem){}
    readFile:typeof readFile=(async (path:string,options?:{encoding?:string})=>{
        let data=await this.wrapped!.readAll(path);
        if(data==null){
            let err=new Error('File not existed.');
            err.name='ENOENT'
            throw err;
        }
        if(options?.encoding!=undefined){
            assert(options.encoding.toLowerCase()=='utf8');
            return new TextDecoder().decode(data);
        }else{
            return data;
        }
    }) as any;
    writeFile:typeof writeFile=(async (path:string,
        data:string|Uint8Array,
        options?:{encoding?:string})=>{
        if(options?.encoding!=undefined){
            assert(options.encoding.toLowerCase()=='utf8');
        }
        if(typeof data==='string'){
            data=new TextEncoder().encode(data);
        }
        await this.wrapped!.writeAll(path,data);
    }) as any;
    unlink:typeof unlink=(async (path:string)=>{
        await this.wrapped!.delete2(path);
    })as any;
    readdir:typeof readdir=(async (path2:string,opt?: {withFileTypes?: boolean})=>{
        let result=await this.wrapped!.listdir(path2);
        if(opt?.withFileTypes!=true){
            return result.map(v=>v.name);
        }else{
            return result.map(v=>new NodeFsCompatDirent(v.type,v.name,path.join(path2,v.name)));
        }
    })as any;
    mkdir:typeof mkdir=(async (path2:string,opt?:number|{recursive?:boolean,mode?:number})=>{
        let result=await this.wrapped!.listdir(path2);
        this.wrapped!.mkdir(path2);
    })as any;
    rmdir:typeof rmdir=(async (path:string)=>{
        if((await this.wrapped!.listdir(path)).length==0){
            await this.wrapped!.delete2(path);
        }else{
            throw new Error('rmdir failed, directory not empty.');
        }
    })as any;
    stat:typeof stat=(async (path:string)=>{
        let sr=await this.wrapped!.stat(path);
        let nst=new NodeFsCompatStats(await this.wrapped!.filetype(path),path,path);
        Object.assign(nst,sr);
    })as any;
    lstat:typeof lstat=(async (path:string)=>{
        return await this.stat(path)
    })as any;
    readlink:typeof readlink=(async ()=>{
        throw new Error('Not implemented');
    })as any;
    symlink:typeof symlink=(async ()=>{
        throw new Error('Not implemented');
    })as any;
    chmod:typeof lstat=(async (path:string,mode:number)=>{
    })as any;
}