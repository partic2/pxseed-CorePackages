


let fs=require('fs/promises');

let path=require('path')

let process=require('process')

let workerThreads=require('worker_threads')
const { constants } = require('fs');

//To avoid unnecessary fetch error. Maybe customize fetch is better
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"

//prevent unexpected exit
process.on('uncaughtException', (error) => {
    console.error('uncaughtException', error);
});


let nodeRequire=require
class NodeScriptLoader{
    currentDefiningModule=null
    npmresolver=null
    async loadModuleAsync(moduleId,url){
        try{
            let filename=await fs.realpath(url);
            await fs.access(filename,constants.R_OK);
            if(filename in require.cache){
                delete require.cache[filename];
            }
            this.currentDefiningModule=moduleId;
            nodeRequire(filename);
            this.currentDefiningModule=null;
            return null;
        }catch(e){
            if(e.code!=='ENOENT'){
                throw e;
            }
        }
        if(this.npmresolver!==false){
            if(this.npmresolver===null){
                try{
                    this.npmresolver=nodeRequire('../npmdeps/npmmoduleresolver').npmimport
                }catch(err){
                    this.npmresolver=false;
                }
            }
            if(this.npmresolver!==false){
                let mod=await this.npmresolver(moduleId);
                if(mod!=null){
                    define(moduleId,[],mod);
                    return
                }
            }
        }
        return new Error('NodeScriptLoader:Cannot find module '+moduleId);
    }
    loadModule(moduleId,url,done){
        this.loadModuleAsync(moduleId,url).then((r)=>done(r)).catch((err)=>done(err));
    }
    getDefiningModule(){
        return this.currentDefiningModule
    }
}



exports.main=async (entry)=>{
    //require('inspector').open(9229,'127.0.0.1',true);
    let content=await fs.readFile(__dirname+'/require.js',{ encoding: 'utf8' })
    let exportsScript=';globalThis.require=require;globalThis.define=define;globalThis.requirejs=requirejs;';
    new Function(content+exportsScript)();
    requirejs.__nodeenv={require:nodeRequire}
    requirejs.config({
        baseUrl:__dirname,
        waitSeconds:30,
        nodeIdCompat:true  //remove suffix .js
    });
    let nodeLoader=new NodeScriptLoader();
    try{
        await import('os')
    }catch(e){
        nodeLoader.useLegacyRequire=true;
    }
    define.amd.scriptLoaders.push(nodeLoader);
    //XXX: UMD module may incorrectly use AMD "define" in node module loading,
    //So we hook the node loader and delete "define" temporarily when load module in "(npmdeps)/node_modules" directory.
    //Maybe we can find better solution?
    let module=require('module')
    let jsloader=module._extensions['.js'];
    module._extensions['.js']=function(module,filename){
        if(filename.startsWith(__dirname+path.sep+'node_modules')||filename.startsWith([path.dirname(__dirname),'npmdeps','node_modules'].join(path.sep))){
            let savedDefine=global.define;
            try{
                delete global.define
                return jsloader(module,filename);
            }catch(e){
                console.error(e);
                throw(e);
            }finally{
                global.define=savedDefine
            }
        }else{
            return jsloader(module,filename);
        }
    }
    globalThis.require([entry],(ent)=>{})
};

if(workerThreads.isMainThread){
    if(require.main===module){
        exports.main(process.argv[2]);
    }
}else{
    exports.main(workerThreads.workerData.entryModule);
}
