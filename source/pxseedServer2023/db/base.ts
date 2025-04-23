


import {assert, future} from 'partic2/jsutils1/base'

export interface DatabaseConnectOption{
    host?:string,
    port?:number,
    filename?:string,
    user?:string,
    password?:string,
    database?:string,
    withColumnsInfo?:boolean
}

export abstract class sqlDb{
    abstract setConnectionInfo(opt:DatabaseConnectOption):sqlDb
    abstract ensureConnected():Promise<'ok'|'connected'>;
    queryToArray(sql:string):Promise<{rows:(string|number|Date)[][],fields:string[],columnsInfo?:{type?:string}[]}>{
        let arr=[sql] as Array<string>&{raw:Array<string>};
        arr.raw=arr;
        return this.queryToArrayTpl!(arr)
    }
    abstract queryToArrayTpl(sql:TemplateStringsArray,...args:any[]):Promise<{rows:(string|number|Date)[][],fields:string[],columnsInfo?:{type?:string}[]}>;
    queryToMap(sql:string):Promise<{rows:{[field:string]:(string|number|Date)}[],columnsInfo?:{type?:string}[]}>{
        let arr=[sql] as Array<string>&{raw:Array<string>};
        arr.raw=arr;
        return this.queryToMapTpl!(arr)
    };
    abstract queryToMapTpl(sql:TemplateStringsArray,...args:any[]):Promise<{rows:{[field:string]:(string|number|Date)}[],columnsInfo?:{type?:string}[]}>;
    execSql(sql:string): Promise<{ insertId?: number | undefined; affectedRows?: number }>{
        let arr=[sql] as Array<string>&{raw:Array<string>};
        arr.raw=arr;
        return this.execSqlTpl!(arr)
    };
    abstract execSqlTpl(sql:TemplateStringsArray,...args:any[]): Promise<{ insertId?: number | undefined; affectedRows?: number }>;
}

