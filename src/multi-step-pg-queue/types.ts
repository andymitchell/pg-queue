
import { z } from "zod";
import { IPgQueueBase, Queryable } from "../types";
import { PgQueueJobReleaseTypes, PgQueueJob, isPgQueueJob, IPgQueue } from "../pg-queue";
import { isTypeEqual } from "@andyrmitchell/utils";



export interface IMultiStepPgQueue<T extends object> extends IPgQueueBase<T> {

    getRawQueue():IPgQueue<T>;
    processNextJob(pIgnoreMaxConcurrency?: boolean, transaction?: Queryable): Promise<ProcessJobResponse>;

};

export type ProcessJobResponse = {
    status: 'ok',
    had_job: boolean
} | 
{
    status: 'error',
    error: {
        type: 'incompatible-job',
        sub_type: 'job-not-owned' | 'bad-job-format',
        message?: string
    } | 
    {
        type: 'unknown-error-handling-multistep',
        message?: string
    } |
    {
        type: 'custom',
        sub_type: string,
        message?: string
    }
}

type StepID = string;
type Step<T> = {
    id: StepID, 
    handler: (job:MultiStepPgQueueJobPayload<T>, jobID: number) => Promise<void | PgQueueJobReleaseTypes>,
    custom_timeout_milliseconds?: number
}
export type Steps<T> = Step<T>[];
/*
export type MultiStep<T extends object> = {
    id: MultiStepID, 
    queue_name: string, 
    create: (payload:T, transaction?:postgres.Transaction) => Promise<void>,
    runStep: (step_id:string, payload:MultiStepPgQueueJobPayload<T>, jobID: number) => Promise<{ next_step?: {id: string, custom_timeout_milliseconds?: number}, release_action?: void | PgQueueJobReleaseTypes }>,
    makeAddJobQuery: (payload:T, step_id?:string, customTimeout?:number ) => DbQuery,
    steps: Steps<T>, // CONSTRAINT: Each step may rerun (if it fails), so it should either only execute one mutation command, or guarantee each mutation command is idempotent
    schema?: z.Schema<T>
}
*/

export const MultiStepPgQueuePayloadSchemaBase = z.object({ // FYI There's probably more on the payload 
    multi_step_id: z.string(),
    step_id: z.string().optional(),
})
type MultiStepPgQueuePayloadBase = {
    multi_step_id: string,
    step_id?: string
}
isTypeEqual<z.infer<typeof MultiStepPgQueuePayloadSchemaBase>, MultiStepPgQueuePayloadBase>(true);

export type MultiStepPgQueueJobPayload<T = object> = T & MultiStepPgQueuePayloadBase;
export type MultiStepPgQueueJob<T = object> = PgQueueJob<MultiStepPgQueueJobPayload<T>>


export function isMultiStepPgQueueJob(x: unknown): x is MultiStepPgQueueJob {
    return isPgQueueJob(x, MultiStepPgQueuePayloadSchemaBase);
}

const MultiStepTestSchema = z.object({
    "testing_multi_step_id": z.string()
});
export type MultiStepTest = z.infer<typeof MultiStepTestSchema>;
export function isMultiStepTest(x: unknown): x is MultiStepTest {
    return MultiStepTestSchema.safeParse(x).success;
}