

import { parentPort } from "worker_threads";
import './env';
import {MessagePortForNodeWorker,setupImpl} from './worker';



setupImpl();
let compa=new MessagePortForNodeWorker(parentPort!);
/* possible break the future eventTarget code. need better solution. */
(global as any).postMessage=compa.postMessage.bind(compa);
(global as any).addEventListener=compa.addEventListener.bind(compa);
(global as any).removeEventListener=compa.removeEventListener.bind(compa);

//exit worker_thread
(global as any).close=()=>process.exit();

import('partic2/jsutils1/workerentry');
    




