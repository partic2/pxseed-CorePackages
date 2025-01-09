
//polyfill globalThis
try{
    let _=globalThis
}catch(e){
    new Function('this.globalThis=this')()
}

export class Task<T>{
    static currentTask:Task<any>|null=null;
    static locals(){
        return Task.currentTask?.locals();
    }
    static getAbortSignal(){
        return Task.currentTask?.getAbortSignal();
    }
    /*
        Convert Promise to Generator. To use Promise in Task and make correct return type with typescript.
        eg: let number_1=yield* Task.yieldWrap(new Promise((resolve)=>resolve(1)));
    */
    static *yieldWrap<T2>(p:Promise<T2>){
        return (yield p) as T2;
    }
    /*
        Avoid losing Task.currentTask after await returned, and also avoid setting incorrent Task when await is pending.
        eg: await Task.awaitWrap(anotherAsyncFunction())
    */
    static async awaitWrap<T2>(p:Promise<T2>){
        Task.getAbortSignal()?.throwIfAborted();
        let savedTask=Task.currentTask;
        Task.currentTask=null;
        try{
            let r=await p;
            return r;
        }finally{
            Task.currentTask=savedTask;
        }
    }
    constructor(taskMain:Generator<Promise<any>,T,any>|(()=>Generator<Promise<any>,T,any>),
                public name?:string){
        this.__iter=(typeof taskMain==='function')?taskMain():taskMain;
        let resolver:Partial<typeof this.__resolver>=[undefined,undefined,undefined];
        resolver[0]=new Promise((resolve,reject)=>{
            resolver![1]=resolve;
            resolver![2]=reject;
        });
        this.__resolver=resolver as any;
    }
    __resolver?:[Promise<T>,((value: T) => void),((reason?: any) => void)]
    __iter?:Generator<Promise<any>>;
    __locals={};
    __abortController=new AbortController();
    __step(tNext:any,error:any){
        Task.currentTask=this;
        try{
            if(this.__abortController.signal.aborted){
                this.__iter!.throw(this.__abortController.signal.reason);
            }
            if(error!=undefined){
                this.__iter!.throw(error);
            }
            let yieldResult=this.__iter!.next(tNext);
            if(!yieldResult.done){
                yieldResult.value.then(
                    r=>this.__step(r,undefined),
                    reason=>this.__step(undefined,reason)
                );
            }else{
                Task.currentTask=null;
                this.__resolver![1](yieldResult.value);
            }
        }catch(e){
            this.__resolver![2](e);
        }finally{
            Task.currentTask=null;
        }
    }
    run(){
        this.__step(undefined,undefined);
        return this;
    }
    abort(reason?:any){
        this.__abortController.abort(reason??new Error('aborted'));
    }
    getAbortSignal(){
        return this.__abortController.signal;
    }
    locals():Record<string,any>{
        return this.__locals;
    }
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): Promise<TResult1 | TResult2>{
        return this.__resolver![0].then(onfulfilled,onrejected);
    }
}

export function throwIfAbortError(e:Error){
    if(e.name==='AbortError'){
        throw e;
    }
}

export function copy<T>(src: T, dst: any, depth: number) {
    if (depth == 0) {
        return;
    }

    Object.getOwnPropertyNames(src).forEach(function (key, i) {
        let srcObj = <{ [key: string]: any }>src;
        let v = srcObj[key];
        if (v instanceof Function) {
            dst[key] = srcObj[key];
        } else if (depth > 1 && (v instanceof Array)) {
            dst[key] = new Array();
            copy(srcObj[key], dst[key], depth - 1);
        } else if (depth > 1 && v instanceof Object) {
            dst[key] = new Object();
            copy(srcObj[key], dst[key], depth - 1);
        } else {
            dst[key] = srcObj[key];
        }
    })

    Object.setPrototypeOf(dst, Object.getPrototypeOf(src));
}

export function clone<T>(src: T, depth: number): T {
    let dst = new Object();
    copy(src, dst, depth);
    return <T>dst;
}


export function FormatDate(date: Date, layout: string) {
    let outstr=layout;
    let o: { [key: string]: number } = {
        "MM": date.getMonth() + 1,
        "dd": date.getDate(),
        "HH": date.getHours(),
        "hh": date.getHours()%12,
        "mm": date.getMinutes(),
        "ss": date.getSeconds(),
        "SS": date.getMilliseconds()
    };
    outstr=outstr.replace(/yyyy/,date.getFullYear().toString().padStart(4,'0'));
    for (var k in o) {
        outstr=outstr.replace(new RegExp(k),o[k].toString().padStart(2,'0'));
    }
    return outstr;
};

export function ParseDate(dateStr: string, layout: string): Date {
    let pos = layout.indexOf('yyyy');
    let year = pos >= 0 ? Number.parseInt(dateStr.substring(pos, pos+4)) : 0;
    pos = layout.indexOf('MM');
    let month = pos >= 0 ? Number.parseInt(dateStr.substring(pos, pos+2)) - 1 : 0;
    pos = layout.indexOf('dd');
    let date = pos >= 0 ? Number.parseInt(dateStr.substring(pos, pos+2)) : 0;
    pos = layout.indexOf('HH');
    let hour = Number.parseInt(dateStr.substring(pos, pos+2))
    pos = layout.indexOf('mm');
    let minute = pos >= 0 ? Number.parseInt(dateStr.substring(pos, pos+2)) : 0;
    pos = layout.indexOf('ss');
    let second = pos >= 0 ? Number.parseInt(dateStr.substring(pos, pos+2)) : 0;
    return new Date(year, month, date, hour, minute, second)
}



export function GetBlobArrayBufferContent(blob: Blob): Promise<ArrayBuffer | null> {
    return new Promise(function (resolve, reject) {
        let reader = new FileReader();
        reader.onload = function (ev) {
            resolve(<ArrayBuffer | null>reader.result);
        }
        reader.onerror=function(ev){
            reject(ev);
        }
        reader.readAsArrayBuffer(blob!);
    })
}


export function sleep<T>(milliSeconds: number, arg?: T): Promise<T> {
    return new Promise(function (resolve, reject) {
        setTimeout(resolve, milliSeconds, arg)
    });
}

export class future<T>{
    public done: boolean = false;
    protected resolveCallback?:(value: T | PromiseLike<T>) => void;
    protected rejectCallback?:(reason?: any) => void;
    protected resultPromise:Promise<T>
    constructor(){
        this.resultPromise=new Promise((resolve,reject)=>{
            this.resolveCallback=resolve;
            this.rejectCallback=reject;
        });
    }
    public get(): Promise<T> {
        return this.resultPromise;
    }
    public setResult(result: T) {
        if (!this.done) {
            this.done = true;
            this.resolveCallback!(result)
        }
    }
    public setException(exception: any) {
        if (!this.done) {
            this.done = true;
            this.rejectCallback!(exception)
        }
    }
}
export class CanceledError extends Error{
    constructor(){
        super('canceled.')
    }
}


export class ArrayWrap2<T>{
    public wrapped:T[]=[]
    public constructor(wrapped?: T[],initPush?: Iterable<T>){
        if(wrapped!=undefined){
            this.wrapped=wrapped;
        }
        if(initPush!=undefined){
            this.pushIterable(initPush);
        }
    }
    public arr(): Array<T> {
        return this.wrapped;
    }
    public pushIterable(iter:Iterable<T>){
        for(let t1 of iter){
            this.wrapped.push(t1);
        }
        return this;
    }
    public removeFirst(predict:(v:T,index:number,arr:T[])=>boolean){
        let idx=this.wrapped.findIndex(predict)
        if(idx>=0){
            return this.wrapped.splice(idx,1)[0];
        }
    }
    public insertAfter(predict:(elem:T,index:number)=>boolean,newElem:T){
        let arr=this.arr();
        arr.splice(arr.findIndex(predict),1,newElem);
        this.wrapped=arr;
    }
    public last(){
        return this.arr()[this.arr().length-1]
    }
    public clone(){
        return new ArrayWrap2<T>([...this.arr()]);
    }
    protected onQueueChange=[] as future<number>[];
    queueSizeLimit?:number
    protected emitQueueChange(){
        let e=clone(this.onQueueChange,1);
        this.onQueueChange.splice(0,this.onQueueChange.length);
        for(let t1 of e){
            t1.setResult(0);
        }
    }
    public cancelWaiting(){
        this.onQueueChange.forEach(t1=>t1.setException(new CanceledError()));
    }
    protected async waitForQueueChange(){
        let waitForChange=new future<number>();
        this.onQueueChange.push(waitForChange);
        await waitForChange.get();
    }
    public async queueBlockShift(){
        while(this.arr().length===0){
            await this.waitForQueueChange();
        }
        let r=this.arr().shift()!;
        this.emitQueueChange();
        return r;
    }
    public async queueBlockPush(elem:T){
        while(this.queueSizeLimit!=undefined && this.arr().length>=this.queueSizeLimit){
            await this.waitForQueueChange();
        }
        this.queueSignalPush(elem);
    }
    public queueSignalPush(elem:T){
        this.arr().push(elem);
        this.emitQueueChange();
    }
    public processWrapped(processor:(origArr:Array<T>)=>Array<T>):this{
        let result=processor(this.arr());
        if(result!=undefined){
            this.wrapped=result;
        }
        return this;
    }
    public [Symbol.iterator](){
        return this.arr()[Symbol.iterator];
    }
    public static *IntSequence(start:number,end:number,step?:number){
        step=step??1;
        for(let t1=start;t1<end;t1+=step){
            yield t1;
        }
    }
}

export class mutex{
    protected locked:boolean=false;
    protected unlockCb:Array<()=>void>=[];
    constructor(){
    }
    public async lock(){
        var that=this;
        if(this.locked){
            return new Promise<void>(function(resolve,reject){
                that.unlockCb.push(resolve);
            });
        }else{
            this.locked=true;
            return;
        }
    }
    public async unlock(){
        if(this.unlockCb.length>0){
            this.unlockCb.shift()!();
        }else{
            this.locked=false;
        }
    }
    public async tryLock(){
        if(!this.locked){
            this.locked=true;
            return true;
        }else{
            return false;
        }
    }
}

declare var require:any,define:any;
export let amdContext={
    require:null as any,
    define:null as any,
    requirejs:null as any
}
try{
    amdContext.require=require;
    amdContext.define=define;
    amdContext.requirejs=(globalThis as any).requirejs
}catch(e){/*Not AMD Environment*/}


//Iamdee spec
interface ScriptLoader {
    loadModule(moduleId: string, url: string, done: (err: Error | null) => void): void;
    getDefiningModule(): string | null;
}
class ResourceProviderLoader implements ScriptLoader{
    currentDefining=null as string|null;
    async loadModuleAsync(moduleId:string,url:string){
        url=(url.match(/[^\?]*/)??[''])[0]
        if(requirejs.resourceProvider==null){
            return new Error('ResourceProviderLoader:Module not found');
        }
        for(let t1 of requirejs.resourceProvider){
            let res=await t1(moduleId,url);
            if(res==null){
                continue;
            }
            if(typeof res==='string'){
                res=new Function(res);
            }
            try{
                this.currentDefining=moduleId;
                res();
            }finally{
                this.currentDefining=null;
            }
            return null;
        }
        return new Error('ResourceProviderLoader:Module not found');
    }
    loadModule(moduleId: string, url: string, done: (err: Error | null) => void): void {
        this.loadModuleAsync(moduleId,url).then((e)=>done(e)).catch(err=>done(err));
    }
    getDefiningModule(): string | null {
        return this.currentDefining;
    }
}

export let requirejs = {
    define:function (name: string, dependency: string[], mod: any) {
        amdContext.define(name, dependency, mod);
    },
    require:function(dependency: string[], callback: any,errback?: any) {
        amdContext.require(dependency, callback,errback);
    },
    promiseRequire:function<mod>(implModName: string) {
        let that=this;
        return new Promise<mod>(function (resolve, reject) {
            that.require([implModName], function (mod0: mod) {
                resolve(mod0);
            },(err:any)=>{
                reject(err);
            });
        })
    },
    getConfig:function(){
        return amdContext.require.getConfig();
    },
    getDefined:async function ():Promise<{[k:string]:any}>{
        return amdContext.require.getDefined();
    },
    getFailed:async function ():Promise<{[k:string]:{error:Error}}>{
        //partic2-iamdee feature
        return amdContext.requirejs.getFailed();
    },
    undef:async function (mod:string){
        amdContext.requirejs.undef(mod)
    },
    resourceProvider:null as ((modName:string,url:string)=>Promise<string|Function|null>)[]|null,
    addResourceProvider(provider:(modName:string,url:string)=>Promise<string|Function|null>){
        //partic2-iamdee feature
        if(this.resourceProvider===null){
            this.resourceProvider=[];
            amdContext.define.amd.scriptLoaders.unshift(new ResourceProviderLoader());
        }
        this.resourceProvider.unshift(provider)
    },
    getLocalRequireModule(localRequire:typeof require):string{
        //partic2-iamdee feature
        return (localRequire as any).localRequireModule
    }
}


export function ArrayEquals<T>(obj1: Array<T>, obj2: Array<T>) {
    if (obj1.length != obj2.length) {
        return false
    }
    for (var i = 0; i < obj1.length; i++) {
        if (obj1[i] != obj2[i]) {
            return false;
        }
    }
    return true;
}

export function GenerateRandomString(maxRandLenX4?:number) {
    let s='rnd1';
    if(maxRandLenX4==undefined)maxRandLenX4=4
    for(let i1=0;i1<maxRandLenX4;i1++){
        let part=Math.floor(Math.random() * 1679616).toString(36);
        for(;part.length<4;part='0'+part);
        s+=part;
    }
    return s;
}

export let UidGenerator={
    idnum:[0],
    generate:function(){
        let i=0;
        for(i=0;i<this.idnum.length;i++){
            if(this.idnum[i]<0x7fffffff){
                this.idnum[i]++;
                break;
            }else{
                this.idnum[i]=0;
            }
        }
        if(i==this.idnum.length){
            this.idnum.push(1);
        }
        return this.idnum.map(v=>v.toString(16)).join('-')
    }
}

export class ErrorChain extends Error{
    causedBy?:Error;
    public constructor(message?:string){
        super(message)
    }
}
//also useful for string template
export type RecursiveIteratable<T>=Iterable<T|RecursiveIteratable<T>|Promise<T>>;
export async function FlattenArray<T>(source:RecursiveIteratable<T>){
    let parts=[] as T[];
    for(let t1 of source){
        if(t1 instanceof Promise){
            parts.push(await t1);
        }else if(t1==null){
        }else if(typeof(t1)==='object' && (Symbol.iterator in t1)){
            parts.push(...await FlattenArray(t1));
        }else{
            parts.push(t1);
        }
    }
    return parts;
}
//Promise will be ignored
export function FlattenArraySync<T>(source:RecursiveIteratable<T>){
    let parts=[] as T[];
    for(let t1 of source){
        if(t1 instanceof Promise){
        }else if(t1==null){
        }else if(typeof(t1)==='object' && (Symbol.iterator in t1)){
            parts.push(...FlattenArraySync(t1));
        }else{
            parts.push(t1);
        }
    }
    return parts;
}


export function DateAdd(org:Date, add:{
    days?:number,
    months?:number,
    years?:number,
    hours?:number,
    minutes?:number,
    seconds?:number
}|number,field?:'date' | 'month' | 'year' | 'hour' | 'minute' | 'second'):Date{
    if(typeof add==='number'){
        assert(field!=undefined);
        switch(field){
            case 'date':
                return DateAdd(org,{days:add});
            case 'month':
            case 'year':
            case 'hour':
            case 'minute':
            case 'second':
                return DateAdd(org,{[field+'s']:add});
        }
    }else{
        var d = new Date(org);
        if(add.days!=undefined){
            d.setDate(d.getDate() + add.days);
        }
        if(add.months!=undefined){
            d.setMonth(d.getMonth() + add.months);
        }
        if(add.years!=undefined){
            d.setFullYear(d.getFullYear() + add.years);
        }
        if(add.hours!=undefined){
            d.setHours(d.getHours() + add.hours);
        }
        if(add.minutes!=undefined){
            d.setMinutes(d.getMinutes() + add.minutes);
        }
        if(add.seconds!=undefined){
            d.setSeconds(d.getSeconds() + add.seconds);
        }
        return d;
    }
}

export function DateDiff(date1:Date, date2:Date, unit:'date' | 'hour' | 'minute' | 'second'):number{
    let diffMs=date1.getTime()-date2.getTime();
    switch(unit){
        case 'date':
            return diffMs/(1000*60*60*24);
        case 'hour':
            return diffMs/(1000*60*60);
        case 'minute':
            return diffMs/(1000*60);
        case 'second':
            return diffMs/1000;
    }
}

export function GetCurrentTime():Date{
    return new Date();
}

export class Ref2<CT>{
    public constructor(protected __val:CT){
    }
    public set(val:CT){
        let oldVal=this.__val;
        this.__val=val;
        this.watcher.forEach(v=>v(this,oldVal));
    }
    public get():CT{
        return this.__val;
    }
    protected watcher:Set<(r:Ref2<CT>,oldValue:CT)=>void>=new Set();
    public watch(onUpdated:(r:Ref2<CT>,oldValue:CT)=>void){
        this.watcher.add(onUpdated);
    }
    public unwatch(onUpdated:(r:Ref2<CT>,oldValue:CT)=>void){
        this.watcher.delete(onUpdated);
    }
}


export var logger={
    debug:function(...msg:any[]){console.debug(...msg)},
    info:function(...msg:any[]){console.info(...msg)},
    warning:function(...msg:any[]){console.warn(...msg)},
    error:function(...msg:any[]){console.error(...msg)},
    setHandler:function(level:'debug'|'info'|'warning'|'error',handler:(msg:string)=>void){
        this[level]=handler;
    },
    getLogger:function(label:string){
        let that=this;
        return {
            debug:(...msg:any[])=>{that.debug(label+':',...msg)},
            info:(...msg:any[])=>{that.info(label+':',...msg)},
            warning:(...msg:any[])=>{that.warning(label+':',...msg)},
            error:(...msg:any[])=>{that.error(label+':',...msg)},
        }
    }
}

export class AssertError extends Error{
    public init(msg:string){
        this.message=msg
        return this;
    }
    public toString(){
        return this.message;
    }
}

export function assert(cond:boolean,msg?:string):asserts cond{
    if(!cond)throw new AssertError().init(msg??'assert failed');
}

// https://github.com/niklasvh/base64-arraybuffer/blob/master/src/index.ts
const b64chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
// Use a lookup table to find the index.
const b64lookup = typeof Uint8Array === 'undefined' ? [] : new Uint8Array(256);
for (let i = 0; i < b64chars.length; i++) {
    b64lookup[b64chars.charCodeAt(i)] = i;
}
export function ArrayBufferToBase64(buffer: ArrayBuffer|Uint8Array): string{
    let bytes:Uint8Array;
    if(buffer instanceof ArrayBuffer){
        bytes=new Uint8Array(buffer);
    }else{
        bytes = new Uint8Array(buffer.buffer,buffer.byteOffset,buffer.byteLength);
    }
    let i,len=bytes.length,base64='';
    for (i = 0; i < len; i += 3) {
        base64 += b64chars[bytes[i] >> 2] +
            b64chars[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)] +
            b64chars[((bytes[i + 1] & 15) << 2) | (bytes[i + 2] >> 6)] +
            b64chars[bytes[i + 2] & 63]
    }

    if (len % 3 === 2) {
        base64 = base64.substring(0, base64.length - 1) + '=';
    } else if (len % 3 === 1) {
        base64 = base64.substring(0, base64.length - 2) + '==';
    }
    return base64;
};


export function Base64ToArrayBuffer(base64: string): ArrayBuffer {
    for (let i = 0; i < b64chars.length; i++) {
        b64lookup[b64chars.charCodeAt(i)] = i;
    }
    let bufferLength = base64.length * 0.75,
        len = base64.length,
        i,
        p = 0,
        encoded1,
        encoded2,
        encoded3,
        encoded4;
    if (base64[base64.length - 1] === '=') {
        bufferLength--;
        if (base64[base64.length - 2] === '=') {
            bufferLength--;
        }
    }
    const arraybuffer = new ArrayBuffer(bufferLength),
        bytes = new Uint8Array(arraybuffer);
    for (i = 0; i < len; i += 4) {
        encoded1 = b64lookup[base64.charCodeAt(i)];
        encoded2 = b64lookup[base64.charCodeAt(i + 1)];
        encoded3 = b64lookup[base64.charCodeAt(i + 2)];
        encoded4 = b64lookup[base64.charCodeAt(i + 3)];
        bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
        bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
        bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
    }
    return arraybuffer;
};

export function BytesToHex(b:Uint8Array){
    let hex='';
    for(let t1 of b){
        let ch=t1.toString(16);
        hex+=ch.length==2?ch:'0'+ch;
    }
    return hex;
}
export function BytesFromHex(hex:string){
    hex=hex.replace(/[^0-9a-fA-F]/g,'');
    let bytes=new Uint8Array(hex.length>>1);
    for(let t1=0;t1<hex.length;t1+=2){
        bytes[t1>>1]=parseInt(hex.substring(t1,t1+2),16);
    }
    return bytes;
}


export function ArrayBufferConcat(bufs:Array<{
    buffer: ArrayBuffer;
    byteLength: number;
    byteOffset: number;
}>){
    let len=bufs.reduce((prev,curr)=>prev+curr.byteLength,0);
    let r=new Uint8Array(len);
    bufs.reduce((offset,curr)=>{
        r.set(new Uint8Array(curr.buffer,curr.byteOffset,curr.byteLength),offset)
        return offset+curr.byteLength
    },0);
    return r.buffer;
}


export async function WaitUntil(cond:()=>boolean,intervalMs?:number,timeoutMs?:number){
    if(intervalMs==undefined){intervalMs=200};
    for(let i1=Math.ceil((timeoutMs??30000)/intervalMs);i1>=0;i1--){
        if(cond())return;
        await sleep(intervalMs,null);
    }
    throw new Error('WaitUntil timeout')
}

export function partial<T>(o:T,fields:Generator<keyof T,keyof T>|(ReadonlyArray<keyof T>)):Partial<T>{
    let r={} as Partial<T>
    for(let f of fields){
        r[f]=o[f]
    }
    return r;
}


export type CommonMimeType='text/html'|'text/xml'|'text/javascript'|'application/xhtml+xml'|'text/plain'|'application/pdf'|'image/png'|'image/gif'|'image/jpeg'|'audio/basic'|'audio/midi'|'audio/x-midi'|'audio/x-pn-realaudio'|'video/mpeg'|'video/x-msvideo'|'application/x-gzip'|'application/x-tar'|'application/octet-stream'|'audio/ogg'|'audio/aac'|'image/svg+xml'|'image/x-icon'

export function ToDataUrl(data:string|ArrayBuffer,mediaType:CommonMimeType){
    if(typeof data==='string'){
        return 'data:'+mediaType+';base64,'+btoa(data);
    }else{
        return 'data:'+mediaType+';base64,'+ArrayBufferToBase64(data);
    }
}
