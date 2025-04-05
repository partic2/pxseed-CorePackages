#!/usr/bin/env node


(async ()=>{
    if(globalThis.process?.versions?.node!=undefined){
        const process=await import('process')
        let pxseedHome=process.env['PXSEED_HOME'];
        const os=await import('os');
        const path=await import('path');
        const fs=await import('fs/promises');
        if(pxseedHome==undefined || pxseedHome==''){
            pxseedHome=path.join(os.homedir(),'.pxseed');
            console.warn(`Environment variable "PXSEED_HOME" is not specified, use ${pxseedHome} as PXSEED_HOME`);
            process.env['PXSEED_HOME']=pxseedHome;
        }
        async function fileExisted(path2:string){
            try{
                await fs.access(path2);
                return true;
            }catch(err:any){
                if(err.name='ENOENT'){
                    return false;
                }else{
                    throw err;
                }
            }
        }
        const child_process=await import('child_process');
        async function runCommand(cmd:string,cwd?:string){
            let proc=child_process.spawn(cmd,{shell:true,stdio:'inherit',cwd});
            return new Promise<number|null>((resolve=>{
                proc.on('close',resolve);
            }));
        }
        async function runCommand2(argv:string[],cwd?:string){
            let proc=child_process.spawn(argv[0],argv.slice(1),{stdio:'inherit',cwd});
            return new Promise<number|null>((resolve=>{
                proc.on('close',resolve);
            }));
        }
        if(!await fileExisted(path.join(pxseedHome,'script','buildAndRun.js'))){
            await fs.mkdir(pxseedHome,{recursive:true});
            console.info(`pxseed CorePackge don't setup yet. Using "git" to fetch it.`);
            //Should we change to use isomorphic-git to avoid "git" dependencies?
            console.info(`git clone https://gitee.com/partic/pxseed-CorePackages.git ${pxseedHome}`)
            let r=await runCommand(`git clone https://gitee.com/partic/pxseed-CorePackages.git ${pxseedHome}`);
            if(r!=0){
                console.info('fetch failed, abort.')
                process.exit(1);
            }
        }
        if(!await fileExisted(path.join(pxseedHome,'www','pxseedServer2023','nodecli.js'))){
            console.info("builod pxseed...");
            await runCommand2([process.execPath,path.join(pxseedHome,'script','buildEnviron.js')]);
            await runCommand2([process.execPath,path.join(pxseedHome,'script','buildPackages.js')]);
        }
        {
            let r=await runCommand2([process.execPath,
                path.join(pxseedHome,'www','noderun.js'),'pxseedServer2023/nodecli',...process.argv.slice(2)]);
            process.exit(r);
        }
    }else{
        throw new Error('Only support node envrionment.')
    }
})();
