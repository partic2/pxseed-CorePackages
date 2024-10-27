var path=require('path');
var spawn=require('child_process').spawn



async function runCommand(cmd,cwd){
    let process=spawn(cmd,{shell:true,stdio:'inherit',cwd});
    return new Promise((resolve=>{
        process.on('close',resolve);
    }))
};
;(async ()=>{
    console.log('run pxseedBuildScript')
    let noderunjs=path.join(path.dirname(__dirname),'www','noderun.js');
    await runCommand(`node ${noderunjs} pxseedBuildScript/build`);
})();