
import * as React from 'preact'
import { css, ReactRefEx } from './domui';
import {Ref2, copy, future} from 'partic2/jsutils1/base'
import { appendFloatWindow, removeFloatWindow, WindowComponent } from './window';


interface OpenNewWindopwOption{
    title?:string
}
interface NewWindowHandle{
    onClose:()=>Promise<void>,
    close:()=>void
}
export let openNewWindow=async function(contentVNode:React.VNode,options?:OpenNewWindopwOption){
    let closeFuture=new future<boolean>();
    let windowVNode=<WindowComponent onClose={()=>closeFuture.setResult(true)} title={options?.title}>{contentVNode}</WindowComponent>;
    appendFloatWindow(windowVNode,true);
    return {
        onClose:async function(){
            await closeFuture.get();
            this.close()
            return
        },
        close:function(){removeFloatWindow(windowVNode);}
    }
}

export function setOpenNewWindowImpl(impl:(contentVNode:React.VNode,options?:OpenNewWindopwOption)=>Promise<NewWindowHandle>){
    openNewWindow=impl;
}


export interface TabInfo{
    id:string,
    title:string,
    container:Ref2<{forceUpdate:(callback:()=>void)=>void}|null>,
    renderPage:()=>React.ComponentChild,
    onRendered?:()=>void
    onClose():Promise<boolean>,
}

export abstract class TabInfoBase implements TabInfo{
    renderPage():React.ComponentChild{
        throw new Error('Not Implemented')
    }
    async onClose(): Promise<boolean> {
        return true;
    }
    id: string='';
    title: string='';
    container=new Ref2<{forceUpdate:(callback:()=>void)=>void}|null>(null);
    async init(initval:Partial<TabInfo>){
        for(let k in initval){
            (this as any)[k]=(initval as any)[k]
        }
        return this;
    }
    async requestPageViewUpdate(){
        let tabView=this.container.get();
        if(tabView!=null){
            return new Promise<void>(r=>tabView!.forceUpdate(r));
        }else{
            return new Promise<void>(r=>r())
        }
    }
}

var eventProcessed=Symbol('eventProcessed')


export class TabView extends React.Component<{onTabActive?:(tabId:string)=>void},{currTab:string,tabs:TabInfo[]}>{
    addTab(tabInfo:TabInfo){
        let foundIndex=this.state.tabs.findIndex(v=>v.id==tabInfo.id);
        if(foundIndex<0){
            tabInfo.container.set(this);
            this.state.tabs.push(tabInfo);
        }else{
            tabInfo.container.set(this);
            this.state.tabs.splice(foundIndex,1,tabInfo)
        }
        this.forceUpdate()
    }
    getTabs(){
        return this.state.tabs;
    }
    openTab(id:string){
        if(this.state.tabs.find(v=>v.id==id)!=undefined){
            this.setState({currTab:id},()=>{
                this.props.onTabActive?.(id);
            })
        }
    }
    async closeTab(id:string){
        let t1=this.state.tabs.findIndex((v)=>v.id==id);
        if(t1>=0){
            let toClose=this.state.tabs[t1];
            if(toClose.onClose){
                let confirm=await toClose.onClose();
                if(!confirm){
                    //abort
                    return
                }
            }
            this.state.tabs.splice(t1,1);
            if(toClose.id===this.state.currTab){
                if(t1>=this.state.tabs.length){
                    t1=this.state.tabs.length-1;
                }
                if(t1>=0){
                    this.setState({currTab:this.state.tabs[t1].id});
                }else{
                    this.setState({currTab:''});
                }
            }else{
                this.forceUpdate();
            }
        }
    }
    onTabClick(ev:React.JSX.TargetedEvent,tab:TabInfo){
        if((ev as any)[eventProcessed]){
            return;
        }
        this.openTab(tab.id);
    }
    renderTabs(){
        return this.state.tabs.map(v=><div className={[
            css.selectable,css.simpleCard,
            this.state.currTab==v.id?css.selected:''].join(' ')}
            onClick={(ev)=>this.onTabClick(ev,v)} >
                {v.title}&nbsp;
                <a href="javascript:;" onClick={(ev)=>{
                    (ev as any)[eventProcessed]=true;
                    this.closeTab(v.id);
                }}>X</a>
            </div>)
    }
    getCurrentTab(){
        return this.state.tabs.find(v=>v.id===this.state.currTab);
    }
    rref={
        tabContainer:React.createRef<HTMLDivElement>()
    }
    constructor(props:any,ctx:any){
        super(props,ctx);
        this.setState({currTab:'',tabs:[]});
    }
    render(props?: Readonly<React.Attributes & { children?: React.ComponentChildren; ref?: React.Ref<any> | undefined; }> | undefined, state?: Readonly<{}> | undefined, context?: any): React.ComponentChild {
        return <div className={css.flexColumn} style={{height:'100%'}}>
            <div className={css.flexRow}>
                {this.renderTabs()}
            </div>
            {this.state.tabs.map(tab=>{
                if(tab.id===this.state.currTab){
                    return <div key={'tabid:'+tab.id} style={{flexGrow:1,display:'flex',minHeight:0,overflow:'auto'}} ref={this.rref.tabContainer}>
                        {tab.renderPage()}
                    </div>
                }else{
                    return <div key={'tabid:'+tab.id} style={{display:'none'}}>
                        {tab.renderPage()}
                    </div>
                }
            })}
        </div>
    }
    componentDidUpdate(previousProps: Readonly<{ onTabActive?: ((tabId: string) => void) | undefined; }>, previousState: Readonly<{ currTab: string; tabs: TabInfo[]; }>, snapshot: any): void {
        this.getCurrentTab()?.onRendered?.();
    }
}
