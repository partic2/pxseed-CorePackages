import { ArrayWrap2, assert, GenerateRandomString, GetCurrentTime, requirejs, Task } from 'partic2/jsutils1/base';


let __name__=requirejs.getLocalRequireModule(require)

export async function prismHighlightJS(text:string){
    let { highlight, languages } = await import('./prism/prism');
    await import('./prism/prism-javascript' as any)
    return highlight(text,languages.javascript,'javascript')
}
