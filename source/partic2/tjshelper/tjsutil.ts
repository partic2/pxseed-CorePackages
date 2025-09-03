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
	constructor(public tjsWriter:tjs.Writer){}
	async write(chunk: Uint8Array, controller: WritableStreamDefaultController): Promise<void>{
		await this.tjsWriter.write(chunk)
	}
}


let remoteModuleLoaderState:{
	rootUrl:string|null
	networkError:Error|null
	lastFailedTime:Date,
	updateLocal?:boolean
}={
	rootUrl:null,
	networkError:null,
	lastFailedTime:new Date(0),
	updateLocal:true
}

export function enableRemoteModuleLoader(rootUrl:string,opts:{updateLocal?:boolean}){
	remoteModuleLoaderState.rootUrl=rootUrl;
	Object.assign(remoteModuleLoaderState,opts)
}


const TxikiJSFetchModuleProvider=async (modName:string,url:string):Promise<string|Function|null>=>{
	if(DateDiff(GetCurrentTime(),remoteModuleLoaderState.lastFailedTime,'second')<15){
		return null;
	}
	if(remoteModuleLoaderState.rootUrl==null){
		return null;
	}else{
		let fetchUrl=`${remoteModuleLoaderState.rootUrl}/${modName}`;
		if(!fetchUrl.endsWith('.js')){
			fetchUrl=fetchUrl+'.js'
		}
		try{
			let resp=await fetch(fetchUrl);
			if(!resp.ok){
				throw new Error('fetch module file failed. server response '+resp.status+' '+await resp.text())
			}
			let data=await resp.text();
			if(remoteModuleLoaderState.updateLocal===true){
				let modFile=`${getWWWRoot()}/${modName}`;
				if(!modFile.endsWith('.js')){
					modFile+='.js'
				}
				let fh=await tjs.open(modFile,'w');
				try{
					await fh.write(new TextEncoder().encode(modFile));
				}catch(e){
					await fh.close();
				}
			}
			return data;
		}catch(err:any){
			remoteModuleLoaderState.networkError=err;
			remoteModuleLoaderState.lastFailedTime=GetCurrentTime();
			return null;
		}
	}
}

export function installTxikiJSFetchModuleProvider(){
	requirejs.addResourceProvider(TxikiJSFetchModuleProvider)
}