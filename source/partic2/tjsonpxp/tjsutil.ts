/*jshint node:true */

import { ArrayBufferConcat, ArrayWrap2, BytesToHex, assert, logger, requirejs } from "partic2/jsutils1/base";
import { ExtendStreamReader } from "partic2/CodeRunner/jsutils2";


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
	constructor(public tjsWriter:tjs.Writer){}
	async write(chunk: Uint8Array, controller: WritableStreamDefaultController): Promise<void>{
		await this.tjsWriter.write(chunk)
	}
}


//WIP HTTP Parser
const headerExp = /^([^: \t]+):[ \t]*((?:.*[^ \t])|)/;
const requestExp = /^([A-Z-]+) ([^ ]+) HTTP\/[^ \t]+$/;
const responseExp = /^HTTP\/[^ \t]+ (\d{3}) ?(.*)$/;

export class HttpParser{
	static lineSpliter='\n'.charCodeAt(0);
	constructor(public reader:ExtendStreamReader){}
	decoder=new TextDecoder();
	method='';
	version='1.0';
	path='/';
	headers=new Array<[string,string]>();
	async parseHeader(){
		let reqHdr=this.decoder.decode(await this.reader.readUntil(HttpParser.lineSpliter));
		let matchResult=reqHdr.match(requestExp);
		assert(matchResult!=null);
		this.method=matchResult[1];
		this.path=matchResult[2];
		this.version=matchResult[3];
		for(let t1=0;t1<64*1024;t1++){
			let line=this.decoder.decode(await this.reader.readUntil(HttpParser.lineSpliter));
			if(line=='\r\n')break;
			let matched=line.match(headerExp);
			assert(matched!=null)
			this.headers.push([matchResult[1],matchResult[2]]);
		}
	}
}
