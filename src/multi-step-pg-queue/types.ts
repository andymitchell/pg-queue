
import { z } from "zod";
import { IPgQueueBase, Queryable } from "../types";
import { JobQueueReleaseTypes, JobQueueDb, isJobQueueDb, IPgQueue } from "../pg-queue";



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
    handler: (job:MultiStepJobQueueDbPayload<T>, jobID: number) => Promise<void | JobQueueReleaseTypes>,
    custom_timeout_milliseconds?: number
}
export type Steps<T> = Step<T>[];
/*
export type MultiStep<T extends object> = {
    id: MultiStepID, 
    queue_name: string, 
    create: (payload:T, transaction?:postgres.Transaction) => Promise<void>,
    runStep: (step_id:string, payload:MultiStepJobQueueDbPayload<T>, jobID: number) => Promise<{ next_step?: {id: string, custom_timeout_milliseconds?: number}, release_action?: void | JobQueueReleaseTypes }>,
    makeAddJobQuery: (payload:T, step_id?:string, customTimeout?:number ) => DbQuery,
    steps: Steps<T>, // CONSTRAINT: Each step may rerun (if it fails), so it should either only execute one mutation command, or guarantee each mutation command is idempotent
    schema?: z.Schema<T>
}
*/

export const MultiStepPayloadSchemaBase = z.object({ // FYI There's probably more on the payload 
    multi_step_id: z.string(),
    step_id: z.string().optional(),
})

export type MultiStepJobQueueDbPayload<T = object> = T & z.infer<typeof MultiStepPayloadSchemaBase>;
export type MultiStepJobQueueDb<T = object> = JobQueueDb<MultiStepJobQueueDbPayload<T>>


export function isMultiStepJobQueueDb(x: unknown): x is MultiStepJobQueueDb {
    return isJobQueueDb(x, MultiStepPayloadSchemaBase);
}

const MultiStepTestSchema = z.object({
    "testing_multi_step_id": z.string()
});
export type MultiStepTest = z.infer<typeof MultiStepTestSchema>;
export function isMultiStepTest(x: unknown): x is MultiStepTest {
    return MultiStepTestSchema.safeParse(x).success;
}