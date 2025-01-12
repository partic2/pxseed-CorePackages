

var __pxseedInit={
    wwwroot:'',
    jspath:'',
    _entry:null,
    //Where pxseedInit is loaded. Known value:'window'|'worker'|'service worker'
    env:'',
    //For service worker only.
    serviceWorker:{
        //onfetch with type "(ev:FetchEvent)=>(Promise<Response>|Response|null)" to delegate the fetch event.
        //DON'T call respondWith in "onfetch". Just return Response or Promise<Response> to intercept the fetch.
        onfetch:null,
        //This function MUST be called to tell pxseedInit that modules are ready to process FetchEvent.
        //Fetch event will be blocked and queued until this function called.
        serviceWorkerLoaded:function(){
            if(!this.isServiceWorkerLoaded){
                this.isServiceWorkerLoaded=true;
                this.onServiceWorkerLoaded.forEach(function(fn){fn()});
            }
        },
        //Cache object(https://developer.mozilla.org/en-US/docs/Web/API/Cache) used by pxseedInit
        //Note: this variable may be change multiple times.
        //Other modules should NOT save this variable.
        //Use "serviceWorker.cache" instead.
        cache:null,
        //Fetch from cache or, if not found, from network, and save to cache.
        //Usually used by pxseedInit internally.
        cacheFetch:null,
        //pxseedInit internallly use, to listen the serviceWorkerLoaded event.
        onServiceWorkerLoaded:[],
        //pxseedInit internallly use, to indicate whether the serviceWorkerLoaded has been called.
        isServiceWorkerLoaded:false
    }
};
__pxseedInit.serviceWorker.cacheFetch=function(url){
    var that=this;
    return this.cache.match(url).then(function(matchResult){
        if(matchResult==undefined){
            var respClone
            return fetch(url).then(function(resp){
                respClone=resp.clone()
                return that.cache.put(url,resp);
            }).then(function(){
                return respClone;
            });
        }else{
            return matchResult;
        }
    })
}.bind(__pxseedInit.serviceWorker);

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
        __pxseedInit._entry=jsentry;
    }
    if(globalThis.document!=undefined && globalThis.window!=undefined){
        //browser
        __pxseedInit.env='window'
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
            require([__pxseedInit._entry]);
        }
        script.setAttribute('type','text/javascript');
        script.setAttribute('src',__pxseedInit.wwwroot+'/require.js?'+urlArgs);
        document.getElementsByTagName('head')[0].appendChild(script);
    }else if(typeof globalThis.importScripts=='function' && globalThis.self!=undefined){
        var jspath=globalThis.location.toString();
        __pxseedInit.wwwroot=jspath.substring(0,jspath.lastIndexOf('/'));
        if('registration' in globalThis && 'clients' in globalThis){
            __pxseedInit.env='service worker'
            //service worker
            globalThis.addEventListener('fetch',function(ev){
                if(ev.request.url.substring(__pxseedInit.wwwroot.length)==='/pxseedInit.js/reload'){
                    //Is here any security issues?
                    globalThis.caches.delete(jspath).then(function(){
                        return globalThis.caches.open(jspath)
                    }).then(function(cacheIn){
                        __pxseedInit.serviceWorker.cache=cacheIn
                    });
                    var defined=require.getDefined();
                    for(var modId in defined){
                        require.undef(modId);
                    }
                    __pxseedInit.onfetch=null;
                    ev.respondWith(new Response('ok'));
                }else{
                    if(!__pxseedInit.serviceWorker.isServiceWorkerLoaded){
                        ev.respondWith(new Promise(function(resolve){
                            __pxseedInit.serviceWorker.onServiceWorkerLoaded.push(resolve)
                        }).then(function(){
                            if(__pxseedInit.onfetch===null){
                                return null;
                            }else{
                                return __pxseedInit.onfetch(ev);
                            }
                        }).then(function(resp){
                            if(resp!==null){
                                return resp
                            }else{
                                return fetch(ev.request);
                            }
                        }));
                    }else if(__pxseedInit.onfetch!==null){
                        var resp=__pxseedInit.onfetch(ev);
                        if(resp!==null){
                            ev.respondWith(resp);
                        }
                    }
                }
            });
            globalThis.caches.open(jspath).then(function(cacheIn){
                __pxseedInit.serviceWorker.cache=cacheIn
            }).then(function(){
                return __pxseedInit.serviceWorker.cacheFetch(__pxseedInit.wwwroot+'/require.js')
            }).then((resp)=>{
                return resp.text();
            }).then((respText)=>{
                (new Function(respText))();
                //remove default broken script loader.
                require.config({
                    baseUrl:__pxseedInit.wwwroot,
                    waitSeconds:300,
                    urlArgs:urlArgs,
                    serviceWorkerFetch:__pxseedInit.serviceWorker.cacheFetch
                });
                require([__pxseedInit._entry]);
            });
        }else{
            //web worker
            __pxseedInit.env='worker'
            importScripts(__pxseedInit.wwwroot+'/require.js?'+urlArgs);
            require.config({
                baseUrl:__pxseedInit.wwwroot,
                waitSeconds:300,
                urlArgs:urlArgs,
                nodeIdCompat:true  //remove suffix .js
            });
            require([__pxseedInit._entry]);
        }
    }
    
})();
