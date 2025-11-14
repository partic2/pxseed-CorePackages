/*jshint node:true */

import { ArrayBufferConcat, ArrayWrap2, DateDiff, GetCurrentTime, assert, logger, requirejs } from "partic2/jsutils1/base";
import { getWWWRoot } from "partic2/jsutils1/webutils";


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

