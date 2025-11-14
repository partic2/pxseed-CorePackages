(function (undefined) {
    //globalThis polyfill
    try {
        var _ = globalThis;
    }
    catch (e) {
        new Function('this.globalThis=this')();
    }
    var scriptLoaders = [];
    var config1 = {
        baseUrl: './',
        serviceWorkerFetch: globalThis.fetch
    };
    function panic(message) {
        if (!config1.IAMDEE_PRODUCTION_BUILD) {
            throw Error('[IAMDEE ERROR]:' + message);
        }
    }
    var HTMLTagScriptLoader = /** @class */ (function () {
        function HTMLTagScriptLoader() {
        }
        HTMLTagScriptLoader.prototype.loadModule = function (moduleId, url, done) {
            // Adding new script to the browser. Since it is inserted
            // dynamically it will be "async" by default
            var el = document.createElement("script");
            el.setAttribute('_amd_moduleId', moduleId);
            el.async = true;
            el.src = url;
            el.onerror = function (err) {
                done(new Error('HTML script node load failed.'));
            };
            el.onload = function () {
                done(null);
            };
            document.head.appendChild(el);
        };
        HTMLTagScriptLoader.prototype.getDefiningModule = function () {
            if (document.currentScript != null) {
                return document.currentScript.getAttribute('_amd_moduleId');
            }
            return null;
        };
        return HTMLTagScriptLoader;
    }());
    var ImportScriptsScriptLoader = /** @class */ (function () {
        function ImportScriptsScriptLoader() {
            this.currentDefining = null;
        }
        ImportScriptsScriptLoader.prototype.loadModule = function (moduleId, url, done) {
            this.currentDefining = moduleId;
            try {
                globalThis.importScripts(url);
                done(null);
            }
            catch (e) {
                done(e);
            }
            finally {
                this.currentDefining = null;
            }
        };
        ImportScriptsScriptLoader.prototype.getDefiningModule = function () {
            return this.currentDefining;
        };
        return ImportScriptsScriptLoader;
    }());
    var ServiceWorkerScriptLoader = /** @class */ (function () {
        function ServiceWorkerScriptLoader() {
            this.currentDefining = null;
        }
        ServiceWorkerScriptLoader.prototype.loadModule = function (moduleId, url, done) {
            var that = this;
            var resp0;
            config1.serviceWorkerFetch(url).then(function (resp) {
                resp0 = resp;
                return resp.text();
            }).then(function (respText) {
                if (!resp0.ok) {
                    throw new Error('fetch respond with ' + resp0.status);
                }
                that.currentDefining = moduleId;
                try {
                    (new Function(respText))();
                    done(null);
                }
                finally {
                    that.currentDefining = null;
                }
            }).catch(function (err) {
                done(err);
            });
        };
        ServiceWorkerScriptLoader.prototype.getDefiningModule = function () {
            return this.currentDefining;
        };
        return ServiceWorkerScriptLoader;
    }());
    if (globalThis.window != undefined && globalThis.document != undefined) {
        scriptLoaders.push(new HTMLTagScriptLoader());
    }
    else if (globalThis.self != undefined && typeof (globalThis.importScripts) == 'function') {
        if ('registration' in globalThis && 'clients' in globalThis) {
            //service worker
            scriptLoaders.push(new ServiceWorkerScriptLoader());
        }
        else {
            scriptLoaders.push(new ImportScriptsScriptLoader());
        }
    }
    var moduleMap = {};
    function noop() { }
    function isAnonymousDefine(args) {
        return typeof args[0] != "string";
    }
    function isAnonymousDefineWithDependencies(args) {
        return Array.isArray(args[0]);
    }
    function isNamedDefineWithDependencies(args) {
        return Array.isArray(args[1]);
    }
    function config(conf) {
        for (var k in conf) {
            config1[k] = conf[k];
        }
        if (config1.baseUrl == undefined)
            config1.baseUrl = './';
        if (config1.IAMDEE_PRODUCTION_BUILD == undefined)
            config1.IAMDEE_PRODUCTION_BUILD = false;
    }
    function resolveModule(id, module) {
        var currentModule = moduleMap[id];
        if (!currentModule) {
            return panic("Trying to resolve non-existing module");
        }
        if (currentModule.moduleState == 3 /* INITIALIZED */ ||
            currentModule.moduleState == 4 /* ERROR */) {
            return panic("Can not double resolve module " + currentModule.moduleState);
        }
        moduleMap[id] = module;
        currentModule.callbacks.map(function (cb) {
            cb(module);
        });
    }
    function isModuleId(value) {
        return typeof value === "string";
    }
    function request(id, callback) {
        var _a;
        var module = moduleMap[id];
        if (!module) {
            var prefix = config1.baseUrl;
            if (prefix.charAt(prefix.length - 1) != '/')
                prefix += '/';
            var urlArgs = (_a = config1.urlArgs) !== null && _a !== void 0 ? _a : '';
            if (urlArgs !== '')
                urlArgs = '?' + urlArgs;
            var src = /^\/|^\w+:|\.js$/.test(id) ? id : prefix + id;
            src += '.js' + urlArgs;
            loadModule(id, src, callback);
        }
        else {
            if (module.moduleState == 3 /* INITIALIZED */ ||
                module.moduleState == 4 /* ERROR */) {
                callback(module);
            }
            else if (module.moduleState == 1 /* NETWORK_LOADING */) {
                module.callbacks.push(callback);
            }
            else if (module.moduleState == 0 /* DEFINED */) {
                module.callbacks.push(callback);
                module.forceInit();
            }
            else if (module.moduleState == 2 /* WAITING_FOR_DEPENDENCIES */) {
                module.callbacks.push(callback);
            }
        }
    }
    function createRequire(moduleId) {
        var baseId = moduleId.replace(/[^/]+$/, "");
        function modulePathToId(path) {
            var temp = path;
            var result = path;
            if (result[0] == ".") {
                result = baseId + result;
                while (result != temp) {
                    temp = result;
                    // Turns /./ and // into /
                    result = result.replace(/\/\.?\//, "/");
                    // Turns foo/bar/../buzz into foo/buzz
                    result = result.replace(/[^/]+\/\.\.(\/|$)/, "");
                }
            }
            return result;
        }
        var require = function (moduleIdOrDependencyPathList, onSuccess, onError) {
            if (isModuleId(moduleIdOrDependencyPathList)) {
                var module = moduleMap[moduleIdOrDependencyPathList];
                if (!module || module.moduleState !== 3 /* INITIALIZED */) {
                    throw Error("[IAMDEE ERROR]:dependecies not resolved yet. require module: " + moduleIdOrDependencyPathList);
                }
                return module.exports;
            }
            var dependencyIds = moduleIdOrDependencyPathList.map(modulePathToId);
            var remainingDependencies = moduleIdOrDependencyPathList.length + 1;
            function ensureCommonJsDependencies() {
                var cjsModule = { exports: {} };
                var module = moduleMap[moduleId];
                if (module) {
                    if (module.moduleState == 2 /* WAITING_FOR_DEPENDENCIES */) {
                        cjsModule = module;
                    }
                    else {
                        //In module require()
                    }
                }
                moduleMap["require"] = {
                    moduleState: 3 /* INITIALIZED */,
                    exports: require
                };
                moduleMap["exports"] = {
                    moduleState: 3 /* INITIALIZED */,
                    exports: cjsModule.exports
                };
                moduleMap["module"] = {
                    moduleState: 3 /* INITIALIZED */,
                    exports: cjsModule
                };
            }
            function dependencyReadyCallback() {
                if (--remainingDependencies == 0) {
                    ensureCommonJsDependencies();
                    try {
                        var dependencies = dependencyIds.map(function (id) {
                            var module = moduleMap[id];
                            if (!module) {
                                return panic("Mismatch in reported and actually loaded modules");
                            }
                            if (module.moduleState == 1 /* NETWORK_LOADING */ ||
                                module.moduleState == 0 /* DEFINED */) {
                                return panic("Unexpected module state when resolving dependencies");
                            }
                            if (module.moduleState == 4 /* ERROR */) {
                                throw new Error('[IAMDEE ERROR]: resolve module failed. module:' + id + ', reason:' + module.moduleError.toString());
                            }
                            return module.exports;
                        });
                        (onSuccess || noop).apply(undefined, dependencies);
                    }
                    catch (error) {
                        (onError || noop)(error);
                    }
                }
            }
            ensureCommonJsDependencies();
            dependencyIds.forEach(function (id) {
                request(id, dependencyReadyCallback);
            });
            globalThis.queueMicrotask ?
                globalThis.queueMicrotask(dependencyReadyCallback) :
                setTimeout(dependencyReadyCallback);
        };
        require.config = config;
        require.undef = function (moduleId) {
            delete moduleMap[moduleId];
        };
        require.getConfig = function () {
            return config1;
        };
        require.getDefined = function () {
            var r = {};
            for (var k in moduleMap) {
                var mod = moduleMap[k];
                if (mod.moduleState === 3 /* INITIALIZED */) {
                    r[k] = mod.exports;
                }
            }
            return r;
        };
        require.getFailed = function () {
            var r = {};
            for (var k in moduleMap) {
                var mod = moduleMap[k];
                if (mod.moduleState === 4 /* ERROR */) {
                    r[k] = { error: mod.moduleError };
                }
            }
            return r;
        };
        require.localRequireModule = moduleId;
        return require;
    }
    function loadModule(id, src, callback) {
        moduleMap[id] = {
            moduleState: 1 /* NETWORK_LOADING */,
            callbacks: [callback]
        };
        var nextLoader = 0;
        var loaderError = [];
        function tryNextScriptLoader() {
            if (nextLoader < scriptLoaders.length) {
                var loader = scriptLoaders[nextLoader];
                nextLoader++;
                loader.loadModule(id, src, function (err) {
                    if (err == null) {
                        if (moduleMap[id].moduleState === 1 /* NETWORK_LOADING */) {
                            resolveModule(id, {
                                moduleState: 3 /* INITIALIZED */,
                                exports: undefined
                            });
                        }
                    }
                    else {
                        loaderError.push(err);
                        tryNextScriptLoader();
                    }
                });
            }
            else {
                resolveModule(id, {
                    moduleState: 4 /* ERROR */,
                    moduleError: new Error("[IAMDEE ERROR]:Module not found." + loaderError.map(function (v) { return v.toString(); }).join(','))
                });
            }
        }
        tryNextScriptLoader();
    }
    function doDefine(id, dependencies, factory) {
        if (config1.onDefining != undefined) {
            var p = { moduleId: id, dependencies: dependencies, factory: factory };
            config1.onDefining(p);
            id = p.moduleId;
            dependencies = p.dependencies;
            factory = p.factory;
        }
        var existingModule = moduleMap[id];
        var definedModule = {
            moduleState: 0 /* DEFINED */,
            callbacks: [],
            forceInit: function () {
                var waitingModule = {
                    moduleState: 2 /* WAITING_FOR_DEPENDENCIES */,
                    callbacks: definedModule.callbacks,
                    exports: {}
                };
                moduleMap[id] = waitingModule;
                var localRequire = createRequire(id);
                localRequire(dependencies, function () {
                    var args = [];
                    for (var _i = 0; _i < arguments.length; _i++) {
                        args[_i] = arguments[_i];
                    }
                    var result = typeof factory == "function"
                        ? factory.apply(undefined, args)
                        : factory;
                    var exports = result === undefined ? waitingModule.exports : result;
                    resolveModule(id, {
                        moduleState: 3 /* INITIALIZED */,
                        exports: exports
                    });
                }, function (error) {
                    resolveModule(id, {
                        moduleState: 4 /* ERROR */,
                        moduleError: error
                    });
                });
            }
        };
        moduleMap[id] = definedModule;
        if (existingModule) {
            if (existingModule.moduleState != 1 /* NETWORK_LOADING */) {
                return panic("Trying to define a module that is in a wrong state");
            }
            definedModule.callbacks = existingModule.callbacks;
            definedModule.forceInit();
        }
    }
    var define = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        var dependencies = ["require", "exports", "module"];
        if (isAnonymousDefine(args)) {
            var expectedModuleId = null;
            for (var _a = 0, scriptLoaders_1 = scriptLoaders; _a < scriptLoaders_1.length; _a++) {
                var t1 = scriptLoaders_1[_a];
                expectedModuleId = t1.getDefiningModule();
                if (expectedModuleId != null)
                    break;
            }
            if (!expectedModuleId) {
                throw Error("[IAMDEE ERROR]:Module id is required.");
            }
            if (isAnonymousDefineWithDependencies(args)) {
                doDefine(expectedModuleId, args[0], args[1]);
            }
            else {
                doDefine(expectedModuleId, dependencies, args[0]);
            }
        }
        else {
            var id = args[0];
            if (isNamedDefineWithDependencies(args)) {
                doDefine(id, args[1], args[2]);
            }
            else {
                doDefine(id, dependencies, args[1]);
            }
        }
    };
    define["amd"] = {
        provider: 'iamdee(partic2 branch)',
        scriptLoaders: scriptLoaders
    };
    globalThis["define"] = define;
    globalThis["requirejs"] = globalThis["require"] = createRequire("");
})();
