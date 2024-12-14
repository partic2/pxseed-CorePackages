
import * as React from 'preact'
import {DomRootComponent, ReactRefEx, ReactRender, css} from 'partic2/pComponentUi/domui'
import { RemoteRunCodeContext } from 'partic2/CodeRunner/RemoteCodeContext'
import {getRegistered,persistent,ServerHostRpcName,ServerHostWorker1RpcName} from 'partic2/pxprpcClient/registry'
import { GenerateRandomString, GetBlobArrayBufferContent, assert, future, requirejs } from 'partic2/jsutils1/base'
import { BuildUrlFromJsEntryModule, GetJsEntry, RequestDownload, selectFile, useDeviceWidth } from 'partic2/jsutils1/webutils'
import {JsonForm} from 'partic2/pComponentUi/input'
import {alert, appendFloatWindow, confirm, prompt, WindowComponent} from 'partic2/pComponentUi/window'
var registryModuleName='partic2/packageManager/registry';

export var __name__=requirejs.getLocalRequireModule(require);
//remote code context

import * as registryModType from 'partic2/packageManager/registry'
import type { PxseedConfig } from 'pxseedBuildScript/buildlib'
import { CodeContextShell, registry } from 'partic2/CodeRunner/CodeContext'
import {openWorkspaceWindowFor} from 'partic2/JsNotebook/workspace'
import { TextEditor } from 'partic2/pComponentUi/texteditor'


let i18n={
    install:'install',
    list:'list',
    filter:'filter',
    urlOrPackageName:'url/package name',
    exportInstallation:'export installation',
    importInstallation:'import installation',
    createPackage:'create package',
    webui:'webui',
    uninstall:'uninstall'
}

if(navigator.language.split('-').includes('zh')){
    i18n.install='安装'
    i18n.list='列出'
    i18n.filter='过滤'
    i18n.urlOrPackageName='url或包名'
    i18n.exportInstallation='导出安装配置'
    i18n.importInstallation='导入安装配置'
    i18n.createPackage='创建包'
    i18n.uninstall='卸载'
}

class singleton<T>{
    constructor(public init:()=>Promise<T>){}
    i:T|null=null;
    async get(){
        if(this.i===null){
            this.i=await this.init()
        }
        return this.i;
    }
}

let codeCellShell=new singleton(async ()=>{
    await persistent.load();
    let rpc=getRegistered(ServerHostWorker1RpcName);
    assert(rpc!=null);
    let codeContext=new RemoteRunCodeContext(await rpc!.ensureConnected());
    registry.set(registryModuleName,codeContext);
    return new CodeContextShell(codeContext);
});
async function getServerCodeShell(){
    let ccs=await codeCellShell.get();
    let mod=await ccs.importModule<typeof registryModType>(registryModuleName,'registry');
    return {
        shell:codeCellShell,
        registry:mod.toModuleProxy()
    };
}

const SimpleButton=(props:React.RenderableProps<{
    onClick: () => void;
}>)=><a href="javascript:;" onClick={()=>props.onClick()} className={css.simpleCard}>{props.children}</a>;

class PackagePanel extends React.Component<{},{
    packageList:PxseedConfig[],
    errorMessage:string
}>{
    rref={
        createPackageGuide:React.createRef<WindowComponent>(),
        createPackageForm:React.createRef<JsonForm>(),
        installPackageName:new ReactRefEx<TextEditor>(),
        listFilter:new ReactRefEx<TextEditor>()
    }
    constructor(props:any,context:any){
        super(props,context);
        this.setState({packageList:[],errorMessage:''});
    }
    async install(){
        let dlg=await prompt(<div style={{backgroundColor:'white'}}>
            {i18n.urlOrPackageName}:<TextEditor ref={this.rref.installPackageName} 
                divClass={[css.simpleCard]}
                divStyle={{width:Math.min(window.innerWidth-8,300)}}
            />
        </div>,i18n.install);
        if((await dlg.answer.get())==='cancel'){
            dlg.close();
            return
        }
        let source=(await this.rref.installPackageName.waitValid()).getPlainText();
        dlg.close();
        let {registry}=await getServerCodeShell();
        this.setState({errorMessage:'Installing...'})
        try{
            await registry.installPackage!(source);
            this.setState({errorMessage:'done'});
            this.refreshList();
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
    filterString:string='webui'
    async requestListPackage(){
        let dlg=await prompt(<div style={{backgroundColor:'white'}}>
            {i18n.filter}:<TextEditor ref={this.rref.listFilter}
                divClass={[css.simpleCard]}
                divStyle={{width:Math.min(window.innerWidth-8,300)}}/>
        </div>,i18n.list);
        (await this.rref.listFilter.waitValid()).setPlainText(this.filterString);
        if((await dlg.answer.get())==='cancel'){
            dlg.close();
            return;
        }else{
            this.filterString=this.rref.listFilter.current!.getPlainText();
            dlg.close();
            await this.refreshList();
        }
    }
    async refreshList(){
        let {registry}=await getServerCodeShell();
        this.setState({
            packageList:await registry.listPackagesArray(this.filterString),
            errorMessage:''
        });
    }
    async showCreatePackage(){
        this.rref.createPackageGuide.current?.active();
        this.rref.createPackageForm.current!.value={
            name:'partic2/createPkgDemo',
            loaders:`[
{"name": "copyFiles","include": ["assets/**/*"]},
{"name": "typescript"}
]`,
            webuiEntry:'./index',
            dependencies:'',
            repositories:[{
                scope:'partic2',
                'url template':'https://github.com/partic2/pxseed-${subname}'
            }]
        }
    }
    async createPackageBtn(pkgInfoIn:any,subbtn?:string){
        let {registry}=await getServerCodeShell();
        if(subbtn==='create'){
            let opt={} as registryModType.PackageManagerOption;
            let webuiEntry=pkgInfoIn.webuiEntry as string;
            if(webuiEntry.startsWith('./')){
                webuiEntry=pkgInfoIn.name+webuiEntry.substring(1);
            }
            opt.webui={
                entry:webuiEntry,
                label:pkgInfoIn.name
            }
            opt.dependencies=(pkgInfoIn.dependencies as string).split(',').filter(v=>v!='');
            opt.repositories={};
            pkgInfoIn.repositories.forEach((v:any)=>{
                opt.repositories![v.scope]=[...(opt.repositories?.[v.scope]??[]),v['url template']]
            });
            let r1:PxseedConfig={
                name:pkgInfoIn.name,
                loaders:JSON.parse(pkgInfoIn.loaders),
                options:{
                    'partic2/packageManager/registry':opt
                }
            }
            this.setState({errorMessage:'creating...'});
            try{
                await registry.createPackageTemplate1!(r1);
                this.setState({errorMessage:'done'});
            }catch(e:any){
                this.setState({errorMessage:e.toString()});
            }
        }else if(subbtn==='fill repositories'){
            try{
                let scopeName=pkgInfoIn.name.split('/')[0];
                let urlTpl=await registry.getUrlTemplateFromScopeName!(scopeName);
                if(urlTpl!=undefined){
                    pkgInfoIn.repositories=urlTpl.map(v=>({
                        scope:scopeName,
                        ['url template']:v
                    }));
                }
                this.rref.createPackageForm.current!.value=pkgInfoIn;
            }catch(e:any){
                await alert(e.toString());
            }
        }
    }
    async uninstallPackage(pkgName:string){
        if(await confirm(`Uninstall package ${pkgName}?`)=='ok'){
            let {registry}=await getServerCodeShell();
            this.setState({errorMessage:'uninstalling...'})
            try{
                await registry.uninstallPackage!(pkgName);
            }catch(e:any){
                this.setState({errorMessage:e.toString()});
            }
            this.setState({errorMessage:'done'})
            this.refreshList();
        }
    }
    async openNotebook(){
        await openWorkspaceWindowFor((await codeCellShell.get()).codeContext as any,'packageManager/registry');
    }
    componentDidMount(): void {
        this.refreshList();
    }
    render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChild {
        return [
        <div className={css.flexColumn}>
                <div>
                    <SimpleButton onClick={()=>this.requestListPackage()}>{i18n.list}</SimpleButton>
                    <SimpleButton onClick={()=>this.install()}>{i18n.install}</SimpleButton>
                    <SimpleButton onClick={()=>this.showCreatePackage()}>{i18n.createPackage}</SimpleButton>
                    <SimpleButton onClick={()=>this.exportPackagesInstallation()} >{i18n.exportInstallation}</SimpleButton>
                    <SimpleButton onClick={()=>this.importPackagesInstallation()} >{i18n.importInstallation}</SimpleButton>
                    <SimpleButton onClick={()=>this.openNotebook()} >notebook</SimpleButton>
                    <div style={{display:'inline-block',color:'red'}}>{this.state.errorMessage}</div>
                </div>
                <div style={{flexGrow:1}}>{
                    this.state.packageList.map(pkg=>{
                    let cmd=[] as {label:string,click:()=>void}[];
                    cmd.push({label:i18n.uninstall,click:()=>{
                        this.uninstallPackage(pkg.name)
                    }})
                    if(pkg.options!=undefined && registryModuleName in pkg.options){
                        let opt=pkg.options[registryModuleName] as registryModType.PackageManagerOption;
                        if(opt.webui!=undefined){
                            cmd.push({label:i18n.webui,click:()=>{
                                window.open(BuildUrlFromJsEntryModule(opt.webui!.entry),'_blank')
                            }});
                        }
                    }
                    return <div className={css.flexRow} style={{alignItems:'center',borderBottom:'solid black 1px'}}>
                        <span style={{flexGrow:1}}>{pkg.name}</span>
                        <div style={{display:'inline-block',flexShrink:1}}>
                            {cmd.map(v=><SimpleButton onClick={v.click}>{v.label}</SimpleButton>)}
                        </div>
                    </div>})
                }</div>
            </div>,
            <WindowComponent ref={this.rref.createPackageGuide} title={i18n.createPackage}>
                <JsonForm ref={this.rref.createPackageForm} divStyle={{minWidth:Math.min(window.innerWidth-8,400)}}
                type={{
                    type:'object',
                    fields:[
                        ['name',{type:'string'}],
                        ['loaders',{type:'string'}],
                        ['webuiEntry',{type:'string'}],
                        ['dependencies',{type:'string'}],
                        ['repositories',{type:'array',element:{
                            type:'object',fields:[
                                ['scope',{type:'string'}],
                                ['url template',{type:'string'}],
                            ]
                        }}],
                        ['btn1',{type:'button',subbtn:['create','fill repositories'],
                            onClick:(parent,subbtn)=>this.createPackageBtn(parent,subbtn)}]
                    ]
                }}/>
            </WindowComponent>]
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
        useDeviceWidth()
        ReactRender(<PackagePanel/>,DomRootComponent);
    }
})()