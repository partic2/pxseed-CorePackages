



exports.npmimport=async function(moduleId){
    useLegacyRequire=false;
    if(!this.useLegacyRequire){
        try{
            let nodeImportName=moduleId;
            let mod;
            mod=await import(nodeImportName);
            return mod;
        }catch(e){
            if(e.code=='MODULE_NOT_FOUND'){
                //mute
            }else{
                console.warn(e);
            }
        }
    }else{
        //For these version NOT support dynamic import.
        try{
            let nodeImportName=moduleId;
            let mod;
            mod=require(nodeImportName);
            return {...mod,default:mod};
        }catch(e){
            if(e.code=='MODULE_NOT_FOUND'){
                //mute
            }else{
                console.warn(e);
            }
        }
    }
    return null;
}

exports.npmrequire=require