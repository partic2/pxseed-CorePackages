import { RpcExtendClientObject, TableSerializer } from "pxprpc/extend";
import { Invoker,getDefault } from "partic2/pxprpcBinding/JseHelper__JseIo";
import { WaitUntil, future,copy, ArrayWrap2, GenerateRandomString, requirejs } from "partic2/jsutils1/base";
import { TjsReaderDataSource, TjsWriterDataSink } from 'partic2/tjshelper/tjsutil'
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
import { Server, Socket } from "net";

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


interface Address {
    family: number;
    ip: string;
    port: number;
    scopeId?: number;
    flowInfo?: number;
}

interface Connection {
    read(buf: Uint8Array): Promise<number|null>;
    write(buf: Uint8Array): Promise<number>;
    setKeepAlive(enable: boolean, delay: number): void;
    setNoDelay(enable?: boolean): void;
    shutdown(): void;
    close(): void;
    localAddress: Address;
    remoteAddress: Address;
    readable: ReadableStream<Uint8Array>;
    writable: WritableStream<Uint8Array>;
}

interface DatagramData {
    nread: number;
    partial: boolean;
    addr: Address;
}

interface DatagramEndpoint {
    recv(buf: Uint8Array): Promise<number>;
    send(buf: Uint8Array, addr?: Address): Promise<DatagramData>;
    close(): void;
    localAddress: Address;
    remoteAddress: Address;
}

type Transport = 'tcp' | 'udp' | 'pipe';

interface ConnectOptions {
    /**
    * Local address to bind to.
    */
    bindAddr: Address;
    
    /**
    * Disables dual stack mode.
    */
    ipv6Only?: boolean;
}


class NodeConnection implements Connection{
    read(buf: Uint8Array): Promise<number | null> {
        return this.rawR.read(buf);
    }
    write(buf: Uint8Array): Promise<number> {
        return this.rawW.write(buf);
    }
    setKeepAlive(enable: boolean, delay: number): void {
        this.sock.setKeepAlive(enable,delay);
    }
    setNoDelay(enable?: boolean | undefined): void {
        this.sock.setNoDelay(enable);
    }
    shutdown(): void {
        this.close();
    }
    close(): void {
        this.sock.end();
    }
    rawR:Reader;
    rawW:Writer;
    constructor(public sock:Socket){
        this.rawR=wrapReadable(sock);
        this.rawW={
            write:async (buf: Uint8Array):Promise<number>=>{
                sock.write(buf);
                return buf.byteLength;
            },
        }
        this.localAddress.ip=sock.localAddress!;
        this.localAddress.port=sock.localPort!;
        this.remoteAddress.ip=sock.localAddress!;
        this.remoteAddress.port=sock.remotePort!;
    }
    localAddress: Address={family: 0,ip:'',port: 0};
    remoteAddress: Address={family: 0,ip:'',port:0};
    //Diabled until concurrent read/write issue is solved.
    readable:ReadableStream<Uint8Array>=undefined as any
    writable:WritableStream<Uint8Array>=undefined as any
    
}
/**
* Creates a connection to the target host + port over the selected transport.
*
* @param transport Type of transport for the connection.
* @param host Hostname for the connection. Basic lookup using {@link lookup} will be performed.
* @param port Destination port (where applicable).
* @param options Extra connection options.
*/
async function connect(transport: Transport, host: string, port?: string | number, options?: ConnectOptions): Promise<Connection | DatagramEndpoint>{
    if(transport=='tcp'){
        let soc=new Socket();
        let r=new NodeConnection(soc);
        let p=new Promise<void>((resolve,reject)=>{
            //XXX:should we remove listener?
            soc.once('connect',resolve)
            soc.once('error',reject)
        });
        soc.connect({host:host,port:Number(port??0)});
        await p;
        return r;
    }else if(transport=='pipe'){
        let soc=new Socket();
        let r=new NodeConnection(soc);
        let p=new Promise<void>((resolve,reject)=>{
            //XXX:should we remove listener?
            soc.once('connect',resolve)
            soc.once('error',reject)
        });
        soc.connect({path:host});
        await p;
        return r;
    }else{
        throw new Error('Not implemented');
    }
}

interface Listener extends AsyncIterable<Connection> {
    accept(): Promise<Connection>;
    close(): void;
    localAddress: Address;
}

interface ListenOptions {
    backlog?: number;
    
    /**
    * Disables dual stack mode.
    */
    ipv6Only?: boolean;
    
    /**
    * Used on UDP only.
    * Enable address reusing (when binding). What that means is that
    * multiple threads or processes can bind to the same address without error
    * (provided they all set the flag) but only the last one to bind will receive
    * any traffic, in effect "stealing" the port from the previous listener.
    */
    reuseAddr?: boolean;
}

class NodeListener implements Listener{
    sockQueue=new ArrayWrap2<Socket>();
    constructor(public ssoc:Server){
        ssoc.on('connection',(soc)=>{
            this.sockQueue.queueSignalPush(soc);
        });
        let addr=ssoc.address();
        if(typeof addr=='string'){
            this.localAddress.ip=addr
        }else if(addr!=undefined){
            this.localAddress.ip=addr.address;
            this.localAddress.port=addr.port;
        }
    };
    async accept(): Promise<Connection> {
        let sock=await this.sockQueue.queueBlockShift();
        return new NodeConnection(sock);
    }
    close(): void {
        this.ssoc.close();
    }
    localAddress: Address={family:0,ip:'',port:0};
    [Symbol.asyncIterator](): AsyncIterator<Connection, any, undefined> {
        throw new Error("Method not implemented.");
    }

}

/**
* Listens for incoming connections on the selected transport.
*
* @param transport Transport type.
* @param host Hostname for listening on.
* @param port Listening port (where applicable).
* @param options Extra listen options.
*/
async function listen(transport: Transport, host: string, port?: string | number, options?: ListenOptions): Promise<Listener | DatagramEndpoint>{
    if(transport=='tcp'){
        let serv=new Server();
        serv.listen({
            host:host,port:Number(port??0)
        });
        return new NodeListener(serv)
    }else if(transport=='udp'){
        let serv=new Server();
        serv.listen({
            path:host
        });
        return new NodeListener(serv)
    }else{
        throw new Error('Not implemented');
    }
}

    let tjsi={
        realpath,unlink,rename,mkstemp,stat,open,rmdir,copyfile,mkdir,readdir,readFile,rm,spawn,homedir,platform,
        realPath:realpath,
        remove:rm,
        homeDir:dataDir,
        makeDir:mkdir,
        readDir:readdir,
        system:{platform:platform},
        listen,connect,
        __impl__:'partic2/nodehelper/tjsadapt'
    } as any;
    tjsImpl=tjsi;
    return tjsImpl;

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

