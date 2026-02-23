

import { RpcExtendClient1, RpcExtendServer1, RpcExtendServerCallable, defaultFuncMap } from 'pxprpc/extend';
import {Client, Server as PxprpcBaseServer, Server} from 'pxprpc/base'


export var __name__=requirejs.getLocalRequireModule(require);

import { addClient, createIoPipe, getPersistentRegistered, getRegistered, rpcWorkerInitModule, ServerHostRpcName, ServerHostWorker1RpcName } from 'partic2/pxprpcClient/registry';

import { GetUrlQueryVariable2, getWWWRoot, path } from 'partic2/jsutils1/webutils';
import { SimpleFileServer, SimpleHttpServerRouter, WebSocketServerConnection } from 'partic2/tjshelper/httpprot';
import { Io } from 'pxprpc/base';
import { buildTjs } from 'partic2/tjshelper/tjsbuilder';
import { GenerateRandomString, requirejs } from 'partic2/jsutils1/base';
import { DirAsRootFS, TjsSfs } from 'partic2/CodeRunner/JsEnviron';
import { getRpcClientConnectWorkerParent } from 'partic2/pxprpcClient/rpcworker';


if(!rpcWorkerInitModule.includes(__name__)){
    rpcWorkerInitModule.push(__name__);
    rpcWorkerInitModule.push(path.join(__name__,'..','httponrpc'));
}

export let subprocessMagic='--subprocessrnd197izpzgbvbhglw0w';


export interface PxseedServer2023StartupConfig{
    pxseedBase?:string,
    listenOn?:{host:string,port:number},
    initModule?:string[],
    //If key!==null. Client should provide url parameter 'key' to get authorization from websocket.
    //DON'T expose the config file to public, if pxprpc is accessible from public. 
    pxprpcKey?:string|null
    deamonMode?:{
        enabled:boolean,
        subprocessConfig:PxseedServer2023StartupConfig[]
    }
    subprocessIndex?:number
    //RegExp to block private/secret file access.
    blockFilesMatch?:string[]
    //Usually used for source map
    serveSourceDirectory?:boolean
    //COI mean crossOriginIsolated refer: https://developer.mozilla.org/en-US/docs/Web/API/Window/crossOriginIsolated
    serveWwwRootWithCoi?:boolean
};

export let config:PxseedServer2023StartupConfig={
    pxseedBase:'/pxseed',
    listenOn:{host:'127.0.0.1',port:2081},
    initModule:[],
    pxprpcKey:null,
    deamonMode:{
        enabled:false,
        subprocessConfig:[]
    },
    //pxprpcKey should be secret.
    blockFilesMatch:['^/+www/+pxseedServer2023/+config\\.json$'],
    serveSourceDirectory:false,
    serveWwwRootWithCoi:true
};

export let rootConfig={...config};



export async function loadConfig(){
    let tjs=await buildTjs();
    try{
        let configData=await tjs.readFile(getWWWRoot()+'/pxseedServer2023/config.json')
        console.warn(`config file ${getWWWRoot()+'/pxseedServer2023/config.json'} found. `);
        let readinConfig=JSON.parse(new TextDecoder().decode(configData));
        rootConfig=Object.assign(readinConfig);
        if(globalThis.process!=undefined){
            let subprocessAt=process.argv.indexOf(subprocessMagic);
            if(subprocessAt>=0 ){
                //This is subprocee spawn by deamon.
                let subprocessIndex=Number(process.argv[subprocessAt+1]);
                Object.assign(config,rootConfig,rootConfig.deamonMode!.subprocessConfig[subprocessIndex]);
                config.deamonMode!.enabled=false;
                config.deamonMode!.subprocessConfig=[]
                config.subprocessIndex=subprocessIndex;
            }else{
                Object.assign(config,rootConfig);
            }
        }else{
            Object.assign(config,rootConfig);
        }
    }catch(e){
        console.warn(`config file not found, write to ${getWWWRoot()+'/pxseedServer2023/config.json'}`)
        config.pxprpcKey=GenerateRandomString(8);
        await saveConfig(config)
    }
}
export async function saveConfig(newConfig:PxseedServer2023StartupConfig){
    let tjs=await buildTjs();
    let configFd=await tjs.open(getWWWRoot()+'/pxseedServer2023/config.json','w');
    try{
        await configFd.write(new TextEncoder().encode(JSON.stringify(newConfig)));
    }finally{
        configFd.close();
    }
}

export let defaultRouter=new SimpleHttpServerRouter();
export let defaultHttpHandler:{
    onfetch:(request:Request)=>Promise<Response>;
    onwebsocket:(controller:{
        request:Request
        accept:()=>Promise<WebSocketServerConnection> //Only accept before 'onwebsocket' resolved.
    })=>Promise<void>;
}={
    onfetch:defaultRouter.onfetch,
    onwebsocket:defaultRouter.onwebsocket
}

async function pxprpcHandler(ctl:{
        request:Request
        accept:()=>Promise<WebSocketServerConnection> 
    }){
    let pass=false;
    if(config.pxprpcKey===null){
        pass=true;
    }else{
        if(decodeURIComponent(GetUrlQueryVariable2(ctl.request.url??'','key')??'')===config.pxprpcKey){
            pass=true;
        }else{
            pass=false;
        }
    }
    if(pass){
        let serv=new RpcExtendServer1(new PxprpcBaseServer(await ctl.accept() as Io));
        //mute error
        serv.serve().catch(()=>{});
    }
}

export let wsPipe=new Map<string,Set<Io>>();
async function wsPipeHandler(ctl:{
        request:Request
        accept:()=>Promise<WebSocketServerConnection> 
    }){
    let url=ctl.request.url;
    if(url==undefined)return;
    let id=GetUrlQueryVariable2(url,'id');
    if(id==undefined)return;
    id=decodeURIComponent(id);
    await serveWsPipe(await ctl.accept() as Io,id);
}

async function serveWsPipe(io:Io,id:string){
    let pipes=wsPipe.get(id);
    if(pipes==undefined){
        pipes=new Set<Io>();
        wsPipe.set(id,pipes);
    }
    pipes.add(io);
    try{
        while(true){
            let msg=await io.receive();
            for(let t1 of pipes){
                if(t1!=io){
                    await t1.send([msg]);
                }
            }
        }
    }catch(e){
        pipes.delete(io);
        if(pipes.size==0){
            wsPipe.delete(id);
        }
    }
}

export async function setupHttpServerHandler(){
    let serverworker1=await getPersistentRegistered(ServerHostWorker1RpcName);
    if(serverworker1==null){
        serverworker1=await addClient('webworker:'+ServerHostWorker1RpcName);
    }
    defaultRouter.setHandler(config.pxseedBase!+'/pxprpc/0',{websocket:pxprpcHandler});
    defaultRouter.setHandler(config.pxseedBase!+'/ws/pipe',{websocket:wsPipeHandler});
    let tjs=await buildTjs();
    let tjsfs=new TjsSfs();
    tjsfs.from(tjs);
    await tjsfs.ensureInited();
    let {path} =await import('partic2/jsutils1/webutils');
    let wwwroot=getWWWRoot().replace(/\\/g,'/');
    let fileServer=new SimpleFileServer(new DirAsRootFS(tjsfs,wwwroot));
    fileServer.pathStartAt=(config.pxseedBase+'/www').length;
    let blockFileMatchRegex=config.blockFilesMatch?.map(t1=>new RegExp(t1))??[];
    fileServer.interceptor=async (path)=>{
        path='/www'+path;
        for(let t1 of blockFileMatchRegex){
            if(t1.test(path)){
                return new Response(null,{status:403});
            }
        }
        return null;
    }
    fileServer.cacheControl=async (filePath:string)=>{
        if(filePath.endsWith('.js')||filePath==='/index.html'){
            return 'no-cache'
        }else{
            return {maxAge:86400}
        }
    };
    if(config.serveWwwRootWithCoi){
         let coiOnfetch=async (req:Request)=>{
            let resp=await fileServer.onfetch(req);
            resp.headers.append('Cross-Origin-Opener-Policy','same-origin');
            resp.headers.append('Cross-Origin-Embedder-Policy','require-corp');
            return resp;
        }
        defaultRouter.setHandler(config.pxseedBase+'/www',{fetch:coiOnfetch}); 
    }else{
        defaultRouter.setHandler(config.pxseedBase+'/www',{fetch:fileServer.onfetch});
    }
    
    if(config.serveSourceDirectory){
        //For sourcemap
        let soourceFileServer=new SimpleFileServer(new DirAsRootFS(tjsfs,path.join(wwwroot,'..','source')));
        soourceFileServer.pathStartAt=(config.pxseedBase+'/source').length;
        defaultRouter.setHandler(config.pxseedBase+'/source',{fetch:soourceFileServer.onfetch});
    }
}

async function copyFilesNewer(destDir:string,srcDir:string,maxDepth?:number,log?:typeof console){
    log?.info(`Check directory "${srcDir}"`)
    let {getNodeCompatApi}=await import('pxseedBuildScript/util');
    if(maxDepth==undefined){
        maxDepth=20;
    }
    if(maxDepth==0){
        return;
    }
    const {fs,path}=await getNodeCompatApi()
    await fs.mkdir(destDir,{recursive:true});
    let children=await fs.readdir(srcDir,{withFileTypes:true});
    try{
        await fs.access(destDir)
    }catch(e){
        await fs.mkdir(destDir,{recursive:true});
    }
    for(let t1 of children){
        if(t1.isDirectory()){
            await copyFilesNewer(path.join(destDir,t1.name),path.join(srcDir,t1.name),maxDepth-1);
        }else{
            let dest=path.join(destDir,t1.name);
            let src=path.join(srcDir,t1.name);
            let needCopy=false;
            try{
                let dfile=await fs.stat(dest);
                let sfile2=await fs.stat(src);
                if(dfile.mtimeMs<sfile2.mtimeMs){
                    needCopy=true;
                }
            }catch(e){
                needCopy=true;
            }
            if(needCopy){
                log?.info(`update file "${dest}";`)
                await fs.mkdir(path.dirname(dest),{recursive:true});
                await fs.copyFile(src,dest);
            }
        }
    }
}

export let serverCommandRegistry:Record<string,(param:any)=>any>={
    buildPackages:async ()=>{
        let {processDirectory}=await import('pxseedBuildScript/buildlib');
        let {getNodeCompatApi,withConsole}=await import('pxseedBuildScript/util');
        let {path,wwwroot}=await getNodeCompatApi();
        let records:any[][]=[];
        let wrapConsole={...globalThis.console};
        wrapConsole.debug=(...msg:any[])=>records.push(msg);
        wrapConsole.info=(...msg:any[])=>records.push(msg);
        wrapConsole.warn=(...msg:any[])=>records.push(msg);
        wrapConsole.error=(...msg:any[])=>records.push(msg);
        await copyFilesNewer(wwwroot,path.join(wwwroot,'..','copysource'),16,wrapConsole);
        await withConsole(wrapConsole,()=>processDirectory(path.join(wwwroot,'..','source')));
        return records.map(t1=>t1.join(' ')).join('\n');
    },
    rebuildPackages:async ()=>{
        let {processDirectory,cleanBuildStatus}=await import('pxseedBuildScript/buildlib');
        let {getNodeCompatApi}=await import('pxseedBuildScript/util');
        let {path,wwwroot}=await getNodeCompatApi();
        await cleanBuildStatus(path.join(wwwroot,'..','source'))
        await processDirectory(path.join(wwwroot,'..','source'));
    },
    getConfig:async ()=>{
        await loadConfig();
        return config;
    },
    saveConfig:async (param:any)=>{
        await saveConfig(param);
        await loadConfig();
        return 'done'
    }
}

export function pxseedRunStartupModules(){
    Promise.allSettled(config.initModule!.map(mod=>requirejs.promiseRequire(mod)));
    if(config.subprocessIndex==undefined)import('partic2/packageManager/onServerStartup');
}

export async function serverCommand(cmd:string,param:any){
    if(serverCommandRegistry[cmd]!=undefined){
        return serverCommandRegistry[cmd](param);
    }
    throw new Error(`No handler for command ${cmd}`)
}

//For ServerHost access on Server side
export async function getConnectionForServerHost(){
    if((globalThis as any).__workerId==undefined){
        let [c2s,s2c]=createIoPipe();
        new RpcExtendServer1(new Server(s2c)).serve().catch(()=>{});
        return c2s;
    }else{
        return await getRpcClientConnectWorkerParent()
    }
}

addClient('pxseedjs:'+__name__+'.getConnectionForServerHost',ServerHostRpcName).catch(()=>{});

export async function initNotebookCodeEnv(_ENV:any){
    Object.assign(_ENV,serverCommandRegistry);
}