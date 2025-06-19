//build tjs interface on supported platform

export async function buildTjs(){
    if(globalThis.tjs!=undefined){
        return globalThis.tjs
    }
}