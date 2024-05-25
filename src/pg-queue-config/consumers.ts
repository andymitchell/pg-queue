import { PostgresHelpers } from "@andyrmitchell/utils";
import { DEFAULT_SCHEMA, Queryable } from "../types";
import { QueueConfigDb, QueueListOptions } from "./types";
import { v4 as uuidv4 } from "uuid";

export async function listQueues(db:Queryable, options?: QueueListOptions, schema = DEFAULT_SCHEMA):Promise<QueueConfigDb[]> {

    // Prepare optional AND clauses. Each array item should start parameters from $1 (concatSqlParameters will then merge)
    const whereAndClauses:{sql: string, parameters: any[]}[] = [];
    if( options?.endpoint_active ) {
        whereAndClauses.push({
            sql: 'endpoint_active = $1',
            parameters: [true]
        })
    }

    let q = `SELECT * FROM ${PostgresHelpers.escapeIdentifier(schema)}.queue_config`;
    let args: any[] = [];
    
    if( whereAndClauses.length ) {
        const whereAndClausesPrepared = PostgresHelpers.concatSqlParameters(whereAndClauses, ' AND ');
        q += ` WHERE ${whereAndClausesPrepared.sql}`;
        args = [...args, ...whereAndClausesPrepared.parameters];
    }
    
    const result = await db.query<QueueConfigDb>({q, args});
    return result.rows;
}

export async function getQueueEndPointApiKey(db:Queryable, queueName:string, schema = DEFAULT_SCHEMA):Promise<string | undefined> {
    const key = uuidv4();
    await db.query({q: `SELECT ${PostgresHelpers.escapeIdentifier(schema)}.register_temporary_key_for_api_access($1)`, args: [key]});
    const result = await db.query<{api_key:string}>({q: `SELECT ${PostgresHelpers.escapeIdentifier(schema)}.get_queue_endpoint_api_key($1, $2) as api_key`, args: [key, queueName]});
    return result.rows[0]?.api_key;
}