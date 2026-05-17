import { LocalRunCodeContext } from "partic2/CodeRunner/CodeContext";
import { throwIfAbortError } from "partic2/jsutils1/base";
import { SimpleFileSystem } from "partic2/CodeRunner/JsEnviron";
import { CodeCompletionContext, CustomFunctionParameterCompletionSymbol, importNameCompletion } from "partic2/CodeRunner/Inspector";
import { path } from "partic2/jsutils1/webutils";

export async function filepathCompletion(partialPath:string,codeContext:LocalRunCodeContext,current?:string){
    let sfs=codeContext.localScope.fs.simple as SimpleFileSystem;
    let pathPart=partialPath.split(/[\\\/]/);
    let dirPart=pathPart.slice(0,pathPart.length-1);
    let partialName=pathPart.at(-1)??'';
    if(current!=undefined && dirPart.length>0 && dirPart[0]=='.'){
        dirPart=[...current.split(/[\\\/]/),...dirPart.slice(1)];
    }
    try{
        let children=await sfs.listdir(dirPart.join('/'));
        return {
            at:partialPath.length-partialName.length,
            children:children.filter(child=>child.name.startsWith(partialName))
        };
    }catch(e:any){
        throwIfAbortError(e);
    }
    return {
        at:partialPath.length-partialName.length,
        children:[]
    };
}

export function makeFunctionCompletionWithFilePathArg0(current:string|undefined){
    return async (context:CodeCompletionContext)=>{
        let param=context.code.substring(context.funcParamStart!,context.caret);
        let loadPath2=param.match(/\(\s*(['"])([^'"]+)$/);
        if(loadPath2!=null){
            let replaceRange:[number,number]=[context.funcParamStart!+param.lastIndexOf(loadPath2[1])+1,0];
            replaceRange[1]=replaceRange[0]+loadPath2[2].length;
            let loadPath=loadPath2[2];
            let t1=await filepathCompletion(loadPath,context.codeContext,current);
            replaceRange[0]=replaceRange[0]+t1.at;
            context.completionItems.push(...t1.children.map(v=>({type:'literal',candidate:v.name,replaceRange})))
        }
    }
}

export function setupInspectorHelper(_ENV:any){
    try{
        _ENV.import2env[CustomFunctionParameterCompletionSymbol]=async (context:CodeCompletionContext)=>{
            let param=context.code.substring(context.funcParamStart!,context.caret);
            let importName2=param.match(/\(\s*(['"])([^'"]+)$/);
            if(importName2!=null){
                let replaceRange:[number,number]=[context.funcParamStart!+param.lastIndexOf(importName2[1])+1,0];
                replaceRange[1]=replaceRange[0]+importName2[2].length;
                let importName=importName2[2];
                let t1=await importNameCompletion(importName);
                let lastSlashOffset=importName.lastIndexOf('/')+1;
                replaceRange[0]+=lastSlashOffset;
                context.completionItems.push(...t1.map(v=>({type:'literal',candidate:v.substring(lastSlashOffset),replaceRange})))
            }
        }
        _ENV.fs.loadScript[CustomFunctionParameterCompletionSymbol]=makeFunctionCompletionWithFilePathArg0(path.dirname(_ENV.fs.codePath??''));
        _ENV.fs.loadNotebook[CustomFunctionParameterCompletionSymbol]=makeFunctionCompletionWithFilePathArg0(path.dirname(_ENV.fs.codePath??''));
        if(_ENV.fs.simple!=undefined){
            _ENV.fs.simple.readAll[CustomFunctionParameterCompletionSymbol]=makeFunctionCompletionWithFilePathArg0(undefined);
            _ENV.fs.simple.read[CustomFunctionParameterCompletionSymbol]=makeFunctionCompletionWithFilePathArg0(undefined);
            _ENV.fs.simple.writeAll[CustomFunctionParameterCompletionSymbol]=makeFunctionCompletionWithFilePathArg0(undefined);
            _ENV.fs.simple.write[CustomFunctionParameterCompletionSymbol]=makeFunctionCompletionWithFilePathArg0(undefined);
            _ENV.fs.simple.listdir[CustomFunctionParameterCompletionSymbol]=makeFunctionCompletionWithFilePathArg0(undefined);
            _ENV.fs.simple.filetype[CustomFunctionParameterCompletionSymbol]=makeFunctionCompletionWithFilePathArg0(undefined);
            _ENV.fs.simple.delete2[CustomFunctionParameterCompletionSymbol]=makeFunctionCompletionWithFilePathArg0(undefined);
            _ENV.fs.simple.mkdir[CustomFunctionParameterCompletionSymbol]=makeFunctionCompletionWithFilePathArg0(undefined);
            _ENV.fs.simple.rename[CustomFunctionParameterCompletionSymbol]=makeFunctionCompletionWithFilePathArg0(undefined);
        }
    }catch(err){
    }
}