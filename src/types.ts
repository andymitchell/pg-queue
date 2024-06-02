
export interface Queryable {
    exec(q:string):Promise<void>,
    query<T extends Record<string,any> = Record<string, any>>(query:DbQuery):Promise<{rows: T[]}>
}

export interface IPgQueueBase<T extends object> {
    addJob(payload:T, options?: AddJobOptions):Promise<void>
}

export const DEFAULT_SCHEMA = 'pgqueue_ds';
export const PGQ_SCHEMA_PLACEHOLDER = 'pgq_schema_placeholder';
export const GLOBAL_MATCH_PGQ_SCHEMA_PLACEHOLDER = new RegExp(PGQ_SCHEMA_PLACEHOLDER, 'g'); // /pgq_schema_placeholder/g;



export type AddJobOptions = {
    retries?: number,
    start_after?: Date,
    transaction?: Queryable
}


type DbQueryArgTypes = string | number | boolean | null | DbQueryArgTypes[];
type DbQueryArgs = DbQueryArgTypes[]
export type DbQuery = {
    q:string, 
    args: DbQueryArgs
}









