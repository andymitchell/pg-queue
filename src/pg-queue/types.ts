import { z } from "zod";
import { IPgQueueBase, Queryable } from "../types";
import { IPgQueueConfig } from "../pg-queue-config";

export interface IPgQueue<T extends object> extends IPgQueueBase<T> {
    //makeAddJobQuery(pPayload: T, pRetriesRemaining?:number, pStartAfter?: Date, customTimeoutMs?:number, customTimeoutWithResult?:PgQueueJobReleaseTypes): DbQuery
    //addJobByQuery(query:DbQuery, transaction?:Queryable): Promise<void>;

    pickNextJob(pIgnoreMaxConcurrency?: boolean, transaction?: Queryable): Promise<PickedJob<T> | undefined> 
    releaseJob(pJobId: number, pResult: PgQueueJobReleaseTypes, transaction?: Queryable): Promise<void>
    ownsJob(x: unknown):x is PgQueueJob<T>;

    getConfig():IPgQueueConfig;

    getQueueEndPointApiKey():Promise<string | undefined>
    setQueueEndPointApiKey(apiKey:string):Promise<void>;
}


export const makePgQueueJobSchema = <T extends z.ZodTypeAny>(
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

const PgQueueJobSchemaBase = makePgQueueJobSchema();
export type PgQueueJobBase = z.infer<typeof PgQueueJobSchemaBase>;

export type PgQueueJobReleaseTypes = 'complete' | 'failed' | 'paused';

export type PickedJob<T extends object = object> = {
    job: PgQueueJob<T>,
    release: (result:PgQueueJobReleaseTypes) => Promise<void>,
    keepAlive: () => Promise<void>,
}
export type PgQueueJob<T extends object = object> = Omit<PgQueueJobBase, 'payload'> & { payload: T };


// This is flexible. You can pass a generic only, and it'll tell you the output is the generic (no matter what it actually is). Or you can pass a schema only, and it'll infer. Or you can pass both, and it'll tell you if there's a mismatch. I still think schema-only (strict) might be best.
export function isPgQueueJob<T extends object = object, PayloadSchema extends z.Schema<T> = z.Schema<T>>(
    x: unknown,
    payloadSchema?: PayloadSchema
): x is PgQueueJob<z.infer<PayloadSchema>> {
    const schema = makePgQueueJobSchema(payloadSchema);
    return schema.safeParse(x).success;
}

// Possibly should be the only way. It infers the type from the schema 
export function isPgQueueJobStrict<PayloadSchema extends z.ZodTypeAny>(
    x: unknown,
    payloadSchema: PayloadSchema
): x is PgQueueJob<z.infer<PayloadSchema>> {
    const schema = makePgQueueJobSchema(payloadSchema);
    return schema.safeParse(x).success;
}
