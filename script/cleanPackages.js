var path=require('path');
var spawn=require('child_process').spawn

/*
 Add --js flag to also clean all .js/.js.map files in www directory.
*/

async function runCommand(cmd,cwd){
    let process=spawn(cmd,{shell:true,stdio:'inherit',cwd});
    return new Promise((resolve=>{
        process.on('close',resolve);
    }))
};
;(async ()=>{
    console.log('run pxseedBuildScript clean')
    let noderunjs=path.join(path.dirname(__dirname),'www','noderun.js');
    await runCommand(`${process.execPath} ${noderunjs} pxseedBuildScript/build clean `+process.argv.slice(2).join(' '));
})();