/*jshint node:true */

import { ArrayBufferConcat, ArrayWrap2, DateDiff, GetCurrentTime, assert, logger, requirejs } from "partic2/jsutils1/base";
import { getWWWRoot } from "partic2/jsutils1/webutils";
import { Io } from "pxprpc/base";


let __name__=requirejs.getLocalRequireModule(require);
let log=logger.getLogger(__name__);
export class TjsReaderDataSource implements UnderlyingDefaultSource<Uint8Array>{
	constructor(public tjsReader:tjs.Reader){}
	async pull(controller: ReadableStreamDefaultController<any>): Promise<void>{
		let buf=new Uint8Array(1024);
		let count=await this.tjsReader.read(buf);
		if(count==null){
			controller.close();
		}else{
			controller.enqueue(new Uint8Array(buf.buffer,0,count));
		}
	}
}

export class TjsWriterDataSink implements UnderlyingSink<Uint8Array>{
	constructor(public tjsWriter:tjs.Writer&{close?:()=>void}){}
	async write(chunk: Uint8Array, controller: WritableStreamDefaultController): Promise<void>{
		await this.tjsWriter.write(chunk)
	}
	close(){
		if(this.tjsWriter.close!=undefined){
			this.tjsWriter.close();
		}
	}
}


export class PxprpcIoFromTjsStream implements Io{
	constructor(public r:tjs.Reader,public w:tjs.Writer,public c:{close:()=>void}){}
	async receive(): Promise<Uint8Array> {
		let buf1=new Uint8Array(4);
		await this.r!.read(buf1);
		let size=new DataView(buf1.buffer).getInt32(0,true);
		buf1=new Uint8Array(size);
		let readCount=0;
		while(readCount<=size){
			let nread=await this.r!.read(new Uint8Array(buf1.buffer,readCount,size-readCount));
			if(nread===null || nread===0){
				throw new Error("packet truncated.");
			}
			readCount+=nread;
		}
		return buf1;
	}
	async send(data: Uint8Array[]): Promise<void> {
		let size=data.reduce((prev,curr)=>prev+curr.byteLength,0);
        let buf1=new Uint8Array(4);
		new DataView(buf1.buffer).setInt32(0,size,true);
		//XXX:Should I take care about the result of write?
		if(size<1024){
			await this.w!.write(new Uint8Array(ArrayBufferConcat([buf1,...data])));
		}else{
			await Promise.all(data.map((t1)=>this.w!.write(buf1)));
		}
	}
	close(): void {
		this.c.close();
	}
	
}