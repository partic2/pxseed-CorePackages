import { RpcExtendClientObject, TableSerializer } from "pxprpc/extend";
import { Invoker,getDefault } from "partic2/pxprpcBinding/JseHelper__JseIo";
import { WaitUntil, future,copy, ArrayWrap2 } from "partic2/jsutils1/base";

import type {} from '@txikijs/types'


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

let tjsImpl=Symbol('tjs implemention')

export async function tjsFrom(invoker:Invoker):Promise<typeof tjs>{
    var jseio:Invoker=invoker;
    if(tjsImpl in invoker){
        return (invoker as any)[tjsImpl]
    }
    
let platform=await jseio.platform()

async function realpath(path: string): Promise<string>{
    return jseio.realpath(path);
}

/**
* Removes the given file.
*
* @param path Path to be removed.
*/
async function unlink(path: string): Promise<void>{
    return jseio.unlink(path);
}

/**
* Renames the given path.
*
* @param path Current path.
* @param newPath New desired path name.
*/
async function rename(path: string, newPath: string): Promise<void>{
    return await jseio.rename(path,newPath);
}


/**
* Create a unique temporary file. The given template must end in XXXXXX, and the Xs will
* be replaced to provide a unique file name. The returned object is an open file handle.Handle
*
* @param template Template for the file name.
*/
async function mkstemp(template: string): Promise<FileHandle>{
    return new FileHandle(...await jseio.mkstemp(template));
}

class FileHandle {
    /**
    * path: The file path.
    */
    constructor(public remoteHandler:RpcExtendClientObject,public path:string){
    }
    /**
    * Reads data into the given buffer at the given file offset. Returns
    * the amount of read data or null for EOF.
    *
    * @param buffer Buffer to read data into.
    * @param offset Offset in the file to read from.
    */
    async read(buffer: Uint8Array, offset?: number): Promise<number|null>{
        offset=offset??0;
        let r=await jseio.fhRead(this.remoteHandler,BigInt(offset),buffer.length);
        if(r.byteLength==0){
            return null;
        }
        buffer.set(r);
        return r.byteLength;
    }
    
    /**
    * Writes data from the given buffer at the given file offset. Returns
    * the amount of data written.
    *
    * @param buffer Buffer to write.
    * @param offset Offset in the file to write to.
    */
    async write(buffer: Uint8Array, offset?: number): Promise<number>{
        offset=offset??0;
        let r=await jseio.fhWrite(this.remoteHandler,BigInt(offset),buffer);
        return r;
    }
    
    /**
    * Closes the file.
    */
    async close(): Promise<void>{
        await this.remoteHandler.free();
    }
    
    /**
    * Get the file status information.
    * See [stat(2)](https://man7.org/linux/man-pages/man2/lstat.2.html)
    */
    async stat(): Promise<StatResult>{
        return await stat(this.path);
    }
    
    /**
    * Truncates the file to the given length.
    *
    * @param offset Length to truncate the file to.
    */
    async truncate(offset?: number): Promise<void>{
        offset=offset??0;
        await jseio.fhTruncate(this.remoteHandler,BigInt(offset));
    }
    
}


/**
* Gets file status information.
* See [stat(2)](https://man7.org/linux/man-pages/man2/stat.2.html)
*
* @param path Path to the file.
*/
async function stat(path: string): Promise<StatResult>{
    let [type,size,mtime]=await jseio.stat(path);
        let r={
            size:Number(size),
            mtim: new Date(Number(mtime)), 
            isDirectory:type==='dir', 
            isFile:type==='file'}
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
    //not support yet
    mode=0;
    return new FileHandle(await jseio.open(path,flags,mode),path);
}

/**
* Removes the directory at the given path.
*
* @param path Directory path.
*/
async function rmdir(path: string): Promise<void>{
    await jseio.rmdir(path);
}


/**
* Create a directory at the given path.
*
* @param path The path to of the directory to be created.
* @param options Options for making the directory.
*/
async function mkdir(path: string, options?: MkdirOptions): Promise<void>{
    jseio.mkdir(path)
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
    jseio.copyFile(path,newPath);
}


/**
* Open the directory at the given path in order to navigate its content.
* See [readdir(3)](https://man7.org/linux/man-pages/man3/readdir.3.html)
*
* @param path Path to the directory.
*/
async function readdir(path: string): Promise<DirHandle>{
    let children=new TableSerializer().load(await jseio.readdir(path));
    let t1={
        close:async ()=>{},path,
        __iter:async function *(){
            let arr=children.toMapArray();
            for(let row of arr){
                yield {isFile:row.type==='file',isDirectory:row.type==='dir',name:row.name} as DirEnt
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

class JseInputReader implements Reader{
    getHandler=new future<RpcExtendClientObject>();
    async read(buf: Uint8Array): Promise<number | null> {
        let handler=await this.getHandler.get();
        let buf2=await jseio.inputRead(handler,buf.length)
        if(buf2.byteLength===0){
            return null
        }
        buf.set(new Uint8Array(buf2),0);
        return buf2.byteLength;
    }
}
class JseOutputWriter implements Writer{
    getHandler=new future<RpcExtendClientObject>()
    async write(buf: Uint8Array): Promise<number> {
        let handler=await this.getHandler.get();
        await jseio.outputWrite(handler,buf);
        return buf.length;
    }
}

/**
 * Recursively delete files and directories at the given path.
 * Equivalent to POSIX "rm -rf".
 *
 * @param path Path to be removed.
 */
async function rm(path: string): Promise<void>{
    await jseio.rm(path);
}

class Process {
    protected getHandler=new future<RpcExtendClientObject>();
    protected cmd:string=''
    constructor(public args: string | string[], public options?: ProcessOptions){
        if(typeof this.args==='string'){
            this.cmd=this.args;
        }else{
            //easy but not complete
            this.cmd=this.args.map(v=>`"${v}"`).join(' ');
        }
        if(this.options!=undefined){
            if((this.options.stdin??'ignore')==='pipe'){
                this.stdin=new JseOutputWriter();
            }
            if((this.options.stdout??'ignore')==='pipe'){
                this.stdout=new JseInputReader();
            }
            if((this.options.stderr??'ignore')==='pipe'){
                this.stderr=new JseInputReader();
            }
        }
        this._init();
    }
    kill(): void{
        throw new Error('Not implemented');
    }
    async wait(): Promise<ProcessStatus>{
        let exit_status=await jseio.processWait(await this.getHandler.get());
        return {exit_status,term_signal:null}
    }
    async _init(){
        this.getHandler.setResult(await jseio.execCommand(this.cmd));
        let [sin,sout,serr]=await jseio.processStdio(await this.getHandler.get(),
                this.stdin!==null,
                this.stdout!==null,
                this.stderr!==null);
        if(sin!=null)(this.stdin as JseOutputWriter).getHandler.setResult(sin);
        if(sout!=null)(this.stdout as JseInputReader).getHandler.setResult(sout);
        if(serr!=null)(this.stderr as JseInputReader).getHandler.setResult(serr);
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

var dataDir=await jseio.getDataDir()
function homedir(){
    return dataDir
}

    let tjsi={
        realpath,unlink,rename,mkstemp,stat,open,rmdir,copyfile,mkdir,readdir,readFile,rm,spawn,homedir,platform
    } as any;

    (invoker as any)[tjsImpl]=tjsi;
    
    return tjsi

}

interface StatResult {
    size: number;
    mtim: Date;
    isDirectory: boolean;
    isFile: boolean;
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



export async function setup(tjsObject?:any){
    if(tjsObject===undefined){
        if(!('tjs' in globalThis)){
            (globalThis as any).tjs={};
        }
        tjsObject=(globalThis as any).tjs;
    }
    let jseio=await getDefault()
    copy(await tjsFrom(jseio),tjsObject,1);
}