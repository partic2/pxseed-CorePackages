import * as sqlite from 'tjs:sqlite'



import { DateDiff, GetCurrentTime, requirejs} from 'partic2/jsutils1/base';
import { Io } from 'pxprpc/base';

var __name__='partic2/tjsonpxp/jsenv';


let remoteModuleLoaderState:{
    rootUrl:string|null
    networkError:Error|null
    lastFailedTime:Date
}={
    rootUrl:null,
    networkError:null,
    lastFailedTime:new Date(0)
}

export function enableRemoteModuleLoader(rootUrl:string){
    remoteModuleLoaderState.rootUrl=rootUrl;
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
            return await resp.text();
        }catch(err:any){
            remoteModuleLoaderState.networkError=err;
            remoteModuleLoaderState.lastFailedTime=GetCurrentTime();
            return null;
        }
    }
}



import { GenerateRandomString } from 'partic2/jsutils1/base';

import {getWWWRoot, IKeyValueDb, path, setKvStoreBackend} from 'partic2/jsutils1/webutils'


var __name__=requirejs.getLocalRequireModule(require);



import {toSerializableObject,fromSerializableObject} from 'partic2/CodeRunner/Inspector'

async function writeFile(path:string,data:Uint8Array){
    let fh=await tjs.open(path,'w');
    try{
        await fh.write(data)
    }finally{
        fh.close();
    }
}

export class FsBasedKvDbV1 implements IKeyValueDb{
    baseDir:string=''
    config?:{
        fileList:{[key:string]:{fileName:string,type:'json'|'ArrayBuffer'|'Uint8Array'|'Int8Array'}},
    }
    
    async init(baseDir:string){
        this.baseDir=baseDir;
        try{
            let data=await tjs.readFile(baseDir+'/config.json');
            this.config={fileList:{},...JSON.parse(new TextDecoder().decode(data))}
        }catch(e){
            this.config={fileList:{}};
            await writeFile(baseDir+'/config.json',new TextEncoder().encode('{}'));
        }
    }
    async setItem(key: string, val: any): Promise<void> {
        if(!(key in this.config!.fileList)){
            this.config!.fileList[key]={fileName:GenerateRandomString(),type:'json'}
        }
        let {fileName}=this.config!.fileList[key];

        if(val instanceof ArrayBuffer){
            this.config!.fileList[key].type='ArrayBuffer';
            await writeFile(`${this.baseDir}/${fileName}`,new Uint8Array(val));
        }else if(val instanceof Uint8Array){
            this.config!.fileList[key].type='Uint8Array';
            await writeFile(`${this.baseDir}/${fileName}`,val);
        }else if(val instanceof Int8Array){
            this.config!.fileList[key].type='Int8Array';
            await writeFile(`${this.baseDir}/${fileName}`,new Uint8Array(val.buffer,val.byteOffset,val.length)); 
        }else{
            let data=JSON.stringify(toSerializableObject(val,{maxDepth:0x7fffffff,enumerateMode:'for in',maxKeyCount:0x7fffffff}));
            await writeFile(`${this.baseDir}/${fileName}`,new TextEncoder().encode(data));
        }
        await writeFile(this.baseDir+'/config.json',new TextEncoder().encode(JSON.stringify(this.config)))
    }
    async getItem(key: string): Promise<any> {
        if(!(key in this.config!.fileList)){
            return undefined;
        }
        let {fileName,type}=this.config!.fileList[key];
        try{
            if(type==='ArrayBuffer'){
                return (await tjs.readFile(fileName)).buffer;
            }else if(type==='Uint8Array'){
                return new Uint8Array((await tjs.readFile(fileName)).buffer);
            }else if(type==='Int8Array'){
                return new Int8Array((await tjs.readFile(fileName)).buffer);
            }else if(type==='json'){
                let data=await tjs.readFile(`${this.baseDir}/${fileName}`)
                let r=fromSerializableObject(JSON.parse(new TextDecoder().decode(data)),{});
                return r;
            }
        }catch(e){
            delete this.config!.fileList[key]
            return undefined
        }
    }
    getAllKeys(onKey: (key: string | null) => { stop?: boolean | undefined }, onErr?: ((err: Error) => void) | undefined): void {
        for(let file in this.config!.fileList){
            let next=onKey(file);
            if(next.stop===true){
                break;
            }
        }
        onKey(null);
    }
    async delete(key: string): Promise<void> {
        let {fileName}=this.config!.fileList[key];
        await tjs.remove(this.baseDir+'/'+fileName);
        delete this.config!.fileList[key]
        await writeFile(this.baseDir+'/config.json',new TextEncoder().encode(JSON.stringify(this.config)))
    }
    async close(): Promise<void> {
        await writeFile(this.baseDir+'/config.json',new TextEncoder().encode(JSON.stringify(this.config)))
    }
}


let cachePath=path.join(getWWWRoot(),__name__,'..');
console.info(cachePath)

export function setupImpl(){
    requirejs.addResourceProvider(TxikiJSFetchModuleProvider);
    setKvStoreBackend(async (dbname)=>{
        await tjs.makeDir(path.join(cachePath,'data'),{recursive:true});
        let dbMap:Record<string,string>={};
        let filename:string=GenerateRandomString();
        try{
            dbMap=JSON.parse(new TextDecoder().decode(await tjs.readFile(path.join(cachePath,'data','meta-dbMap'))));
        }catch(e){};
        if(dbname in dbMap){
            filename=dbname;
        }else{
            dbMap[dbname]=filename;
        }
        await writeFile(path.join(cachePath,'data','meta-dbMap'),new TextEncoder().encode(JSON.stringify(dbMap)));
        let db=new FsBasedKvDbV1();
        await tjs.makeDir(path.join(cachePath,'data',filename),{recursive:true});
        await db.init(path.join(cachePath,'data',filename));
        return db;
    });
}

setupImpl();