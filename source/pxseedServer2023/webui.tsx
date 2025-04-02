
import * as React from 'preact'

import {RegistryUI} from 'partic2/pxprpcClient/ui'

import type {PxseedServer2023StartupConfig} from './workerInit'
import {TextEditor} from 'partic2/pComponentUi/texteditor'
import { DomRootComponent, ReactRefEx,ReactRender,css } from 'partic2/pComponentUi/domui'
import { alert,prompt } from 'partic2/pComponentUi/window'
import { getPersistentRegistered, ServerHostRpcName } from 'partic2/pxprpcClient/registry'
import { PxseedServer2023Function } from './clientFunction'
import { requirejs } from 'partic2/jsutils1/base'
import { GetJsEntry } from 'partic2/jsutils1/webutils'

import {} from 'partic2/jsutils1/webutils'

export class PxseedServerAdministrateTool extends React.Component<{},{serverConfig?:PxseedServer2023StartupConfig}>{
    rref={
        configView:new ReactRefEx<TextEditor>()
    }
    rpcFunc?:PxseedServer2023Function;
    async componentDidMount() {
        if(this.rpcFunc==undefined){
            let rpc=await (await getPersistentRegistered(ServerHostRpcName))!.ensureConnected();
            this.rpcFunc=new PxseedServer2023Function();
            await this.rpcFunc.init(rpc);
        }
        let cfg=await this.rpcFunc!.getConfig();
        this.setState({
            serverConfig:cfg
        });
        (await this.rref.configView.waitValid()).setPlainText(JSON.stringify(cfg,undefined,2));
    }
    async reloadServerConfig(){
        let cfg=await this.rpcFunc!.getConfig();
        this.setState({
            serverConfig:cfg
        });
        (await this.rref.configView.waitValid()).setPlainText(JSON.stringify(cfg,undefined,2));
    }
    async saveServerConfig(){
        this.rpcFunc!.saveConfig(JSON.parse((await this.rref.configView.waitValid()).getPlainText()))
    }
    async buildEnviron(){
        let resp=await this.rpcFunc!.buildEnviron();
        prompt(<pre>{resp}</pre>);
    }
    async buildPackage(){
        let resp=await this.rpcFunc!.buildPackages();
        prompt(<pre>{resp}</pre>);
    }
    async forceRebuildPackages(){
        let resp=await this.rpcFunc!.rebuildPackages();
        prompt(<pre>{resp}</pre>);
    }
    async restartSubprocess(index:number){
        await this.rpcFunc!.subprocessRestart(index);
        await alert('restart done');
    }
    render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined; }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChild {
        return <div className={css.flexColumn}>
            <h2>Server cnofig</h2>
            <div className={css.flexColumn}>
                <TextEditor ref={this.rref.configView} divClass={[css.simpleCard]}/>
                <div className={css.flexRow}>
                    <a href="javascript:;" onClick={()=>this.reloadServerConfig()}>&nbsp;reload&nbsp;</a> 
                    <a href="javascript:;" onClick={()=>this.saveServerConfig()}>&nbsp;save&nbsp;</a>
                </div>
            </div>
            <h2>Command</h2>
            <div className={css.flexColumn}>
                <a href="javascript:;" onClick={()=>this.buildEnviron()}>build environ</a>
                <a href="javascript:;" onClick={()=>this.buildPackage()}>build packages</a>
                <a href="javascript:;" onClick={()=>this.forceRebuildPackages()}>force rebuild pakcages</a>
                <a href="javascript:;">stop server</a>
                {(this.state.serverConfig?.deamonMode?.enabled==true)?this.state.serverConfig!.deamonMode.subprocessConfig.map((cfg,index)=>{
                    return <a href="javascript:;" onClick={()=>this.restartSubprocess(index)}>
                        restart subprocess {index} on {`${cfg.listenOn?.host}:${cfg.listenOn?.port}`}
                    </a>
                }):null}
            </div>
        </div>
    }
}

let __name__=requirejs.getLocalRequireModule(require);

;(async ()=>{
    if(__name__==GetJsEntry()){
        ReactRender(<PxseedServerAdministrateTool/>,DomRootComponent);
    }
})();