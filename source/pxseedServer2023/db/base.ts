


import {future} from 'partic2/jsutils1/base'

export interface DatabaseConnectOption{
    host?:string,
    port?:number,
    filename?:string,
    user?:string,
    password?:string,
    database?:string,
    withColumnsInfo?:boolean
}

export interface sqlDb{
    setConnectionInfo(opt:DatabaseConnectOption):sqlDb
    ensureConnected():Promise<'ok'|'connected'>;
    queryToArray(sql:string):Promise<{rows:(string|number|Date)[][],fields:string[],columnsInfo?:{type?:string}[]}>;
    queryToMap(sql:string):Promise<{rows:{[field:string]:(string|number|Date)}[],columnsInfo?:{type?:string}[]}>;
    execSql(sql:string): Promise<{ insertId?: number | undefined; affectedRows?: number }>;
}

