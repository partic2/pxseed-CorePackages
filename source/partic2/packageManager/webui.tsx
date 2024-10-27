
import * as React from 'preact'
import {DomRootComponent, ReactRender, css} from 'partic2/pComponentUi/domui'
import {IInteractiveCodeShell} from 'partic2/CodeRunner/Inspector'
import {InspectableShell, InspectableShellInspector} from 'partic2/CodeRunner/Component1'
import { RemoteRunCodeContext } from 'partic2/CodeRunner/RemoteCodeContext'
import {getRegistered,persistent,ServerHostRpcName,ServerHostWorker1RpcName} from 'partic2/pxprpcClient/registry'
import { GetBlobArrayBufferContent, TextToJsString, assert } from 'partic2/jsutils1/base'
import { BuildUrlFromJsEntryModule, GetJsEntry, RequestDownload, selectFile } from 'partic2/jsutils1/webutils'
import {TextEditor} from 'partic2/pComponentUi/texteditor'
import {WindowComponent} from 'partic2/pComponentUi/window'
var registryModuleName='partic2/packageManager/registry';

export var __name__='partic2/packageManager/webui'

//remote code context

import type * as registry from 'partic2/packageManager/registry'
import type { PxseedConfig } from 'pxseedBuildScript/buildlib'
import { CodeContextShell } from 'partic2/CodeRunner/CodeContext'


let codeCellShell:IInteractiveCodeShell|null=null;

let i18n={
    install:'install',
    refresh:'refresh',
    exportInstallation:'export installation',
    importInstallation:'import installation',
    createPackage:'create package',
    webEntry:'web entry',
    toggleConsole:'toggle console',
    name:'name'
}

async function getServerCodeShell(){
    if(codeCellShell==null){
        await persistent.load();
        //let rpc=getRegistered(ServerHostWorker1RpcName);
        let rpc=getRegistered(ServerHostRpcName);
        assert(rpc!=null);
        let codeContext=new RemoteRunCodeContext(await rpc!.ensureConnected())
        codeCellShell=new CodeContextShell(codeContext);
        await codeCellShell.runCode(
            `import * as registry from 'partic2/packageManager/registry'`
        )
    }
    let registry1:Partial<typeof registry>={};
    const exportNames=['installLocalPackage','fetchGitRepositoryFromUrl',
        'fetchRepositoryFromUrl','getRepoInfoFromPkgName','fetchRepository','removePackage','upgradeGitPackage',
        'upgradePackage','publishPackage','initGitRepo','exportPackagesInstallation','importPackagesInstallation',
        'listPackagesArray','installPackage'] as const;
    for(let t1 of exportNames){
        registry1[t1]=codeCellShell.getRemoteFunction(`registry.${t1}`);
    }
    return {
        shell:codeCellShell,
        registry:registry1
    };
}



const SimpleButton=(props:React.RenderableProps<{
    onClick: () => void;
}>)=><a href="javascript:;" onClick={()=>props.onClick()} className={css.simpleCard}>{props.children}</a>;

class PackagePanel extends React.Component<{},{
    packageList:PxseedConfig[],
    errorMessage:string,
    showConsole:boolean,
    shellConsole:InspectableShell|null
}>{
    rref={
        packageName:React.createRef<HTMLInputElement>(),
        createPackageGuide:React.createRef<WindowComponent>()
    }
    constructor(props:any,context:any){
        super(props,context);
        this.setState({packageList:[],errorMessage:'',showConsole:false,shellConsole:null});
    }
    async install(){
        let source=this.rref.packageName.current!.value;
        let {registry}=await getServerCodeShell();
        this.setState({errorMessage:'Installing...'})
        try{
            await registry.installPackage!(source);
            this.setState({errorMessage:'done'})
        }catch(e:any){
            this.setState({errorMessage:'Failed:'+e.toString()})
        }
    }
    async exportPackagesInstallation(){
        let {registry}=await getServerCodeShell();
        let result=await registry.exportPackagesInstallation!();
        RequestDownload(new TextEncoder().encode(JSON.stringify(result)),'export.txt')
    }
    async importPackagesInstallation(){
        let selected=await selectFile();
        if(selected!=null && selected.length>0){
            let {registry}=await getServerCodeShell();
            registry.importPackagesInstallation!(JSON.parse(new TextDecoder().decode(
                (await GetBlobArrayBufferContent(selected.item(0)!))!))
            )
        }
    }
    componentDidMount(): void {
        this.refreshList();
    }
    async refreshList(){
        let {registry}=await getServerCodeShell();
        this.setState({
            packageList:await registry.listPackagesArray!('')
        });
    }
    render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChild {
        return [<div className={css.flexColumn}>
                <div className={css.flexRow}>
                    <input placeholder="url or package name" ref={this.rref.packageName} style={{flexGrow:1}}></input>
                    <SimpleButton onClick={()=>this.install()}>{i18n.install}</SimpleButton>
                </div>
                <div>
                    <SimpleButton onClick={()=>this.refreshList()}>{i18n.refresh}</SimpleButton>
                    <SimpleButton onClick={()=>this.exportPackagesInstallation()} >{i18n.exportInstallation}</SimpleButton>
                    <SimpleButton onClick={()=>this.importPackagesInstallation()} >{i18n.importInstallation}</SimpleButton>
                    <div style={{display:'inline-block',color:'red'}}>{this.state.errorMessage}</div>
                </div>
                <div style={{flexGrow:1}}>{
                    this.state.packageList.map(pkg=>{
                    let cmd=[] as {label:string,click:()=>void}[];
                    if(pkg.options!=undefined && registryModuleName in pkg.options){
                        let opt=pkg.options[registryModuleName] as registry.PackageManagerOption;
                        if(opt.webui!=undefined){
                            cmd.push({label:i18n.webEntry,click:()=>{
                                window.open(BuildUrlFromJsEntryModule(opt.webui!.entry),'_blank')
                            }});
                        }
                    }
                    return <div className={css.flexRow} style={{alignItems:'center'}}>
                        <span style={{flexGrow:1}}>{pkg.name}</span>
                        <div style={{display:'inline-block',flexShrink:1}}>
                            {cmd.map(v=><SimpleButton onClick={v.click}>{v.label}</SimpleButton>)}
                        </div>
                    </div>})
                }</div>
            </div>]
    }

}

//Module cleaner
export async function close(){
    if(codeCellShell!=null){
        if(codeCellShell instanceof CodeContextShell){
            codeCellShell.codeContext.close();
        }
    }
}

;(async ()=>{
    if(GetJsEntry()==__name__){
        ReactRender(<PackagePanel/>,DomRootComponent)
    }
})()