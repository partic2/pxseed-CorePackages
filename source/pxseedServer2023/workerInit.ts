


import { setupEnv } from 'partic2/nodehelper/env';
import { rpcWorkerInitModule } from 'partic2/pxprpcClient/registry';
import { RpcExtendServerCallable, defaultFuncMap } from 'pxprpc/extend';

//init for any worker of pxseedServer2023, usually setup helper and pxprpc server

export var __name__='pxseedServer2023/workerInit'

if(!rpcWorkerInitModule.includes(__name__)){
    rpcWorkerInitModule.push(__name__);
}

import {cleanBuildStatus, processDirectory, sourceDir} from 'pxseedBuildScript/buildlib'


export async function runPxseedBuildScript(){
    await processDirectory(sourceDir)
}
export async function runPxseedCleanScript(){
    await cleanBuildStatus(sourceDir);
}

defaultFuncMap[__name__+'.runPxseedBuildScript']=new RpcExtendServerCallable(runPxseedBuildScript).typedecl('->');
defaultFuncMap[__name__+'.runPxseedCleanScript']=new RpcExtendServerCallable(runPxseedCleanScript).typedecl('->');

setupEnv();
