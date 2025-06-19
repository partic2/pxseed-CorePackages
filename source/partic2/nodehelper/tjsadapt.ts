import { RpcExtendClientObject, TableSerializer } from "pxprpc/extend";
import { Invoker,getDefault } from "partic2/pxprpcBinding/JseHelper__JseIo";
import { WaitUntil, future,copy, ArrayWrap2, GenerateRandomString, requirejs } from "partic2/jsutils1/base";

import type {} from '@txikijs/types/src/index'


/**
        * Implemented by entities from which data can be read.
        */
interface Reader {
    /**
    * Reads data into the given buffer. Resolves to the number of read bytes or null for EOF.
    *
    * @param buf Buffer to read data into.
    */
    read(buf: Uint8Array): Promise<number|null>;
}

/**
* Implemented by entities to which data can be written.
*/
interface Writer {
    /**
    * Writes the given data buffer. Resolves to the number of written bytes.
    *
    * @param buf Buffer of data to write.
    */
    write(buf: Uint8Array): Promise<number>;
}

let tjsImpl:any=null;

import os from 'os'
import path from 'path'
import fs from 'fs/promises'
import child_process from 'child_process'
import { wrapReadable } from "./nodeio";

export async function tjsFrom():Promise<typeof tjs>{
    if(tjsImpl!=null){
        return tjsImpl
    }
    
let platform=os.platform();

async function realpath(path: string): Promise<string>{
    return await fs.realpath(path);
}

/**
* Removes the given file.
*
* @param path Path to be removed.
*/
async function unlink(path: string): Promise<void>{
    return await fs.unlink(path);
}

/**
* Renames the given path.
*
* @param path Current path.
* @param newPath New desired path name.
*/
async function rename(path: string, newPath: string): Promise<void>{
    return await fs.rename(path,newPath);
}


/**
* Create a unique temporary file. The given template must end in XXXXXX, and the Xs will
* be replaced to provide a unique file name. The returned object is an open file handle.Handle
*
* @param template Template for the file name.
*/
async function mkstemp(template: string): Promise<FileHandle>{
    let tmpdir=os.tmpdir()
    let rpath=path.join(tmpdir,template).replace(/XXXXXX$/,GenerateRandomString().substring(4,10))
    let fh=new FileHandle(await fs.open(rpath),rpath);
    return fh;
}

class FileHandle {
    /**
    * path: The file path.
    */
    constructor(public nodeFh:fs.FileHandle,public path:string){
    }
    /**
    * Reads data into the given buffer at the given file offset. Returns
    * the amount of read data or null for EOF.
    *
    * @param buffer Buffer to read data into.
    * @param offset Offset in the file to read from.
    */
    async read(buffer: Uint8Array, offset?: number): Promise<number|null>{
        let result=await this.nodeFh.read(Buffer.from(buffer.buffer,buffer.byteOffset,buffer.byteLength),offset);
        if(result.bytesRead==0){
            return null;
        }else{
            return result.bytesRead;
        }
    }
    
    /**
    * Writes data from the given buffer at the given file offset. Returns
    * the amount of data written.
    *
    * @param buffer Buffer to write.
    * @param offset Offset in the file to write to.
    */
    async write(buffer: Uint8Array, offset?: number): Promise<number>{
        let result=await this.nodeFh.write(Buffer.from(buffer.buffer,buffer.byteOffset,buffer.byteLength),offset)
        return result.bytesWritten
    }
    
    /**
    * Closes the file.
    */
    async close(): Promise<void>{
        await this.nodeFh.close();
    }
    
    /**
    * Get the file status information.
    * See [stat(2)](https://man7.org/linux/man-pages/man2/lstat.2.html)
    */
    async stat(): Promise<StatResult>{
        return stat(this.path);
    }
    
    /**
    * Truncates the file to the given length.
    *
    * @param offset Length to truncate the file to.
    */
    async truncate(offset?: number): Promise<void>{
        this.nodeFh.truncate(offset);
    }
    
}

interface StatResult {
    dev: number;
    mode: number;
    nlink: number;
    uid: number;
    gid: number;
    rdev: number;
    ino: number;
    size: number;
    blksize: number;
    blocks: number;
    atim: Date;
    mtim: Date;
    ctim: Date;
    birthtim: Date;
    isBlockDevice: boolean;
    isCharacterDevice: boolean;
    isDirectory: boolean;
    isFIFO: boolean;
    isFile: boolean;
    isSocket: boolean;
    isSymbolicLink: boolean;
}

/**
* Gets file status information.
* See [stat(2)](https://man7.org/linux/man-pages/man2/stat.2.html)
*
* @param path Path to the file.
*/
async function stat(path: string): Promise<StatResult>{
    let statResult=await fs.stat(path);
    let r={
        dev:0,
        mode:0o777,
        nlink:0,
        uid:0,
        gid:0,
        rdev:0,
        ino:0,
        blksize:0,
        blocks:0,
        size:statResult.size,
        atim:statResult.atime,
        mtim:statResult.mtime, 
        ctim:statResult.ctime,
        birthtim:statResult.birthtime,
        isBlockDevice: false,
        isCharacterDevice: false,
        isFIFO: false,
        isSocket: false,
        isSymbolicLink: false,
        isDirectory:statResult.isDirectory(), 
        isFile:statResult.isFile()}
    return r;
}


/**
* Opens the file at the given path. Opening flags:
*
*   - r: open for reading
*   - w: open for writing, truncating the file if it exists
*   - x: open with exclusive creation, will fail if the file exists
*   - a: open for writing, appending at the end if the file exists
*   - +: open for updating (reading and writing)
*
* ```js
* const f = await tjs.open('file.txt', 'r');
* ```
* @param path The path to the file to be opened.
* @param flags Flags with which to open the file.
* @param mode File mode bits applied if the file is created. Defaults to `0o666`.
*/
async function open(path: string, flags: string, mode?: number): Promise<FileHandle>{
    return new FileHandle(await fs.open(path,flags,mode),path);
}

/**
* Removes the directory at the given path.
*
* @param path Directory path.
*/
async function rmdir(path: string): Promise<void>{
    await fs.rmdir(path);
}


/**
* Create a directory at the given path.
*
* @param path The path to of the directory to be created.
* @param options Options for making the directory.
*/
async function mkdir(path: string, options?: MkdirOptions): Promise<void>{
    await fs.mkdir(path,{recursive:true});
}

/**
* Copies the source file into the target.
*
* If `COPYFILE_EXCL` is specified the operation will fail if the target exists.
*
* If `COPYFILE_FICLONE` is specified it will attempt to create a reflink. If
* copy-on-write is not supported, a fallback copy mechanism is used.
*
* If `COPYFILE_FICLONE_FORCE` is specified it will attempt to create a reflink.
* If copy-on-write is not supported, an error is thrown.
*
* @param path Source path.
* @param newPath Target path.
* @param flags Specify the mode for copying the file.
*/
async function copyfile(path: string, newPath: string, flags?: number): Promise<void>{
    await fs.copyFile(path,newPath);
}


/**
* Open the directory at the given path in order to navigate its content.
* See [readdir(3)](https://man7.org/linux/man-pages/man3/readdir.3.html)
*
* @param path Path to the directory.
*/
async function readdir(path: string): Promise<DirHandle>{
    let children=await fs.readdir(path,{withFileTypes:true})
    let t1={
        close:async ()=>{},path,
        __iter:async function *(){
            for(let ch of children){
                yield {isFile:ch.isFile(),isDirectory:ch.isDirectory(),name:ch.name} as DirEnt
            }
        }(),
        next:function(){
            return this.__iter.next();
        },
        return:function(){return this.__iter.return()},
        throw:function(e:any){return this.__iter.throw(e)},
        [Symbol.asyncIterator]:function(){return this;},
    };
    return t1;
}


/**
* Reads the entire contents of a file.
*
* @param path File path.
*/
async function readFile(path: string): Promise<Uint8Array>{
    let fh=await open(path,'r');
    try{
        let stat2=await fh.stat();
        let offset=0;
        let buf=new Uint8Array(stat2.size);
        let readLen=await fh.read(buf,offset);
        while(readLen!=null){
            offset+=readLen;
            readLen=await fh.read(buf,offset);
        }
        return buf;
    }finally{
        await fh.close()
    }
}


/**
 * Recursively delete files and directories at the given path.
 * Equivalent to POSIX "rm -rf".
 *
 * @param path Path to be removed.
 */
async function rm(path: string): Promise<void>{
    await fs.rm(path,{recursive:true});
}

class Process {
    nodeProcess?:child_process.ChildProcessWithoutNullStreams
    constructor(public args: string | string[], public options?: ProcessOptions){
        if(typeof args==='string'){
            args=[args];
        }
        this.nodeProcess=child_process.spawn(args[0],args.slice(1),{
            stdio:'pipe'
        });

        if(this.options!=undefined){
            if((this.options.stdin??'ignore')==='pipe'){
                this.stdin={
                    write:(buf: Uint8Array):Promise<number>=>new Promise((resolve,reject)=>{
                        this.nodeProcess!.stdin.write(buf,(err)=>{
                            if(err!=null){
                                reject(err);
                                resolve(buf.length);
                            }
                        })
                    })
                }
            }
            if((this.options.stdout??'ignore')==='pipe'){
                this.stdout=wrapReadable(this.nodeProcess.stdout);
            }
            if((this.options.stderr??'ignore')==='pipe'){
                this.stderr=wrapReadable(this.nodeProcess.stderr);
            }
        }
        this.pid=this.nodeProcess.pid??-1
    }
    kill(): void{
        throw new Error('Not implemented');
    }
    async wait(): Promise<ProcessStatus>{
        return new Promise((resolve,reject)=>{
            this.nodeProcess!.on('exit',(code)=>{
                resolve({
                    exit_status:code??-1,
                    term_signal:null
                });
            })
        });
    }
    pid: number=-1;
    stdin?: Writer;
    stdout?: Reader;
    stderr?: Reader;
    
}


function spawn(args: string | string[], options?: ProcessOptions): Process{
    let p = new Process(args,options)
    return p;
}

var dataDir=requirejs.getConfig().wwwroot;
function homedir(){
    return dataDir
}

    let tjsi={
        realpath,unlink,rename,mkstemp,stat,open,rmdir,copyfile,mkdir,readdir,readFile,rm,spawn,homedir,platform,
        realPath:realpath,
        remove:rm,
        homeDir:dataDir,
        makeDir:mkdir,
        readDir:readdir,
        system:{platform:platform}
    } as any;
    
    return tjsi

}




interface MkdirOptions {
    /* The file mode for the new directory. Defaults to `0o777`. */
    mode?: number;
    /* Whether the directories will be created recursively or not. */
    recursive?: boolean;
}


interface DirEnt {
    name: string;
    isBlockDevice: boolean;
    isCharacterDevice: boolean;
    isDirectory: boolean;
    isFIFO: boolean;
    isFile: boolean;
    isSocket: boolean;
    isSymbolicLink: boolean;
}

/**
* Directory entries can be obtained through asynchronous iteration:
*
* ```js
* const dirIter = await tjs.readdir('.');
* for await (const item of dirIter) {
*     console.log(item.name);
* }
* ```
*/
interface DirHandle extends AsyncIterableIterator<DirEnt> {
    
    /**
    * Closes the directory handle.
    */
    close(): Promise<void>;
    
    /**
    * Path of the directory.
    */
    path: string;
}


interface ProcessStatus {
    exit_status: number;
    term_signal: null;
}


type ProcessStdio = 'pipe' | 'ignore';
interface ProcessOptions {
    stdin?: ProcessStdio;
    stdout?: ProcessStdio;
    stderr?: ProcessStdio;
}

