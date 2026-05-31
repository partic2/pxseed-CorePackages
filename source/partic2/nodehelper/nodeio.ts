import { Duplex, Readable,Writable } from "stream";
import {ArrayBufferConcat, ArrayWrap2, assert, CanceledError, future, requirejs} from 'partic2/jsutils1/base'
import { Io } from "pxprpc/base";
import { Server, Socket } from "net";
import type {} from 'partic2/tjshelper/txikijs'


export var wrappedStreams=Symbol('wrappedStreams');

export function wrapReadable(r:Readable):ReadStream4NodeIo{
    let wrapped={} as any;
    if(wrappedStreams in r){
        wrapped=(r as any)[wrappedStreams];
    }else{
        (r as any)[wrappedStreams]=wrapped;
    }
    if(!('readStream' in wrapped)){
        wrapped.readStream=new ReadStream4NodeIo(r);
    }
    return wrapped.readStream
}

//tjs.Reader
class ReadStream4NodeIo implements tjs.Reader{
    protected chunkQueue=new ArrayWrap2<Buffer|null>();
    protected err:Error|null=null;
    constructor(protected nodeInput:Readable){
        nodeInput.on('data',(chunk)=>{
            this.chunkQueue.queueSignalPush(chunk);
        });
        nodeInput.on('end',()=>{
            this.chunkQueue.queueSignalPush(null);
        });
        nodeInput.on('error',(err)=>{
            this.chunkQueue.queueSignalPush(null);
            this.err=err;
        });
        nodeInput.on('close',()=>{
            this.chunkQueue.queueSignalPush(null);
            this.endOfStream=true;
        })
    }
    protected remainbuf:Buffer|null=null;
    protected endOfStream=false;
    protected remainoff:number=0;
    async read(buf:Uint8Array,offset?:number){
        if(this.err!=null){
            throw this.err;
        }
        offset=offset??0;
        if(this.endOfStream)return null;
        if(this.remainbuf===null){
            this.remainbuf=await this.chunkQueue.queueBlockShift();
            if(this.remainbuf===null){
                if(this.err!=null){
                    throw this.err;
                }
                return null
            }
            this.remainoff=this.remainbuf.byteOffset;
        }
        let readLen=Math.min(buf.length-offset,this.remainbuf.length-this.remainoff);
        buf.set(new Uint8Array(this.remainbuf.buffer,this.remainbuf.byteOffset+this.remainoff,readLen),offset);
        this.remainoff+=readLen;
        if(this.remainbuf.length-this.remainoff===0){
            this.remainbuf=null;
        }
        return readLen;
    }
    async readFully(buf:Uint8Array){
        let end=buf.byteOffset+buf.byteLength;
        let start=0;
        while(start<end){
            let readLen=await this.read(buf,start);
            if(readLen==null){
                if(start<end){
                    throw new Error('EOF occured');
                }
            }else{
                start+=readLen;
            }
        }
    }
    async readAll(){
        let buffList=[]
        for(let t1=0;t1<1024*1024;t1++){
            let buff=await this.chunkQueue.queueBlockShift();
            if(buff!=null){
                buffList.push(buff);
            }else{
                break;
            }
        }
        return ArrayBufferConcat(buffList)
    }
}


export class PxprpcIoFromSocket implements Io{
    public sock?:Socket;
    async connect(opt:{
        path:string
    }|{
        host:string,
        port:number
    }){
        if(this.sock==undefined){
            return new Promise<undefined>((resolve,reject)=>{
                    this.sock=new Socket();
                    this.sock.once('error',(err)=>{
                        reject(err);
                    });
                    this.sock.connect(opt,()=>resolve(undefined));
            });
        }else{
            return this.sock;
        }
    }
    async receive(): Promise<Uint8Array> {
        let buf1=new Uint8Array(4);
        await wrapReadable(this.sock!).readFully(buf1);
        let size=new DataView(buf1.buffer).getInt32(0,true);
        buf1=new Uint8Array(size);
        await wrapReadable(this.sock!).readFully(buf1);
        return buf1;
    }
    async send(data: Uint8Array[]): Promise<void> {
        let size=data.reduce((prev,curr)=>prev+curr.byteLength,0);
        let buf1=new Uint8Array(4);
        new DataView(buf1.buffer).setInt32(0,size,true);
        this.sock!.write(buf1);
        data.forEach((buf2)=>{
            this.sock!.write(buf2);
        });
    }
    close(): void {
        this.sock!.end();
    }
}

export class PxprpcTcpServer{
    onNewConnection:(conn:Io)=>void=()=>{}
    ssock?:Server
    async listen(opt:{
        host?:string
        port:number
    }|{
        path:string
    }){
        return new Promise<undefined>((resolve,reject)=>{
            this.ssock=new Server();
            this.ssock.once('error',(err)=>reject(err));
            this.ssock.on('connection',(conn)=>{
                let io1=new PxprpcIoFromSocket();
                io1.sock=conn;
                this.onNewConnection(io1);
            })
            this.ssock.listen(opt,6,()=>resolve(undefined));
        });
    }
    async close(){
        return new Promise<undefined>((resolve,reject)=>{
            this.ssock!.close((err)=>{
                if(err!=null){
                    reject(err);
                }else{
                    resolve(undefined);
                }
            })
        })
    }
}


import { defaultFuncMap, RpcExtendServerCallable } from "pxprpc/extend";
import { GetUrlQueryVariable2 } from "partic2/jsutils1/webutils";

const __name__=requirejs.getLocalRequireModule(require);


export async function createIoPxseedJsUrl(url:string){
    let bus=await import('partic2/pxprpcClient/bus')
    return bus.createIoPxseedJsUrl(url);
}


import tls from "tls";


export class NodeReadableDataSource implements UnderlyingDefaultSource<any>{
	constructor(public nodeReadable:Readable){}
    start(controller: ReadableStreamDefaultController<any>){
        this.nodeReadable.on('data',(chunk)=>controller.enqueue(chunk))
        this.nodeReadable.on('error',(err)=>{try{controller.error(err);controller.close()}catch(err){}});
        this.nodeReadable.on('end',()=>controller.close());
    }
}

export class NodeWritableDataSink implements UnderlyingSink<Uint8Array>{
	constructor(public nodeWritable:Writable){}
	async write(chunk: Uint8Array, controller: WritableStreamDefaultController): Promise<void>{
		this.nodeWritable.write(chunk)
	}
}


export class TlsStream{

    protected nodeDuplex?:Duplex
    protected tlsConn?:tls.TLSSocket
    r:ReadableStream=new ReadableStream();
    w:WritableStream=new WritableStream();
	constructor(protected underlying:{r:ReadableStream<Uint8Array>,w:WritableStream},public servername?:string){}
    async connect():Promise<{r:ReadableStream<Uint8Array>,w:WritableStream}>{
        this.nodeDuplex=Duplex.fromWeb({readable:this.underlying.r as any,writable:this.underlying.w});
        this.tlsConn=tls.connect({servername:this.servername,socket:this.nodeDuplex})
        this.r=new ReadableStream(new NodeReadableDataSource(this.tlsConn));
        this.w=new WritableStream(new NodeWritableDataSink(this.tlsConn));
        return this;
    }
	closed=false;
	close(){
		if(!this.closed){
			this.closed=true;
			this.underlying.w.close();
			this.underlying.r.cancel()
			this.w?.close();
            this.tlsConn?.destroy();
		}
	}
}

import type {HttpClient} from 'partic2/tjshelper/httpprot'

export async function newHttpClientForNodeJs(){
    let {HttpClient}=await import('partic2/tjshelper/httpprot');
    let {buildTjs} =await import('partic2/tjshelper/tjsbuilder');
    let client=new HttpClient();
    client.setConnectorTjs((await buildTjs()).connect);
    client.makeSsl=async (underlying,servername)=>new TlsStream(underlying,servername).connect()
    return client
}


