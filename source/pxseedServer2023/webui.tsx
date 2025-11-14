
import * as React from 'preact'

import {RegistryUI} from 'partic2/pxprpcClient/ui'

import type {PxseedServer2023StartupConfig} from './pxseedhttpserver'
import {TextEditor} from 'partic2/pComponentUi/texteditor'
import { DomRootComponent, ReactRefEx,ReactRender,css } from 'partic2/pComponentUi/domui'
import { alert,prompt } from 'partic2/pComponentUi/window'
import { openNewWindow} from 'partic2/pComponentUi/workspace'
import { getAttachedRemoteRigstryFunction, getPersistentRegistered, ServerHostRpcName, ServerHostWorker1RpcName } from 'partic2/pxprpcClient/registry'
import { PxseedServer2023Function } from './clientFunction'
import { requirejs, sleep, throwIfAbortError } from 'partic2/jsutils1/base'
import { GetJsEntry } from 'partic2/jsutils1/webutils'

import {} from 'partic2/jsutils1/webutils'
import { getPxseedUrl, updatePxseedServerConfig } from './webentry'
import { RpcExtendClient1 } from 'pxprpc/extend'


async function alertIfError<T>(p:()=>Promise<T>){
    try{
        return await p();
    }catch(err:any){
        throwIfAbortError(err);
        alert(err.message+'\n'+err.stack)
    }
}

export class PxseedServerAdministrateTool extends React.Component<{},{
        serverConfig?:PxseedServer2023StartupConfig,
        scene?:'connected'|'tryLogin',
        pxprpcKey:string
    }>{
    rref={
        configView:new ReactRefEx<TextEditor>()
    }
    rpcFunc?:PxseedServer2023Function;
    constructor(prop:any,ctx:any){
        super(prop,ctx);
    }
    componentDidMount(): void {
        this.tryConnect();
    }
    async reloadServerConfig(){
        let cfg=await this.rpcFunc!.getConfig();
        this.setState({
            serverConfig:cfg
        });
        (await this.rref.configView.waitValid()).setPlainText(JSON.stringify(cfg,undefined,2));
    }
    async saveServerConfig(){
        await this.rpcFunc!.saveConfig(JSON.parse((await this.rref.configView.waitValid()).getPlainText()))
    }
    async buildEnviron(){
        let resp=await this.rpcFunc!.buildEnviron();
        prompt(<pre>{resp}</pre>);
    }
    async buildPackage(){
        await alertIfError(async()=>{
            let resp=await this.rpcFunc!.buildPackages();
            let wnd=await prompt(<pre>{resp}</pre>);
            await wnd.response.get();
            wnd.close();
        });
    }
    async forceRebuildPackages(){
        await alertIfError(async()=>{
            let resp=await this.rpcFunc!.rebuildPackages();
            let wnd=await prompt(<pre>{resp}</pre>);
            await wnd.response.get();
            wnd.close();
        });
        
    }
    async restartSubprocess(index:number){
        await alertIfError(async()=>{
            await this.rpcFunc!.subprocessRestart(index);
            await alert('restart done');
        });
    }
    async restartServerHostWorker1(){
        await alertIfError(async()=>{
            let host1=await getPersistentRegistered(ServerHostWorker1RpcName);
            let client1=await host1!.ensureConnected();
            let funcs=await getAttachedRemoteRigstryFunction(client1);
            funcs.jsExec('globalThis.close()',null).catch();
            await sleep(1000);
            window.location.reload();
        })
    }
    renderConnected(){
        return <div className={css.flexColumn}>
            <h2>Server config</h2>
            <div className={css.flexColumn}>
                <div className={css.flexColumn} style={{overflowY:'auto',maxHeight:'300px',display:'flex'}}>
                    <TextEditor ref={this.rref.configView} divClass={[css.simpleCard]}/>
                    <div className={css.flexRow} style={{textAlign:'center'}}>
                        <a href="javascript:;" onClick={()=>this.reloadServerConfig()} style={{flexGrow:'1'}}>reload</a> 
                        <a href="javascript:;" onClick={()=>this.saveServerConfig()} style={{flexGrow:'1'}}>save</a>
                    </div>
                </div>
            </div>
            <h2>Command</h2>
            <div className={css.flexColumn}>
                <a href="javascript:;" onClick={()=>this.buildEnviron()}>build environ</a>
                <a href="javascript:;" onClick={()=>this.buildPackage()}>build packages</a>
                <a href="javascript:;" onClick={()=>this.forceRebuildPackages()}>force rebuild pakcages</a>
                <a href="javascript:;" onClick={()=>this.restartServerHostWorker1()}>restart server host worker 1</a>
                <a href="javascript:;">stop server</a>
                {(this.state.serverConfig?.deamonMode?.enabled==true)?this.state.serverConfig!.deamonMode.subprocessConfig.map((cfg,index)=>{
                    return <a href="javascript:;" onClick={()=>this.restartSubprocess(index)}>
                        restart subprocess {index} on {`${cfg.listenOn?.host}:${cfg.listenOn?.port}`}
                    </a>
                }):null}
            </div>
        </div>
    }
    async doLogin(){
        await updatePxseedServerConfig(this.state.pxprpcKey);
        this.tryConnect();
        this.setState({scene:'connected'});
    }
    async tryConnect(){
        try{
            if(this.rpcFunc==undefined){
                let rpc=await (await getPersistentRegistered(ServerHostRpcName))!.ensureConnected();
                this.rpcFunc=new PxseedServer2023Function();
                await this.rpcFunc.init(rpc);
            }
            let cfg=await this.rpcFunc!.getConfig();
            this.setState({
                serverConfig:cfg,
                scene:'connected'
            });
            (await this.rref.configView.waitValid()).setPlainText(JSON.stringify(cfg,undefined,2));
        }catch(err:any){
            throwIfAbortError(err);
            alert(err.message,'Error');
            this.setState({scene:'tryLogin'});
        }
    }
    renderTryLogin(){
        return <div>
            pxprpc key:<input type="text" value={this.state.pxprpcKey} onChange={(ev)=>{
                this.setState({pxprpcKey:(ev.target as any).value})
            }}/><a href="javascript:;" onClick={()=>this.doLogin()}>connect</a>
        </div> 
    }
    render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined; }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChild {
        switch(this.state.scene){
            case 'tryLogin':
                return this.renderTryLogin();
            case 'connected':
                return this.renderConnected();
            default:
                return this.renderTryLogin();
        }
    }
}

let __name__=requirejs.getLocalRequireModule(require);


export function *main(){
    openNewWindow(<PxseedServerAdministrateTool/>,{
        title:'PxseedServerAdministrateTool'
    })
}

;(async ()=>{
    if(__name__==GetJsEntry()){
        ReactRender(<PxseedServerAdministrateTool/>,DomRootComponent);
    }
})();