

import { RpcExtendServer1, RpcExtendServerCallable, defaultFuncMap } from 'pxprpc/extend';
import {Server as PxprpcBaseServer} from 'pxprpc/base'


export var __name__=requirejs.getLocalRequireModule(require);

import { rpcWorkerInitModule } from 'partic2/pxprpcClient/registry';
if(!rpcWorkerInitModule.includes(__name__)){
    rpcWorkerInitModule.push(__name__);
}

export let subprocessMagic='--subprocessrnd197izpzgbvbhglw0w';


export interface PxseedServer2023StartupConfig{
    pxseedBase?:string,
    listenOn?:{host:string,port:number},
    initModule?:string[],
    pxprpcCheckOrigin?:string[]|false,
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
    //Specify the directory serve as file server. default is ['www','source'].
    //'source' is added to enable sourceMap.
    serveDirectory?:string[]
};

export let config:PxseedServer2023StartupConfig={
    pxseedBase:'/pxseed',
    listenOn:{host:'127.0.0.1',port:2081},
    initModule:[],
    pxprpcCheckOrigin:['localhost','127.0.0.1','[::1]'],
    pxprpcKey:null,
    deamonMode:{
        enabled:false,
        subprocessConfig:[]
    },
    //pxprpcKey should be secret.
    blockFilesMatch:['^/www/pxseedServer2023/config\\.json$'],
    serveDirectory:['www','source']
};

export let rootConfig={...config};

import { GetUrlQueryVariable2, getWWWRoot } from 'partic2/jsutils1/webutils';
import { SimpleHttpServerRouter, WebSocketServerConnection } from 'partic2/tjshelper/httpprot';
import { Io } from 'pxprpc/base';
import { buildTjs } from 'partic2/tjshelper/tjsbuilder';
import { GenerateRandomString, requirejs } from 'partic2/jsutils1/base';
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
        await saveConfig(config)
    }
    defaultRouter.setHandler(config.pxseedBase!+'/pxprpc/0',{websocket:pxprpcHandler});
    defaultRouter.setHandler(config.pxseedBase!+'/ws/pipe',{websocket:wsPipeHandler});
}
export async function saveConfig(newConfig:PxseedServer2023StartupConfig){
    let tjs=await buildTjs();
    let configFd=await tjs.open(getWWWRoot()+'/pxseedServer2023/config.json','w');
    try{
        await configFd.write(new TextEncoder().encode(JSON.stringify(config)));
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
    if(config.pxprpcCheckOrigin===false || ctl.request.headers.get('origin')==undefined){
        pass=true;
    }else if(ctl.request.headers.get('origin')!=undefined){
        let originUrl=new URL(ctl.request.headers.get('origin')!);
        for(let t1 of [config.listenOn!.host,...(config.pxprpcCheckOrigin as string[])]){
            if(originUrl.hostname===t1){
                pass=true;
                break;
            };
        }
    }
    if(!pass){
        return;
    }
    pass=false;
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

let wsPipe=new Map<string,Set<Io>>();
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
