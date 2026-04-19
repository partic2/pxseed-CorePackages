

import * as React from 'preact'
import { ClientInfo, addClient, removeClient, getRegistered, listRegistered, persistent, listPersistentRegistered } from './registry';
import { ReactRefEx, css, event } from 'partic2/pComponentUi/domui';
import { prompt,alert} from 'partic2/pComponentUi/window';
import { ArrayWrap2, assert, GenerateRandomString, requirejs } from 'partic2/jsutils1/base';
import { rpcId } from './rpcworker';
import { DynamicPageCSSManager, GetPersistentConfig, SavePersistentConfig } from 'partic2/jsutils1/webutils';

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

export class RegistryUI extends React.Component<{},{selected:string|null,filter:string}>{
    rref={div:React.createRef<HTMLDivElement>()}
    async doLoadConfig(){
        await listPersistentRegistered();
        if(config==null){
            config=await GetPersistentConfig(__name__);
            if(config!.lastFilter!=undefined){
                this.setState({filter:config!.lastFilter})
            }
        }
        this.forceUpdate(()=>{
            let div=this.rref.div.current
            div?.dispatchEvent(new Event(event.layout,{bubbles:true}))
        })
    }
    componentDidMount(): void {
        this.doLoadConfig()
        this.setState({selected:null,filter:''});
    }
    async doAdd(){
        let addCard=new ReactRefEx<AddCard>();
        let dlg=await prompt(<AddCard ref={addCard}/>,'New rpc client');
        if(await dlg.response.get()==='ok'){
            let {url,name}=(await addCard.waitValid()).getAddClientInfo();
            await addClient(url,name);
        }
        dlg.close();
        await persistent.save();
        this.forceUpdate();
    }
    async doEdit(){
        let selected=this.state.selected!;
        let addCard=new ReactRefEx<AddCard>();
        let dlg=await prompt(<AddCard ref={addCard}/>,'New rpc client');
        (await addCard.waitValid()).setAddClientInfo({
            name:selected,
            url:getRegistered(selected)?.url??''
        });
        if(await dlg.response.get()==='ok'){
            let {url,name}=(await addCard.waitValid()).getAddClientInfo();
            await removeClient(selected);
            await addClient(url,name);
        }
        dlg.close();
        await persistent.save();
        this.forceUpdate();
    }
    async doRemove(){
        await removeClient(this.state.selected!);
        await persistent.save();
        this.forceUpdate();
    }
    async doSelect(selected:string){
        this.setState({selected})
    }
    async doDisconnect(){
        let conn=getRegistered(this.state.selected!);
        await conn!.disconnect();
        this.forceUpdate();
    }
    async doSyncWithServer(){
        try{
            await persistent.pullFromServerHost();
            await persistent.pushToServerHost();
            this.forceUpdate();
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
        this.forceUpdate();
    }
    getSelected(){
        return this.state.selected;
    }
    async onFilterChange(newFilter:string){
        if(config==null){
            config=await GetPersistentConfig(__name__);
        }
        config!.lastFilter=newFilter;
        await SavePersistentConfig(__name__);
        this.setState({filter:newFilter});
    }
    render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined; }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChild {
        let btns=[] as {label:string,handler:()=>any}[];
        let sel2=getRegistered(this.state.selected??'');
        if(sel2){
            if(sel2.connected()){
                btns.push({label:'Disconnect',handler:()=>this.doDisconnect()});
            }else{
                btns.push({label:'Connect',handler:()=>this.doConnect()});
            }
            btns.push({label:'Edit',handler:()=>this.doEdit()});
            btns.push({label:'Remove',handler:()=>this.doRemove()});
        }
        btns.push({label:'Add',handler:()=>this.doAdd()})
        btns.push({label:'SyncWithServer',handler:()=>this.doSyncWithServer()});
        let allClients=Array.from(listRegistered());
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
                    <div>{ent[1]!.connected()?'connected':'disconnected'}</div>
                </div>
            })}
        
        <hr/>
        <div style={{wordBreak:'break-all'}}>RPC id for this scope:{rpcId.get()}</div>
        </div>
    }
}