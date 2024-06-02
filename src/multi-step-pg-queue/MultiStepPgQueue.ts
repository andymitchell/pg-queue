import {  AddJobOptions, DEFAULT_SCHEMA, Queryable } from "../types";
import { HttpError } from "../utils/HttpError";
import { IMultiStepPgQueue, MultiStepPgQueueJob, MultiStepPgQueueJobPayload, ProcessJobResponse, Steps, isMultiStepPgQueueJob } from "./types";


import { z } from "zod";
import { IPgQueue, PgQueue, pgqc } from "../pg-queue";




type Logger<T extends object> = {
    error:(message: string, type?: string, body?: MultiStepPgQueueJob<T>) => void;
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
    protected queue:IPgQueue<MultiStepPgQueueJobPayload<T>>;
    protected payloadSchema?: z.Schema<T>;
    protected options?: Options<T>;

    constructor(db:Queryable, queueName:string, steps:S, payloadSchema?: z.Schema<T>, options?: Options<T>, schema = DEFAULT_SCHEMA) {
        this.queueName = queueName;
        this.schemaName = schema ?? DEFAULT_SCHEMA;
        this.db = db;
        this.steps = steps;
        this.id = options?.custom_id ?? this.queueName;
        this.payloadSchema = payloadSchema;
        this.queue = new PgQueue<MultiStepPgQueueJobPayload<T>>(db, this.queueName, this.schemaName);
        this.options = options;
    }

    async addJob(payload: T, options?: AddJobOptions): Promise<void> {
        const multiStepPayload = this.makeMultiStepPgQueueJobPayload(payload);

        await this.queue.addJob(multiStepPayload, options);
    }

    private makeMultiStepPgQueueJobPayload(payload: T, step_id?: string, customTimeout?: number):MultiStepPgQueueJobPayload<T> {
        if (step_id === undefined) step_id = this.steps[0]?.id;
        if (!step_id && !this.steps.find(step => step.id === step_id)) throw new Error("Unknown step id");

        if (this.payloadSchema) {
            const parseResult = this.payloadSchema.safeParse(payload);
            if (!parseResult.success) {
                console.log("MultiStep parse fail", parseResult.error, payload, { id: this.id, queue_name: this.queueName });
                throw new Error("MultiStep payload payloadSchema mismatch");
            }
        }

        const finalPayload: MultiStepPgQueueJobPayload<T> = {
            ...payload,
            multi_step_id: this.id,
            step_id
        }
        return finalPayload;
    }


    ownsJob(x: unknown):x is MultiStepPgQueueJob<T> {
        const isQueueSchema = isMultiStepPgQueueJob(x);
        return isQueueSchema && x.payload.multi_step_id===this.id;
    }

    /**
     * Use this with a long-runner, to loop picking the next job and running it 
     * @param pIgnoreMaxConcurrency 
     * @returns 
     */
    async processNextJob(pIgnoreMaxConcurrency?: boolean, transaction?: Queryable): Promise<ProcessJobResponse> {
        const job = await pgqc.pickNextJob<T>(transaction ?? this.db, this.queueName, undefined, this.id, pIgnoreMaxConcurrency, this.schemaName) as MultiStepPgQueueJob<T> | undefined;

        if( job ) {
            return this.runNextStepForJob(job);
        } else {
            return {status: 'ok', had_job: false};
        }
    }

    /**
     * Use this when receiving a job from a dispatcher
     * @param x 
     * @returns 
     */
    async processJob(x: unknown, transaction?: Queryable):Promise<ProcessJobResponse> {
        if( this.ownsJob(x) ) {
            return await this.runNextStepForJob(x, transaction);
        } else {
            return {
                status: 'error',
                error: {
                    type: 'incompatible-job',
                    sub_type: isMultiStepPgQueueJob(x)? 'job-not-owned' : 'bad-job-format'
                }
            }
        }
    }

    private async runNextStepForJob(body:MultiStepPgQueueJob<T>, transaction?: Queryable):Promise<ProcessJobResponse> {
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
            await this.queue.releaseJob(body.job_id, final_release_action, transaction);

            // Add a job to the queue to run this function again, for the next step 
            if( final_release_action==='complete' ) {
                if (next_step && !this.options?.testing?.prevent_fan_out) {
                    const nextPayload = this.makeMultiStepPgQueueJobPayload(body.payload, next_step.id, next_step.custom_timeout_milliseconds);
                    this.queue.addJob(nextPayload, {transaction});
                }
            }

            return {status: 'ok', had_job: true};
        } catch(e) {
            
            console.warn("MultiStep job failed", body, e);
            await this.queue.releaseJob(body.job_id, 'failed', transaction);

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
