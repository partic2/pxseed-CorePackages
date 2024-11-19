
import {RpcExtendServerCallable, defaultFuncMap, TableSerializer} from 'pxprpc/extend'

import * as fs from 'fs/promises'
import * as os from 'os'
import * as fse from 'fs-extra'
import * as net from 'net'
import {sep} from 'path'
import {ChildProcessWithoutNullStreams, spawn} from 'child_process'
import {Readable,Writable} from 'stream'
import { wrapReadable } from 'partic2/nodehelper/nodeio'
import { dirname } from 'path'


class JseStreamWrap{
    constructor(public r?:Readable,public w?:Writable){};
    tjsRead(){
        return wrapReadable(this.r!);
    }
    close(){
        if(this.r!=undefined)this.r.destroy();
        if(this.w!=undefined)this.w?.destroy();
    }
}

export function setup(){
defaultFuncMap['JseHelper.JseIo.realpath']=new RpcExtendServerCallable(async(path:string)=>fs.realpath(path)).typedecl('s->s');
defaultFuncMap['JseHelper.JseIo.unlink']=new RpcExtendServerCallable(async(path:string)=>fs.unlink(path)).typedecl('s->');
defaultFuncMap['JseHelper.JseIo.rename']=new RpcExtendServerCallable(async(path:string,newPath:string)=>fs.rename(path,newPath)).typedecl('ss->');
defaultFuncMap['JseHelper.JseIo.mkstemp']=new RpcExtendServerCallable(async(template:string)=>{
    //simple implement, not correctly
    let prefix="";
    for(let i=template.length;i>=0;i--){
        if(template.charAt(i)!='X'){
            prefix=template.substring(0,i);
            break;
        }
    }
    let tmppath=os.tmpdir()+fs.mkdtemp(prefix);
    let fh=await fs.open(tmppath);
    return [fh,tmppath]
}).typedecl('s->os');
defaultFuncMap['JseHelper.JseIo.fhRead']=new RpcExtendServerCallable(async(fh:fs.FileHandle,offset:bigint,len:number)=>{
    let buf=Buffer.alloc(len);
    let readResult=await fh.read(buf,0,len,Number(offset))
    return new Uint8Array(buf.buffer,0,readResult.bytesRead);
}).typedecl('oli->b');

defaultFuncMap['JseHelper.JseIo.fhWrite']=new RpcExtendServerCallable(async(fh:fs.FileHandle,offset:bigint,buf:Uint8Array)=>{
    let writeResult=await fh.write(buf,0,buf.byteLength,Number(offset));
    return writeResult.bytesWritten
}).typedecl('olb->i');

defaultFuncMap['JseHelper.JseIo.fhClose']=new RpcExtendServerCallable(async(fh:fs.FileHandle)=>fh.close()).typedecl('o->');
defaultFuncMap['JseHelper.JseIo.fhTruncate']=new RpcExtendServerCallable(async(fh:fs.FileHandle,offset:bigint)=>fh.truncate(Number(offset))).typedecl('sl->');
defaultFuncMap['JseHelper.JseIo.stat']=new RpcExtendServerCallable(async(path:string)=>{
    let fileStat=await fs.stat(path);
    let type='unknown';
    if(fileStat.isFile())type='file';
    if(fileStat.isDirectory())type='dir';
    return [type,BigInt(fileStat.size),BigInt(fileStat.mtime.getTime())];
}).typedecl('s->sll');
defaultFuncMap['JseHelper.JseIo.open']=new RpcExtendServerCallable(async(path:string,flag:string,mode:number)=>{
    //ignore mode
    return fs.open(path,flag)
}).typedecl('ssi->o');
defaultFuncMap['JseHelper.JseIo.rmdir']=new RpcExtendServerCallable(async(path:string)=>fs.rmdir(path)).typedecl('s->');
defaultFuncMap['JseHelper.JseIo.mkdir']=new RpcExtendServerCallable(async(path:string)=>fs.mkdir(path,{recursive:true})).typedecl('s->');
defaultFuncMap['JseHelper.JseIo.copyFile']=new RpcExtendServerCallable(async(path:string,newPath:string)=>fse.copy(path,newPath,{overwrite:true})).typedecl('ss->');
defaultFuncMap['JseHelper.JseIo.readdir']=new RpcExtendServerCallable(async(path:string)=>{
    let ser=new TableSerializer().setColumnInfo(null,['name','type','size','mtime']);
    for(let f of await fs.readdir(path)){
        try{
            let fileStat=await fs.stat(path+sep+f);
            let type='unknwon';
            if(fileStat.isDirectory())type='dir';
            if(fileStat.isFile())type='file';
            ser.addRow([f,type,BigInt(fileStat.size),BigInt(fileStat.mtime.getTime())])
        }catch(e){}
    }
    return ser.build();
}).typedecl('s->b');
defaultFuncMap['JseHelper.JseIo.rm']=new RpcExtendServerCallable(async(path:string)=>fse.remove(path)).typedecl('s->');
defaultFuncMap['JseHelper.JseIo.execCommand']=new RpcExtendServerCallable(async(command:string)=>{
    let proc=spawn(command,{
        stdio:'pipe',shell:true
    });
    return proc;
}).typedecl('s->o');
defaultFuncMap['JseHelper.JseIo.processWait']=new RpcExtendServerCallable(async(proc:ChildProcessWithoutNullStreams)=>{
    if(proc.exitCode!==null){
        return proc.exitCode;
    }else{
        return await new Promise((resolve)=>{
            proc.once('exit',(code)=>resolve(code))
        })
    }
}).typedecl('o->i');
defaultFuncMap['JseHelper.JseIo.processIsAlive']=new RpcExtendServerCallable(async(proc:ChildProcessWithoutNullStreams)=>{
    return proc.exitCode==undefined;
}).typedecl('o->c');
defaultFuncMap['JseHelper.JseIo.processStdio']=new RpcExtendServerCallable(async(proc:ChildProcessWithoutNullStreams,in2:boolean,out2:boolean,err2:boolean)=>{
    return [
        in2?new JseStreamWrap(undefined,proc.stdin):null,
        out2?new JseStreamWrap(proc.stdout):null,
        err2?new JseStreamWrap(proc.stdout):new JseStreamWrap(proc.stderr)
    ];
}).typedecl('occc->ooo');
defaultFuncMap['JseHelper.JseIo.inputRead']=new RpcExtendServerCallable(async(in2:JseStreamWrap,len:number)=>{
    let buf=new Uint8Array(len);
    let readLen=await in2.tjsRead().read(buf,0);
    if(readLen==null){
        return new Uint8Array(0);
    }
    let buf2=new Uint8Array(buf.buffer,buf.byteOffset,readLen);
    return buf2;
}).typedecl('oi->b');
defaultFuncMap['JseHelper.JseIo.outputWrite']=new RpcExtendServerCallable(async(out2:JseStreamWrap,data:Uint8Array)=>{
    return await new Promise<number>((resolve,reject)=>{
        out2.w!.write(Buffer.from(data),(err)=>{
            if(err===null){
                resolve(data.byteLength);
            }else{
                reject(err);
            }
        });
    })
}).typedecl('ob->i');
defaultFuncMap['JseHelper.JseIo.tcpConnect']=new RpcExtendServerCallable(async(host:string,port:number)=>{
    return await new Promise<net.Socket>((resolve,reject)=>{
        let socket=net.connect(port,host);
        socket.once('connect',()=>resolve(socket));
        socket.once('error',(e)=>reject(e))
        socket.once('timeout',()=>reject('connect timeout'));
    });
}).typedecl('si->o');
defaultFuncMap['JseHelper.JseIo.tcpStreams']=new RpcExtendServerCallable(async(soc:net.Socket)=>{
    return [new JseStreamWrap(soc),new JseStreamWrap(undefined,soc)];
}).typedecl('o->oo');
defaultFuncMap['JseHelper.JseIo.tcpListen']=new RpcExtendServerCallable(async(host:string,port:number)=>{
    return await new Promise<net.Server>((resolve,reject)=>{
        let serv=net.createServer()
        serv.once('error',(e)=>reject(e));
        serv.once('listening',()=>resolve(serv));
        serv.listen(port,host,8);
    });
}).typedecl('si->o');
defaultFuncMap['JseHelper.JseIo.tcpAccept']=new RpcExtendServerCallable(async(serv:net.Server)=>{
    return await new Promise<net.Socket>((resolve,reject)=>{
        serv.once('connection',(soc)=>resolve(soc))
    });
}).typedecl('o->o');
defaultFuncMap['JseHelper.JseIo.platform']=new RpcExtendServerCallable(async(serv:net.Server)=>{
    let platform=os.platform()
    if(platform=='win32')return 'windows';
    return platform;
}).typedecl('->s');
defaultFuncMap['JseHelper.JseIo.getDataDir']=new RpcExtendServerCallable(async()=>{
    //use the dirname(.../www)
    return dirname(dirname(dirname(dirname(__filename))))
}).typedecl('->s');
}
