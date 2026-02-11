


import {buildTjs} from 'partic2/tjshelper/tjsbuilder'
import { getWWWRoot } from 'partic2/jsutils1/webutils';
import { assert, requirejs } from 'partic2/jsutils1/base';
import { utf8conv } from 'partic2/CodeRunner/jsutils2';

let __name__=requirejs.getLocalRequireModule(require);

let pathsep=getWWWRoot().includes('\\')?'\\':'/';

export class PxseedLoaderBuilder{
    git='git';
    cmake='cmake'
    pxseedLoaderSource:string|null=null;
    desktopBuildToolchains:Record<string,{CC:string,CXX:string,APPENDENV?:{PATH?:string[],LD_LIBRARY_PATH?:string[]}}>|null=null;
    cmakeGenerator:'Unix Makefiles'|'MinGW Makefiles'|null=null;
    androidBuild:boolean|null=null;
    AndroidHome:string|null=null;
    AndroidNdk:string|null=null;
    androidBuildSdkVersion:number|null=null;
    tjsi:null|typeof tjs=null;
    depsSourceDirs:string|null=null;
    androidAbi=['arm64-v8a','armeabi-v7a']
    skipDepsCheck=false;
    async ensureTjsi(){
        if(this.tjsi==null)this.tjsi=await buildTjs();
        return this.tjsi;
    }
    async whichExec(name:string){
        let tjsi=await this.ensureTjsi();
        let path1=tjsi.env.PATH;
        let pathsSep=path1.includes(';')?';':':';
        let path1List=path1.split(pathsSep);
        let found:string|null=null;
        for(let t1 of path1List){
            try{
                let t2=t1+pathsep+name;
                await tjsi.stat(t2);
                found=t2;
                break;
            }catch(err){};
            try{
                let t2=t1+pathsep+name+'.exe';
                await tjsi.stat(t2);
                found=t2;
                break;
            }catch(err){};
        }
        return found;
    }
    async runCommand(cmd:string[],cwd?:string){
        console.info('run command:\n '+cmd.join(' ')+'\n in '+(cwd??'.'));
        let tjsi=await this.ensureTjsi();
        let proc=await tjsi.spawn(cmd,{stdout:'inherit',stderr:'inherit',cwd});
        let runstat=await proc.wait();
        assert(runstat.exit_status==0,'process exit with code '+runstat.exit_status);
    }
    async listDir(dir:string){
        let tjsi=await this.ensureTjsi();
        let children=new Array<{path:string,name:string,type:'dir'|'file'}>();
        let iter=await tjsi.readDir(dir);
        for await(let ch of iter){
            children.push({name:ch.name,path:[dir,ch.name].join(pathsep),type:ch.isDirectory?'dir':'file'});
        }
        return children;
    }
    dirname(path:string){
        return path.split(/[\\\/]/g).slice(0,-1).join(pathsep);
    }
    async copyFilesNewer(destDir:string,srcDir:string,ignore?:(name:string,path:string)=>boolean,maxDepth?:number){
        let tjsi=await this.ensureTjsi();
        if(maxDepth==undefined){
            maxDepth=30;
        }
        if(maxDepth==0){
            return;
        }
        await tjsi.makeDir(destDir,{recursive:true});
        let children=await this.listDir(srcDir);
        try{
            await tjsi.stat(destDir)
        }catch(e){
            await tjsi.makeDir(destDir,{recursive:true});
        }
        for(let t1 of children){
            if(ignore!=undefined && ignore(t1.name,srcDir+'/'+t1.name)){
                continue;
            }
            if(t1.type=='dir'){
                await this.copyFilesNewer([destDir,t1.name].join(pathsep),[srcDir,t1.name].join(pathsep),ignore,maxDepth-1);
            }else{
                let dest=[destDir,t1.name].join(pathsep);
                let src=[srcDir,t1.name].join(pathsep);
                let needCopy=false;
                try{
                    let dfile=await tjsi.stat(dest);
                    let sfile2=await tjsi.stat(src);
                    if(dfile.mtim.getTime()<sfile2.mtim.getTime()){
                        needCopy=true;
                    }
                }catch(e){
                    needCopy=true;
                }
                if(needCopy){
                    await tjsi.makeDir(this.dirname(dest),{recursive:true});
                    await tjsi.copyFile(src,dest);
                }
            }
        }
    }
    async build(){
        let tjsi=await this.ensureTjsi();
        if(this.pxseedLoaderSource===null){
            this.pxseedLoaderSource=[getWWWRoot(),...__name__.split('/'),'pxseedloadersource'].join(pathsep);
            console.info(`pxseed loader source not defined, use ${this.pxseedLoaderSource}`)
        }
        try{
            await tjsi.stat(this.pxseedLoaderSource);
        }catch(err){
            console.info('No source found, clone from remote.');
            await tjsi.makeDir(this.pxseedLoaderSource,{recursive:true});
            await this.runCommand([this.git,'clone','--depth=1','https://gitee.com/partic/xplatj2.git',this.pxseedLoaderSource])
        }
        await this.initializeEnviron();
        if(this.androidBuild)await this.buildAndroidRelease();
        await this.buildDesktopRelease();
    }
    protected async detectCmakeGenerator(){
        if(this.tjsi!.system.platform=='linux'){
            this.cmakeGenerator='Unix Makefiles'
        }else if(this.tjsi!.system.platform=='windows'){
            this.cmakeGenerator='MinGW Makefiles';
        }else{
            let make=await this.whichExec('make');
            if(make!==null){
                this.cmakeGenerator='Unix Makefiles'
            }
            if(make==null){
                make=await this.whichExec('mingw32-make');
                if(make!==null){
                    this.cmakeGenerator='MinGW Makefiles'
                }
            }
        }
    }
    async pullDeps(dir:string){
        let tjsi=await this.ensureTjsi();
        try{
            await tjsi.stat([dir,'deps','pull_deps.py'].join(pathsep));
            let pullList=new Array<{name:string,url:string,branch:string}>();
            let pullStats=utf8conv(await tjsi.readFile([dir,'deps','pull_deps.py'].join(pathsep))).match(/pull\(.+\)/g)!.slice(1);
            pullStats.forEach(t1=>new Function('pull',t1)((name:string,url:string,branch:string)=>pullList.push({name,url,branch})))
            for(let t1 of pullList){
                let targetDir=[this.depsSourceDirs,t1.name].join(pathsep);
                let existed=false;
                try{
                    await tjsi.stat(targetDir);
                    existed=true;
                }catch(err){}
                if(existed){
                    await this.runCommand([this.git,'-C',targetDir,'pull','--rebase']);
                }else{
                    await this.runCommand([this.git,'clone',t1.url,'-b',t1.branch,'--depth=1',targetDir]);
                }
                await this.pullDeps(targetDir);
            }
        }catch(err){};
    }
    async initializeEnviron(){
        let tjsi=await this.ensureTjsi();
        if(this.cmakeGenerator==null){
            this.detectCmakeGenerator();
        }
        if(this.depsSourceDirs==null){
            this.depsSourceDirs=tjsi.env.DEPS_SOURCE_DIRS;
        }
        if(this.depsSourceDirs==null || this.depsSourceDirs==''){
            this.depsSourceDirs=[this.pxseedLoaderSource,'deps'].join(pathsep);
        }
        if(this.depsSourceDirs!=tjsi.env.DEPS_SOURCE_DIRS){
            tjsi.env.DEPS_SOURCE_DIRS=this.depsSourceDirs;
        }
        if(this.androidBuild==null){
            if(this.AndroidHome==null){
                this.AndroidHome=tjsi.env.ANDROID_HOME;
            }
            this.androidBuild=this.AndroidHome!=null;
        }
        if(this.androidBuild && this.AndroidNdk==null){
            let ndksDir=[this.AndroidHome,'ndk'].join(pathsep);
            for(let t1 of await this.listDir(ndksDir)){
                try{
                    await tjsi.stat([t1.path,'build','cmake','android.toolchain.cmake'].join(pathsep));
                    this.AndroidNdk=t1.path;
                    break;
                }catch(err){};
            }
            assert(this.AndroidNdk!=null,'ANDROID NDK not found.Install it first');
            if(this.androidBuildSdkVersion==null){
                let buildGradle=new TextDecoder().decode(await tjsi.readFile(this.pxseedLoaderSource+'/android-project/build.gradle'));
                let foundMinSdkVersion=buildGradle.match(/minSdkVersion\s*(\d+)/);
                if(foundMinSdkVersion==null){
                    this.androidBuildSdkVersion=21;
                }else{
                    this.androidBuildSdkVersion=Number(foundMinSdkVersion[1]);
                }
            }
        }
        if(this.desktopBuildToolchains==null){
            this.desktopBuildToolchains={};
            if(tjsi.env.CC!=null && tjsi.env.CC!='' && tjsi.env.CXX!=null && tjsi.env.CXX!=''){
                this.desktopBuildToolchains.hostToolchain={CC:tjsi.env.CC,CXX:tjsi.env.CXX}
            }
        }
        if(!this.skipDepsCheck){
            await this.pullDeps(this.pxseedLoaderSource!);
        }
    }
    async buildAndroidRelease(){
        let tjsi=await this.ensureTjsi();
        for(let currAbi of this.androidAbi){
            let flags=[this.cmake]
            flags.push(`-DANDROID_NATIVE_API_LEVEL=${this.androidBuildSdkVersion}`)
            flags.push(`-DCMAKE_TOOLCHAIN_FILE=${this.AndroidNdk!}/build/cmake/android.toolchain.cmake`);
            flags.push('-DCMAKE_BUILD_TYPE=RELEASE');
            flags.push(`-DANDROID_ABI=${currAbi}`)
            flags.push('-G',`${this.cmakeGenerator}`);
            flags.push('-S',this.pxseedLoaderSource+'/launcher');
            let builddir=[this.pxseedLoaderSource,'launcher','build','android',currAbi].join(pathsep);
            flags.push('-B',builddir);
            await this.runCommand(flags);
            await this.runCommand([this.cmake,'--build',builddir]);
            let jniDir=this.pxseedLoaderSource+'/android-project/src/main/jniLibs/'+currAbi;
            await tjsi.makeDir(jniDir,{recursive:true});
            let sodir=this.pxseedLoaderSource+'/launcher/build/android/'+currAbi+'/build-sdl'
            for(let sofile of await this.listDir(sodir)){
                if(sofile.name.endsWith('.so')){
                    try{
                        await tjsi.copyFile(sofile.path,jniDir+'/'+sofile.name);
                    }catch(err){};
                }
            }
            await tjsi.copyFile(builddir+'/build-pxprpc_rtbridge/libpxprpc_rtbridge.so',jniDir+'/libpxprpc_rtbridge.so');
            try{
                await this.copyFilesNewer(this.pxseedLoaderSource+'/android-project/src/main/assets/res/tjs-initialize',builddir+'/build-txiki.js/tjs-initialize')
            }catch(err){}
        }
        await this.runCommand([this.pxseedLoaderSource+'/android-project/gradlew','assembleRelease'],[this.pxseedLoaderSource,'android-project'].join(pathsep));
        await tjsi.copyFile(this.pxseedLoaderSource+'/android-project/build/outputs/apk/release/xplatj-release.apk',this.pxseedLoaderSource+'/launcher/build/pxseedloader-release.apk')
    }
    async buildDesktopRelease(){
        let tjsi=await this.ensureTjsi();
        let pathssep=tjsi.system.platform==='windows'?';':':';
        for(let [name,buildToolchain] of Object.entries(this.desktopBuildToolchains!)){
            let savedenv:Record<string,string>={};
            if(buildToolchain.APPENDENV!=undefined){
                savedenv.PATH=tjsi.env.PATH;
                savedenv.LD_LIBRARY_PATH=tjsi.env.LD_LIBRARY_PATH;
                if(buildToolchain.APPENDENV.PATH!=undefined){
                    tjsi.env.PATH=[...buildToolchain.APPENDENV.PATH,tjsi.env.PATH,].join(pathssep);
                }
                if(buildToolchain.APPENDENV.LD_LIBRARY_PATH!=undefined){
                    tjsi.env.LD_LIBRARY_PATH=[...buildToolchain.APPENDENV.LD_LIBRARY_PATH,tjsi.env.PATH,].join(pathssep);
                }
            }
            try{
                let flags=[this.cmake];
                flags.push('-DCMAKE_BUILD_TYPE=RELEASE')
                flags.push(`-DCMAKE_C_COMPILER=${buildToolchain.CC}`);
                flags.push(`-DCMAKE_CXX_COMPILER=${buildToolchain.CXX}`);
                flags.push('-DXPLATJ_GUESS_TOOLCHAIN_VARIABLE=ON')
                flags.push('-S',this.pxseedLoaderSource+'/launcher')
                flags.push('-G',`${this.cmakeGenerator}`)
                let builddir=[this.pxseedLoaderSource,'launcher','build',name].join(pathsep);
                flags.push('-B',builddir);
                await this.runCommand(flags);
                await this.runCommand([this.cmake,'--build',builddir]);
                let outdir=this.pxseedLoaderSource+'/launcher/build/'+name+'_release'
                await tjsi.makeDir(outdir,{recursive:true});
                let copyFiles=['launcher','launcher.exe','build-sdl/SDL3.dll','build-sdl/libSDL3.so',
                   'build-pxprpc_rtbridge/libpxprpc_rtbridge.dll','build-pxprpc_rtbridge/libpxprpc_rtbridge.so']
                for(let t1 of copyFiles){
                    let filename=t1.split(/[\\\/]/g).at(-1);
                    try{
                        await tjsi.copyFile(builddir+'/'+t1,outdir+'/'+filename);
                    }catch(err){};
                }
                await this.copyFilesNewer(outdir,this.pxseedLoaderSource+'/commonj/src/main/assets')
                await this.copyFilesNewer(outdir+'/res/tjs-initialize',builddir+'/build-txiki.js/tjs-initialize');
                
            }finally{
                if(buildToolchain.APPENDENV!=undefined){
                    tjsi.env.PATH=savedenv.PATH;
                    tjsi.env.LD_LIBRARY_PATH=savedenv.LD_LIBRARY_PATH;
                }
            }
        }
    }
}

export async function defaultBuild(configFile?:string){
    console.info('prepare default build.');
    try{
        let buildConfig=new PxseedLoaderBuilder();
        let tjsi=await buildTjs();
        if(tjsi.env.PXSEEDLOADER_SOURCE_DIR!=null && tjsi.env.PXSEEDLOADER_SOURCE_DIR!=''){
            buildConfig.pxseedLoaderSource=tjsi.env.PXSEEDLOADER_SOURCE_DIR;
        }
        let configJs='';
        if(configFile!=undefined){
            configJs=new TextDecoder().decode(await tjsi.readFile(configFile));
            
        }else{
            try{
                configJs=new TextDecoder().decode(await tjsi.readFile(buildConfig.pxseedLoaderSource+'/launcher/build_config.txt'));
            }catch(err){};
        }
        if(configJs!='')new Function('c',configJs)(buildConfig);
        await buildConfig.build()
    }catch(err:any){
        console.error(err.message+'\n'+err.stack);
    }
}
