
addEventListener('unhandledrejection',function(ev){
    console.error(ev.reason);
    ev.preventDefault();
});
addEventListener('error',function(ev){
    console.error(ev.reason);
    ev.preventDefault();
});


async function readFile(filename,opt){
    let fh=await tjs.open(filename,'r');
    try{
        let jsbuffer=await tjs.readFile(filename);
        if(opt==undefined || opt.encoding==undefined){
            return jsbuffer;
        }else{
            return new TextDecoder().decode(jsbuffer);
        }
    }finally{
        await fh.close();
    }
}


class TxikiScriptLoader{
    currentDefiningModule=null
    async loadModuleAsync(moduleId,url){
        try{
            let jss=await readFile(url,{ encoding: 'utf8' });
            this.currentDefiningModule=moduleId
            new Function(jss)();
            this.currentDefiningModule=null;
            return null;
        }catch(e){
            if(e.code!=='ENOENT'){
                throw e;
            }
        }
        try{
            let nodeImportName=moduleId;
            let mod;
            mod=await import(nodeImportName);
            define(moduleId,[],mod)
            return null;
        }catch(e){
            if(e.message.indexOf('Cannot find module')>=0){
                //mute
            }else{
                console.warn(e);
            }
        }
        return new Error('TxikiScriptLoader:Cannot find module '+moduleId);
    }
    loadModule(moduleId,url,done){
        this.loadModuleAsync(moduleId,url).then((r)=>done(r)).catch((err)=>done(err));
    }
    getDefiningModule(){
        return this.currentDefiningModule
    }
}

let __dirname=import.meta.dirname

export const main=async (entry)=>{
    let content=await readFile(__dirname+'/require.js',{ encoding: 'utf8' })
    let exportsScript=';globalThis.require=require;globalThis.define=define;globalThis.requirejs=requirejs;';
    new Function(content+exportsScript)();
    requirejs.config({
        baseUrl:__dirname,
        waitSeconds:30,
        nodeIdCompat:true  //remove suffix .js
    });
    define.amd.scriptLoaders.push(new TxikiScriptLoader());
    globalThis.require([entry],(ent)=>{});
};

if(tjs.args[2].endsWith('txikirun.js')){
    main(tjs.args[3]);
}