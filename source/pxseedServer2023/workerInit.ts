


import { setupEnv } from 'partic2/nodehelper/env';
import { RpcExtendServerCallable, defaultFuncMap } from 'pxprpc/extend';


//init for any worker of pxseedServer2023, usually setup helper and pxprpc server
setupEnv();


export var __name__='pxseedServer2023/workerInit'

import { rpcWorkerInitModule } from 'partic2/pxprpcClient/registry';
if(!rpcWorkerInitModule.includes(__name__)){
    rpcWorkerInitModule.push(__name__);
}




export interface PxseedServer2023StartupConfig{
    pxseedBase?:string,
    pxprpcPath?:string,
    wsPipePath?:string
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
    pxprpcPath:'/pxprpc/0',
    wsPipePath:'/ws/pipe',
    listenOn:{host:'127.0.0.1',port:8088},
    initModule:[],
    pxprpcCheckOrigin:['localhost','127.0.0.1','[::1]'],
    pxprpcKey:null,
    deamonMode:{
        enabled:false,
        subprocessConfig:[]
    },
    //pxprpcKey should be secret.
    blockFilesMatch:['^/www/pxseedServer2023/config.json$'],
    serveDirectory:['www','source']
};

export let rootConfig={...config};

import * as fs from 'fs/promises'
import { getWWWRoot } from 'partic2/jsutils1/webutils';
export async function loadConfig(){
    try{
        let configData=await fs.readFile(getWWWRoot()+'/pxseedServer2023/config.json');
        console.log(`config file ${getWWWRoot()+'/pxseedServer2023/config.json'} found. `);
        let readinConfig=JSON.parse(new TextDecoder().decode(configData));
        rootConfig=Object.assign(readinConfig);
        if(globalThis.process==undefined)return null;
        let subprocessAt=process.argv.indexOf('--subprocess');
        if(process.argv[2]=='pxseedServer2023/entry' && subprocessAt>=0 ){
            //This is subprocee spawn by deamon.
            let subprocessIndex=Number(process.argv[subprocessAt+1]);
            Object.assign(config,rootConfig,rootConfig.deamonMode!.subprocessConfig[subprocessIndex]);
            config.deamonMode!.enabled=false;
            config.deamonMode!.subprocessConfig=[]
            config.subprocessIndex=subprocessIndex;
        }else{
            Object.assign(config,rootConfig);
        }
    }catch(e){
        console.log(`config file not found, write to ${getWWWRoot()+'/pxseedServer2023/config.json'}`)
        await fs.writeFile(getWWWRoot()+'/pxseedServer2023/config.json',new TextEncoder().encode(JSON.stringify(config)))
    }
}
export async function saveConfig(newConfig:PxseedServer2023StartupConfig){
    await fs.writeFile(getWWWRoot()+'/pxseedServer2023/config.json',JSON.stringify(newConfig));
}