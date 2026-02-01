
import type { Dirent,StatsBase } from 'fs';
import type {readFile,writeFile,unlink,readdir,mkdir,rmdir,stat,lstat,readlink,symlink,chmod,rm,access,copyFile} from 'fs/promises'
import { SimpleFileSystem } from 'partic2/CodeRunner/JsEnviron';
import { assert, requirejs } from 'partic2/jsutils1/base';
import {getWWWRoot, path} from 'partic2/jsutils1/webutils'
import { easyCallRemoteJsonFunction, getPersistentRegistered } from 'partic2/pxprpcClient/registry';


//node compatible fs, To used in isomorphic-git

class NodeFsCompatDirent{
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
function makeENOENT(){
  let err=new Error('no such file or directory.') as any;
  err.code='ENOENT';
  return err;
}
export class NodeFsAdapter{
    constructor(public wrapped:SimpleFileSystem){}
    access:typeof access=(async (path: string, mode?: number)=>{
      if(await this.wrapped.filetype(path)==='none'){
        throw makeENOENT();
      }
    }) as any
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
        this.wrapped!.mkdir(path2);
    })as any;
    rmdir:typeof rmdir=(async (path:string)=>{
        if((await this.wrapped!.listdir(path)).length==0){
            await this.wrapped!.delete2(path);
        }else{
            throw new Error('rmdir failed, directory not empty.');
        }
    })as any;
    rm:typeof rm=(async (path: string, options?: any)=>{
      if(options?.recursive || await this.wrapped.filetype(path)=='file'){
        await this.wrapped!.delete2(path);
      }else{
        await this.rmdir(path);
      }
    })as any
    stat:typeof stat=(async (path:string)=>{
        let sr=await this.wrapped!.stat(path);
        let nst=new NodeFsCompatStats(await this.wrapped!.filetype(path),path,path);
        Object.assign(nst,sr);
        return nst;
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
    chmod:typeof chmod=(async (path:string,mode:number)=>{
    })as any;
    copyFile:typeof copyFile=(async (src: string, dest: string, mode?: number)=>{
      let data=await this.wrapped.readAll(src);
      if(data==null){
        throw makeENOENT();
      }
      await this.wrapped.writeAll(dest,data);
    }) as any;
}

export let pathCompat={
  sep:getWWWRoot().includes('\\')?'\\':'/',
  join(...args:string[]){
      let parts=[] as string[];
      for(let t1 of args){
          for(let t2 of t1.split(/[\\\/]/)){
              if(t2==='..' && parts.length>=1){
                  parts.pop();
              }else if(t2==='.'){
                  //skip
              }else{
                  parts.push(t2);
              }
          }
      }
      return parts.join(this.sep);
  },
  dirname(p:string){
      return this.join(p,'..');
  },
  basename(p:string){
    p.split(/[\\\/]/).at(-1)??'';
  }
}

export async function buildNodeCompatApiTjs(){
  const {buildTjs}=await import('partic2/tjshelper/tjsbuilder');
  const tjs=await buildTjs();
  const {TjsSfs}=await import('partic2/CodeRunner/JsEnviron');
  const fs=new TjsSfs();
  fs.from(tjs);
  await fs.ensureInited();
  const {NodeFsAdapter}=await import('partic2/packageManager/nodecompat');
  const nfs=new NodeFsAdapter(fs);
  const {ServerHostWorker1RpcName,getPersistentRegistered,getAttachedRemoteRigstryFunction}=await import('partic2/pxprpcClient/registry')
  let wwwroot=getWWWRoot();
  if(wwwroot.startsWith('http')){
    //get the server wwwroot
    const serverWorker1=await getPersistentRegistered(ServerHostWorker1RpcName);
    if(serverWorker1!=undefined){
        wwwroot=await easyCallRemoteJsonFunction(await serverWorker1.ensureConnected(),'partic2/jsutils1/webutils','getWWWRoot',[]);;
        wwwroot=wwwroot.replace(/\\/g,'/');
        if(wwwroot.startsWith('/')){
            wwwroot='/'+wwwroot;
        }
    }
  }
  
  return {fs:{promises:nfs},'fs/promises':nfs,wwwroot:wwwroot,path:pathCompat}
}

let cachedTypescriptModule:typeof import('typescript')|null=null;

export async function getTypescriptModuleTjs():Promise<typeof import('typescript')>{
  if(cachedTypescriptModule!=null){
    return cachedTypescriptModule!;
  }
  let importTyescriptSucc=false;
  try{
    let ts=await requirejs.promiseRequire<any>('typescript');
    importTyescriptSucc=true;
    cachedTypescriptModule=ts.default??ts;
    return cachedTypescriptModule!;
  }catch(err){
    await Promise.all(Object.keys(await requirejs.getFailed()).map((t1)=>requirejs.undef(t1)));
  }
  try{
    let ts=await requirejs.promiseRequire<any>('partic2/packageManager/typescript4tjs');
    importTyescriptSucc=true;
    cachedTypescriptModule=ts.default??ts;
    return cachedTypescriptModule!;
  }catch(err){
    await Promise.all(Object.keys(await requirejs.getFailed()).map((t1)=>requirejs.undef(t1)));
  }
  {
    let downloadTs=await fetch('https://cdnjs.cloudflare.com/ajax/libs/typescript/5.8.3/typescript.min.js');
    assert(downloadTs.ok);
    let tstxt=await downloadTs.text();
    tstxt="define(['exports','module'],function(exports,module){"+tstxt+"})";
    const {fs,wwwroot,path}=await buildNodeCompatApiTjs();
    await fs.promises.writeFile(path.join(wwwroot,'partic2','packageManager','typescript4tjs.js'),new TextEncoder().encode(tstxt));
  }
  {
    let ts=await requirejs.promiseRequire<any>('partic2/packageManager/typescript4tjs');
    importTyescriptSucc=true;
    cachedTypescriptModule=ts.default??ts;
    return cachedTypescriptModule!;
  }
}