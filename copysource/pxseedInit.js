

var __pxseedInit={
    wwwroot:'',
    _entry:null,
    _entryLoaded:false,
    entry:function(path){
        this._entry=path;
        if('require' in globalThis && !this._entryLoaded){
            require([this._entry]);
            _entryLoaded=true;
        }
    },
    onloaded:function(){
        if(this._entry!=null && !this._entryLoaded){
            require([this._entry]);
            _entryLoaded=true;
        }
    }
};
(function(){
    //globalThis polyfill
    try{
        var _=globalThis
    }catch(e){
        new Function('this.globalThis=this')()
    }
    var urlArgs='v=0.0.1';
    var jsentryQuery=globalThis.location.search.match(/__jsentry=([^&]*)/);
    if(jsentryQuery!=null){
        var jsentry=decodeURIComponent(jsentryQuery[1]);
        __pxseedInit.entry(jsentry);
    }
    if(globalThis.document!=undefined && globalThis.window!=undefined){
        //browser
        var jsls = document.scripts;
        var jspath=jsls[jsls.length - 1].src;
        __pxseedInit.wwwroot=jspath.substring(0,jspath.lastIndexOf('/'));
        var script = document.createElement('script');
        script.onload=function(ev){
            require.config({
                baseUrl:__pxseedInit.wwwroot,
                waitSeconds:300,
                urlArgs:urlArgs,
                nodeIdCompat:true  //remove suffix .js
            });
            __pxseedInit.onloaded();   
        }
        script.setAttribute('type','text/javascript');
        script.setAttribute('src',__pxseedInit.wwwroot+'/require.js?'+urlArgs);
        document.getElementsByTagName('head')[0].appendChild(script);
    }else if(typeof globalThis.importScripts=='function' && globalThis.self!=undefined){
        //web worker
        var jspath=globalThis.location.toString();
        __pxseedInit.wwwroot=jspath.substring(0,jspath.lastIndexOf('/'));
        importScripts(__pxseedInit.wwwroot+'/require.js?'+urlArgs);
        require.config({
            baseUrl:__pxseedInit.wwwroot,
            waitSeconds:300,
            urlArgs:urlArgs,
            nodeIdCompat:true  //remove suffix .js
        });
        __pxseedInit.onloaded(); 
    }
    
})();
