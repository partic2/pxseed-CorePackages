

import { RpcExtendClient1, RpcExtendServer1, RpcExtendServerCallable, defaultFuncMap } from 'pxprpc/extend';
import {Client, Server as PxprpcBaseServer, Server} from 'pxprpc/base'


export var __name__=requirejs.getLocalRequireModule(require);

import { addClient, createIoPipe, getPersistentRegistered, getRegistered, importRemoteModule, listRegistered, rpcWorkerInitModule, ServerHostRpc, ServerHostRpcName, ServerHostWorker1RpcName } from 'partic2/pxprpcClient/registry';

import { GetUrlQueryVariable2, getWWWRoot, path } from 'partic2/jsutils1/webutils';
import { SimpleFileServer, SimpleHttpServerRouter, WebSocketServerConnection } from 'partic2/tjshelper/httpprot';
import { Io } from 'pxprpc/base';
import { buildTjs } from 'partic2/tjshelper/tjsbuilder';
import { assert, GenerateRandomString, requirejs, sleep } from 'partic2/jsutils1/base';
import { DirAsRootFS, TjsSfs } from 'partic2/CodeRunner/JsEnviron';
import { getRpcClientConnectWorkerParent } from 'partic2/pxprpcClient/rpcworker';


if(!rpcWorkerInitModule.includes(__name__)){
    rpcWorkerInitModule.push(__name__);
}


export interface PxseedServer2023StartupConfig{
    pxseedBase?:string,
    listenOn?:{host:string,port:number},
    broadcastUdpPorts?:number[],
    initModule?:string[],
    //If key!==null. Client should provide url parameter 'key' to get authorization from websocket.
    //DON'T expose the config file to public, if pxprpc is accessible from public. 
    pxprpcKey?:string|null
    deamonMode?:{
        enabled:boolean,
        subprocessConfig:PxseedServer2023StartupConfig[]
    }
    subprocessIndex?:number
    //Usually used for source map
    serveSourceDirectory?:boolean
};

export let config:PxseedServer2023StartupConfig={
    pxseedBase:'/pxseed',
    listenOn:{host:'0.0.0.0',port:2081},
    initModule:[],
    pxprpcKey:null,
    deamonMode:{
        enabled:false,
        subprocessConfig:[]
    },
    serveSourceDirectory:false
};

export let rootConfig={...config};

export let blockStaticFileAccessIf=new Map<string,(path:string)=>Promise<boolean>>();

blockStaticFileAccessIf.set(__name__+'.keepPxprpcKeySecret',async (path)=>/^\/+www\/+pxseedServer2023\/+config\.json$/.test(path))

export async function setupServerPxprpcClient(){
    await addClient({url:'pxseedjs:'+__name__+'.getConnectionForServerHost',name:ServerHostRpcName});
    await addClient({url:'webworker:partic2/pxprpcClient/registry/worker/1',name:ServerHostWorker1RpcName});
    rpcWorkerInitModule.push({module:__name__,func:'setupServerPxprpcClient'});
}

export async function loadConfig(){
    await setupServerPxprpcClient();
    let tjs=await buildTjs();
    try{
        let configData=await tjs.readFile(getWWWRoot()+'/pxseedServer2023/config.json')
        console.warn(`config file ${getWWWRoot()+'/pxseedServer2023/config.json'} found. `);
        let readinConfig=JSON.parse(new TextDecoder().decode(configData));
        rootConfig=Object.assign(readinConfig);
        Object.assign(config,rootConfig);
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

export async function setupHttpServerHandler(){
    let serverworker1=await getPersistentRegistered(ServerHostWorker1RpcName);
    if(serverworker1==null){
        await addClient({url:'webworker:'+ServerHostWorker1RpcName,name:ServerHostWorker1RpcName,persistent:true});
        serverworker1=await getRegistered(ServerHostWorker1RpcName)
    }
    defaultRouter.setHandler(config.pxseedBase!+'/pxprpc/0',{websocket:pxprpcHandler});
    let tjs=await buildTjs();
    let tjsfs=new TjsSfs();
    tjsfs.from(tjs);
    await tjsfs.ensureInited();
    let {path} =await import('partic2/jsutils1/webutils');
    let wwwroot=getWWWRoot().replace(/\\/g,'/');
    let fileServer=new SimpleFileServer(new DirAsRootFS(tjsfs,wwwroot));
    fileServer.pathStartAt=(config.pxseedBase+'/www').length;
    
    fileServer.interceptor=async (path)=>{
        path='/www'+path;
        for(let t1 of blockStaticFileAccessIf.values()){
            if(await t1(path)){
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

    let wwwOnFetch=async (req:Request)=>{
        let resp=await fileServer.onfetch(req);
        let pxseedserveropt=GetUrlQueryVariable2(req.url,'__pxseedserveropt')
        if(pxseedserveropt!=null){
            let opt=decodeURIComponent(pxseedserveropt).split(' ')
            if(opt.includes('coi')){
                //Cross Origin Isolation
                resp.headers.append('Cross-Origin-Opener-Policy','same-origin');
                resp.headers.append('Cross-Origin-Embedder-Policy','require-corp');
            }
        }
        return resp;
    }
    defaultRouter.setHandler(config.pxseedBase+'/www',{fetch:wwwOnFetch}); 

    
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
    __workerBuildPackages:async ()=>{
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
    buildPackages:async ()=>{
        let mod1=await importRemoteModule(await (await getPersistentRegistered(ServerHostWorker1RpcName)!)!.ensureConnected(),__name__) as typeof import('./pxseedhttpserver')
        return mod1.serverCommand('__workerBuildPackages',{});
    },
    __workerRebuildPackages:async ()=>{
        let {processDirectory,cleanBuildStatus}=await import('pxseedBuildScript/buildlib');
        let {getNodeCompatApi,withConsole}=await import('pxseedBuildScript/util');
        let {path,wwwroot}=await getNodeCompatApi();
        let records:any[][]=[];
        let wrapConsole={...globalThis.console};
        wrapConsole.debug=(...msg:any[])=>records.push(msg);
        wrapConsole.info=(...msg:any[])=>records.push(msg);
        wrapConsole.warn=(...msg:any[])=>records.push(msg);
        wrapConsole.error=(...msg:any[])=>records.push(msg);
        await withConsole(wrapConsole,async ()=>{
            await cleanBuildStatus(path.join(wwwroot))
            await processDirectory(path.join(wwwroot,'..','source'));
        });
        return records.map(t1=>t1.join(' ')).join('\n');
    },
    rebuildPackages:async ()=>{
        let mod1=await importRemoteModule(await (await getPersistentRegistered(ServerHostWorker1RpcName)!)!.ensureConnected(),__name__) as typeof import('./pxseedhttpserver')
        return mod1.serverCommand('__workerRebuildPackages',{});
    },
    getConfig:async ()=>{
        await loadConfig();
        return config;
    },
    saveConfig:async (param:any)=>{
        await saveConfig(param);
        await loadConfig();
        return 'done'
    },
}

export function pxseedRunStartupModules(){
    Promise.allSettled(config.initModule!.map(mod=>import(mod)));
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
    let parent=await getRpcClientConnectWorkerParent();
    if(parent==null){
        let [c2s,s2c]=createIoPipe();
        new RpcExtendServer1(new Server(s2c)).serve().catch(()=>{});
        return c2s;
    }else{
        return parent;
    }
}

//Server information API should only used through "./clientFunction" module
let serverInformation=new Array<string>();
let udpBroadcastEndpoint:tjs.DatagramEndpoint|null=null;
let cachedRemoteServerInformation:Record<string,string[]>={};
async function ensureUdpBroadcastEndpoint(){
    if(udpBroadcastEndpoint!=null)return;
    let tjs=await buildTjs();
    udpBroadcastEndpoint=await tjs.listen('udp','0.0.0.0',config.listenOn?.port??2081) as tjs.DatagramEndpoint;
    await udpBroadcastEndpoint.setBroadcast(true);
    (async ()=>{
        let {utf8conv}=await import('partic2/CodeRunner/jsutils2');
        while(udpBroadcastEndpoint!=null){
            let recvBuf=new Uint8Array(1000);
            let rinfo=await udpBroadcastEndpoint.recv(recvBuf);
            let remoteAddr=rinfo.addr;
            let msg=utf8conv(new Uint8Array(recvBuf.buffer,0,rinfo.nread));
            if(msg=='?'){
                for(let t1 of serverInformation){
                    udpBroadcastEndpoint.send(utf8conv(t1),remoteAddr);
                }
            }else{
                let source='udp://'+remoteAddr.ip+':'+remoteAddr.port;
                if(cachedRemoteServerInformation[source]==undefined){
                    cachedRemoteServerInformation[source]=[];
                }
                cachedRemoteServerInformation[source].push(msg);
            }
        }
    })();
}
export async function __serverHostSetServerInformation(info:string[]){
    await ensureUdpBroadcastEndpoint();
    assert(!info.includes('?'),'"?" is reserved for broadcast query.');
    serverInformation=info;
}
export async function __serverHostGetServerInformation(){
    return serverInformation;
}
export async function __serverHostBroadcastToQueryServerInformation(waitSecond?:number){
    let {utf8conv}=await import('partic2/CodeRunner/jsutils2');
    waitSecond=waitSecond??1;
    await ensureUdpBroadcastEndpoint();
    cachedRemoteServerInformation={};
    udpBroadcastEndpoint!.send(utf8conv('?'),{family:4,ip:'255.255.255.255',port:config.listenOn?.port??2081});
    if(config.broadcastUdpPorts!=undefined){
        for(let k1 of config.broadcastUdpPorts){
            udpBroadcastEndpoint!.send(utf8conv('?'),{family:4,ip:'255.255.255.255',port:k1});
        }
    }
    await sleep(waitSecond*1000);
    let result=cachedRemoteServerInformation;
    cachedRemoteServerInformation={};
    return result;
}
