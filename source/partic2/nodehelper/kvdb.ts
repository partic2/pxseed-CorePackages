
import * as fs from 'fs/promises'
import {join} from 'path'
import { GenerateRandomString ,Base64ToArrayBuffer,ArrayBufferToBase64, BytesToHex} from 'partic2/jsutils1/base';

import {CKeyValueDb, IKeyValueDb, setKvStoreBackend} from 'partic2/jsutils1/webutils'


var __name__='partic2/JsNotebookServer/entry';



import {toSerializableObject,fromSerializableObject} from 'partic2/CodeRunner/Inspector'


export class FsBasedKvDbV1 implements IKeyValueDb{
    baseDir:string=''
    config?:{
        fileList:{[key:string]:{fileName:string,type:'json'|'ArrayBuffer'|'Uint8Array'|'Int8Array'}},
    }
    async init(baseDir:string){
        this.baseDir=baseDir;
        try{
            await fs.access(baseDir+'/config.json',fs.constants.R_OK);
        }catch(e){
            await fs.writeFile(baseDir+'/config.json',new TextEncoder().encode('{}'))
        }
        let data=await fs.readFile(baseDir+'/config.json')
        this.config={fileList:{},...JSON.parse(new TextDecoder().decode(data))}
    }
    async setItem(key: string, val: any): Promise<void> {
        if(!(key in this.config!.fileList)){
            this.config!.fileList[key]={fileName:GenerateRandomString(),type:'json'}
        }
        let {fileName}=this.config!.fileList[key];

        if(val instanceof ArrayBuffer){
            this.config!.fileList[key].type='ArrayBuffer';
            await fs.writeFile(`${this.baseDir}/${fileName}`,new Uint8Array(val));
        }else if(val instanceof Uint8Array){
            this.config!.fileList[key].type='Uint8Array';
            await fs.writeFile(`${this.baseDir}/${fileName}`,val);
        }else if(val instanceof Int8Array){
            this.config!.fileList[key].type='Int8Array';
            await fs.writeFile(`${this.baseDir}/${fileName}`,val); 
        }else{
            let data=JSON.stringify(toSerializableObject(val,{maxDepth:0x7fffffff,enumerateMode:'for in',maxKeyCount:0x7fffffff}));
            await fs.writeFile(`${this.baseDir}/${fileName}`,new TextEncoder().encode(data));
        }
        await fs.writeFile(this.baseDir+'/config.json',new TextEncoder().encode(JSON.stringify(this.config)))
    }
    async getItem(key: string): Promise<any> {
        if(!(key in this.config!.fileList)){
            return undefined;
        }
        let {fileName,type}=this.config!.fileList[key];
        try{
            if(type==='ArrayBuffer'){
                return (await fs.readFile(fileName)).buffer;
            }else if(type==='Uint8Array'){
                return new Uint8Array((await fs.readFile(fileName)).buffer);
            }else if(type==='Int8Array'){
                return new Int8Array((await fs.readFile(fileName)).buffer);
            }else if(type==='json'){
                let data=await fs.readFile(`${this.baseDir}/${fileName}`)
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
        await fs.rm(this.baseDir+'/'+fileName);
        delete this.config!.fileList[key]
        await fs.writeFile(this.baseDir+'/config.json',new TextEncoder().encode(JSON.stringify(this.config)))
    }
    async close(): Promise<void> {
        await fs.writeFile(this.baseDir+'/config.json',new TextEncoder().encode(JSON.stringify(this.config)))
    }
}


import * as path from 'path'

export function setupImpl(){
    setKvStoreBackend(async (dbname)=>{
        let dbMap:Record<string,string>={};
        //deprecate base64 to be filesystem independent.
        let filename=btoa(dbname);
        try{
            dbMap=JSON.parse(new TextDecoder().decode(await fs.readFile(path.join(__dirname,'data','meta-dbMap'))));
        }catch(e){};
        if(dbname in dbMap){
            filename=dbname;
        }
        try{
            await fs.access(path.join(__dirname,'data',filename));
            if(!(dbname in dbMap)){
                dbMap[dbname]=filename;
            }
        }catch(e){
            filename=GenerateRandomString();
            dbMap[dbname]=filename;
        }
        await fs.writeFile(path.join(__dirname,'data','meta-dbMap'),JSON.stringify(dbMap));
        let db=new FsBasedKvDbV1();
        await fs.mkdir(path.join(__dirname,'data',filename),{recursive:true});
        await db.init(path.join(__dirname,'data',filename));
        return db;
    });
}