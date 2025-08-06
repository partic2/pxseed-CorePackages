## About pxseed

"pxseed" is a package manager manage javascript/typescript code and assets for both browser and node(server) by using AMD loader.

## Usage

We recommand you to use pxseed from source 
You can run all-in-one script
```sh
node script/buildAndRun.js
```

Or step by step

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

1. Open package manager in browser.


You can also get installer from npm 
```sh
npm i -g @partic2/pxseed-cli
pxseed-cli
```

## Develope

"pxseed.config.json" is the description file for a pacakge. View [source/pxseedBuildScript/build.ts](source/pxseedBuildScript/build.ts) and [source/partic2/packageManager/registry.ts](source/partic2/packageManager/registry.ts) for detail usage.
