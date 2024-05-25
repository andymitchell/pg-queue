import {z, ZodAny} from "zod";


export type Queryable = {
    exec(q:string, transaction?: Queryable):Promise<void>,
    query<T extends Record<string,any> = Record<string, any>>(query:DbQuery, transaction?: Queryable):Promise<{rows: T[]}>
}

export interface IPgQueueBase<T extends object> {
    addJob(payload:T, retries?:number, startAfter?:Date):Promise<void>
}

export const DEFAULT_SCHEMA = 'pgqueue_ds';
export const PGQ_SCHEMA_PLACEHOLDER = 'pgq_schema_placeholder';
export const GLOBAL_MATCH_PGQ_SCHEMA_PLACEHOLDER = new RegExp(PGQ_SCHEMA_PLACEHOLDER, 'g'); // /pgq_schema_placeholder/g;




type DbQueryArgTypes = string | number | object | boolean | null | DbQueryArgTypes[];
type DbQueryArgs = DbQueryArgTypes[]
export type DbQuery = {
    q:string, 
    args: DbQueryArgs
}









