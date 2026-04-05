import { GenerateRandomString, amdContext, assert, future, mutex, requirejs, sleep } from "./base";


export var __name__='partic2/jsutils1/webutils'

export var config={
    defaultStorePrefix:__name__,
    //No garantee to contain all kvStorePrefix binding, But at least binding for current wwwroot.
    //See useKvStorePrefix for detail.
    kvStorePrefix:null as Record<string,string>|null
}


function DomStringListToArray(strLs: DOMStringList) {
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
            this.db!.close();
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
    async getAllKeys(onKey:(key:string|null)=>{stop?:boolean},onErr?:(err:Error)=>void) {
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
    constructor(public dbName:string,public impl:IKeyValueDb){}
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
        delete kvdbmap[this.dbName];
        return this.impl!.close();
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
            },(err)=>reject(err))
        })
    }
    async *getAllItems(){
        for(let k of await this.getAllKeysArray()){
            yield {key:k,value:await this.getItem(k)}
        }
    }
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


export function RequestDownload(buff:ArrayBuffer|string|Uint8Array<ArrayBuffer>,fileName:string){
    let downloadAnchor = document.createElement('a');
    downloadAnchor.style.display = 'none';
    document.body.appendChild(downloadAnchor);
    downloadAnchor.setAttribute('download', fileName);
    let url = URL.createObjectURL(new Blob( [buff] ))
    downloadAnchor.href = url;
    downloadAnchor.click();
    (async ()=>{
        await sleep(5000,null);
        URL.revokeObjectURL(url);
        document.body.removeChild(downloadAnchor);
    })();
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
var kvStoreBackend:(dbname:string)=>Promise<IKeyValueDb>=async (dbname:string)=>{
    let impl=new IndexedDbAdapter4Kvdb();
    await impl.init(dbname);
    return impl;
}
export async function kvStore(dbname?:string){
    return kvdbinitmutex.exec(async ()=>{
        if(dbname==undefined){
            dbname=config.defaultStorePrefix+'/kv-1';
        }
        if(config.kvStorePrefix==null){
            let impl=await kvStoreBackend(config.defaultStorePrefix+'/kv-1');
            let cfg=await impl.getItem(__name__+'/config');
            if(cfg==undefined||cfg.kvStorePrefix==undefined){
                config.kvStorePrefix={};
            }else{
                config.kvStorePrefix=cfg.kvStorePrefix;
            }
        }
        let prefix=config.kvStorePrefix![getWWWRoot()];
        if(prefix!=undefined){
            dbname=prefix+dbname;
        }
        if(!(dbname in kvdbmap)){
            let impl=await kvStoreBackend(dbname);
            kvdbmap[dbname]=new CKeyValueDb(dbname,impl);
            
        }
        return kvdbmap[dbname]!;
    })
}
export function setKvStoreBackend(backend:(dbname:string)=>Promise<IKeyValueDb>){
    kvStoreBackend=backend;
}
//By default, kvStore pass 'dbname' parameter directly to kvStoreBackend.
//But sometime, User may want a isolated kvStore namespace.
//This function bind a kvStore 'prefix' to wwwroot persistently.
//When this module is loaded with matched wwwroot, the correspond prefix will be added to 'dbname' before passing to kvStoreBackend.
//Default value:wwwroot=getWWWRoot();prefix=wwwroot+'/';
export async function useKvStorePrefix(wwwroot?:string,prefix?:string){
    await kvdbinitmutex.lock();
    try{
        wwwroot=wwwroot??getWWWRoot();
        prefix=prefix??(wwwroot+'/');
        let impl=await kvStoreBackend(config.defaultStorePrefix+'/kv-1');
        let cfg=await impl.getItem(__name__+'/config');
        if(cfg==undefined)cfg={};
        if(cfg.kvStorePrefix==undefined)cfg.kvStorePrefix={};
        cfg.kvStorePrefix[wwwroot]=prefix;
        await impl.setItem(__name__+'/config',cfg);
    }finally{
        await kvdbinitmutex.unlock();
    }
}

var cachedPersistentConfig:{[modname:string]:any}={};
export async function GetPersistentConfig(modname:string){
    if(cachedPersistentConfig[modname]==undefined){
        cachedPersistentConfig[modname]={};
    }
    let kvs=await kvStore();
    let cfg=await kvs.getItem(modname+'/config');
    let ccfg=cachedPersistentConfig[modname];
    for(let t1 in ccfg){delete ccfg[t1]};
    Object.assign(ccfg,cfg)
    return ccfg;
    
}
export async function SavePersistentConfig(modname:string){
    if(cachedPersistentConfig[modname]!=undefined){
        let kvs=await kvStore();
        return await kvs.setItem(modname+'/config',cachedPersistentConfig[modname]);
    }
}

//WorkerThread feature require a custom AMD loader https://github.com/partic2/partic2-iamdee
export const WorkerThreadMessageMark='__messageMark_WorkerThread'

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
        transfer?: Transferable[];
    }) => void;
}

export interface IWorkerThread{
    port?:BasicMessagePort
    workerId:string;
    start():Promise<void>;
    call(module:string,func:string,args:any[]):Promise<any>
    onExit:Set<()=>void>
}

export class FunctionCallOverMessagePort{
    callRequest:Record<string,future<any>>={};
    onMessage=(msg:MessageEvent)=>{
        if(typeof msg.data==='object'){
            if(msg.data[WorkerThreadMessageMark]==='return'){
                let {id,res,err}=msg.data
                if(this.callRequest[id]!=undefined){
                    if(err!=undefined){
                        this.callRequest[id].setException(err);
                    }else{
                        this.callRequest[id].setResult(res);
                    }
                    delete this.callRequest[id];
                }
            }else if(msg.data[WorkerThreadMessageMark]==='call'){
                let {id,module,func,args}=msg.data;
                import(module).then((mod)=>mod[func](...args,this)).then(
                    (res)=>{(msg.source??this.port).postMessage({[WorkerThreadMessageMark]:'return',id,res})},
                    (err)=>{(msg.source??this.port).postMessage({[WorkerThreadMessageMark]:'return',id,err})}
                )
            }
        }
    }
    constructor(public port:BasicMessagePort){
        this.port.addEventListener('message',this.onMessage);
    };
    async call(module:string,func:string,args:any[]):Promise<any>{
        let id=GenerateRandomString();
        let fut=new future<any>();
        this.callRequest[id]=fut
        this.port.postMessage({[WorkerThreadMessageMark]:'call',id,module,func,args});
        return fut.get();
    }
}

export class WebWorkerThread implements IWorkerThread{
    //XXX:Chrome for android don't support SharedWorker.
    port?:BasicMessagePort;
    workerId='';
    protected waitReady=new future<number>();
    protected funcCall?:FunctionCallOverMessagePort;
    onExit=new Set<()=>void>()
    constructor(workerId?:string){
        this.workerId=workerId??GenerateRandomString();
    };
    protected _forwardLifecycle=(msg:Event)=>{
        this.call('partic2/jsutils1/workerentry','dispatchWorkerLifecycle',[msg.type]);
    }
    protected async _createWorker():Promise<BasicMessagePort>{
        return new Worker(workerEntryUrl);
    }
    async start(){
        this.port=await this._createWorker();
        let cb=(msg:MessageEvent)=>{
            if(typeof msg.data==='object'){
                if(msg.data[WorkerThreadMessageMark]==='ready'){
                    this.waitReady.setResult(0);
                }else if(msg.data[WorkerThreadMessageMark]==='closing'){
                    this.onExit.forEach(cb=>cb());
                }
            }
        };
        this.port.addEventListener('message',cb);
        await this.waitReady.get();
        this.funcCall=new FunctionCallOverMessagePort(this.port);
        await this.call('partic2/jsutils1/workerentry','setWorkerInfo',[this.workerId]);
        lifecycle.addEventListener('exit',this._forwardLifecycle);
        this.onExit.add(()=>lifecycle.removeEventListener('exit',this._forwardLifecycle));
    }
    async call(module:string,funcName:string,args:any[]):Promise<any>{
        return await this.funcCall!.call(module,funcName,args)
    }
    requestExit(){
        this.call('partic2/jsutils1/workerentry','requestExit',[]);
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
        for(let hook of this.reqHooks){
            await hook({url,init});
        }
        let resp=await fetch(url,init);
        for(let hook of this.respHooks){
            await hook({url,init},resp);
        }
        return resp;
    }
    protected reqHooks:((req:{url:string,init?:RequestInit})=>Promise<void>)[]=[];
    protected respHooks:((req:{url:string,init?:RequestInit},resp:Response)=>Promise<void>)[]=[]
    hookRequest(hook:((req:{url:string,init?:RequestInit})=>Promise<void>)){
        this.reqHooks.push(hook);
    }
    hookResponse(hook:(req:{url:string,init?:RequestInit},resp:Response)=>Promise<void>){
        this.respHooks.push(hook);
    }
}

export var defaultHttpClient=new HttpClient();
export function setDefaultHttpClient(client:HttpClient){
    defaultHttpClient=client;
}

declare let __pxseedInit:any

export function GetJsEntry(){
    return __pxseedInit._entry
}
//Mainly for http url process, So don't modify 'sep' on windows.
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
    },
    dirname(PathLike:string){
        return this.join(PathLike,'..');
    }
}

export function BuildUrlFromJsEntryModule(entryModule:string,urlarg?:string){
    return window.location.pathname+'?__jsentry='+encodeURIComponent(entryModule)+(urlarg?'&'+urlarg:'');
}

export function getWWWRoot():string{
    return requirejs.getConfig().baseUrl
}

let getResourceManagerImpl=(modNameOrLocalRequire:string|typeof require)=>{
    if(typeof modNameOrLocalRequire==='function'){
        modNameOrLocalRequire=requirejs.getLocalRequireModule(modNameOrLocalRequire)
    }
    return {
        getUrl(path2:string){
            let r='';
            if(path2.substring(0,1)==='/'){
                r=path.join(getWWWRoot(),path2.substring(1));
            }else{
                r=path.join(getWWWRoot(),(modNameOrLocalRequire as string),'..',path2);
            }
            if(r.startsWith('http')){
                let urlArgs=requirejs.getConfig().urlArgs??'';
                if(urlArgs!==''){
                    r=r+'?'+urlArgs;
                }
            }
            return r;
        },
        async read(path2:string):Promise<ReadableStream>{
            let resp=await defaultHttpClient.fetch(this.getUrl(path2));
            assert(resp.ok,'fetch failed with error HTTP error:'+resp.status+' '+resp.statusText)
            assert(resp.body!=null);
            return resp.body;
        }
    }
}

export function setResourceManagerImpl(impl:typeof getResourceManagerImpl){
    getResourceManagerImpl=impl;
}

export function getResourceManager(modNameOrLocalRequire:string|typeof require){
    return getResourceManagerImpl(modNameOrLocalRequire)
}

export function useDeviceWidth(){
    let headmeta=document.createElement('meta');
    headmeta.name='viewport';
    headmeta.content='width=device-width user-scalable=no';
    document.head.append(headmeta)
}

export function useCssFile(cssUrl:string){
    let linkTag=document.createElement('link')
    linkTag.rel='stylesheet';
    linkTag.type='text/css';
    linkTag.href=cssUrl;
    document.head.appendChild(linkTag);
}

let iconLinkTag:HTMLLinkElement|null=null;
export function usePageIcon(iconUrl:string,iconType?:'image/x-icon'|'image/png'|'image/svg+xml'){
    if(iconLinkTag!=null){
        document.head.removeChild(iconLinkTag);
    }
    iconType=iconType??'image/x-icon';
    iconLinkTag=document.createElement('link')
    iconLinkTag.rel='icon';
    iconLinkTag.type=iconType;
    iconLinkTag.href=iconUrl;
    document.head.appendChild(iconLinkTag);
}

class _LifecycleEventHandler extends EventTarget{
    addEventListener(type:'pause',callback:EventListenerOrEventListenerObject):void;
    addEventListener(type:'resume',callback:EventListenerOrEventListenerObject):void;
    addEventListener(type:'exit',callback:EventListenerOrEventListenerObject):void;
    addEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions | undefined): void {
        super.addEventListener(type,callback,options);
    }
}
export let lifecycle=new _LifecycleEventHandler();

if(globalThis.document!=undefined){
    globalThis.document.addEventListener('visibilitychange',(ev)=>{
        if(document.hidden){
            lifecycle.dispatchEvent(new Event('pause'));
        }else{
            lifecycle.dispatchEvent(new Event('resume'));
        }
    });
    globalThis.addEventListener('beforeunload',()=>{
        lifecycle.dispatchEvent(new Event('pause'));
        lifecycle.dispatchEvent(new Event('exit'));
    });
}

export class GlobalInputStateTracer{
    pressingKey=new Set<string>();
    mouseState={x:0,y:0,left:false,right:false,center:false};
    touchsPosition=new Array<{x:number,y:number,id:number}>();
    onStateChange=new Set<()=>void>();
    protected keyDownHandler=(ev:KeyboardEvent)=>{
        this.pressingKey.add(ev.key);
        this.onStateChange.forEach((cb)=>cb());
    }
    protected keyUpHandler=(ev:KeyboardEvent)=>{
        this.pressingKey.delete(ev.key);
        this.onStateChange.forEach((cb)=>cb());
    }
    protected mouseHandler=(ev:MouseEvent)=>{
        this.mouseState.x=ev.clientX;
        this.mouseState.y=ev.clientY;
        this.mouseState.left=(ev.buttons&1)!=0;
        this.mouseState.right=(ev.buttons&2)!=0;
        this.mouseState.center=(ev.buttons&3)!=0
        this.onStateChange.forEach((cb)=>cb());;
    }
    protected touchHandler=(ev:TouchEvent)=>{
        ev.touches.item(0)
        this.touchsPosition.splice(0,this.touchsPosition.length);
        for(let t1=0;t1<ev.touches.length;t1++){
            let t2=ev.touches.item(t1)!;
            this.touchsPosition.push({x:t2.clientX,y:t2.clientY,id:t2.identifier});
        }
        this.onStateChange.forEach((cb)=>cb());
    }
    enabled=false;
    enable(){
        if(!this.enabled && globalThis.window!=undefined){
            let {window}=globalThis;
            this.enabled=true;
            window.addEventListener('keydown',this.keyDownHandler);
            window.addEventListener('keyup',this.keyUpHandler);
            window.addEventListener('mousemove',this.mouseHandler);
            window.addEventListener('mouseup',this.mouseHandler);
            window.addEventListener('mousedown',this.mouseHandler);
            window.addEventListener('touchstart',this.touchHandler);
            window.addEventListener('touchmove',this.touchHandler);
            window.addEventListener('touchend',this.touchHandler);
            window.addEventListener('touchcancel',this.touchHandler);
        }
    }
}
export var globalInputState=new GlobalInputStateTracer();
