
import { highlight, languages } from './prism/prism';
import './prism/prism-javascript'

export async function prismHighlightJS(text:string){
    return highlight(text,languages.javascript,'javascript')
}