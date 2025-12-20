
import { GenerateRandomString ,Base64ToArrayBuffer,ArrayBufferToBase64, requirejs, logger} from 'partic2/jsutils1/base';
import {Serializer} from 'pxprpc/base'
import {CKeyValueDb, getWWWRoot, IKeyValueDb, setKvStoreBackend} from 'partic2/jsutils1/webutils'

var __name__=requirejs.getLocalRequireModule(require);

import type {} from 'partic2/tjshelper/txikijs'
import { buildTjs } from 'partic2/tjshelper/tjsbuilder';

let log=logger.getLogger(__name__);

let serializableObjectMagic='__DUz66NYkWuMdex9k2mvwBbYN__';

function serializableObject(obj:any):Uint8Array{
    Error.stackTraceLimit=100
    let extraSer=new Array<Uint8Array>();
    let json=JSON.stringify(obj,(key,value)=>{
        if(value instanceof Uint8Array){
            extraSer.push(value);
            return {[serializableObjectMagic]:true,t:'Uint8Array',i:extraSer.length-1};
        }else if(value instanceof ArrayBuffer){
            extraSer.push(new Uint8Array(value));
            return {[serializableObjectMagic]:true,t:'ArrayBuffer',i:extraSer.length-1};
        }else if(value instanceof Int8Array){
            extraSer.push(new Uint8Array(value.buffer,value.byteOffset,value.byteLength));
            return {[serializableObjectMagic]:true,t:'Int8Array',i:extraSer.length-1};
        }
        return value;
    })
    let ser=new Serializer().prepareSerializing(64);
    ser.putString(json).putVarint(extraSer.length);
    for(let t1 of extraSer){
        ser.putBytes(t1);
    }
    return ser.build();
}

function unserializableObject(data:Uint8Array):any{
    let unser=new Serializer().prepareUnserializing(data);
    let json=unser.getString();
    let extraSerCount=unser.getVarint();
    let extraSer=new Array<Uint8Array>();
    for(let t1=0;t1<extraSerCount;t1++){
        extraSer.push(unser.getBytes())
    }
    let obj=JSON.parse(json,(key,value)=>{
        if(value[serializableObjectMagic]===true){
            if(value.t==='Uint8Array'){
                return extraSer[value.i];
            }else if(value.t==='ArrayBuffer'){
                return extraSer[value.i].buffer;
            }else if(value.v instanceof Array){
                return new (globalThis as any)[value.t](...value.v)
            }else if(value.t==='Int8Array'){
                return new Int8Array(extraSer[value.i].buffer);
            }
        }
        return value;
    });
    return obj;
}

async function tjsWriteFile(path:string,data:Uint8Array){
    let tjs1=await buildTjs()
    let file1=await tjs1!.open(path,'w');
    try{
        await file1.write(data);
    }finally{
        await file1.close();
    }
}

//TODO: concurrent read/write support?
export class FsBasedKvDbV1 implements IKeyValueDb{
    baseDir:string=''
    config?:{
        version:1,
        fileList:{[key:string]:{fileName:string}},
    }
    tjs1:null|typeof tjs=null;
    async init(baseDir:string){
        this.baseDir=baseDir;
        this.tjs1=await buildTjs();
        try{
            let data=await this.tjs1.readFile(baseDir+'/config.json')
            this.config=JSON.parse(new TextDecoder().decode(data));
            if(this.config?.version!==1){
                log.warning('Invalid kvdb file, ignored.',baseDir+'/config.json')
                this.config={version:1,fileList:{}}
            }
        }catch(e){
            this.config={version:1,fileList:{}}
        }
        
    }
    async setItem(key: string, val: any): Promise<void> {
        if(!(key in this.config!.fileList)){
            this.config!.fileList[key]={fileName:GenerateRandomString()}
        }
        let {fileName}=this.config!.fileList[key];
        await tjsWriteFile(`${this.baseDir}/${fileName}`,serializableObject(val))
        await tjsWriteFile(this.baseDir+'/config.json',new TextEncoder().encode(JSON.stringify(this.config)))
    }
    async getItem(key: string): Promise<any> {
        if(this.config!.fileList[key]==undefined){
            return undefined;
        }
        let {fileName}=this.config!.fileList[key];
        try{
            return await unserializableObject(await this.tjs1!.readFile(`${this.baseDir}/${fileName}`))
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
        await this.tjs1!.remove(this.baseDir+'/'+fileName);
        delete this.config!.fileList[key]
        await tjsWriteFile(this.baseDir+'/config.json',new TextEncoder().encode(JSON.stringify(this.config)))
    }
    async close(): Promise<void> {
        await tjsWriteFile(this.baseDir+'/config.json',new TextEncoder().encode(JSON.stringify(this.config)))
    }
}

let pathSep=getWWWRoot().includes('\\')?'\\':'/';

function pathJoin(...args:string[]){
    let parts=[] as string[];
    for(let t1 of args){
        for(let t2 of t1.split(/[\/\\]/)){
            if(t2==='..' && parts.length>=1){
                parts.pop();
            }else if(t2==='.'){
                //skip
            }else{
                parts.push(t2);
            }
        }
    }
    return parts.join(pathSep);
}

let dbDir=pathJoin(getWWWRoot(),__name__,'..')

export function setupImpl(){
    setKvStoreBackend(async (dbname)=>{
        let dbMap:Record<string,string>={};
        //deprecate base64 to be filesystem independent.
        let filename:string|null=null;
        let tjs1=await buildTjs();
        await tjs1.makeDir(pathJoin(dbDir,'data'),{recursive:true});
        try{
            dbMap=JSON.parse(new TextDecoder().decode(await tjs1.readFile(pathJoin(dbDir,'data','meta-dbMap'))));
        }catch(e){};
        if(dbMap[dbname]!=undefined){
            filename=dbMap[dbname];
        }else{
            filename=GenerateRandomString();
            dbMap[dbname]=filename;
            await tjs1.makeDir(pathJoin(dbDir,'data',filename),{recursive:true});
        }
        await tjsWriteFile(pathJoin(dbDir,'data','meta-dbMap'),new TextEncoder().encode(JSON.stringify(dbMap)));
        let db=new FsBasedKvDbV1();
        await tjs1.makeDir(pathJoin(dbDir,'data',filename),{recursive:true});
        await db.init(pathJoin(dbDir,'data',filename));
        return db;
    });
};