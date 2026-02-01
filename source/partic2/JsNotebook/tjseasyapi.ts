
import { ExtendStreamReader, utf8conv } from "partic2/CodeRunner/jsutils2";
import { buildTjs } from "partic2/tjshelper/tjsbuilder";
import { TjsReaderDataSource, TjsWriterDataSink } from "partic2/tjshelper/tjsutil";
import {assert} from "partic2/jsutils1/base";
import { future, Task } from "partic2/jsutils1/base";
import { RpcSerializeMagicMark } from "partic2/pxprpcClient/registry";
import { TaskLocalEnv } from "partic2/CodeRunner/CodeContext";

export class TjsUtilsProcess{
	stdin:WritableStream<Uint8Array>
	stdout:ReadableStream<Uint8Array>
	stderr:ReadableStream<Uint8Array>
	[RpcSerializeMagicMark]={}
	constructor(public tjsProc:tjs.Process,public args:string[]){
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
	async writeStdinUtf8(data:string){
		return await this.writeStdin(data);
	}
	protected nextStdoutChunk:future<Uint8Array>|null=null;
	async readStdout(){
		if(this.nextStdoutChunk!=null)return this.nextStdoutChunk.get();
		this.nextStdoutChunk=new future();
		let r=new ExtendStreamReader(this.stdout.getReader());
		try{
			let rr=await r.read();
			assert(!rr.done,'EOF reached')
			this.nextStdoutChunk.setResult(rr.value);
			this.nextStdoutChunk=null;
			return rr.value!;
		}catch(err){
			this.nextStdoutChunk!.setException(err);
			throw err;
		}finally{
			r.releaseLock();
		}
	}
	async readStdoutUtf8(){
		return utf8conv(await this.readStdout())
	}
	protected nextStderrChunk:future<Uint8Array>|null=null;
	async readStderr(){
		if(this.nextStderrChunk!=null)return this.nextStderrChunk.get();
		this.nextStderrChunk=new future();
		let r=new ExtendStreamReader(this.stderr.getReader());
		try{
			let rr=await r.read();
			assert(!rr.done,'EOF reached')
			this.nextStderrChunk.setResult(rr.value);
			this.nextStderrChunk=null;
			return rr.value!;
		}catch(err){
			this.nextStderrChunk!.setException(err);
			throw err;
		}finally{
			r.releaseLock();
		}
	}
	async readStderrUtf8(){
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
	async openInNotebookWebui(opt?:{forwardClose:boolean}){
		let env=TaskLocalEnv.get();
		if(env?.jsnotebook?.callFunctionInNotebookWebui!=undefined){
			let stdioSource={
				[RpcSerializeMagicMark]:{},
				readStdoutUtf8:this.readStdoutUtf8.bind(this),
				readStderrUtf8:this.readStderrUtf8.bind(this),
				writeStdinUtf8:this.writeStdinUtf8.bind(this),
				close:this.kill.bind(this),
    			waitClosed:this.wait.bind(this),
			}
			if(opt?.forwardClose===false){
				stdioSource.close=async ()=>{};
			}
			env.jsnotebook.callFunctionInNotebookWebui('partic2/JsNotebook/fileviewer','openStdioConsoleWebui',[stdioSource,{
				title:this.args.join(' ')
			}]);
		}
	}
	async wait(){
		return this.tjsProc.wait();
	}
	async kill(){
		return this.tjsProc.kill();
	}
}

export async function newTjsUtilsProcess(args:string[],tjsImpl?:typeof tjs){
	if(tjsImpl==undefined)tjsImpl=await buildTjs();
	return new TjsUtilsProcess(await tjsImpl.spawn(args,{stdin:'pipe',stdout:'pipe',stderr:'pipe'}),args)
}

export let shutils={
	which:function(command:string){
		
	}
}