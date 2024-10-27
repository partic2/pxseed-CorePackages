import { ArrayBufferToBase64, GenerateRandomString, ToDataUrl, amdContext, future, mutex, requirejs, sleep } from "./base";


export var __name__='partic2/jsutils1/webutils'

export var config={
    defaultStorePrefix:__name__
}


export function DomStringListToArray(strLs: DOMStringList) {
    var arr = new Array<string>();
    for (var i = 0; i < strLs.length; i++) {
        arr.push(strLs[i]);
    }
    return arr;
}

class CIndexedDb {
    public constructor() { }
    public db?: IDBDatabase;
    public transaction!: IDBTransaction;
    public update!: boolean;
    public connect(name: string, version?: number): Promise<boolean> {
        var that = this;
        return new Promise(function (resolve, reject) {
            let openReq = globalThis.indexedDB.open(name, version);
            openReq.onerror = function (ev) {
                reject(openReq.error);
            };
            openReq.onsuccess = function (ev) {
                that.db = openReq.result;
                that.update = false;
                resolve(that.update);
            }
            openReq.onupgradeneeded = function (ev) {
                that.db = openReq.result;
                that.update = true;
                resolve(that.update);
            }
        });
    }
    public async drop(name?: string) {
        if (this.db != null) {
            if (name == null) {
                name = this.db!.name
            }
            await this.db!.close();
        }
        return new Promise(function (resolve, reject) {
            var req = globalThis.indexedDB.deleteDatabase(name!);
            req.onsuccess = function (ev) {
                resolve(this.result);
            } 
            req.onerror = function (ev) {
                reject(req.error);
            }
        })
    }
    public async createObjectStore(name: string, parameters?: IDBObjectStoreParameters) {
        let obj = this.db!.createObjectStore(name, parameters);
        return obj;
    }
    public beginTranscation() {
        this.transaction = this.db!.transaction(DomStringListToArray(this.db!.objectStoreNames), 'readwrite')
        return this.transaction;
    }
    public getObjectStoreNames(){
        return Array.from(this.db!.objectStoreNames);
    }
    public async close() {
        this.db!.close();
    }
}

export interface IKeyValueDb{
    //NOTE: only number,string,boolean,Uint8Array,Int8Array,ArrayBuffer,Array or Object with only above member are promised can store as value.
    setItem(key: string, val: any):Promise<void>
    getItem(key: string):Promise<any>
    //onKey(null) if all key consumed.
    getAllKeys(onKey:(key:string|null)=>{stop?:boolean},onErr?:(err:Error)=>void):void
    delete(key: string):Promise<void>
    close():Promise<void>
}

class IndexedDbAdapter4Kvdb implements IKeyValueDb{
    backend:string='none'
    constructor() { }
    db?: CIndexedDb;
    async init(dbName:string){
        this.db = new CIndexedDb();
        var update = await this.db.connect(dbName);
        if (update && !new Set(this.db.getObjectStoreNames()).has('KeyValueMap')) {
            var objStore = await this.db.createObjectStore('KeyValueMap', {
            });
            await this.db.close();
            await this.db.connect(dbName);
        }
        this.backend='indexedDb'
    }
    async setItem(key: string, val: any) {
        var trans = this.db!.beginTranscation();
        var store = trans!.objectStore('KeyValueMap');
        var req = store.put(val, key);
        return new Promise<void>(function (resolve, reject) {
            req.onsuccess = function (ev) {
                resolve();
            }
            req.onerror = function (ev) {
                reject(this.error);
            }
        })
    }
    async getItem(key: string) {
        var trans = this.db!.beginTranscation();
        var store = trans!.objectStore('KeyValueMap');
        var req = store.get(key)
        return new Promise<any>(function (resolve, reject) {
            req.onsuccess = function (ev) {
                resolve(this.result);
            }
            req.onerror = function (ev) {
                reject(this.error);
            }
        })
    }
    //do NOT use AsyncIterator. indexedDb will close cursor automatically if no further request in one TICK.
    getAllKeys(onKey:(key:string|null)=>{stop?:boolean},onErr?:(err:Error)=>void) {
        var trans = this.db!.beginTranscation();
        var store = trans!.objectStore('KeyValueMap');
        var req = store.openKeyCursor();
        req.onsuccess = function (ev) {
            if(this.result!==null){
                let next=onKey(this.result.key as string);
                if(!(next!=undefined && next.stop===true)){
                    this.result.continue();
                }
            }else{
                onKey(null);
            }
        }
        req.onerror = function (ev) {
            onErr?.(new Error('idb error'))
            onKey(null);
        }
    }
   
    async delete(key: string) {
        var trans = this.db!.beginTranscation();
        var store = trans!.objectStore('KeyValueMap');
        var req = store.delete(key)
        return new Promise<any>(function (resolve, reject) {
            req.onsuccess = function (ev) {
                resolve(this.result);
            }
            req.onerror = function (ev) {
                reject(this.error);
            }
        })
    }
    async close() {
        await this.db!.close();
    }
}

export class CKeyValueDb implements IKeyValueDb {
    impl?:IKeyValueDb;
    async use(impl:IKeyValueDb){
        this.impl=impl;
    }
    //NOTE: only number,string,boolean,Uint8Array,Int8Array,ArrayBuffer,Array or Object with only above member are promised can store as value.
    setItem(key: string, val: any): Promise<void> {
        return this.impl!.setItem(key,val);
    }
    getItem(key: string): Promise<any> {
        return this.impl!.getItem(key);
    }
    getAllKeys(onKey: (key: string | null) => { stop?: boolean | undefined; }, onErr?: ((err: Error) => void) | undefined): void {
        this.impl!.getAllKeys(onKey,onErr);
    }
    delete(key: string): Promise<void> {
        return this.impl!.delete(key);
    }
    close(): Promise<void> {
        return this.impl!.close();
    }
    async useIndexedDb(dbName: string) {
        let impl=new IndexedDbAdapter4Kvdb();
        await impl.init(dbName);
        await this.use(impl);
    }
    async getAllKeysArray(){
        let keys=[] as string[]
        return await new Promise<string[]>((resolve,reject)=>{
            this.getAllKeys((k)=>{
                if(k!=null){
                    keys.push(k)
                }else{
                    resolve(keys);
                }
                return {};
            })
        })
    }
    async *getAllItems(){
        for(let k of await this.getAllKeysArray()){
            yield {key:k,value:await this.getItem(k)}
        }
    }
}

export function ConvertFormDataToObject(data:FormData):any{
    var r:any={};
    data.forEach((val,key,parent)=>{
        r[key]=val;
    })
    return r;
}

export function GetUrlQueryVariable(name:string):string|null{
    return GetUrlQueryVariable2(location.toString(),name);
}

export function GetUrlQueryVariable2(url:string,name:string):string|null{
    var startOfQuery=url.indexOf('?');
    if(startOfQuery<0){
        return null;
    }else{
        var query = url.substring(startOfQuery+1)
        var vars = query.split("&");
        for (var i=0;i<vars.length;i++) {
                var pair = vars[i].split("=");
                if(pair[0] == name){return pair[1];}
        }
        return null;
    }
}

export function AddUrlQueryVariable(url:string,vars:{[key:string]:string}):string{
    var startOfQuery=url.indexOf('&');
    let split='&'
    if(startOfQuery<0){
        url+='?'
        split=''
    }
    for(let k in vars){
        url+=split+k+'='+encodeURI(vars[k]);
        split='&'
    }
    return url;
    
}


export function GetFullPathFromRelativePath(relPath:string):string{
    var dir=location.pathname.substring(location.pathname.lastIndexOf('/'));
    return dir+relPath;
}

var priv__CachedDownloadLink:HTMLAnchorElement|null=null;
export function RequestDownload(buff:ArrayBuffer|string,fileName:string){
    if(priv__CachedDownloadLink==null){
        priv__CachedDownloadLink = document.createElement('a');
        priv__CachedDownloadLink.style.display = 'none';
        document.body.appendChild(priv__CachedDownloadLink);
    }
    priv__CachedDownloadLink.setAttribute('download', fileName);
    let url = URL.createObjectURL(new Blob( [buff] ))
    
    priv__CachedDownloadLink.href = url;
    priv__CachedDownloadLink.click();
    (async ()=>{await sleep(5000,null);URL.revokeObjectURL(url);});
}
export async function selectFile():Promise<FileList|null>{
    let fileInput=document.createElement('input');
    fileInput.type='file';
    fileInput.multiple=true;
    return new Promise<FileList|null>((resolve,reject)=>{
        fileInput.addEventListener('change',(ev)=>{
            resolve(fileInput.files);
        });
        fileInput.click();
    })
}

export function AddStyleSheetNode():CSSStyleSheet{
    let cssNode=document.createElement('style')
    document.head.appendChild(cssNode);
    return <CSSStyleSheet>cssNode.sheet
}


export function GetStyleRuleOfSelector(selector:string){
    var matched=new Array<CSSStyleRule>();
    for(let i=0;i<document.styleSheets.length;i++){
        let style=document.styleSheets.item(i) as CSSStyleSheet;
        for(let i2=0;i2<style.cssRules.length;i2++){
            var rule=style.cssRules.item(i2);
            if(rule!=null&&rule.constructor==CSSStyleRule){
                let cssRule=rule as CSSStyleRule;
                if(cssRule.selectorText.split(',').findIndex(function(v){
                    return v.trim()==selector;
                })>=0){
                    matched.push(cssRule);
                }
            }
        }
    }
    return matched;
}


export class CDynamicPageCSSManager{
    public CssNode?:CSSStyleSheet
    public InsertedSelector=new Array<string>();
    public PutCss(selector:string,rules:string[]){
        if(this.CssNode==undefined){
            this.CssNode=AddStyleSheetNode();
        }
        let index=this.InsertedSelector.indexOf(selector);
        if(index>=0){
            //cssText is read only, Do not write it. 
            this.CssNode.deleteRule(index);
            this.InsertedSelector.splice(index,1);
        }
        this.CssNode.insertRule(selector+'{'+rules.join(';')+'}',0);
        this.InsertedSelector.unshift(selector);
    }
    public RemoveCss(selector:string){
        if(this.CssNode==undefined){
            this.CssNode=AddStyleSheetNode();
        }
        let index=this.InsertedSelector.indexOf(selector);
        if(index>=0){
            this.CssNode.deleteRule(index);
            this.InsertedSelector.splice(index,1);
        }
    }
}

export var DynamicPageCSSManager=new CDynamicPageCSSManager();
var kvdbmap={} as {[dbname:string]:CKeyValueDb}
var kvdbinitmutex=new mutex();
var kvStoreBackend=async (dbname:string)=>{
    let db=new CKeyValueDb();
    await db.useIndexedDb(dbname);
    return db.impl!;
}
export async function kvStore(dbname?:string){
    await kvdbinitmutex.lock();
    if(dbname==undefined){
        dbname=config.defaultStorePrefix+'/kv-1';
    }
    try{
        if(!(dbname in kvdbmap)){
            let impl=await kvStoreBackend(dbname);
            kvdbmap[dbname]=new CKeyValueDb();
            await kvdbmap[dbname].use(impl)
        }
        return kvdbmap[dbname]!;
    }finally{
        await kvdbinitmutex.unlock();
    }
}
export function setKvStoreBackend(backend:(dbname:string)=>Promise<IKeyValueDb>){
    kvStoreBackend=backend;
}

var cachedPersistentConfig:{[modname:string]:any}={};
export async function GetPersistentConfig(modname:string){
    if(cachedPersistentConfig[modname]==undefined){
        let kvs=await kvStore();
        cachedPersistentConfig[modname]=await kvs.getItem(modname+'/config');
    }
    if(cachedPersistentConfig[modname]==undefined){
        cachedPersistentConfig[modname]={};
    }
    return cachedPersistentConfig[modname];
    
}
export async function SavePersistentConfig(modname:string){
    if(cachedPersistentConfig[modname]!=undefined){
        let kvs=await kvStore();
        return await kvs.setItem(modname+'/config',cachedPersistentConfig[modname]);
    }
}


//WorkerThread feature require a custom AMD loader https://github.com/partic2/requirejs-extend
const WorkerThreadMessageMark='__messageMark_WorkerThread'

/*workerentry.js MUST put into the same origin to access storage api on web ,
Due to same-origin-policy. That mean, dataurl is unavailable.
Worker can be override, So do NOT abort this module init(throw error).*/
let workerEntryUrl=function(){
    try{
        return getWWWRoot()+'/pxseedInit.js?__jsentry='+encodeURIComponent('partic2/jsutils1/workerentry')
    }catch(e){};
    return '';
}()

export interface BasicMessagePort {
    addEventListener: (type: 'message', cb: (msg: MessageEvent) => void) => void;
    removeEventListener: (type: 'message', cb: (msg: MessageEvent) => void) => void;
    postMessage: (data: any, opt?: {
        transfer: Transferable[];
    }) => void;
}

export interface IWorkerThread{
    port?:BasicMessagePort
    workerId:string;
    start():Promise<void>
    runScript(script:string,getResult?:boolean):Promise<any>
}

class WebWorkerThread implements IWorkerThread{
    port?:Worker;
    workerId='';
    waitReady=new future<number>();
    constructor(workerId?:string){
        this.workerId=workerId??GenerateRandomString();
    };
    async start(){
        this.port=new Worker(workerEntryUrl);
        this.port=this.port;
        this.port.addEventListener('message',(msg:MessageEvent)=>{
            if(typeof msg.data==='object' && msg.data[WorkerThreadMessageMark]){
                let {type,scriptId}=msg.data as {type:string,scriptId?:string};
                switch(type){
                    case 'run':
                        this.onHostRunScript(msg.data.script)
                        break;
                    case 'onScriptResolve':
                        this.onScriptResult(msg.data.result,scriptId)
                        break;
                    case 'onScriptReject':
                        this.onScriptReject(msg.data.reason,scriptId);
                        break;
                    case 'ready':
                        this.waitReady.setResult(0);
                        break;
                }
            }
        });
        await this.waitReady.get();
        await this.runScript(`this.__workerId='${this.workerId}'`)
    }
    onHostRunScript(script:string){
        (new Function('workerThread',script))(this);
    }
    processingScript={} as {[scriptId:string]:future<any>}
    async runScript(script:string,getResult?:boolean){
        let scriptId='';
        if(getResult===true){
            scriptId=GenerateRandomString();
            this.processingScript[scriptId]=new future<any>();
        }
            this.port?.postMessage({[WorkerThreadMessageMark]:true,type:'run',script,scriptId})
        if(getResult===true){
            return await this.processingScript[scriptId].get();            
        }
    }
    onScriptResult(result:any,scriptId?:string){
        if(scriptId!==undefined && scriptId in this.processingScript){
            let fut=this.processingScript[scriptId];
            delete this.processingScript[scriptId];
            fut.setResult(result);
        }
    }
    onScriptReject(reason:any,scriptId?:string){
        if(scriptId!==undefined && scriptId in this.processingScript){
            let fut=this.processingScript[scriptId];
            delete this.processingScript[scriptId];
            fut.setException(new Error(reason));
        }
    }
}


var defaultWorkerThreadImpl:{new(workerId?:string):IWorkerThread}=WebWorkerThread;
export function CreateWorkerThread(workerId?:string):IWorkerThread{
    return new defaultWorkerThreadImpl(workerId);
}

export function setWorkerThreadImplementation(impl:{new(workerId?:string):IWorkerThread}){
    defaultWorkerThreadImpl=impl
}

export class HttpClient{
    async fetch(url:string,init?:RequestInit){
        for(let hook of this.hooks){
            await hook({url,init});
        }
        let resp=await fetch(url,init);
        for(let hook of this.respHooks){
            await hook({url,init},resp);
        }
        return resp;
    }
    hooks:((req:{url:string,init?:RequestInit})=>Promise<void>)[]=[];
    respHooks:((req:{url:string,init?:RequestInit},resp:Response)=>Promise<void>)[]=[]
    hookRequest(hook:((req:{url:string,init?:RequestInit})=>Promise<void>)){
        this.hooks.push(hook);
    }
    hookResponse(hook:(req:{url:string,init?:RequestInit},resp:Response)=>Promise<void>){
        this.respHooks.push(hook);
    }
}

export var defaultHttpClient=new HttpClient();

export async function webFetch(url:string,init?:RequestInit){
    return await defaultHttpClient.fetch(url,init);
}

declare let __pxseedInit:any

export function GetJsEntry(){
    return __pxseedInit._entry
}

export let path={
    sep:'/',
    join(...args:string[]){
        let parts=[] as string[];
        for(let t1 of args){
            for(let t2 of t1.split(this.sep)){
                if(t2==='..' && parts.length>=1){
                    parts.pop();
                }else if(t2==='.'){
                    //skip
                }else{
                    parts.push(t2);
                }
            }
        }
        return parts.join(this.sep);
    }
}

export function BuildUrlFromJsEntryModule(entryModule:string,urlarg?:string){
    return window.location.pathname+'?__jsentry='+encodeURIComponent(entryModule)+(urlarg?'&'+urlarg:'');
}

export function getWWWRoot(){
    return requirejs.getConfig().baseUrl
}

export function getResourceManager(moduleName:string){
    return {
        getUrl(path2:string){
            return path.join(getWWWRoot(),moduleName+'/..',path2);
        }
    }
}

export function useDeviceWidth(){
    let headmeta=document.createElement('meta');
    headmeta.name='viewport';
    headmeta.content='width=device-width user-scalable=no';
    document.head.append(headmeta)
}
