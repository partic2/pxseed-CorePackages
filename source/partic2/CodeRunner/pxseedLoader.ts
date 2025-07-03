
//Some function to process source 

import * as acorn from 'acorn'
import {ancestor} from 'acorn-walk'
import { Task, assert, requirejs, throwIfAbortError } from 'partic2/jsutils1/base';
import type { PxseedStatus } from 'pxseedBuildScript/buildlib';

const __name__=requirejs.getLocalRequireModule(require);

export class JsSourceReplacePlan{
    plan:{start:number,end:number,newString:string}[]=[];
    parsedAst?:acorn.Program
    constructor(public source:string){
    }
    ast(){
        if(this.parsedAst==undefined){
            this.parsedAst=acorn.parse(this.source,acorn.defaultOptions);
        }
        return this.parsedAst;
    }
    apply():string{
        let modified:string[]=[];
        let start=0;
        this.plan.sort((a,b)=>{
            if(a.end<=b.start){
                return -1;
            }else if(a.start>=b.end){
                return 1;
            }else{
                throw new Error('Invaid params:plan');
            }
        });
        this.plan.forEach(plan=>{
            modified.push(this.source.substring(start,plan.start));
            modified.push(plan.newString);
            start=plan.end
        });
        modified.push(this.source.substring(start));
        return modified.join('');
    }
}


//XXX:Support top most await?
function addAsyncEnterExitHook(node:acorn.FunctionDeclaration|acorn.FunctionExpression|acorn.ArrowFunctionExpression|
        acorn.AnonymousFunctionDeclaration,
    replacePlan:JsSourceReplacePlan){
    if(node.async && node.body.type==='BlockStatement'){
        let enterHook=`Promise.__onAsyncEnter();try{`;
        if(!(replacePlan.source.substring(node.body.start+1,node.body.start+1+enterHook.length)===enterHook)){
            replacePlan.plan.push({
                start:node.body.start+1,
                end:node.body.start+1,
                newString:enterHook
            });
            replacePlan.plan.push({
                start:node.body.end-1,
                end:node.body.end-1,
                newString:`}finally{Promise.__onAsyncExit();}`
            })
        }
    }
}


export function addAsyncHook(replacePlan:JsSourceReplacePlan){
    let result=replacePlan.ast();
    ancestor(result,{
        FunctionDeclaration(node,state,ancetors){
            addAsyncEnterExitHook(node,replacePlan);
        },
        ArrowFunctionExpression(node,state,ancetors){
            addAsyncEnterExitHook(node,replacePlan);
        },
        FunctionExpression(node,state,ancetors){
            addAsyncEnterExitHook(node,replacePlan);
        },
        AwaitExpression(node,state,ancetors){
            let awaitHook='Promise.__onAwait(';
            if(!(replacePlan.source.substring(node.argument.start,node.argument.start+awaitHook.length)===awaitHook)){
                replacePlan.plan.push({
                    start:node.argument.start,
                    end:node.argument.start,
                    newString:awaitHook
                });
                replacePlan.plan.push({
                    start:node.argument.end,
                    end:node.argument.end,
                    newString:')'
                });
            }
        }
    });
}

import {setupAsyncHook} from './jsutils2'

export {setupAsyncHook}

export async function ensureModuleImported(replacePlan:JsSourceReplacePlan,moduleName:string){
    //Only support top most AMD declare
    for(let t1 of replacePlan.ast().body){
        if(t1.type==='ExpressionStatement' && t1.expression.type==='CallExpression' &&
            t1.expression.callee.type==='Identifier' && t1.expression.callee.name==='define'
        ){
            let t2=t1.expression.arguments;
            let t3=t2[0].type==='ArrayExpression'?t2[0]:t2[1];
            let deps=JSON.parse(replacePlan.source.substring(t3.start,t3.end)) as string[];
            if(!deps.includes(moduleName)){
                deps.push(moduleName)
                replacePlan.plan.push({start:t3.start,end:t3.end,newString:JSON.stringify(deps)});
            }
        }
    }
}

export async function addAsyncHookPxseedLoader(dir:string,config:{include?:string[]},status:PxseedStatus){
    const {sourceDir,outputDir}=await import('pxseedBuildScript/loaders');
    const { getNodeCompatApi }=await import('pxseedBuildScript/util');
    const {fs,path}=await getNodeCompatApi();
    let packageOutput=outputDir+'/'+dir.substring(sourceDir.length+1);
    if(config.include==undefined){
        config.include=['**/*.js']
    }
    const { simpleGlob } =await import('pxseedBuildScript/util');
    for(let file1 of await simpleGlob(config.include,{cwd:packageOutput})){
        let fpath=path.join(packageOutput,file1);
        let finfo=await fs.stat(fpath);
        if(finfo.mtime.getTime()>status.lastSuccessBuildTime){
            console.info('addAsyncHook:',file1);
            let source=new TextDecoder().decode(await fs.readFile(fpath));
            let replacePlan=new JsSourceReplacePlan(source);
            replacePlan.parsedAst=acorn.parse(source,{allowAwaitOutsideFunction:true,ecmaVersion:'latest',allowReturnOutsideFunction:true});
            addAsyncHook(replacePlan);
            let modified=replacePlan.apply();
            await fs.writeFile(fpath,new TextEncoder().encode(modified));
        }
    }
}

