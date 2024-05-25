import { JobQueueReleaseTypes } from "../pg-queue";

export interface IPgQueueConfig {
    get():Promise<QueueConfigDb | undefined>;
    getQueueEndPointApiKey():Promise<string | undefined>;
    setQueueEndPointApiKey(apiKey:string):Promise<void>;
    set(config:Omit<QueueConfig, 'queue_name'>):Promise<{status:'ok'} | {status: 'error'}>;
}

export type QueueListOptions = {
    endpoint_active?:boolean
}

export type BaseQueueConfigDb = {
    queue_config_id: number;
    queue_name: string;
    timeout_milliseconds: number;
    timeout_with_result: JobQueueReleaseTypes,
    max_concurrency: number; // with a default of -1
    pause_between_retries_milliseconds: number;
    endpoint_active: boolean;
    created_at: string; // TIMESTAMPTZ, might use string to represent it and it has a default value so it's optional
    updated_at: string; // TIMESTAMPTZ, might use string to represent it and it has a default value so it's optional
}

type QueueConfigActiveDetailsDb = {
    endpoint_method: 'GET' | 'POST';
    endpoint_bearer_token_location: '' | 'supabase_vault' | 'inline';
    endpoint_bearer_token_inline_value: string,
    endpoint_url: string;
    endpoint_timeout_milliseconds: number;
    endpoint_manual_release: boolean;
}

export type QueueConfigActiveEndpointDb = Omit<BaseQueueConfigDb, 'endpoint_active'> & {
    endpoint_active: true;
} & QueueConfigActiveDetailsDb;

export type QueueConfigInactiveEndpointDb = Omit<BaseQueueConfigDb, 'endpoint_active'> & {
    endpoint_active: false;
}

export type QueueConfigDb = QueueConfigActiveEndpointDb | QueueConfigInactiveEndpointDb;
type NonUpdateableQueueConfigKeys = 'queue_config_id' | 'created_at' | 'updated_at'
export type QueueConfig = Omit<QueueConfigActiveEndpointDb, NonUpdateableQueueConfigKeys> | Omit<QueueConfigInactiveEndpointDb, NonUpdateableQueueConfigKeys>;
export type QueueConfigDbUpdate = Omit<BaseQueueConfigDb, NonUpdateableQueueConfigKeys> & Partial<QueueConfigActiveDetailsDb>;
