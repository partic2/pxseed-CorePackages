import { Duplex, Readable,Writable } from "stream";
import {ArrayBufferConcat, ArrayWrap2, assert, CanceledError, future, requirejs} from 'partic2/jsutils1/base'
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
    protected chunkQueue=new ArrayWrap2<Uint8Array|'END'>();
    protected err:Error|null=null;
    constructor(protected nodeInput:Readable){
        nodeInput.on('data',(chunk:Buffer)=>{
            this.chunkQueue.queueSignalPush(new Uint8Array(chunk.buffer,chunk.byteOffset,chunk.length));
        });
        nodeInput.on('end',()=>{
            this.chunkQueue.queueSignalPush('END');
        });
        nodeInput.on('error',(err)=>{
            this.chunkQueue.queueSignalPush('END');
            this.err=err;
        });
        nodeInput.on('close',()=>{
            this.chunkQueue.queueSignalPush('END');
        })
    }
    protected endOfStream=false;
    async read(buf:Uint8Array,offset?:number){
        if(this.err!=null){
            throw this.err;
        }
        offset=offset??0;
        if(this.endOfStream)return null;
        let buf1=await this.chunkQueue.queueBlockShift();
        if(buf1==='END'){
            this.endOfStream=true;
            return null;
        }
        let readLen=Math.min(buf.length-offset,buf1.length);
        buf.set(new Uint8Array(buf1.buffer,buf1.byteOffset,readLen),offset);
        if(readLen<buf1.length){
            buf1=new Uint8Array(buf1.buffer,buf1.byteOffset+readLen,buf1.length-readLen);
            this.chunkQueue.arr().unshift(buf1);
        }
        return readLen;
    }
}

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



export async function newHttpClientForNodeJs(){
    let {HttpClient}=await import('partic2/tjshelper/httpprot');
    let {buildTjs} =await import('partic2/tjshelper/tjsbuilder');
    let client=new HttpClient();
    client.setConnectorTjs((await buildTjs()).connect);
    client.makeSsl=async (underlying,servername)=>new TlsStream(underlying,servername).connect()
    return client
}

