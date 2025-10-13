
import {RpcExtendServerCallable, defaultFuncMap, TableSerializer} from 'pxprpc/extend'
import { buildTjs } from './tjsbuilder';
import { getWWWRoot,path } from 'partic2/jsutils1/webutils';


export let inited=(async function(){
    let tjs=await buildTjs();
defaultFuncMap['JseHelper.JseIo.realpath']=new RpcExtendServerCallable(async(path:string)=>tjs.realPath(path)).typedecl('s->s');
defaultFuncMap['JseHelper.JseIo.unlink']=new RpcExtendServerCallable(async(path:string)=>tjs.remove(path)).typedecl('s->');
defaultFuncMap['JseHelper.JseIo.rename']=new RpcExtendServerCallable(async(path:string,newPath:string)=>tjs.rename(path,newPath)).typedecl('ss->');
defaultFuncMap['JseHelper.JseIo.mkstemp']=new RpcExtendServerCallable(async(template:string)=>tjs.makeTempFile(template)).typedecl('s->os');
defaultFuncMap['JseHelper.JseIo.fhRead']=new RpcExtendServerCallable(async(fh:tjs.FileHandle,offset:bigint,len:number)=>{
    let buf=new Uint8Array(len);
    let readResult=(await fh.read(buf,Number(offset)))??0;
    return new Uint8Array(buf.buffer,0,readResult);
}).typedecl('oli->b');

defaultFuncMap['JseHelper.JseIo.fhWrite']=new RpcExtendServerCallable(async(fh:tjs.FileHandle,offset:bigint,buf:Uint8Array)=>{
    let writeResult=await fh.write(buf,Number(offset));
    return writeResult
}).typedecl('olb->i');

defaultFuncMap['JseHelper.JseIo.fhClose']=new RpcExtendServerCallable(async(fh:tjs.FileHandle)=>fh.close()).typedecl('o->');
defaultFuncMap['JseHelper.JseIo.fhTruncate']=new RpcExtendServerCallable(async(fh:tjs.FileHandle,offset:bigint)=>fh.truncate(Number(offset))).typedecl('sl->');
defaultFuncMap['JseHelper.JseIo.stat']=new RpcExtendServerCallable(async(path:string)=>{
    let fileStat=await tjs.stat(path);
    let type='unknown';
    if(fileStat.isFile)type='file';
    if(fileStat.isDirectory)type='dir';
    return [type,BigInt(fileStat.size),BigInt(fileStat.mtim.getTime())];
}).typedecl('s->sll');
defaultFuncMap['JseHelper.JseIo.open']=new RpcExtendServerCallable(async(path:string,flag:string,mode:number)=>{
    //ignore mode, at least now
    return tjs.open(path,flag)
}).typedecl('ssi->o');
defaultFuncMap['JseHelper.JseIo.rmdir']=new RpcExtendServerCallable(async(path:string)=>tjs.remove(path)).typedecl('s->');
defaultFuncMap['JseHelper.JseIo.mkdir']=new RpcExtendServerCallable(async(path:string)=>tjs.makeDir(path,{recursive:true})).typedecl('s->');
defaultFuncMap['JseHelper.JseIo.copyFile']=new RpcExtendServerCallable(async(path:string,newPath:string)=>tjs.copyFile(path,newPath)).typedecl('ss->');
defaultFuncMap['JseHelper.JseIo.readdir']=new RpcExtendServerCallable(async(path:string)=>{
    let ser=new TableSerializer().setColumnsInfo(null,['name','type','size','mtime']);
    for await(let f of await tjs.readDir(path)){
        try{
            let fileStat=await tjs.stat(path+'/'+f.name);
            let type='unknwon';
            if(fileStat.isDirectory)type='dir';
            if(fileStat.isFile)type='file';
            ser.addRow([f.name,type,BigInt(fileStat.size),BigInt(fileStat.mtim.getTime())])
        }catch(e){}
    }
    return ser.build();
}).typedecl('s->b');
defaultFuncMap['JseHelper.JseIo.rm']=new RpcExtendServerCallable(async(path:string)=>tjs.remove(path)).typedecl('s->');
defaultFuncMap['JseHelper.JseIo.execCommand']=new RpcExtendServerCallable(async(command:string)=>{
    let args=[];
    for(let t1=0;t1<command.length;t1++){
        let part='';
        let inQuote=false;
        let ch=command.charAt(t1);
        if(ch=='"'){
            inQuote=!inQuote;
        }else{
            if(ch==' ' && part!=='' && !inQuote){
                args.push(part);
                part='';
            }else{
                part+=ch;
            }
        }
    }
    let proc=tjs.spawn(args,{stdin:'pipe',stdout:'pipe',stderr:'pipe'});
    return proc;
}).typedecl('s->o');
defaultFuncMap['JseHelper.JseIo.processWait']=new RpcExtendServerCallable(async(proc:tjs.Process)=>{
    let exitStat=await proc.wait();
    return exitStat.exit_status;
}).typedecl('o->i');
defaultFuncMap['JseHelper.JseIo.processIsAlive']=new RpcExtendServerCallable(async(proc:tjs.Process)=>{
    throw new Error('Not implemented');
}).typedecl('o->c');
defaultFuncMap['JseHelper.JseIo.processStdio']=new RpcExtendServerCallable(async(proc:tjs.Process,in2:boolean,out2:boolean,err2:boolean)=>{
    return [
        in2?proc.stdin:null,
        out2?proc.stdout:null,
        err2?proc.stderr:null
    ];
}).typedecl('occc->ooo');
defaultFuncMap['JseHelper.JseIo.inputRead']=new RpcExtendServerCallable(async(in2:tjs.Reader,len:number)=>{
    let buf=new Uint8Array(len);
    let readLen=(await in2.read(buf))??0;
    let buf2=new Uint8Array(buf.buffer,0,readLen);
    return buf2;
}).typedecl('oi->b');
defaultFuncMap['JseHelper.JseIo.outputWrite']=new RpcExtendServerCallable(async(out2:tjs.Writer,data:Uint8Array)=>out2.write(data)).typedecl('ob->i');
defaultFuncMap['JseHelper.JseIo.tcpConnect']=new RpcExtendServerCallable(async(host:string,port:number)=>tjs.connect('tcp',host,port)).typedecl('si->o');
defaultFuncMap['JseHelper.JseIo.tcpStreams']=new RpcExtendServerCallable(async(soc:tjs.Connection)=>{
    return [{read:soc.read.bind(soc)},{write:soc.write.bind(soc)}];
}).typedecl('o->oo');
defaultFuncMap['JseHelper.JseIo.tcpListen']=new RpcExtendServerCallable(async(host:string,port:number)=>{
    let listener=await tjs.listen('tcp',host,port);
    return listener;
}).typedecl('si->o');
defaultFuncMap['JseHelper.JseIo.tcpAccept']=new RpcExtendServerCallable(async(serv:tjs.Listener)=>{
    return await serv.accept();
}).typedecl('o->o');
defaultFuncMap['JseHelper.JseIo.platform']=new RpcExtendServerCallable(async()=>{
    return tjs.system.platform;
}).typedecl('->s');
defaultFuncMap['JseHelper.JseIo.getDataDir']=new RpcExtendServerCallable(async()=>{
    return path.join(getWWWRoot().replace(/\\/g,'/'),'..');
}).typedecl('->s');
})();