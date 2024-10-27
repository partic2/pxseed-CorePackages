
import { ArrayWrap2, GenerateRandomString, future, requirejs } from "partic2/jsutils1/base";
import { CKeyValueDb, kvStore } from "partic2/jsutils1/webutils";
import type * as tjsGlobalDecl from '@txikijs/types/types/txikijs'
import { ClientInfo } from "partic2/pxprpcClient/registry";


export interface FileEntry{
    name:string
    type:'dir'|'file',
    children?:FileEntry[],
    dataKey?:string
}
export interface SimpleFileSystem{
    //optional rpc to enable further control
    pxprpc?:ClientInfo;
    ensureInited():Promise<void>;
    writeAll(path:string,data:Uint8Array):Promise<void>;
    readAll(path:string):Promise<Uint8Array|null>;
    delete2(path:string):Promise<void>;
    listdir(path:string):Promise<{name:string,type:string}[]>;
    filetype(path:string):Promise<'dir'|'file'|'none'>;
    mkdir(path:string):Promise<void>;
    rename(path:string,newPath:string):Promise<void>;
    dataDir():Promise<string>;
}


export class TjsSfs implements SimpleFileSystem{
    
    impl?:typeof tjs
    pxprpc?:ClientInfo
    
    protected dummyRootDir:[string,tjs.StatResult][]=[];
    //is windows base(C:\... D:\...) path?
    protected winbasepath=false;
    from(impl:typeof tjs){
        this.impl=impl;
    }
    async ensureInited(): Promise<void> {
        if(this.impl==undefined){
            throw new Error('call from() first.');
        }
        try{
            await this.impl.stat('c:\\');
            this.winbasepath=true;
        }catch(e){}
    }
    async writeAll(path: string, data: Uint8Array): Promise<void> {
        let dirname=path.substring(0,path.lastIndexOf('/'));
        if(await this.filetype(dirname)!=='dir'){
            await this.mkdir(dirname);
        }
        path=this.pathConvert(path);
        let file=await this.impl!.open(path,'w');
        try{
            let offset=0;
            for(let times=0;offset<data.byteLength && times<4000;times++){
                let sizemax=4*1024*1024;
                if(data.length-offset<sizemax){
                    sizemax=data.length-offset;
                }
                let write=await file.write(new Uint8Array(data,offset,sizemax),offset);
                offset+=write;
            }
        }finally{
            await file.close();
        }
    }
    async readAll(path: string): Promise<Uint8Array | null> {
        path=this.pathConvert(path);
        return await this.impl!.readFile(path);
    }
    async delete2(path: string): Promise<void> {
        path=this.pathConvert(path);
        await this.impl!.rm(path);
    }
    protected pathConvert(path:string):string{
        if(path===''){
            return '/';
        }
        if(path.startsWith('/') && this.winbasepath){
            if(path.length<=3){
                return path.substring(1)+'\\';
            }else{
                return path.substring(1);
            }
        }else{
            return path;
        }
    }
    async listdir(path: string): Promise<{ name: string; type: string; }[]> {
        if((path==='/' || path==='') && this.winbasepath){
            if(this.dummyRootDir.length===0){
                for(let t1 of 'cdefghijklmn'){
                    try{
                        this.dummyRootDir.push([t1+':',await this.impl!.stat(t1+':\\')]);
                    }catch(e){
                    }
                }
            }
            return this.dummyRootDir.map(v=>({name:v[0],type:'dir'}))
        }
        path=this.pathConvert(path);
        let files=[] as { name: string; type: string; }[];
        for await (let child of await this.impl!.readdir(path)){
            files.push({name:child.name,type:child.isDirectory?'dir':'file'})
        }
        return files;
    }
    async filetype(path: string): Promise<"dir" | "file" | "none"> {
        path=this.pathConvert(path);
        try{
            let st=await this.impl!.stat(path);
            return st.isDirectory?'dir':'file'
        }catch(e){
            return 'none';
        }
    }
    async mkdir(path: string): Promise<void> {
        path=this.pathConvert(path);
        await this.impl!.mkdir(path);
    }
    async rename(path: string, newPath: string): Promise<void> {
        path=this.pathConvert(path);
        newPath=this.pathConvert(newPath);
        await this.impl!.rename(path,newPath);
    }
    async dataDir(): Promise<string> {
        //note homedir is Application specified, not the user home normally.
        //maybe we should use another function name.
        return this.impl!.homedir()
    }

    
}


export class LocalWindowSFS implements SimpleFileSystem{
    db?: CKeyValueDb;
    root?:FileEntry;
    //For compatibility. fs module is in partic2/JsNotebook in early day.
    dbname='partic2/JsNotebook/filebrowser/sfs';

    constructor(){}
    pxprpc?: ClientInfo | undefined;
    async ensureInited(){
        //XXX: race condition
        if(this.db==undefined){
            this.db=await kvStore(this.dbname)
            this.root=await this.db.getItem('lwsfs/1');
            if(this.root==undefined){
                this.root={name:'',type:'dir',children:[]}
            }
        }
    }
    pathSplit(path:string){
        //remove empty name
        return path.split(/[\/\\]/).filter(v=>v!='');
    }
    protected async lookupPathDir(path2:string[],opt:{createParentDirectories?:boolean}){
        let curobj:FileEntry=this.root!;
        for(let i1=0;i1<path2.length;i1++){
            let name=path2[i1];
            if(curobj.type==='dir'){
                let t1=curobj.children!.find(v=>v.name===name);
                if(t1===undefined){
                    if(opt.createParentDirectories){
                        t1={type:'dir',children:[],name};
                        curobj.children!.push(t1);
                    }else{
                        throw new Error(path2.slice(0,i1).join('/')+' is not a directory')
                    }
                }
                curobj=t1;
            }else if(curobj.type==='file'){
                throw new Error(path2.slice(0,i1+1).join('/')+' is not a directory')
            }
        }
        return curobj;
    }
    async writeAll(path:string,data:Uint8Array){
        let path2=this.pathSplit(path);
        let parent=await this.lookupPathDir(path2.slice(0,path2.length-1),{createParentDirectories:true});
        let found=parent.children!.find(v=>v.name===path2[path2.length-1]);
        let dataKey=GenerateRandomString();
        if(found==undefined){
            parent.children!.push({type:'file',name:path2[path2.length-1],dataKey})
        }else{
            dataKey=found.dataKey!;
        }
        await this.db!.setItem(dataKey,data);
        await this.saveChange();
    }
    async readAll(path:string){
        let path2=this.pathSplit(path);
        try{
            let parent=await this.lookupPathDir(path2.slice(0,path2.length-1),{createParentDirectories:false});
            let found=parent.children!.find(v=>v.name===path2[path2.length-1]);
            if(found==undefined || found.type!=='file'){
                return null
            }else{
                return await this.db!.getItem(found.dataKey!) as Uint8Array;
            }
        }catch(e){
            return null;
        }
    }
    async delete2(path:string){
        let path2=this.pathSplit(path);
        let parent=await this.lookupPathDir(path2.slice(0,path2.length-1),{createParentDirectories:false});
        let found=parent.children!.findIndex(v=>v.name===path2[path2.length-1]);
        if(found>=0){
            let [fe]=parent.children!.splice(found,1);
            if(fe.dataKey!=undefined){
                this.db!.delete(fe.dataKey);
            }
        }
        await this.saveChange()
    }
    async saveChange(){
        this.db!.setItem('lwsfs/1',this.root);
    }
    async listdir(path:string){
        let path2=this.pathSplit(path);
        let dir1=await this.lookupPathDir(path2,{createParentDirectories:false});
        return dir1.children!.map(v=>v);
    }
    async mkdir(path:string){
        let path2=this.pathSplit(path);
        await this.lookupPathDir(path2,{createParentDirectories:true});
        await this.saveChange();
    }
    //Don't create directory automatically
    async filetype(path:string):Promise<'dir'|'file'|'none'>{
        let path2=this.pathSplit(path);
        try{
            if(path==''){
                return this.root!.type;
            }
            let parent=await this.lookupPathDir(path2.slice(0,path2.length-1),{createParentDirectories:false});
            let found=parent.children!.find(v=>v.name===path2[path2.length-1]);
            return found===undefined?'none':found.type;
        }catch(e){
            return 'none'
        }
    }
    async rename(path:string,newPath:string){
        let path2=this.pathSplit(path);
        let newPath2=this.pathSplit(newPath);
        let parent=await this.lookupPathDir(path2.slice(0,path2.length-1),{createParentDirectories:false})
        let newParent=await this.lookupPathDir(newPath2.slice(0,path2.length-1),{createParentDirectories:true});
        let foundIndex=parent.children!.findIndex(v=>v.name==path2[path2.length-1]);
        let [t1]=parent.children!.splice(foundIndex,1);
        t1.name=newPath2[newPath2.length-1];
        newParent.children!.push(t1);
        await this.saveChange();
    }
    async dataDir(): Promise<string> {
        return ''
    }
}


class RequirejsResourceProvider{
    rootPath:string='www';
    constructor(public fs:SimpleFileSystem){};
    handler=async (modName: string, url: string)=>{
        await this.fs.ensureInited();
        let {baseUrl}=requirejs.getConfig();
        let fileName=url.substring(baseUrl.length)
        let data=await this.fs.readAll(this.rootPath+'/'+fileName)
        if(data!=null){
            return new TextDecoder().decode(data);
        }
        return null;
    }
}

export let installedRequirejsResourceProvider=[] as {rootPath:string,fs:SimpleFileSystem,handler:any}[];

export async function installRequireProvider(fs:SimpleFileSystem,rootPath?:string){
    let provider=new RequirejsResourceProvider(fs);
    if(rootPath!=undefined){
        provider.rootPath=rootPath;
    }
    requirejs.addResourceProvider(provider.handler);
    installedRequirejsResourceProvider.push(provider);
    return provider.handler;
}
