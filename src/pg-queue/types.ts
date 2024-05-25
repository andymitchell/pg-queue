import { z } from "zod";
import { IPgQueueBase } from "../types";
import { IPgQueueConfig } from "../pg-queue-config";

export interface IPgQueue<T extends object> extends IPgQueueBase<T> {
    //makeAddJobQuery(pPayload: T, pRetriesRemaining?:number, pStartAfter?: Date, customTimeoutMs?:number, customTimeoutWithResult?:JobQueueReleaseTypes): DbQuery
    //addJobByQuery(query:DbQuery, transaction?:Queryable): Promise<void>;

    pickNextJob(pIgnoreMaxConcurrency?: boolean): Promise<PickedJob<T> | undefined> 
    releaseJob(pJobId: number, pResult: JobQueueReleaseTypes): Promise<void>

    getConfig():IPgQueueConfig;

    getQueueEndPointApiKey():Promise<string | undefined>
    setQueueEndPointApiKey(apiKey:string):Promise<void>;
}


export const makeJobQueueDbSchema = <T extends z.ZodTypeAny>(
    payloadSchema: T = z.record(z.unknown()) as unknown as T
) => z.object({
    job_id: z.number(),
    queue_name: z.string(),
    payload: payloadSchema,
    status: z.enum(['', 'processing', 'complete', 'failed'] as const),
    start_after: z.union([z.string(), z.date()]).optional(),
    retries_remaining: z.number().int().nonnegative().optional(),
    created_at: z.union([z.string(), z.date()]).optional(),
    status_updated_at: z.union([z.string(), z.date()]).optional(),
});

const JobQueueDbSchemaBase = makeJobQueueDbSchema();
export type JobQueueDbBase = z.infer<typeof JobQueueDbSchemaBase>;

export type JobQueueReleaseTypes = 'complete' | 'failed' | 'paused';

export type PickedJob<T extends object = object> = {
    job: JobQueueDb<T>,
    release: (result:JobQueueReleaseTypes) => Promise<void>,
    keepAlive: () => Promise<void>,
}
export type JobQueueDb<T extends object = object> = Omit<JobQueueDbBase, 'payload'> & { payload: T };


// This is flexible. You can pass a generic only, and it'll tell you the output is the generic (no matter what it actually is). Or you can pass a schema only, and it'll infer. Or you can pass both, and it'll tell you if there's a mismatch. I still think schema-only (strict) might be best.
export function isJobQueueDb<T extends object = object, PayloadSchema extends z.Schema<T> = z.Schema<T>>(
    x: unknown,
    payloadSchema?: PayloadSchema
): x is JobQueueDb<z.infer<PayloadSchema>> {
    const schema = makeJobQueueDbSchema(payloadSchema);
    return schema.safeParse(x).success;
}

// Possibly should be the only way. It infers the type from the schema 
export function isJobQueueDbStrict<PayloadSchema extends z.ZodTypeAny>(
    x: unknown,
    payloadSchema: PayloadSchema
): x is JobQueueDb<z.infer<PayloadSchema>> {
    const schema = makeJobQueueDbSchema(payloadSchema);
    return schema.safeParse(x).success;
}
