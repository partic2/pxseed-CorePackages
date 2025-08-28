var path=require('path');
var spawn=require('child_process').spawn
var fs=require('fs/promises');



async function runCommand(cmd,cwd){
    let process=spawn(cmd,{shell:true,stdio:'inherit',cwd});
    return new Promise((resolve=>{
        process.on('close',resolve);
    }))
};
;(async ()=>{
    let existed=false;
    try{
        await fs.access(path.join(__dirname,'..','www','pxseedBuildScript','build.js'))
        existed=true;
    }catch(e){
        if(e.toString().indexOf('no such file or directory')<0){
            throw e;
        }
    }
    if(!existed){
        await runCommand(`${process.execPath} ${path.join(__dirname,'buildEnviron.js')}`)
    }
    console.log('run pxseedBuildScript')
    let noderunjs=path.join(path.dirname(__dirname),'www','noderun.js');
    await runCommand(`"${process.execPath}" "${noderunjs}" pxseedBuildScript/build`);
})();