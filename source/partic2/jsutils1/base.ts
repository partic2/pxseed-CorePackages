
//polyfill globalThis
try{
    let _=globalThis
}catch(e){
    new Function('this.globalThis=this')()
}


//AbortController polyfill on https://github.com/mo/abortcontroller-polyfill
(function(){
    class AbortSignal extends EventTarget {
        aborted: boolean = false;
        reason?: any;
        onabort?: (ev: Event) => void
        constructor() {
            super();
        }
        toString() {
            return '[object AbortSignal]';
        }
        dispatchEvent(event: Event) {
            if (event.type === 'abort') {
                this.aborted = true;
                if (typeof this.onabort === 'function') {
                    this.onabort.call(this, event);
                }
            }
            return super.dispatchEvent(event);
        }
        throwIfAborted() {
            const { aborted, reason = 'Aborted' } = this;
            if (!aborted) return;
            throw reason;
        }
        static timeout(time: number) {
            const controller = new AbortController();
            setTimeout(() => controller.abort(new DOMException(`This signal is timeout in ${time}ms`, 'TimeoutError')), time);
            return controller.signal;
        }
    }
    class AbortController {
        signal: AbortSignal = new AbortSignal()
        constructor() {
        }
        abort(reason: any) {
            let signalReason = reason;
            if(reason==undefined){
                signalReason=new Error('This operation was aborted');
                signalReason.name='AbortError'
            }
            const event = new Event('abort');
            (event as any).reason = reason;
    
            this.signal.reason = signalReason;
            this.signal.dispatchEvent(event);
        }
        toString() {
            return '[object AbortController]';
        }
    }
    if(globalThis.AbortSignal==undefined || globalThis.AbortSignal.prototype.throwIfAborted==undefined){
        (globalThis as any).AbortController=AbortController;
        (globalThis as any).AbortSignal=AbortSignal;
    }
})();

interface TaskCallback<T>{
    then(resolve:(result:T)=>void,reject:(reason:any)=>void):void
}

export class Task<T> {
    static currentTask: Task<any> | null = null;
    static locals() {
        return Task.currentTask?.locals();
    }
    static getAbortSignal() {
        return Task.currentTask?.getAbortSignal();
    }
    static fork<T2>(taskMain: Generator<TaskCallback<any>, T2, any> | (() => Generator<TaskCallback<any>, T2, any>)){
        if(Task.currentTask!==null){
            return Task.currentTask.fork(taskMain);
        }else{
            return new Task(taskMain);
        }
    }
    /*
        Convert Promise to Generator. To use Promise in Task and make correct return type with typescript.
        eg: let number_1=yield* Task.yieldWrap(new Promise((resolve)=>resolve(1)));
    */
    static *yieldWrap<T2>(p: Promise<T2>) {
        return (yield p) as T2;
    }
    constructor(taskMain: Generator<TaskCallback<any>, T, any> | (() => Generator<TaskCallback<any>, T, any>),
        public name?: string) {
        this.__iter = (typeof taskMain === 'function') ? taskMain() : taskMain;
        let resolver: Partial<typeof this.__resolver> = [undefined, undefined, undefined];
        resolver[0] = new Promise((resolve, reject) => {
            resolver![1] = resolve;
            resolver![2] = reject;
        });
        this.__resolver = resolver as any;
        this.__abortController.signal.addEventListener('abort', (ev) => {
            this.onAbort();
        });
    }
    __resolver?: [Promise<T>, ((value: T) => void), ((reason?: any) => void)]
    __iter?: Generator<TaskCallback<any>>;
    __locals = {};
    __abortController = new AbortController();
    __step(tNext: any, error: any) {
        let savedTask=Task.currentTask
        Task.currentTask = this;
        try {
            if (this.__abortController.signal.aborted) {
                this.__iter!.throw(this.__abortController.signal.reason);
            }
            if (error != undefined) {
                this.__iter!.throw(error);
            }
            let yieldResult = this.__iter!.next(tNext);
            if (!yieldResult.done) {
                yieldResult.value.then(
                    r => this.__step(r, undefined),
                    reason => this.__step(undefined, reason)
                );
            } else {
                Task.currentTask = null;
                this.__resolver![1](yieldResult.value);
            }
        } catch (e) {
            this.__resolver![2](e);
        } finally {
            Task.currentTask = savedTask;
        }
    }
    run() {
        this.__step(undefined, undefined);
        return this;
    }
    abort(reason?: any) {
        this.__abortController.abort(reason);
    }
    getAbortSignal() {
        return this.__abortController.signal;
    }
    locals(): Record<string, any> {
        return this.__locals;
    }
    __childrenTask = new Array<Task<any>>();
    //Fork a child task. 
    //The default behaviour: set the parent locals as prototype of child locals, propagate abort signal to children.
    fork<T2>(taskMain: Generator<TaskCallback<any>, T2, any> | (() => Generator<TaskCallback<any>, T2, any>)) {
        let childTask = new Task(taskMain);
        Object.setPrototypeOf(childTask.__locals, this.locals());
        this.__childrenTask.push(childTask);
        const cleanTask = () => this.__childrenTask.splice(this.__childrenTask.indexOf(childTask));
        childTask.then(cleanTask, cleanTask);
        return childTask;
    }
    onAbort() {
        for (let t1 of [...this.__childrenTask]) {
            t1.abort(this.__abortController.signal.reason);
        }
    }
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): Promise<TResult1 | TResult2> {
        return this.__resolver![0].then(onfulfilled, onrejected);
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
        "SSS": date.getMilliseconds()
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
    pos = layout.indexOf('SSS');
    let millisecond = pos >= 0 ? Number.parseInt(dateStr.substring(pos, pos+3)) : 0;
    return new Date(year, month, date, hour, minute, second,millisecond)
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
    public result?: T;
    public exception:any; 
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
            this.result=result;
            this.resolveCallback!(result)
        }
    }
    public setException(exception: any) {
        if (!this.done) {
            this.done = true;
            this.exception=exception;
            this.rejectCallback!(exception)
        }
    }
}
export class CanceledError extends Error{
    name='Canceled'
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
    public clone(){
        return new ArrayWrap2<T>([...this.arr()]);
    }
    protected onQueueChange=[] as future<number>[];
    queueSizeLimit?:number
    public emitQueueChange(){
        let e=clone(this.onQueueChange,1);
        this.onQueueChange.splice(0,this.onQueueChange.length);
        for(let t1 of e){
            t1.setResult(0);
        }
    }
    public cancelWaiting(){
        this.onQueueChange.forEach(t1=>t1.setException(new CanceledError()));
    }
    public async waitForQueueChange(){
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
    public [Symbol.iterator](){
        return this.arr()[Symbol.iterator];
    }
    public static *IntSequence(start:number,end?:number,step?:number){
        if(end==undefined){
            end=start;start=0;
        }
        assert(step!==0);
        step=step??(end>=start?1:-1);
        for(let t1=start;(step>0)?(t1<end):(t1>end);t1+=step){
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
    public async exec<T>(fn:()=>Promise<T>){
        await this.lock();
        try{
            return await fn();
        }finally{
            await this.unlock()
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
export interface IamdeeScriptLoader {
    loadModule(moduleId: string, url: string, done: (err: Error | null) => void): void;
    getDefiningModule(): string | null;
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
    addScriptLoader(loader:IamdeeScriptLoader,beforeOthers?:boolean){
        //partic2-iamdee feature
        if(beforeOthers){
            amdContext.define.amd.scriptLoaders.unshift(loader);
        }else{
            amdContext.define.amd.scriptLoaders.push(loader);
        }
    },
    getLocalRequireModule(localRequire:typeof require):string{
        //partic2-iamdee feature
        return (localRequire as any).localRequireModule
    },
    definingHook:null as ((defineParameter:{moduleId:string,dependencies:string[],defineFactory: Function})=>void)[]|null,
    async addDefiningHook(hook:(defineParameter:{moduleId:string,dependencies:string[],defineFactory: Function})=>void){
        //partic2-iamdee feature
        if(this.definingHook===null){
            this.definingHook=[];
            let {onDefining}=await this.getConfig();
            if(onDefining!=undefined){
                this.definingHook.push(onDefining);
            }
            amdContext.requirejs.config({
                onDefining:(defineParameter:{moduleId:string,dependencies:string[],defineFactory: Function})=>{
                    if(this.definingHook!=null){
                        for(let t1 of this.definingHook){
                            t1(defineParameter);
                        }
                    }
                }
            })
        }
        this.definingHook.push(hook);
    }
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


export function DateAdd(org:Date, add:{
    days?:number,
    months?:number,
    years?:number,
    hours?:number,
    minutes?:number,
    seconds?:number,
    milliseconds?:number
}|number,field?:'date' | 'month' | 'year' | 'hour' | 'minute' | 'second' | 'millisecond'):Date{
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
            case 'millisecond':
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
        if(add.milliseconds){
            d.setMilliseconds(d.getMilliseconds()+add.milliseconds)
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
    //tsc complain with it's type, So I use Function directly.
    protected watcher:Set<Function>=new Set();
    public watch(onUpdated:(r:this,previousValue:CT)=>void){
        this.watcher.add(onUpdated);
    }
    public unwatch(onUpdated:(r:this,previousValue:CT)=>void){
        this.watcher.delete(onUpdated);
    }
}

export class TaskLocalRef<T> extends Ref2<T|undefined>{
    taskLocalVarName='TaskLocalRef.var-'+GenerateRandomString();
    constructor(nonTaskValue?:T){
        super(nonTaskValue);
    }
    public get(): T|undefined {
        let loc=Task.locals();
        if(loc!=undefined){
            return loc[this.taskLocalVarName];
        }else{
            return super.get();
        }
    }
    public set(val: T|undefined): void {
        let loc=Task.locals();
        if(loc!=undefined){
            loc[this.taskLocalVarName]=val;
        }else{
            super.set(val);
        }
    }
}



export var logger={
    debug:function(...msg:any[]){console.debug(...msg)},
    info:function(...msg:any[]){console.info(...msg)},
    warning:function(...msg:any[]){console.warn(...msg)},
    error:function(...msg:any[]){console.error(...msg)},
    setHandler:function(level:'debug'|'info'|'warning'|'error',handler:(...msg:any[])=>void){
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

export function stringToCharCodes(s:string):number[]{
    let r=new Array<number>(s.length);
    for(let t1=0;t1<r.length;t1++){
        r[t1]=s.charCodeAt(t1);
    }
    return r;
}

export function ArrayBufferConcat(bufs:Array<{
    buffer: ArrayBufferLike;
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


export type CommonMimeType='text/html'|'text/xml'|'text/javascript'|'application/javascript'|'application/xhtml+xml'|'text/plain'|'application/pdf'|'image/png'|'image/gif'|'image/webp'|'image/bmp'|'image/jpeg'|'audio/basic'|'audio/midi'|'audio/x-midi'|'audio/x-pn-realaudio'|'video/mpeg'|'video/x-msvideo'|'application/x-gzip'|'application/x-tar'|'application/octet-stream'|'audio/ogg'|'audio/aac'|'image/svg+xml'|'image/x-icon'

export function ToDataUrl(data:string|ArrayBuffer|Uint8Array,mediaType:CommonMimeType){
    if(typeof data==='string'){
        return 'data:'+mediaType+';base64,'+btoa(data);
    }else{
        return 'data:'+mediaType+';base64,'+ArrayBufferToBase64(data);
    }
}
