

import * as React from 'preact'
import { ClientInfo, addClient, dropClient, getRegistered, listRegistered, persistent } from './registry';
import { SimpleReactForm1, css, event } from 'partic2/pComponentUi/domui';
import { GenerateRandomString } from 'partic2/jsutils1/base';

class AddCard extends SimpleReactForm1<{onAdd:(info:{url:string,name:string})=>void},{}>{
    setNewWebWorker(){
        this.setValue({url:'webworker:'+GenerateRandomString()});
    }
    public render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined; }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChild {
        return <div class={css.simpleCard}>
            <input type="text" ref={this.getRefForInput("name")} placeholder='name'/><br/>
            <input type="text" ref={this.getRefForInput("url")} placeholder='url'/><br/>
            <a href="javascript:;" onClick={()=>this.props.onAdd(this.getValue() as any)}>Add</a>&nbsp;
            <a href="javascript:;" onClick={()=>this.setNewWebWorker()}>NewWorker</a>
        </div>
    }
}

export class RegistryUI extends React.Component<{
    onSelectConfirm?:(info:ClientInfo|null)=>void
},{selected:string}>{
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
    }
    async doAdd(info: { url: string; name: string; }){
        await addClient(info.url,info.name);
        await persistent.save();
        this.forceUpdate();
    }
    async doDrop(){
        await dropClient(this.state.selected);
        await persistent.save();
        this.forceUpdate();
    }
    async doConfirm(){
        this.props.onSelectConfirm?.(getRegistered(this.state.selected)!);
    }
    async doCancel(){
        this.props.onSelectConfirm?.(null);
    }
    async doSelect(selected:string){
        this.setState({selected})
    }
    async doDisconnect(){
        let conn=getRegistered(this.state.selected);
        await conn!.disconnect();
        this.forceUpdate();
    }
    async doConnect(){
        let conn=getRegistered(this.state.selected);
        await conn!.ensureConnected();
        this.forceUpdate();
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
            btns.push({label:'Drop',handler:()=>this.doDrop()});
        }
        if(this.props.onSelectConfirm){
            btns.push({label:'Confirm',handler:()=>this.doConfirm()})
            btns.push({label:'Cancel',handler:()=>this.doCancel()})
        }
        return <div className={css.simpleCard} ref={this.rref.div}>
            PXPRPC Connection:<br/>
            {Array.from(listRegistered()).map(ent=>{
                return <div key={ent[0]} className={[css.simpleCard,css.selectable,this.state.selected===ent[0]?css.selected:''].join(' ')}
                    onClick={()=>this.doSelect(ent[0])}>
                    <div>{ent[0]}</div><div>{ent[1]!.url.toString()}</div>
                    <div>{ent[1]!.connected()?'connected':'disconnected'}</div>
                </div>
            })}
            <AddCard onAdd={(info)=>this.doAdd(info)}/>
        <div>
            {btns.map(v=><span>&emsp;<a href="javascript:;" onClick={v.handler}>{v.label}</a>&emsp;</span>)}
        </div>
        </div>
    }
}