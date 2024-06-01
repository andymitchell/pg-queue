import { JobQueueReleaseTypes } from "../pg-queue";

export interface IPgQueueConfig {
    get():Promise<QueueConfig | undefined>;
    getQueueEndPointApiKey():Promise<string | undefined>;
    setQueueEndPointApiKey(apiKey:string):Promise<void>;
    set(config:Partial<QueueConfigCore>):Promise<{status:'ok'} | {status: 'error'}>;

    setEndpoint(active:false):Promise<{status:'ok'} | {status: 'error'}>;
    setEndpoint(active:true, config:Partial<QueueConfigActiveDetails>):Promise<{status:'ok'} | {status: 'error'}>;
    setEndpoint(active:boolean, config?:Partial<QueueConfigActiveDetails>):Promise<{status:'ok'} | {status: 'error'}>;
}

export type QueueListOptions = {
    endpoint_active?:boolean
}

type BaseQueueConfig = {
    queue_name: string;
    created_at: string; // TIMESTAMPTZ, might use string to represent it and it has a default value so it's optional
    updated_at: string; // TIMESTAMPTZ, might use string to represent it and it has a default value so it's optional
}

type QueueConfigTimeout = {
    timeout_milliseconds: number;
    timeout_with_result: JobQueueReleaseTypes,
}

export type QueueConfigCore = QueueConfigTimeout & {
    max_concurrency: number; // with a default of -1
    pause_between_retries_milliseconds: number;
}

export type QueueConfigActiveDetails = {
    endpoint_method: 'GET' | 'POST';
    endpoint_bearer_token_location: '' | 'supabase_vault' | 'inline';
    endpoint_bearer_token_inline_value: string,
    endpoint_url: string;
    endpoint_timeout_milliseconds: number;
    endpoint_manual_release: boolean;
}

export type QueueConfigActiveEndpointDb = BaseQueueConfig & QueueConfigCore & {
    endpoint_active: true;
} & QueueConfigActiveDetails;

export type QueueConfigInactiveEndpointDb = BaseQueueConfig & QueueConfigCore & {
    endpoint_active: false;
}

export type QueueConfig = QueueConfigActiveEndpointDb | QueueConfigInactiveEndpointDb;
