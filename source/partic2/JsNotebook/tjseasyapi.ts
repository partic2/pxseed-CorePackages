
import { ExtendStreamReader, utf8conv } from "partic2/CodeRunner/jsutils2";
import { buildTjs } from "partic2/tjshelper/tjsbuilder";
import { TjsReaderDataSource, TjsWriterDataSink } from "partic2/tjshelper/tjsutil";
import {assert, mutex} from "partic2/jsutils1/base";
import { future, Task } from "partic2/jsutils1/base";
import { RpcSerializeMagicMark } from "partic2/pxprpcClient/registry";
import { TaskLocalEnv } from "partic2/CodeRunner/CodeContext";
import {SimpleFileSystem, simpleFileSystemHelper, TjsSfs} from 'partic2/CodeRunner/JsEnviron'
import { getNodeCompatApi } from "pxseedBuildScript/util";
import { getWWWRoot } from "partic2/jsutils1/webutils";

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

export let files={
	tjs:null as typeof tjs|null,
	simple:null as SimpleFileSystem|null,
	initmtx:new mutex(),
	osPathSep:getWWWRoot().includes('\\')?'\\':'/',
	async init(){
		await this.initmtx.exec(async ()=>{
			if(this.tjs==null){
				this.tjs=await buildTjs();
				let fs=new TjsSfs();
				fs.from(this.tjs);
				await fs.ensureInited()
				this.simple=fs;
			}
		})
	},
	async whichExecutable(name:string):Promise<string|null>{
		let tjsi=this.tjs!;
        let path1=tjsi.env.PATH;
        let pathsSep=path1.includes(';')?';':':';
        let path1List=path1.split(pathsSep);
        let found:string|null=null;
        for(let t1 of path1List){
            try{
                let t2=t1+this.osPathSep+name;
                await tjsi.stat(t2);
                found=t2;
                break;
            }catch(err){};
            try{
                let t2=t1+this.osPathSep+name+'.exe';
                await tjsi.stat(t2);
                found=t2;
                break;
            }catch(err){};
        }
        return found;
	},
	pathJoin(...names:string[]){
		return this.pathJoin2(names);
	},
	pathJoin2(names:string[],sep?:string){
		let parts=[] as string[];
		for(let t1 of names){
			for(let t2 of t1.split(/[\\\/]/)){
				if(t2==='..' && parts.length>=1){
					parts.pop();
				}else if(t2==='.'){
					//skip
				}else{
					parts.push(t2);
				}
			}
		}
		let fullpath=parts.join(sep??this.osPathSep);
		return fullpath
	},
	async copySingleFile(src:string,dest:string){
		await simpleFileSystemHelper.copyFile(this.simple!,src,dest);
	},
	async copyFileTree(srcDir:string,destDir:string,opt?:{ignore?:(name:string,path:string)=>boolean,maxDepth?:number,confilctPolicy?:'overwrite'|'skip'|'most recent'}){
		opt=opt??{};
		if(opt.ignore==undefined)opt.ignore=()=>false;
		if(opt.maxDepth==undefined)opt.maxDepth=1000;
		opt.confilctPolicy=opt.confilctPolicy??'overwrite';
        await this.simple!.mkdir(destDir);
        let children=await this.simple!.listdir(srcDir);
        for(let t1 of children){
            if(opt.ignore(t1.name,[srcDir,t1.name].join('/'))){
                continue;
            }
            if(t1.type=='dir'){
                await this.copyFileTree([srcDir,t1.name].join('/'),[destDir,t1.name].join('/'),{...opt,maxDepth:opt.maxDepth-1});
            }else if(t1.type=='file'){
                let destPath=[destDir,t1.name].join('/')
                let srcPath=[srcDir,t1.name].join('/');
                let needCopy=false;
				if(opt.confilctPolicy==='most recent'){
					try{
						let dfile=await this.simple!.stat(destPath);
						let sfile2=await this.simple!.stat(srcPath);
						if(dfile.mtime<sfile2.mtime){
							needCopy=true;
						}
					}catch(e){
						needCopy=true;
					}
				}else if(opt.confilctPolicy==='overwrite'){
					needCopy=true;
				}else if(opt.confilctPolicy==='skip'){
					if(await this.simple!.filetype(destPath)==='none'){
						needCopy=true;
					}
				}else{
					assert(false,'Invalid parameter:opt.conflictPolicy');
				}
                if(needCopy){
					await this.copySingleFile(srcPath,destPath);
                }
            }
        }
	}
}


export async function then(resolve:any){
	await files.init()
	delete exports.then;
	resolve(exports);
}

