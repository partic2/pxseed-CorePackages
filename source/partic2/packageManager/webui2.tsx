
import * as React from 'preact'
import {DomComponentGroup, DomRootComponent, ReactRefEx, ReactRender, css} from 'partic2/pComponentUi/domui'
import { RemoteRunCodeContext } from 'partic2/CodeRunner/RemoteCodeContext'
import {getPersistentRegistered, getRegistered,importRemoteModule,persistent,ServerHostRpcName,ServerHostWorker1RpcName, WebWorker1RpcName} from 'partic2/pxprpcClient/registry'
import { GenerateRandomString, GetBlobArrayBufferContent, Task, assert, future, requirejs } from 'partic2/jsutils1/base'
import { BuildUrlFromJsEntryModule, GetJsEntry, GetPersistentConfig, RequestDownload, selectFile, useDeviceWidth } from 'partic2/jsutils1/webutils'
import {JsonForm} from 'partic2/pComponentUi/input'
import {alert, appendFloatWindow, confirm, prompt, css as windowCss, WindowComponent} from 'partic2/pComponentUi/window'
var registryModuleName='partic2/packageManager/registry';
import {TaskLocalRef,Singleton} from 'partic2/CodeRunner/jsutils2'

export var __name__=requirejs.getLocalRequireModule(require);
//remote code context

import type * as registryModType from 'partic2/packageManager/registry'
import type { PxseedConfig } from 'pxseedBuildScript/buildlib'
import {openWorkspaceWindowFor} from 'partic2/JsNotebook/workspace'
import { TextEditor } from 'partic2/pComponentUi/texteditor'
import { NewWindowHandle, NewWindowHandleLists, openNewWindow, setBaseWindowView, WorkspaceWindowContext  } from 'partic2/pComponentUi/workspace'


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
    error:'error',
    upgradeCorePackages:'upgrade pxseed core',
    packageManager:"package manager"
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
    i18n.upgradeCorePackages='升级PXSEED核心库'
    i18n.packageManager='包管理'
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

import {getIconUrl} from 'partic2/pxseedMedia1/index1'
import { ReactDragController } from 'partic2/pComponentUi/transform'

class WindowListIcon extends React.Component<{},{
    hideList:boolean,
    listWidth:number,
    listHeight:number,
    windows:{title:string,visible:boolean}[]
}>{
    drag=new ReactDragController();
    constructor(props:any,ctx:any){
        super(props,ctx);
        this.setState({hideList:false,listWidth:250,listHeight:320,windows:[]})
    }
    async onExpandClick(){
        let moved=this.drag.checkIsMovedSinceLastCheck()
        if(!moved){
            if(this.state.hideList)
            await this.onWindowListChange()
            this.setState({hideList:!this.state.hideList})
        }
    }
    mounted=false;
    onWindowListChange=async ()=>{
        let windows=new Array<{title:string,visible:boolean}>();
        for(let t1 of NewWindowHandleLists.value){
            if(t1.parentWindow==undefined){
                windows.push({title:t1.title??'Untitle',visible:!await t1.isHidden()})
            }
        }
        this.setState({windows})
    }
    onWindowResize=async ()=>{
        //How to find a good place to move to?
        this.drag.dragged.newPos?.({left:window.innerWidth-this.state.listWidth-10,top:window.innerHeight-this.state.listHeight-40});
    }
    async componentDidMount(): Promise<void> {
        this.setState({listWidth:Math.min(250,window.innerWidth),listHeight:Math.min(320,window.innerHeight-32)});
        this.mounted=true;
        NewWindowHandleLists.addEventListener('change',this.onWindowListChange);
        window.addEventListener('resize',this.onWindowResize);
    }
    componentWillUnmount(): void {
        this.mounted=false;
        NewWindowHandleLists.removeEventListener('change',this.onWindowListChange);
        window.removeEventListener('resize',this.onWindowResize);
    }
    render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChildren {
        return <div style={{display:'inline-block',position:'absolute',pointerEvents:'none'}} 
        ref={this.drag.draggedRef({left:window.innerWidth-this.state.listWidth-10,top:window.innerHeight-this.state.listHeight-40})}>
        <div style={{width:this.state.listWidth+'px',height:this.state.listHeight+'px',display:'flex',flexDirection:'column-reverse'}}>{
            this.state.hideList?null:<div>{
                this.state.windows.map((t1,t2)=><div className={[css.flexRow,css.simpleCard].join(' ')} style={{backgroundColor:'white',pointerEvents:'auto'}}>
                    <div style={{display:'flex',flexGrow:'1',wordBreak:'break-all'}} onClick={()=>NewWindowHandleLists.value[t2].activate()}>{t1.title}</div>
                    <img draggable={false} src={t1.visible?getIconUrl('eye.svg'):getIconUrl('eye-off.svg')} onClick={()=>{
                        if(t1.visible){
                            NewWindowHandleLists.value[t2].hide();
                        }else{
                            NewWindowHandleLists.value[t2].activate();
                        }
                    }}/>
                </div>)
            }</div>
        }</div>
        <div className={css.flexRow}>
            <div style={{flexGrow:'1'}}></div>
            <div style={{pointerEvents:'auto'}} onPointerUp={()=>this.onExpandClick()}>
                <img draggable={false} src={getIconUrl('layers.svg')} {...this.drag.trigger}
                    style={{width:'32px',height:'32px'}}/>
            </div>
            
        </div>
        </div>
    }
}

const SimpleButton=(props:React.RenderableProps<{
    onClick: () => void;
}>)=><a href="javascript:;" onClick={()=>props.onClick()} className={css.simpleCard}>{props.children}</a>;

class PackagePanel extends React.Component<{},{
    packageList:PxseedConfig[],
    errorMessage:string
}>{
    rref={
        createPackageForm:new ReactRefEx<JsonForm>(),
        installPackageName:new ReactRefEx<TextEditor>(),
        listFilter:new ReactRefEx<TextEditor>()
    }
    constructor(props:any,context:any){
        super(props,context);
        this.setState({packageList:[],errorMessage:''});
    }
    async install(){
        let dlg=await prompt(<div className={css.flexRow} style={{backgroundColor:'white',alignItems:'center'}}>
            {i18n.urlOrPackageName}:<TextEditor ref={this.rref.installPackageName} 
                divClass={[css.simpleCard]}
                divStyle={{width:Math.min(window.innerWidth-8,300)}}
            />
        </div>,i18n.install);
        if((await dlg.response.get())==='cancel'){
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
        let dlg=await prompt(<div className={css.flexRow} style={{backgroundColor:'white',alignItems:'center'}}>
            {i18n.filter}:<TextEditor ref={this.rref.listFilter}
                divClass={[css.simpleCard]}
                divStyle={{width:Math.min(window.innerWidth-8,300)}}/>
        </div>,i18n.list);
        (await this.rref.listFilter.waitValid()).setPlainText(this.filterString);
        if((await dlg.response.get())==='cancel'){
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
        openNewWindow(<JsonForm ref={this.rref.createPackageForm} divStyle={{minWidth:Math.min(window.innerWidth-8,400)}}
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
        }}/>,{title:i18n.createPackage,parentWindow:this.lastWindow});        
        (await this.rref.createPackageForm.waitValid())!.value={
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
                        if(entryModule.main!=undefined){
                            Task.fork(function*(){
                                let r:any=null;
                                if(entryModule.main.constructor.name=='GeneratorFunction'){
                                    r=yield* entryModule.main('webui')
                                }else{
                                    r=entryModule.main('webui');
                                    if(r instanceof Promise){
                                        r=yield r;
                                    }
                                }
                            }).run();
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
    async upgradeCorePackages(){
        try{
            this.setState({errorMessage:'upgrading package...'});
            let registry=await remoteModule.registry.get();
            await registry.UpgradeCorePackages();
            this.setState({errorMessage:'done'});
        }catch(err:any){
            this.setState({errorMessage:'Failed:'+err.toString()});
        }
    }
    lastWindow?:NewWindowHandle
    render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChild {
        return [
            <WorkspaceWindowContext.Consumer>
            {(v)=>{
                this.lastWindow=v.lastWindow;
                return null;
            }}
            </WorkspaceWindowContext.Consumer>,
            <div className={css.flexColumn}>
                <div>
                    <SimpleButton onClick={()=>this.requestListPackage()}>{i18n.list}</SimpleButton>
                    <SimpleButton onClick={()=>this.install()}>{i18n.install}</SimpleButton>
                    <SimpleButton onClick={()=>this.showCreatePackage()}>{i18n.createPackage}</SimpleButton>
                    <SimpleButton onClick={()=>this.exportPackagesInstallation()} >{i18n.exportInstallation}</SimpleButton>
                    <SimpleButton onClick={()=>this.importPackagesInstallation()} >{i18n.importInstallation}</SimpleButton>
                    <SimpleButton onClick={()=>this.upgradeCorePackages()} >{i18n.upgradeCorePackages}</SimpleButton>
                    <SimpleButton onClick={()=>this.openNotebook()} >notebook</SimpleButton>
                    <div style={{display:'inline-block',color:'red'}}>{this.state.errorMessage}</div>
                </div>
                <div style={{flexGrow:1}}>{
                    this.renderPackageList()
                }</div>
            </div>
        ]
    }
    
}

export let renderPackagePanel=async()=>{
    useDeviceWidth();
    openNewWindow(<PackagePanel/>,{title:i18n.packageManager});
    appendFloatWindow(<WindowComponent keepTop={true} noTitleBar={true} noResizeHandle={true} windowDivClassName={windowCss.borderlessWindowDiv}>
        <WindowListIcon/>
    </WindowComponent>)
    
};