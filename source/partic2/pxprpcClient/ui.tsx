

import * as React from 'preact'
import { ClientInfo, addClient, removeClient, getRegistered, listRegistered, persistent, rpcId } from './registry';
import { ReactRefEx, css, event } from 'partic2/pComponentUi/domui';
import { prompt,alert} from 'partic2/pComponentUi/window';
import { ArrayWrap2, assert, GenerateRandomString } from 'partic2/jsutils1/base';

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
        return <div className={[css.simpleCard,css.flexColumn].join(' ')} style={{minWidth:'360px'}}>
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

export class RegistryUI extends React.Component<{},{selected:string|null}>{
    rref={div:React.createRef<HTMLDivElement>()}
    async doLoadConfig(){
        await persistent.load()
        this.forceUpdate(()=>{
            let div=this.rref.div.current
            div?.dispatchEvent(new Event(event.layout,{bubbles:true}))
        })
    }
    componentDidMount(): void {
        this.doLoadConfig()
        this.setState({selected:null});
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
        let allClients=Array.from(listRegistered());
        allClients.sort((a,b)=>(a[0]<b[0])?-1:(a[0]===b[0]?0:1))
        return <div className={css.simpleCard} ref={this.rref.div}>
            RPC id for this scope:{rpcId}<br/>
            PXPRPC Connection:<br/>
            {allClients.map(ent=>{
                return <div key={ent[0]} className={[css.simpleCard,css.selectable,this.state.selected===ent[0]?css.selected:''].join(' ')}
                    onClick={()=>this.doSelect(ent[0])}>
                    <div>{ent[0]}</div><div>{ent[1]!.url.toString()}</div>
                    <div>{ent[1]!.connected()?'connected':'disconnected'}</div>
                </div>
            })}
        <div>
            {btns.map(v=><span>&emsp;<a href="javascript:;" onClick={v.handler}>{v.label}</a>&emsp;</span>)}
        </div>
        </div>
    }
}