
import * as React from 'preact'
import {DomComponentGroup, DomRootComponent, ReactRefEx, ReactRender, css} from 'partic2/pComponentUi/domui'
import { RemoteRunCodeContext } from 'partic2/CodeRunner/RemoteCodeContext'
import {getPersistentRegistered, importRemoteModule,persistent,ServerHostRpcName,ServerHostWorker1RpcName, WebWorker1RpcName} from 'partic2/pxprpcClient/registry'
import { GenerateRandomString, GetBlobArrayBufferContent, Ref2, Task, assert, future, requirejs } from 'partic2/jsutils1/base'
import { BuildUrlFromJsEntryModule, GetJsEntry, GetPersistentConfig, getResourceManager, path, RequestDownload, selectFile, useDeviceWidth } from 'partic2/jsutils1/webutils'
import {promptWithForm, SimpleReactForm1} from 'partic2/pComponentUi/input'
import {alert, appendFloatWindow, confirm, prompt, css as windowCss, WindowComponent} from 'partic2/pComponentUi/window'
var registryModuleName='partic2/packageManager/registry';
import {TaskLocalRef,Singleton} from 'partic2/CodeRunner/jsutils2'
import {RemotePxseedJsIoServer} from 'partic2/pxprpcClient/bus'

export var __name__=requirejs.getLocalRequireModule(require);
//remote code context

import * as registryModType from 'partic2/packageManager/registry'
import type { PxseedConfig } from 'pxseedBuildScript/buildlib'
import {openWorkspaceWindowFor, openWorkspaceWithProfile} from 'partic2/JsNotebook/workspace'
import { PlainTextEditorInput, TextEditor } from 'partic2/pComponentUi/texteditor'
import { NewWindowHandle, NewWindowHandleLists, openNewWindow, setBaseWindowView, WorkspaceWindowContext  } from 'partic2/pComponentUi/workspace'


let i18n={
    install:'install',
    list:'list',
    filter:'filter',
    urlOrPackageName:'url/package name',
    packageName:'package name',
    exportInstallation:'export installation',
    importInstallation:'import installation',
    createPackage:'create package',
    webui:'webui',
    uninstall:'uninstall',
    error:'error',
    upgradeCorePackages:'upgrade pxseed core',
    packageManager:"package manager",
    done:'done'
}

if(navigator.language.split('-').includes('zh')){
    i18n.install='安装'
    i18n.list='列出'
    i18n.filter='过滤'
    i18n.urlOrPackageName='url或包名'
    i18n.packageName='包名'
    i18n.exportInstallation='导出安装配置'
    i18n.importInstallation='导入安装配置'
    i18n.createPackage='创建包'
    i18n.uninstall='卸载'
    i18n.error='错误'
    i18n.upgradeCorePackages='升级PXSEED核心库'
    i18n.packageManager='包管理'
    i18n.done='完成'
}

let remoteModule={
    registry:new Singleton(async ()=>{
        return await importRemoteModule(
            await (await getPersistentRegistered(ServerHostWorker1RpcName))!.ensureConnected(),'partic2/packageManager/registry') as typeof import('partic2/packageManager/registry');
    })
}

import {getIconUrl} from 'partic2/pxseedMedia1/index1'
import { ReactDragController } from 'partic2/pComponentUi/transform'
import { RpcExtendServer1 } from 'pxprpc/extend'
import { Server } from 'pxprpc/base'
import { rpcId } from '../pxprpcClient/rpcworker'

let resourceManager=getResourceManager(__name__);

class WindowListIcon extends React.Component<{},{
    hideList:boolean,
    listWidth:number,
    listHeight:number,
    windows:{title:string,visible:boolean,index:number}[]
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
        let windows=new Array<{title:string,visible:boolean,index:number}>();
        for(let t2=0;t2<NewWindowHandleLists.value.length;t2++){
            let t1=NewWindowHandleLists.value[t2];
            if(t1.parentWindow==undefined){
                windows.push({title:t1.title??'Untitle',visible:!await t1.isHidden(),index:t2})
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
                this.state.windows.map((t1)=><div className={[css.flexRow,css.simpleCard].join(' ')} style={{pointerEvents:'auto'}}>
                    <div style={{display:'flex',flexGrow:'1',wordBreak:'break-all'}} onClick={()=>NewWindowHandleLists.value[t1.index].activate()}>{t1.title}</div>
                    <img draggable={false} src={t1.visible?getIconUrl('eye.svg'):getIconUrl('eye-off.svg')} onClick={()=>{
                        if(t1.visible){
                            NewWindowHandleLists.value[t1.index].hide();
                        }else{
                            NewWindowHandleLists.value[t1.index].activate();
                        }
                    }}/>
                </div>)
            }</div>
        }</div>
        <div className={css.flexRow}>
            <div style={{flexGrow:'1'}}></div>
            <div draggable={false} style={{pointerEvents:'auto',touchAction:'none'}} {...this.drag.trigger} onPointerUp={(ev)=>{this.onExpandClick();}}>
                <img draggable={false} src={getIconUrl('layers.svg')} 
                    style={{width:'32px',height:'32px',touchAction:'none'}}/>
            </div>
            
        </div>
        </div>
    }
}

const SimpleButton=(props:React.RenderableProps<{
    onClick: () => void;
}>)=><a href="javascript:;" onClick={()=>props.onClick()} className={css.simpleCard}>{props.children}</a>;

export async function startWebuiForPackage(pkgName:string){
    let registry=await remoteModule.registry.get();
    let config1=await registry.getPxseedConfigForPackage(pkgName);
    assert(config1!=null,'packages not found.');
    assert(config1.options?.[registryModuleName]?.webui!=undefined,'No webui info found in package');
    let pmopt=config1.options[registryModuleName] as registryModType.PackageManagerOption;
    let entry=pmopt.webui!.entry
    if(entry.startsWith('.')){
        entry=path.join(pkgName,entry)
    }
    let entryModule=await import(entry);
    if(entryModule.main!=undefined){
        Task.fork(function*():Generator<any,any>{
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
}

class PackageWebUiEntry extends React.Component<{pmopt:registryModType.PackageManagerOption,packageName:string}>{
    async launchWebui(){
        try{
            await startWebuiForPackage(this.props.packageName)
        }catch(err){
            //use current cache
            let pmopt=this.props.pmopt
            let entry=pmopt.webui!.entry
            if(entry.startsWith('.')){
                entry=path.join(this.props.packageName,entry)
            }
            let entryModule=await import(entry);
            if(entryModule.main!=undefined){
                Task.fork(function*():Generator<any,any>{
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
        }
    }
    render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChildren {
        let iconUrl=this.props.pmopt.webui?.icon;
        if(iconUrl==undefined){
            iconUrl=getIconUrl('package.svg')
        }else{
            iconUrl=resourceManager.getUrl(iconUrl);
        }
        return <div style={{display:'inline-flex',flexDirection:'column',alignItems:'center',
            width:'100px',height:'120px',padding:'4px'}} onClick={()=>this.launchWebui()}>
            <div><img src={iconUrl} style={{width:'80px',height:'80px'}}></img></div>
            <div style={{textAlign:'center',wordBreak:'break-all'}}>{this.props.pmopt.webui?.label??this.props.packageName}</div>
        </div>
    }
}

class PackagePanel extends React.Component<{},{
    packageList:PxseedConfig[],
    errorMessage:string
}>{
    rref={
        installPackageName:new ReactRefEx<TextEditor>(),
        listFilter:new ReactRefEx<TextEditor>()
    }
    constructor(props:any,context:any){
        super(props,context);
        this.setState({packageList:[],errorMessage:''});
    }
    async install(){
        let dlg=await prompt(<div className={css.flexRow} style={{alignItems:'center'}}>
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
        let dlg=await prompt(<div className={css.flexRow} style={{alignItems:'center'}}>
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
                            "entry":"./index",
                            "label":"Js Notebook",
                            "icon":"/partic2/pxseedMedia1/icons/sidebar.svg"
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
                            "entry":"./webui",
                            "label":"pxseedServer2023",
                            "icon":"/partic2/pxseedMedia1/icons/server.svg"
                        }
                      }
                    }
                  }],
                errorMessage:err.toString()
            });
        }
    }
    async showCreatePackage(){
        try{
            let basicInfo=await promptWithForm(<SimpleReactForm1>{(form1)=>{
                return <div>
                    <div>name:</div>
                    <div><input style={{width:'100%',boxSizing:'border-box'}} ref={form1.getRefForInput('name')} type='text'/></div>
                    <div>loaders:</div>
                    <PlainTextEditorInput ref={form1.getRefForInput('loaders')} divStyle={{border:'solid 1px black'}}/>
                    <div>description:</div>
                    <PlainTextEditorInput ref={form1.getRefForInput('description')} divStyle={{border:'solid 1px black'}}/>
                    <div>dependencies:</div>
                    <PlainTextEditorInput ref={form1.getRefForInput('dependencies')} divStyle={{border:'solid 1px black'}}/>
                    <SimpleReactForm1 ref={form1.getRefForInput('webui')}>{form1=><div>
                        <div>webui relative config:</div>
                        <div>entry:</div>
                        <div><input style={{width:'100%',boxSizing:'border-box'}} ref={form1.getRefForInput('entry')} type='text'/></div>
                        <div>label:</div>
                        <div><input style={{width:'100%',boxSizing:'border-box'}} ref={form1.getRefForInput('label')} type='text'/></div>
                        <div>icon:</div>
                        <div><input style={{width:'100%',boxSizing:'border-box'}} ref={form1.getRefForInput('icon')} type='text'/></div>
                    </div>}</SimpleReactForm1>
                </div>
            }}</SimpleReactForm1>,{title:i18n.createPackage,initialValue:{
                name:'partic2/createPkgDemo',
                loaders:JSON.stringify([
                    {"name": "copyFiles","include": ["assets/**/*"]},
                    {"name": "typescript"}
                ],undefined,4),
                webui:{
                    entry:'./webui',
                    label:'',
                    icon:''
                }
            }})
            if(basicInfo==null){
                return;
            }
            basicInfo.loaders=JSON.parse(basicInfo.loaders);
            let registry=await remoteModule.registry.get();
            let scopeName=basicInfo.name.split('/')[0];
            let urlTpl=await registry.getUrlTemplateFromScopeName!(scopeName);
            basicInfo.repositories=JSON.stringify({
                [scopeName]:urlTpl??['https://github.com/'+scopeName+'/pxseed-${subname}']
            },undefined,4);
            basicInfo=await promptWithForm(<SimpleReactForm1>{(form1)=>{
                return <div>
                    <div>repositories:</div>
                    <PlainTextEditorInput ref={form1.getRefForInput('repositories')} divStyle={{border:'solid 1px black'}}/>
                </div>
            }}</SimpleReactForm1>,{title:i18n.createPackage,initialValue:basicInfo})
            if(basicInfo==null){
                return;
            }
            try{
                basicInfo.options={};
                let opt={} as registryModType.PackageManagerOption;
                let inPath=basicInfo.webui.entry as string;
                if(inPath!=''){
                    if(inPath.startsWith('./')){
                        inPath=basicInfo.name+inPath.substring(1);
                    }
                    opt.webui={entry:inPath,label:basicInfo.name};
                    inPath=basicInfo.webui.icon as string;
                    if(inPath!=''){
                        if(inPath.startsWith('./')){
                            inPath=basicInfo.name+inPath.substring(1);
                        }
                        opt.webui.icon=inPath;
                    }
                    if(basicInfo.webui.label!=''){
                        opt.webui.label=basicInfo.webui.label;
                    }
                }
                delete basicInfo.webui
                opt.dependencies=(basicInfo.dependencies as string).split(',').filter(v=>v!='');
                delete basicInfo.dependencies
                opt.repositories=JSON.parse(basicInfo.repositories);
                delete basicInfo.repositories
                basicInfo.options['partic2/packageManager/registry']=opt;
                await registry.createPackageTemplate1!(basicInfo);
                await alert(i18n.done,'CAUTION');
            }catch(e:any){
                this.setState({errorMessage:e.toString()});
            }
        }catch(err:any){
            await alert(err.message+'\n'+err.stack,'ERROR');
        }
        await this.refreshList();
    }
    
    async uninstall(){
        let dlg=await prompt(<div className={css.flexRow} style={{alignItems:'center'}}>
            {i18n.packageName}:<TextEditor ref={this.rref.installPackageName} 
                divClass={[css.simpleCard]}
                divStyle={{width:Math.min(window.innerWidth-8,300)}}
            />
        </div>,i18n.uninstall);
        if((await dlg.response.get())==='cancel'){
            dlg.close();
            return
        }
        let pkgName=(await this.rref.installPackageName.waitValid()).getPlainText();
        dlg.close();
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
            let nbw=await openWorkspaceWithProfile.openJSNotebookFirstProfileWorkspace({
                defaultRpc:ServerHostWorker1RpcName,
                defaultStartupScript:`import2env('partic2/jsutils1/base');
import2env('partic2/jsutils1/webutils');
import2env('partic2/CodeRunner/jsutils2');
import2env('partic2/packageManager/registry');`,
                notebookDirectory:path.join(__name__,'..','notebook'),
                sampleCode:[`installPackage('xxx')`,`listPackageArray('')`]
            });
            nbw.title='PackageManager'
            await nbw.start();
        }catch(err:any){
            await alert(err.errorMessage,i18n.error)
        }
    }
    componentDidMount(): void {
        this.refreshList();
    }
    renderPackageList(){
        return this.state.packageList.filter(pkg=>pkg.options?.[registryModuleName]!=undefined).map(pkg=>{
            return <PackageWebUiEntry pmopt={pkg.options![registryModuleName]} packageName={pkg.name}/>
        })
    }
    async upgradeCorePackages(){
        try{
            let resp=await confirm(i18n.upgradeCorePackages+'?');
            if(resp=='cancel')return;
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
                    <SimpleButton onClick={()=>this.uninstall()}>{i18n.uninstall}</SimpleButton>
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
    openNewWindow(<PackagePanel/>,{title:i18n.packageManager,layoutHint:__name__+'.PackagePanel',windowOptions:{closeIcon:null}});
    appendFloatWindow(<WindowComponent keepTop={true} noTitleBar={true} noResizeHandle={true} windowDivClassName={windowCss.borderlessWindowDiv}>
        <WindowListIcon/>
    </WindowComponent>)
    
};

export async function openPackageMainWindow(appInfo:{pkgName:string,beforeUnload?:()=>Promise<void>},...args:Parameters<typeof openNewWindow>){
    if(args[1]==undefined){
        args[1]={}
    }
    if(args[1].windowOptions==undefined){
        args[1].windowOptions={}
    }
    if(args[1].windowOptions.titleBarButton==undefined){
        args[1].windowOptions.titleBarButton=[]
    }
    let windowHandler:NewWindowHandle
    args[1].windowOptions.titleBarButton.unshift({
        icon:getIconUrl('refresh-ccw.svg'),
        onClick:async ()=>{
            windowHandler.close();
            await appInfo.beforeUnload?.()
            for(let t1 of Object.keys(await requirejs.getDefined())){
                if(t1.startsWith(appInfo.pkgName+'/')){
                    await requirejs.undef(t1);
                }
            }
            let registry=await remoteModule.registry.get();
            await registry.unloadPackageModules(appInfo.pkgName);
            await registry.buildPackage(appInfo.pkgName)
            startWebuiForPackage(appInfo.pkgName);
        }
    })
    windowHandler=await openNewWindow(...args);
    return windowHandler;
}

export let __inited__=(async ()=>{
    if(GetJsEntry()==__name__){
        document.body.style.overflow='hidden';
        renderPackagePanel()
        RemotePxseedJsIoServer.serve(`/pxprpc/pxseed_webui/${__name__.replace(/\//g,'.')}/${rpcId.get()}`,{
            onConnect:(io)=>new RpcExtendServer1(new Server(io))
        });
    }
})();