
import type { Dirent,StatsBase } from 'fs';
import type {readFile,writeFile,unlink,readdir,mkdir,rmdir,stat,lstat,readlink,symlink,chmod,rm,access,copyFile} from 'fs/promises'
import { SimpleFileSystem } from 'partic2/CodeRunner/JsEnviron';
import { assert, requirejs } from 'partic2/jsutils1/base';
import {getWWWRoot, path} from 'partic2/jsutils1/webutils'
import { getPersistentRegistered } from 'partic2/pxprpcClient/registry';


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
  let err=new Error('File not found.') as any;
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
      if(options.recursive || await this.wrapped.filetype(path)=='file'){
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

export let pathCompat=(function(){
//https://github.com/ionic-team/rollup-plugin-node-polyfills/blob/master/polyfills/path.js
  function normalizeArray(parts: string[], allowAboveRoot: boolean) {
    // if the path tries to go above the root, `up` ends up > 0
    var up = 0;
    for (var i = parts.length - 1; i >= 0; i--) {
      var last = parts[i];
      if (last === '.') {
        parts.splice(i, 1);
      } else if (last === '..') {
        parts.splice(i, 1);
        up++;
      } else if (up) {
        parts.splice(i, 1);
        up--;
      }
    }
  
    // if the path is allowed to go above the root, restore leading ..s
    if (allowAboveRoot) {
      for (; up--; up) {
        parts.unshift('..');
      }
    }
  
    return parts;
  }
  
  // Split a filename into [root, dir, basename, ext], unix version
  // 'root' is just a slash, or nothing.
  var splitPathRe =
      /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
  var splitPath = function(filename: string) {
    return splitPathRe.exec(filename)!.slice(1);
  };
  
  // path.resolve([from ...], to)
  // posix version
  function resolve(... args:string[]) {
    var resolvedPath = '',
        resolvedAbsolute = false;
  
    for (var i = args.length - 1; i >= -1 && !resolvedAbsolute; i--) {
      var path = (i >= 0) ? args[i] : '/';
  
      // Skip empty and invalid entries
      if (typeof path !== 'string') {
        throw new TypeError('Arguments to path.resolve must be strings');
      } else if (!path) {
        continue;
      }
  
      resolvedPath = path + '/' + resolvedPath;
      resolvedAbsolute = path.charAt(0) === '/';
    }
  
    // At this point the path should be resolved to a full absolute path, but
    // handle relative paths to be safe (might happen when process.cwd() fails)
  
    // Normalize the path
    resolvedPath = normalizeArray(resolvedPath.split('/').filter(function(p) {
      return !!p;
    }), !resolvedAbsolute).join('/');
  
    return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
  };
  
  // path.normalize(path)
  // posix version
  function normalize(path:string) {
    var isPathAbsolute = isAbsolute(path),
        trailingSlash = path.substring(-1) === '/';
  
    // Normalize the path
    path = normalizeArray(path.split('/').filter(function(p) {
      return !!p;
    }), !isPathAbsolute).join('/');
  
    if (!path && !isPathAbsolute) {
      path = '.';
    }
    if (path && trailingSlash) {
      path += '/';
    }
  
    return (isPathAbsolute ? '/' : '') + path;
  };
  
  // posix version
  function isAbsolute(path:string) {
    return path.charAt(0) === '/';
  }
  
  // posix version
  function join(...pathParts:string[]) {
    var paths = Array.prototype.slice.call(pathParts, 0);
    return normalize(paths.filter(function(p:any, index:number) {
      if (typeof p !== 'string') {
        throw new TypeError('Arguments to path.join must be strings');
      }
      return p;
    }).join('/'));
  }
  
  
  // path.relative(from, to)
  // posix version
  function relative(from:string, to:string) {
    from = resolve(from).substring(1);
    to = resolve(to).substring(1);
  
    function trim(arr:string[]) {
      var start = 0;
      for (; start < arr.length; start++) {
        if (arr[start] !== '') break;
      }
  
      var end = arr.length - 1;
      for (; end >= 0; end--) {
        if (arr[end] !== '') break;
      }
  
      if (start > end) return [];
      return arr.slice(start, end - start + 1);
    }
  
    var fromParts = trim(from.split('/'));
    var toParts = trim(to.split('/'));
  
    var length = Math.min(fromParts.length, toParts.length);
    var samePartsLength = length;
    for (var i = 0; i < length; i++) {
      if (fromParts[i] !== toParts[i]) {
        samePartsLength = i;
        break;
      }
    }
  
    var outputParts = [];
    for (var i = samePartsLength; i < fromParts.length; i++) {
      outputParts.push('..');
    }
  
    outputParts = outputParts.concat(toParts.slice(samePartsLength));
  
    return outputParts.join('/');
  }
  
  var sep = '/';
  var delimiter = ':';
  
  function dirname(path:string) {
    var result = splitPath(path),
        root = result[0],
        dir = result[1];
  
    if (!root && !dir) {
      // No dirname whatsoever
      return '.';
    }
  
    if (dir) {
      // It has a dirname, strip trailing slash
      dir = dir.substring(0, dir.length - 1);
    }
  
    return root + dir;
  }
  
  function basename(path:string, ext:string) {
    var f = splitPath(path)[2];
    // TODO: make this comparison case-insensitive on windows?
    if (ext && f.substr(-1 * ext.length) === ext) {
      f = f.substr(0, f.length - ext.length);
    }
    return f;
  }
  
  
  function extname(path:string) {
    return splitPath(path)[3];
  }
  return {
    extname: extname,
    basename: basename,
    dirname: dirname,
    sep: sep,
    delimiter: delimiter,
    relative: relative,
    join: join,
    isAbsolute: isAbsolute,
    normalize: normalize,
    resolve: resolve
  };
})();

export async function buildNodeCompatApiTjs(){
  const {buildTjs,XplatjDefaultRpcName}=await import('partic2/tjshelper/tjsbuilder');
  const tjs=await buildTjs();
  const {TjsSfs}=await import('partic2/CodeRunner/JsEnviron');
  const fs=new TjsSfs();
  fs.from(tjs);
  await fs.ensureInited();
  const {NodeFsAdapter}=await import('partic2/packageManager/nodecompat');
  const nfs=new NodeFsAdapter(fs);
  const {ServerHostWorker1RpcName,getPersistentRegistered,getAttachedRemoteRigstryFunction}=await import('partic2/pxprpcClient/registry')
  let wwwroot='';
  const serverWorker1=await getPersistentRegistered(ServerHostWorker1RpcName);
  if(serverWorker1!=undefined){
      const remoteJsRpc=await getAttachedRemoteRigstryFunction(await serverWorker1.ensureConnected());
      const webutilsMod=await remoteJsRpc.loadModule('partic2/jsutils1/webutils');
      wwwroot=await remoteJsRpc.callJsonFunction(webutilsMod,'getWWWRoot',[]);
      wwwroot=wwwroot.replace(/\\/g,'/');
      if(wwwroot.startsWith('/')){
          wwwroot='/'+wwwroot;
      }
      webutilsMod.free();
  }else{
      if(await getPersistentRegistered(XplatjDefaultRpcName)!=undefined){
        let {pathname}=new URL(getWWWRoot());
        if(pathname.startsWith('/localFile')){
            wwwroot=pathname.replace(/^\/localFile/,'');
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