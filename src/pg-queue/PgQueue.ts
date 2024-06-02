



import { AddJobOptions, DEFAULT_SCHEMA, DbQuery, Queryable } from "../types";
import {  IPgQueue, PgQueueJob, PgQueueJobReleaseTypes, PickedJob, isPgQueueJob, isPgQueueJobStrict } from "./types";
import { pgqc } from ".";
import { PostgresHelpers } from "@andyrmitchell/utils";
import { IPgQueueConfig, PgQueueConfig } from "../pg-queue-config";




export class PgQueue<T extends object> implements IPgQueue<T> {
    
    private db:Queryable;
    private queueName:string;
    private queueConfig:IPgQueueConfig;
    private escapedSchemaName:string;

    constructor(db:Queryable, queueName:string, schemaName = DEFAULT_SCHEMA) {
        this.queueName = queueName;
        this.db = db;
        this.escapedSchemaName = PostgresHelpers.escapeIdentifier(schemaName);
        this.queueConfig = new PgQueueConfig(this.db, this.queueName, this.escapedSchemaName);
    }

    async addJob(payload: T, options?: AddJobOptions): Promise<void> {
        await this.addJobByQuery(this.makeAddJobQuery(payload, options?.retries, options?.start_after), options?.transaction);   
    }

    private makeAddJobQuery(pPayload: T, pRetriesRemaining = 10, pStartAfter?: Date, customTimeoutMs?:number, customTimeoutWithResult?:PgQueueJobReleaseTypes): DbQuery {
        if ( !pPayload || pRetriesRemaining == null) {
            throw new Error('Parameters cannot be null');
        }
    
    
        let q = '';
        const args = [this.queueName, JSON.stringify(pPayload), pRetriesRemaining, 'REPLACED BELOW', customTimeoutMs ?? null, customTimeoutWithResult ?? null];
        if( pStartAfter ) {
            q = `SELECT ${this.escapedSchemaName}.add_job($1, $2, $3, to_timestamp(CAST($4 as bigint)/1000)), $5, $6)`;
            args[3] = pStartAfter.getTime();
        } else {
            q = `SELECT ${this.escapedSchemaName}.add_job($1, $2, $3, NOW(), $4, $5)`;
            args.splice(3, 1);
        }
        
    
        
    
        return {q, args};
    }

    private async addJobByQuery(query:DbQuery, transaction?:Queryable): Promise<void> {
        // This is just a convenience function - most things have access to 'queryArray'
        const result = await (transaction ?? this.db).query(query);   
       
    }

    async pickNextJob(pIgnoreMaxConcurrency?: boolean, transaction?: Queryable): Promise<PickedJob<T> | undefined> {
        const job = await pgqc.pickNextJob<T>(transaction ?? this.db, this.queueName, undefined, undefined, pIgnoreMaxConcurrency, this.escapedSchemaName);

        if( job ) {
            return {
                job,
                release: async (pResult: PgQueueJobReleaseTypes) => {
                    await pgqc.releaseJob(this.db, job.job_id, pResult, this.escapedSchemaName);
                },
                keepAlive: async () => {
                    await pgqc.keepJobAlive(this.db, job.job_id, this.escapedSchemaName);
                }
            }
        }
        return undefined;
    }

    async releaseJob(pJobId: number, pResult: PgQueueJobReleaseTypes, transaction?: Queryable): Promise<void> {
        return await pgqc.releaseJob(transaction ?? this.db, pJobId, pResult, this.escapedSchemaName);
    }

    ownsJob(x: unknown):x is PgQueueJob<T> {
        const isQueueSchema = isPgQueueJob(x);
        return isQueueSchema;
    }

    getConfig():IPgQueueConfig {
        return this.queueConfig;
    }

    // TODO Can probably replace these with .getConfig().getQueueEndPointApiKey()
    async getQueueEndPointApiKey():Promise<string | undefined> {
        return this.queueConfig.getQueueEndPointApiKey();
    }
    
    async setQueueEndPointApiKey(apiKey:string):Promise<void> {
        await this.queueConfig.setQueueEndPointApiKey(apiKey);
    }
}

