import {  DEFAULT_SCHEMA, Queryable } from "../types";
import { HttpError } from "../utils/HttpError";
import { IMultiStepPgQueue, MultiStepJobQueueDb, MultiStepJobQueueDbPayload, ProcessJobResponse, Steps, isMultiStepJobQueueDb } from "./types";


import { z } from "zod";
import { IPgQueue, PgQueue } from "../pg-queue";




type Logger<T extends object> = {
    error:(message: string, type?: string, body?: MultiStepJobQueueDb<T>) => void;
}
type Options<T extends object> = {
    custom_id?: string,
    logger?: Logger<T>;
    testing?: {
        prevent_fan_out: boolean
    }
}


export class MultiStepPgQueue<T extends object, S extends Steps<T> = Steps<T>> implements IMultiStepPgQueue<T> {

    protected db:Queryable;
    protected queueName:string;
    protected schemaName: string;
    protected steps: S;
    protected id: string;
    protected queue:IPgQueue<MultiStepJobQueueDbPayload<T>>;
    protected payloadSchema?: z.Schema<T>;
    protected options?: Options<T>;

    constructor(db:Queryable, queueName:string, steps:S, payloadSchema?: z.Schema<T>, options?: Options<T>, schema = DEFAULT_SCHEMA) {
        this.queueName = queueName;
        this.schemaName = schema ?? DEFAULT_SCHEMA;
        this.db = db;
        this.steps = steps;
        this.id = options?.custom_id ?? this.queueName;
        this.payloadSchema = payloadSchema;
        this.queue = new PgQueue<MultiStepJobQueueDbPayload<T>>(db, this.queueName, this.schemaName);
        this.options = options;
    }

    async addJob(payload: T, retries?: number | undefined, startAfter?: Date | undefined): Promise<void> {
        const multiStepPayload = this.makeMultiStepJobQueueDbPayload(payload);

        await this.queue.addJob(multiStepPayload, retries, startAfter);
    }

    private makeMultiStepJobQueueDbPayload(payload: T, step_id?: string, customTimeout?: number):MultiStepJobQueueDbPayload<T> {
        if (step_id === undefined) step_id = this.steps[0]?.id;
        if (!step_id && !this.steps.find(step => step.id === step_id)) throw new Error("Unknown step id");

        if (this.payloadSchema) {
            const parseResult = this.payloadSchema.safeParse(payload);
            if (!parseResult.success) {
                console.log("MultiStep parse fail", parseResult.error, payload, { id: this.id, queue_name: this.queueName });
                throw new Error("MultiStep payload payloadSchema mismatch");
            }
        }

        const finalPayload: MultiStepJobQueueDbPayload<T> = {
            ...payload,
            multi_step_id: this.id,
            step_id
        }
        return finalPayload;
    }


    ownsJob(x: unknown):x is MultiStepJobQueueDb<T> {
        const isQueueSchema = isMultiStepJobQueueDb(x);
        return isQueueSchema && x.payload.multi_step_id===this.id;
    }

    async processJob(x: unknown):Promise<ProcessJobResponse> {
        if( this.ownsJob(x) ) {
            return await this.runNextStepForJob(x);
        } else {
            return {
                status: 'error',
                error: {
                    type: 'incompatible-job',
                    sub_type: isMultiStepJobQueueDb(x)? 'job-not-owned' : 'bad-job-format'
                }
            }
        }
    }

    private async runNextStepForJob(body:MultiStepJobQueueDb<T>):Promise<ProcessJobResponse> {
        try {
            const idx = this.steps.findIndex(x => x.id === (body.payload.step_id ?? this.steps[0]?.id));
            const step = idx>-1? this.steps[idx] : undefined;
            if (!step) {
                throw new HttpError('Unknown step ID - was it implemented?', 400);
            }
            const nextStep = this.steps[idx + 1];
            const next_step = nextStep? {
                id: nextStep.id,
                custom_timeout_milliseconds: nextStep.custom_timeout_milliseconds
            } : undefined;
            
            const release_action = await step.handler(body.payload, body.job_id);
            const final_release_action = release_action? release_action : 'complete';
            await this.queue.releaseJob(body.job_id, final_release_action);

            // Add a job to the queue to run this function again, for the next step 
            if( final_release_action==='complete' ) {
                if (next_step && !this.options?.testing?.prevent_fan_out) {
                    const nextPayload = this.makeMultiStepJobQueueDbPayload(body.payload, next_step.id, next_step.custom_timeout_milliseconds);
                    this.queue.addJob(nextPayload);
                }
            }

            return {status: 'ok'};
        } catch(e) {
            
            console.warn("MultiStep job failed", body, e);
            await this.queue.releaseJob(body.job_id, 'failed');

            if( e instanceof Error ) {
                if( this.options?.logger ) {
                    this.options?.logger?.error(e.message, 'unknown-error-handling-multistep', body);
                }
            }
            return {
                status: 'error',
                error: {
                    type: 'unknown-error-handling-multistep',
                    message: (e instanceof Error)? e.message : ''
                }
            }
        }
    }

    getRawQueue(): IPgQueue<T> {
        return this.queue;
    }


}
