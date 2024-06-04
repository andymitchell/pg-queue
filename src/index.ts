import { z } from "zod";
import { install } from "./install/module";
import { MultiStepPgQueuePayloadSchemaBase, MultiStepPgQueue, createMultiStepPgQueueAsRecord } from "./multi-step-pg-queue";
import { PgQueueJobReleaseTypes, PgQueue, isPgQueueJob, makePgQueueJobSchema, pgqc } from "./pg-queue";
import { DEFAULT_SCHEMA, DbQuery, Queryable } from "./types";
import { PostgresDb } from "./utils/PostgresDb";
import { PgQueueConfig } from "./pg-queue-config";
import { Dispatcher, DispatcherOptions } from "./workers";
import { HttpError } from "./utils/HttpError";
import { IFileIo, fileIoNode } from "@andyrmitchell/file-io";

export {
    install,
    fileIoNode,
    PostgresDb,
    DEFAULT_SCHEMA
}

export {
    PgQueue,
    MultiStepPgQueue,
    createMultiStepPgQueueAsRecord,
    PgQueueConfig,
    Dispatcher,
    pgqc,
    HttpError
}

export {
    isPgQueueJob,
    makePgQueueJobSchema,
    MultiStepPgQueuePayloadSchemaBase
}

// #ZOD_SCHEMA_COMPATIBILITY Export zod, as an issue with Zod means that schemas passed in must be created with a compatible version
export {
    z
}

export type {
    IFileIo,
    Queryable,
    DbQuery,
    DispatcherOptions,
    PgQueueJobReleaseTypes
}


