

import 'partic2/pxprpcClient/registry'
import 'partic2/CodeRunner/RemoteCodeContext'

import { setupEnv } from 'partic2/nodehelper/env';
import { rpcWorkerInitModule } from 'partic2/pxprpcClient/registry';

//init for any worker of pxseedServer2023, usually setup helper and pxprpc server

export var __name__='pxseedServer2023/workerInit'

rpcWorkerInitModule.push(__name__);
setupEnv();
