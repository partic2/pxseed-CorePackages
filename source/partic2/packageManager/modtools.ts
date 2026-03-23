import { getPersistentRegistered, importRemoteModule, ServerHostWorker1RpcName } from "partic2/pxprpcClient/registry";
import { Singleton } from "partic2/CodeRunner/jsutils2";
import { requirejs, Task } from "partic2/jsutils1/base";

let remoteMisc=new Singleton<typeof import('partic2/packageManager/misc')>(async ()=>{
    return await importRemoteModule(await (await getPersistentRegistered(ServerHostWorker1RpcName))!.ensureConnected(),
        'partic2/packageManager/misc')
})


interface HMRModuleState{
    moduleName:string
    onLoad?:string|null,
    onUnload?:string|null,
    state?:any,
    hmr?:boolean
}

export class CHotModuleReload{
    protected registry=new Map<string,HMRModuleState>()
    watcher:Task<void>|null=null;
    protected async checkAndReloadHmrModule(rebuildMods:Array<{pkgName:string}>){
        let reloadList=new Array<HMRModuleState>();
        for(let t1 of this.registry.values()){
            let found=rebuildMods.find(t2=>t1.moduleName.startsWith(t2.pkgName+'/'))
            if(found){
                reloadList.push(t1);
            }
        }
        reloadList.forEach(t1=>this.registry.delete(t1.moduleName));
        await Promise.allSettled(reloadList.map((t1)=>(async ()=>{
            if(t1.onUnload!=undefined){
                let mod1=await import(t1.moduleName);
                await mod1[t1.onUnload]?.();
            }
            await requirejs.undef(t1.moduleName);
            let mod1=await import(t1.moduleName);
            if(t1.onLoad!=undefined){
                await mod1[t1.onLoad]?.();
            }
        })()));
    }
    setModuleState(s:HMRModuleState){
        if(s.hmr===false){
            this.registry.delete(s.moduleName);
        }else{
            let found=this.registry.get(s.moduleName);
            if(found==null){
                this.registry.set(s.moduleName,s);
            }else{
                for(let t1 in s){
                    if(t1!='moduleName' && (s as any)[t1]!=undefined){
                        (found as any)[t1]=(s as any)[t1];
                    }
                }
            }
        }
        if(this.watcher==null && this.registry.size>0){
            let that=this;
            let newWatcherTask=Task.fork(function *(){
                let misc=yield* Task.yieldWrap(remoteMisc.get());
                while(that.watcher==newWatcherTask){
                    let newBuildEvent=yield* Task.yieldWrap(misc.waitBuildWatcherEvent());
                    that.checkAndReloadHmrModule(newBuildEvent);
                }
            });
            this.watcher=newWatcherTask;
            this.watcher.run();
        }else if(this.watcher!==null && this.registry.size==0){
            this.watcher.abort();
            this.watcher=null;
        }
    }
}

export let HotModuleReload=new CHotModuleReload();
