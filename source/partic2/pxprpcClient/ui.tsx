

import * as React from 'preact'
import { ClientInfo, addClient, removeClient, getRegistered, listRegistered, persistent, listPersistentRegistered, ServerHostRpcName, isServerHost, easyCallRemoteJsonFunction, getPersistentRegistered, importRemoteModule } from './registry';
import { ReactRefEx, css, event } from 'partic2/pComponentUi/domui';
import { prompt,alert} from 'partic2/pComponentUi/window';
import { ArrayWrap2, assert, GenerateRandomString, requirejs } from 'partic2/jsutils1/base';
import { rpcId } from './rpcworker';
import { DynamicPageCSSManager, GetPersistentConfig, SavePersistentConfig,path } from 'partic2/jsutils1/webutils';
import { RpcExtendClient1 } from 'pxprpc/extend';

let css2={
    rpcClientCard:GenerateRandomString()
}

let __name__=requirejs.getLocalRequireModule(require);

DynamicPageCSSManager.PutCss('.'+css2.rpcClientCard,['word-break:break-all']);

class AddCard extends React.Component<{},{
    url:string,name:string,rpcChain:string[]
}>{
    constructor(props:any,ctx:any){
        super(props,ctx);
        this.setState({url:'',name:'',rpcChain:[]})
    }
    protected setNewWebWorker(){
        let tname=this.state.name;
        if(tname===''){
            for(let t1 of ArrayWrap2.IntSequence(0,10000)){
                tname='partic2/pxprpcClient/registry/worker/'+String(t1);
                if(getRegistered(tname)==undefined){
                    break;
                }
            }
        }
        this.setState({
            url:'webworker:'+GenerateRandomString(),
            name:tname
        })
    }
    decodeURISafe(s:string){
        try{
            return decodeURIComponent(s);
        }catch(e){
            return '';
        }
    }
    protected parseRpcChain(url:string){
        let url1=new URL(url);
        assert(url1.protocol==='iooverpxprpc:')
        let chain1=url1.pathname.split('/');
        return chain1.map(t1=>this.decodeURISafe(t1));
    }
    getAddClientInfo(){
        return {
            url:this.state.url,
            name:this.state.name
        }
    }
    setAddClientInfo(info:{url:string,name:string}){
        this.setState({url:info.url,name:info.name})
    }
    public render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined; }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChild {
        return <div className={[css.simpleCard,css.flexColumn].join(' ')}>
            <input type="text" placeholder='name' value={this.state.name} onChange={(ev)=>{this.setState({name:(ev.target as any).value})}} />
            <input type="text" placeholder='url' value={this.state.url} onChange={(ev)=>{this.setState({url:(ev.target as any).value})}} />
            <div className={[css.flexRow].join(' ')} style={{flexWrap:'wrap'}}>
                <a href="javascript:;" onClick={()=>this.setNewWebWorker()}>|New WebWorker|</a>
            </div>
            {this.state.url.startsWith('iooverpxprpc:')?<div className={[css.flexColumn].join(' ')}>
                RPC Chain:{
                    this.parseRpcChain(this.state.url).map(t1=>(
                        <div>{t1}-&gt;</div>
                    ))
                }
            </div>:null}
        </div>
    }
}

let config:{lastFilter?:string}|null=null;

export class RegistryInfoProvider{

}

async function pullFromServerHost(){
    let rpc=await getPersistentRegistered(ServerHostRpcName);
    if(rpc!=undefined && !await isServerHost()){
        let result1=await easyCallRemoteJsonFunction(await rpc.ensureConnected(),path.join(__name__,'..','registry'),'listPersistentRegistered',[]);
        for(let t1 of result1){
            if(t1[0]==ServerHostRpcName)continue;
            let existed=await getPersistentRegistered(t1[0]);
            if(existed==null || t1[1].url.startsWith(`iooverpxprpc:${ServerHostRpcName}`)){
                if(t1[1].url.startsWith('iooverpxprpc:')){
                    await addClient(`iooverpxprpc:${ServerHostRpcName}/${t1[1].url.substring('iooverpxprpc:'.length)}`)
                }else{
                    await addClient(`iooverpxprpc:${ServerHostRpcName}/${encodeURIComponent(t1[1].url)}`,t1[0]);
                }
            }
        }
    }
}
async function pushToServerHost(){
    let rpc=getRegistered(ServerHostRpcName);
    if(rpc!=undefined && !await isServerHost()){
        let remoteClientList=new Map(await easyCallRemoteJsonFunction(await rpc.ensureConnected(),path.join(__name__,'..','registry'),'listPersistentRegistered',[]) as Array<[string,{url:string,name:string}]>);
        let toRemove=new Array<string>();
        let toAdd=new Array<[string,string]>();
        let registered=await listPersistentRegistered();
        for(let t1 of registered){
            if(t1[1].url.startsWith(`iooverpxprpc:${ServerHostRpcName}/`)){
                let restRpcPath=t1[1].url.substring(`iooverpxprpc:${ServerHostRpcName}/`.length);
                if(restRpcPath.indexOf('/')>=0){
                    restRpcPath='iooverpxprpc:'+restRpcPath;
                }else{
                    restRpcPath=decodeURIComponent(restRpcPath);
                }
                if(remoteClientList.get(t1[0])?.url!=restRpcPath){
                    toAdd.push([restRpcPath,t1[0]]);
                }
            }
        }
        for(let t1 of remoteClientList.keys()){
            if(getRegistered(t1)==undefined){
                toRemove.push(t1);
            }
        }
        for(let t1 of toAdd){
            await easyCallRemoteJsonFunction(await rpc.ensureConnected(),__name__,'addClient',t1)
        }
        for(let t1 of toRemove){
            await easyCallRemoteJsonFunction(await rpc.ensureConnected(),__name__,'removeClient',[t1]);
        }
    }
}

export class RegistryUI extends React.Component<{rpc?:RpcExtendClient1},
    {selected:string|null,filter:string,clients?:Array<[string,{url:string,name:string}|ClientInfo]>}>{
    rref={div:React.createRef<HTMLDivElement>()}
    async doLoadConfig(){
        if(config==null){
            config=await GetPersistentConfig(__name__);
            if(config!.lastFilter!=undefined){
                this.setState({filter:config!.lastFilter})
            }
        }
        let r=await this._getRegistyModule();
        this.setState({clients:await r.listPersistentRegistered()},()=>{
            let div=this.rref.div.current
            div?.dispatchEvent(new Event(event.layout,{bubbles:true}))
        });
    }
    componentDidMount(): void {
        this.doLoadConfig()
        this.setState({selected:null,filter:''});
    }
    protected async _getRegistyModule(){
        if(this.props.rpc==undefined){
            return await import('./registry')
        }else{
            return await importRemoteModule(this.props.rpc,path.join(__name__,'..','registry')) as typeof import('./registry')
        }
    }
    async doAdd(){
        let addCard=new ReactRefEx<AddCard>();
        let dlg=await prompt(<AddCard ref={addCard}/>,'New rpc client');
        (await addCard.waitValid()).setAddClientInfo({name:'user.',url:''});
        if(await dlg.response.get()==='ok'){
            let {url,name}=(await addCard.waitValid()).getAddClientInfo();
            let r=await this._getRegistyModule();
            await r.addClient(url,name);
        }
        dlg.close();
        await this.doLoadConfig();
    }
    async doEdit(){
        let selected=this.state.selected!;
        let addCard=new ReactRefEx<AddCard>();
        let dlg=await prompt(<AddCard ref={addCard}/>,'New rpc client');
        (await addCard.waitValid()).setAddClientInfo({
            name:selected,
            url:this.state.clients!.find(t1=>t1[0]==selected)![1].url
        });
        if(await dlg.response.get()==='ok'){
            let {url,name}=(await addCard.waitValid()).getAddClientInfo();
            let r=await this._getRegistyModule();
            await r.removeClient(selected);
            await r.addClient(url,name);
        }
        dlg.close();
        await this.doLoadConfig();
    }
    async doRemove(){
        let r=await this._getRegistyModule();
        await r.removeClient(this.state.selected!);
        await this.doLoadConfig();
    }
    async doSelect(selected:string){
        this.setState({selected})
    }
    async doDisconnect(){
        let conn=getRegistered(this.state.selected!);
        await conn!.disconnect();
        await this.doLoadConfig();
    }
    async doSyncWithServer(){
        try{
            await pullFromServerHost();
            await pushToServerHost();
            await this.doLoadConfig();
        }catch(err:any){
            alert(err.toString()+err.stack)
        }
    }
    async doConnect(){
        let conn=getRegistered(this.state.selected!);
        try{
            await conn!.ensureConnected();
        }catch(e:any){
            await alert(e.toString());
        }
        await this.doLoadConfig();
    }
    getSelected(){
        return this.state.selected;
    }
    async onFilterChange(newFilter:string){
        if(config==null){
            config=await GetPersistentConfig(__name__);
        }
        config!.lastFilter=newFilter;
        await SavePersistentConfig(__name__,config);
        this.setState({filter:newFilter});
    }
    render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined; }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChild {
        let btns=[] as {label:string,handler:()=>any}[];
        let sel2=getRegistered(this.state.selected??'');
        if(sel2){
            if(this.props.rpc==undefined){
                if(sel2.connected()){
                    btns.push({label:'Disconnect',handler:()=>this.doDisconnect()});
                }else{
                    btns.push({label:'Connect',handler:()=>this.doConnect()});
                }
            }
            btns.push({label:'Edit/Copy',handler:()=>this.doEdit()});
            btns.push({label:'Remove',handler:()=>this.doRemove()});
        }
        btns.push({label:'Add',handler:()=>this.doAdd()})
        if(this.props.rpc==undefined){
            btns.push({label:'SyncWithServer',handler:()=>this.doSyncWithServer()});
        }
        let allClients=(this.state.clients??[]);
        allClients.sort((a,b)=>(a[0]<b[0])?-1:(a[0]===b[0]?0:1))
        return <div className={[css.simpleCard,css.flexColumn].join(' ')} ref={this.rref.div}>
            <div className={css.flexRow}>
                <b style={{flexGrow:'0',flexShrink:'1'}}>PXPRPC Connection:</b>
                <input type="text" placeholder="filter" style={{flexGrow:'1',flexShrink:'1'}} 
                onChange={(e:any)=>this.onFilterChange(e.target.value)} value={this.state.filter}/>
            </div>
            <div>
                {btns.map(v=><span>&emsp;<a href="javascript:;" onClick={v.handler}>{v.label}</a>&emsp;</span>)}
            </div>
            {allClients.filter(t1=>t1[0].includes(this.state.filter)).map(ent=>{
                return <div key={ent[0]} className={[css2.rpcClientCard,css.simpleCard,css.selectable,
                    this.state.selected===ent[0]?css.selected:''].join(' ')}
                    onClick={()=>this.doSelect(ent[0])}>
                    <div>{ent[0]}</div><hr/><div>{ent[1]!.url.toString()}</div><hr/>
                    {this.props.rpc==undefined?<div>{(ent[1] as ClientInfo)!.connected()?'connected':'disconnected'}</div>:''}
                </div>
            })}
        <hr/>
        {this.props.rpc==undefined?<div style={{wordBreak:'break-all'}}>RPC id:{rpcId.get()}</div>:''}
        </div>
    }
}