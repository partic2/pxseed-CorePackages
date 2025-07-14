import { Readable,Writable } from "stream";
import {ArrayBufferConcat, ArrayWrap2, assert, CanceledError, future, requirejs} from 'partic2/jsutils1/base'
import { Io } from "pxprpc/base";
import { Server, Socket } from "net";
import type {} from '@txikijs/types/src/index'


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
                this.endOfStream=true;
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
//security issue?
defaultFuncMap[__name__+'.createPxprpcIoFromTcpTarget']=new RpcExtendServerCallable(async (connectTo:string)=>{
    let s=new PxprpcIoFromSocket();
    await s.connect(JSON.parse(connectTo))
    return s;
}).typedecl('s->o');

export async function createIoPxseedJsUrl(url:string){
    let type=GetUrlQueryVariable2(url,'type');
    if(type==='tcp'){
        let io=new PxprpcIoFromSocket();
        let host=GetUrlQueryVariable2(url,'host')??'127.0.0.1';
        let port=Number(GetUrlQueryVariable2(url,'port')!);
        await io.connect({host,port});
        return io;
    }
}


import { WebSocket } from 'ws'
export class NodeWsIo implements Io{
    priv__cached=new ArrayWrap2<Uint8Array>([])
    closed:boolean=false;
    constructor(public ws:WebSocket){
        ws.on('message',(data,isBin)=>{
            if(data instanceof ArrayBuffer){
                this.priv__cached.queueBlockPush(new Uint8Array(data))
            }else if(data instanceof Buffer){
                this.priv__cached.queueBlockPush(data);
            }else if(data instanceof Array){
                this.priv__cached.queueBlockPush(new Uint8Array(ArrayBufferConcat(data)));
            }else{
                throw new Error('Unknown data type')
            }
        });
        ws.on('close',(code,reason)=>{
            this.closed=true;
            this.priv__cached.cancelWaiting();
        });
    }
    async receive(): Promise<Uint8Array> {
        try{
            let wsdata=await this.priv__cached.queueBlockShift();
            return wsdata;
        }catch(e){
            if(e instanceof CanceledError && this.closed){
                this.ws.close();
                throw new Error('closed.')
            }else{
                this.ws.close();
                throw e;
            }
        }
    }
    async send(data: Uint8Array[]): Promise<void> {
        this.ws.send(ArrayBufferConcat(data));
    }
    close(): void {
        this.ws.close();
        this.closed=true;
        this.priv__cached.cancelWaiting();
    }
}

globalThis.WebSocket=WebSocket as any;

export class NodeReadableDataSource implements UnderlyingDefaultSource<any>{
	constructor(public nodeReadable:Readable){}
	async pull(controller: ReadableStreamDefaultController<any>): Promise<void>{
        let errorHandler:((...args:any[])=>void)|null=null;
        let resolveHandler:((...args:any[])=>void)|null=null;
        try{
            let chunk=await new Promise((resolve,reject)=>{
                errorHandler=reject;
                this.nodeReadable.on('error',errorHandler);
                resolveHandler=resolve;
                this.nodeReadable.on('data',resolveHandler);
            });
            controller.enqueue(chunk);
        }finally{
            if(errorHandler!=null){
                this.nodeReadable.off('error',errorHandler);
            }
            if(resolveHandler!=null){
                this.nodeReadable.off('data',resolveHandler);
            }
        }
		
	}
}

export class NodeWritableDataSink implements UnderlyingSink<Uint8Array>{
	constructor(public nodeWritable:Writable){}
	async write(chunk: Uint8Array, controller: WritableStreamDefaultController): Promise<void>{
		this.nodeWritable.write(chunk)
	}
}

