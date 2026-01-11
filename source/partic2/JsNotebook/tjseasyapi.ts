
import { ExtendStreamReader, utf8conv } from "partic2/CodeRunner/jsutils2";
import { buildTjs } from "partic2/tjshelper/tjsbuilder";
import { TjsReaderDataSource, TjsWriterDataSink } from "partic2/tjshelper/tjsutil";
import assert from "assert";
import { Task } from "partic2/jsutils1/base";
import { RpcSerializeMagicMark } from "partic2/pxprpcClient/registry";

export class TjsUtilsProcess{
	stdin:WritableStream<Uint8Array>
	stdout:ReadableStream<Uint8Array>
	stderr:ReadableStream<Uint8Array>
	[RpcSerializeMagicMark]={}
	constructor(public tjsProc:tjs.Process){
		this.stdin=new WritableStream(new TjsWriterDataSink(this.tjsProc.stdin!));
		this.stdout=new ReadableStream(new TjsReaderDataSource(this.tjsProc.stdout!));
		this.stderr=new ReadableStream(new TjsReaderDataSource(this.tjsProc.stderr!));
	}
	async writeStdin(data:Uint8Array|string){
		if(typeof data=='string'){
			data=utf8conv(data);
		}
		let w=this.stdin.getWriter();
		try{
			return w.write(data)
		}finally{
			w.releaseLock();
		}
	}
	async readStdout(){
		let r=new ExtendStreamReader(this.stdout.getReader());
		try{
			let rr=await r.read();
			assert(!rr.done,'EOF reached')
			return rr.value!;
		}finally{
			r.releaseLock();
		}
	}
	async readStdoutInUtf8(){
		return utf8conv(await this.readStdout())
	}
	async readStderr(){
		let r=this.stderr.getReader();
		try{
			let rr=await r.read();
			assert(!rr.done,'EOF reached')
			return rr.value!;
		}finally{
			r.releaseLock();
		}
	}
	async readStderrInUtf8(){
		return utf8conv(await this.readStderr());
	}
	async readAllOutputs(){
		let o=new ExtendStreamReader(this.stdout.getReader());
		let e=new ExtendStreamReader(this.stderr.getReader());
		try{
			return {
				out:await o.readAll(),
				err:await e.readAll()
			}
		}finally{
			e.releaseLock();
			e.releaseLock();
		}
	}
	async readAllOutputsInString(){
		let r=await this.readAllOutputs();
		return {
			out:utf8conv(r.out),
			err:utf8conv(r.err)
		}
	}
}

export async function newTjsUtilsProcess(args:string[],tjsImpl?:typeof tjs){
	if(tjsImpl==undefined)tjsImpl=await buildTjs();
	return new TjsUtilsProcess(await tjsImpl.spawn(args,{stdin:'pipe',stdout:'pipe',stderr:'pipe'}))
}
