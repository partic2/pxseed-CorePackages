import { Readable } from "stream";
import {ArrayBufferConcat, ArrayWrap2, future} from 'partic2/jsutils1/base'


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

class ReadStream4NodeIo{
    protected chunkQueue=new ArrayWrap2<Buffer|null>([]);
    constructor(protected nodeInput:Readable){
        nodeInput.on('data',(chunk)=>{
            this.chunkQueue.queueBlockPush(chunk);
        });
        nodeInput.on('end',()=>{
            this.chunkQueue.queueBlockPush(null);
        })
    }
    protected remainbuf:Buffer|null=null;
    protected endOfStream=false;
    protected remainoff:number=0;
    async read(buf:Uint8Array,offset:number){
        if(this.endOfStream)return null;
        if(this.remainbuf===null){
            this.remainbuf=await this.chunkQueue.queueBlockShift();
            if(this.remainbuf===null){
                this.endOfStream=true;
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
