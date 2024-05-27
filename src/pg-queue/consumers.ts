
import { PostgresHelpers } from "@andyrmitchell/utils";
import { DEFAULT_SCHEMA, Queryable } from "../types";
import {JobQueueDb, JobQueueReleaseTypes } from "./types";



export async function pickNextJob<T extends object>(db:Queryable, pQueueName?: string, pAllowedQueueNames?: string[], pMultiStepId?:string, pIgnoreMaxConcurrency?: boolean, schema = DEFAULT_SCHEMA): Promise<JobQueueDb<T> | undefined> {
    const result = await db.query<JobQueueDb<T>>({ q: `SELECT * FROM ${PostgresHelpers.escapeIdentifier(schema)}.pick_next_job($1, $2, $3, $4)`, args: [pQueueName ?? null, pAllowedQueueNames ?? null, pMultiStepId ?? null, pIgnoreMaxConcurrency ?? false] });
    return result.rows[0];
}

export async function keepJobAlive(db:Queryable, pJobId: number, schema = DEFAULT_SCHEMA): Promise<void> {
    await db.query({ q: `SELECT ${PostgresHelpers.escapeIdentifier(schema)}.keep_job_alive($1)`, args: [pJobId] });
}

export async function releaseJob(db:Queryable, pJobId: number, pResult: JobQueueReleaseTypes, schema = DEFAULT_SCHEMA): Promise<void> {
    await db.query({ q: `SELECT ${PostgresHelpers.escapeIdentifier(schema)}.release_job($1, $2)`, args: [pJobId, pResult] });
}



export async function checkAndReleaseTimedOutJobs(db:Queryable, schema = DEFAULT_SCHEMA): Promise<void> {
    await db.query({ q: `SELECT ${PostgresHelpers.escapeIdentifier(schema)}.check_and_release_timed_out_jobs()`, args: [] });
}