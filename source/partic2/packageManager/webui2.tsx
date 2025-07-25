
import * as React from 'preact'
import {DomComponentGroup, DomRootComponent, ReactRefEx, ReactRender, css} from 'partic2/pComponentUi/domui'
import { RemoteRunCodeContext } from 'partic2/CodeRunner/RemoteCodeContext'
import {getPersistentRegistered, getRegistered,importRemoteModule,persistent,ServerHostRpcName,ServerHostWorker1RpcName, WebWorker1RpcName} from 'partic2/pxprpcClient/registry'
import { GenerateRandomString, GetBlobArrayBufferContent, Task, assert, future, requirejs } from 'partic2/jsutils1/base'
import { BuildUrlFromJsEntryModule, GetJsEntry, GetPersistentConfig, RequestDownload, selectFile, useDeviceWidth } from 'partic2/jsutils1/webutils'
import {JsonForm} from 'partic2/pComponentUi/input'
import {alert, appendFloatWindow, confirm, prompt, removeFloatWindow, WindowComponent} from 'partic2/pComponentUi/window'
var registryModuleName='partic2/packageManager/registry';
import {TaskLocalRef,Singleton} from 'partic2/CodeRunner/jsutils2'

export var __name__=requirejs.getLocalRequireModule(require);
//remote code context

import type * as registryModType from 'partic2/packageManager/registry'
import type { PxseedConfig } from 'pxseedBuildScript/buildlib'
import {openWorkspaceWindowFor} from 'partic2/JsNotebook/workspace'
import { TextEditor } from 'partic2/pComponentUi/texteditor'
import { setOpenNewWindowImpl } from 'partic2/pComponentUi/workspace'


let i18n={
    install:'install',
    list:'list',
    filter:'filter',
    urlOrPackageName:'url/package name',
    exportInstallation:'export installation',
    importInstallation:'import installation',
    createPackage:'create package',
    webui:'webui',
    uninstall:'uninstall',
    error:'error'
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
    i18n.error='错误'
}

let remoteModule={
    registry:new Singleton(async ()=>{
        let rpc1=await getPersistentRegistered(ServerHostRpcName);
        if(rpc1!=undefined){
            return await importRemoteModule<typeof import('partic2/packageManager/registry')>(
                await (await getPersistentRegistered(ServerHostWorker1RpcName))!.ensureConnected(),'partic2/packageManager/registry');
        }else{
            //Local worker with xplatj mode.
            return await importRemoteModule<typeof import('partic2/packageManager/registry')>(
                await (await getPersistentRegistered(WebWorker1RpcName))!.ensureConnected(),'partic2/packageManager/registry');
        }
    })
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
        this.setState({errorMessage:'Installing...'})
        try{
            const registry=await remoteModule.registry.get();
            await registry.installPackage!(source);
            this.setState({errorMessage:'done'});
            this.refreshList();
        }catch(e:any){
            this.setState({errorMessage:'Failed:'+e.toString()})
        }
    }
    async exportPackagesInstallation(){
        const registry=await remoteModule.registry.get();
        let result=await registry.exportPackagesInstallation!();
        RequestDownload(new TextEncoder().encode(JSON.stringify(result)),'export.txt')
    }
    async importPackagesInstallation(){
        let selected=await selectFile();
        if(selected!=null && selected.length>0){
            let registry=await remoteModule.registry.get();
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
        try{
            let registry=await remoteModule.registry.get();
            this.setState({
                packageList:await registry.listPackagesArray(this.filterString)
            });
        }catch(err:any){
            this.setState({
                packageList:[{
                    "loaders": [
                      {
                        "name": "typescript"
                      }
                    ],
                    "name": "partic2/JsNotebook",
                    "options":{
                      "partic2/packageManager/registry":{
                        "webui":{
                          "entry":"partic2/JsNotebook/index"
                        }
                      }
                    }
                  },{
                    "loaders": [
                      {
                        "name": "typescript"
                      },{
                        "name":"rollup",
                        "entryModules":[
                          "preact"
                        ]
                      }
                    ],
                    "name": "pxseedServer2023",
                    "options":{
                      "partic2/packageManager/registry":{
                        "webui":{
                          "entry":"pxseedServer2023/webui"
                        }
                      }
                    }
                  }],
                errorMessage:err.toString()
            });
        }
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
        let registry=await remoteModule.registry.get();
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
            let registry=await remoteModule.registry.get();
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
        try{
            await openWorkspaceWindowFor((await getPersistentRegistered(ServerHostWorker1RpcName))!,'packageManager/registry');
        }catch(err:any){
            await alert(err.errorMessage,i18n.error)
        }
    }
    componentDidMount(): void {
        this.refreshList();
    }
    renderPackageList(){
        return this.state.packageList.map(pkg=>{
            let cmd=[] as {label:string,click:()=>void}[];
            cmd.push({label:i18n.uninstall,click:()=>{
                this.uninstallPackage(pkg.name)
            }})
            if(pkg.options!=undefined && registryModuleName in pkg.options){
                let opt=pkg.options[registryModuleName] as registryModType.PackageManagerOption;
                if(opt.webui!=undefined){
                    cmd.push({label:i18n.webui,click:async ()=>{
                        let entryModule=await import(opt.webui!.entry);
                        if(typeof entryModule.main==='function'){
                            let r=entryModule.main('webui');
                            if(Symbol.iterator in r){
                                Task.fork(r).run();
                            }
                        }
                    }});
                }
            }
            return <div className={css.flexRow} style={{alignItems:'center',borderBottom:'solid black 1px'}}>
                <span style={{flexGrow:1}}>{pkg.name}</span>
                <div style={{display:'inline-block',flexShrink:1}}>
                    {cmd.map(v=><SimpleButton onClick={v.click}>{v.label}</SimpleButton>)}
                </div>
            </div>})
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
                    this.renderPackageList()
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

export let renderPackagePanel=async()=>{
    useDeviceWidth()
    ReactRender(<PackagePanel/>,DomRootComponent);
};