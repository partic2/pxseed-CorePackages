## About pxseed

"pxseed" is a package manager manage javascript/typescript code and assert for both browser and node(server) by using AMD loader.

## Usage

1. Prepare environment
```sh
node script/buildEnviron.js
```

2. Build package
```sh
node script/buildPackages.js 
```

3. Start node server
```sh
node www/noderun.js pxseedServer2023/entry
```

4. Open package manager ui(url:http://localhost:8088/pxseed/www/index.html?__jsentry=partic2%2fpackageManager%2fwebui) in browser.

## Develope

"pxseed.config.json" is the description file for a pacakge. View [source/pxseedBuildScript/build.ts](source/pxseedBuildScript/build.ts) and [source/partic2/packageManager/registry.ts](source/partic2/packageManager/registry.ts) for detail usage.
