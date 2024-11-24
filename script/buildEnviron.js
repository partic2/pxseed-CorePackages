var fs=require('fs/promises')
var path=require('path')
var spawn=require('child_process').spawn


async function runCommand(cmd,cwd){
    let process=spawn(cmd,{shell:true,stdio:'inherit',cwd});
    return new Promise((resolve=>{
        process.on('close',resolve);
    }))
}

async function updateFileIfNewer(sdir,ddir){
    try{
        await fs.mkdir(ddir,{recursive:true});
    }catch(e){
    };
    for(let sfile of await fs.readdir(sdir,{withFileTypes:true})){
        let spath=path.join(sdir,sfile.name);
        let dpath=path.join(ddir,spath.substring(sdir.length+1))
        if(sfile.isFile()){
            let needCopy=false;
            try{
                let dfile=await fs.stat(dpath);
                let sfile2=await fs.stat(spath);
                if(dfile.mtimeMs<sfile2.mtimeMs){
                    needCopy=true;
                }
            }catch(e){
                needCopy=true;
            }
            if(needCopy){
                console.log(`copy ${spath} to ${dpath}...`);
                await fs.copyFile(spath,dpath);
            }
        }else if(sfile.isDirectory()){
            await updateFileIfNewer(spath,dpath);
        }
    }
}

;(async()=>{
    //copy static
    let copysource=path.join(path.dirname(__dirname),'copysource')
    await updateFileIfNewer(copysource,path.join(path.dirname(__dirname),'www'))
    try{
        await fs.access(path.join(path.dirname(__dirname),'npmdeps','package.json'));
    }catch(e){
        await fs.copyFile(path.join(path.dirname(__dirname),'npmdeps','package.1.json'),path.join(path.dirname(__dirname),'npmdeps','package.json'))
    }
    //npm i
    await runCommand('npm i',path.join(path.dirname(__dirname),'npmdeps'))
    let inited=true;
    try{
        console.log('check www/node_modules...')
        let wwwModule=await fs.lstat(path.join(path.dirname(__dirname),'www','node_modules'));    
        if(!wwwModule.isSymbolicLink()){
            throw new Error('TODO: copy mode');
        }
    }catch(e){
        if(e.toString().indexOf('no such file or directory')<0){
            throw e;
        }
        inited=false;
    }
    if(!inited){
        inited=true;
        console.log('create symbol link...')
        try{
            await fs.mkdir(path.join(path.dirname(__dirname),'www'),{recursive:true});
            await fs.symlink(path.join(path.dirname(__dirname),'npmdeps','node_modules'),
                path.join(path.dirname(__dirname),'www','node_modules'),
                'dir');
        }catch(e){
            console.log('failed,' +e.toString()+'fallback copy mode.')
            inited=false;
        }
    }
    if(!inited){
        inited=true;
        console.log('create directory...')
        await fs.mkdir(path.join(path.dirname(__dirname),'www','node_modules'),{recursive:true});
        throw new Error('TODO: copy mode');
    }
    let buildProj=path.join(path.dirname(__dirname),'source','pxseedBuildScript')
    let tscPath=path.join(path.dirname(__dirname),'www','node_modules','typescript','bin','tsc');
    await runCommand(`${process.execPath} "${tscPath}" -p "${buildProj}"`)
})()