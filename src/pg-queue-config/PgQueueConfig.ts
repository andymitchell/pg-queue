import { PostgresHelpers } from "@andyrmitchell/utils";
import { DEFAULT_SCHEMA, Queryable } from "../types";
import { IPgQueueConfig, QueueConfig, QueueConfigActiveDetails, QueueConfigCore } from "./types";
import { v4 as uuidv4 } from "uuid";
import { pgqcc } from ".";

export class PgQueueConfig implements IPgQueueConfig {
    queueName: Readonly<string>;
    private db:Queryable;
    private escapedSchemaName: string;

    constructor(db:Queryable, queueName:string, schemaName = DEFAULT_SCHEMA) {
        this.queueName = queueName;
        this.db = db;
        this.escapedSchemaName = PostgresHelpers.escapeIdentifier(schemaName);
    }


    async get():Promise<QueueConfig | undefined> {
        const result = await this.db.query<QueueConfig>({
            q: `SELECT * FROM ${this.escapedSchemaName}.queue_config WHERE queue_name = $1`,
            args: [this.queueName]
        });

        return result.rows[0];

    }

    async set(config:Partial<QueueConfigCore>):Promise<{status:'ok'} | {status: 'error'}> {
        const _config = config;

        await this.db.query({
            q: `SELECT ${this.escapedSchemaName}.update_queue_config($1, $2, $3, $4, $5)`,
            args: [
                this.queueName,
                _config.max_concurrency ?? null,
                _config.pause_between_retries_milliseconds ?? null,
                _config.timeout_milliseconds ?? null,
                _config.timeout_with_result ?? null
            ]
        });

        
        return {status: 'ok'};
    }

    setEndpoint(active:false):Promise<{status:'ok'} | {status: 'error'}>;
    setEndpoint(active:true, config:Partial<QueueConfigActiveDetails>):Promise<{status:'ok'} | {status: 'error'}>;
    async setEndpoint(active:boolean, config?:Partial<QueueConfigActiveDetails>):Promise<{status:'ok'} | {status: 'error'}> {
        await this.db.query({
            q: `SELECT ${this.escapedSchemaName}.update_queue_config($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            args: [
                this.queueName,
                null,
                null,
                null,
                null,
                active,
                config?.endpoint_method ?? null,
                config?.endpoint_bearer_token_location ?? null,
                config?.endpoint_url ?? null,
                config?.endpoint_timeout_milliseconds ?? null,
                config?.endpoint_manual_release ?? null,
            ]
        });

        
        return {status: 'ok'};
    }


    async getQueueEndPointApiKey():Promise<string | undefined> {
        return await pgqcc.getQueueEndPointApiKey(this.db, this.queueName, this.escapedSchemaName);
    }

    async setQueueEndPointApiKey(apiKey:string):Promise<void> {
        const key = uuidv4();
        await this.db.query({q: `SELECT ${this.escapedSchemaName}.register_temporary_key_for_api_access($1)`, args: [key]});
        await this.db.query({q: `SELECT ${this.escapedSchemaName}.set_queue_endpoint_api_key($1, $2, $3)`, args: [key, this.queueName, apiKey]});
    }
}