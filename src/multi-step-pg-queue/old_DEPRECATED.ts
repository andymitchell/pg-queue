import { isJobQueueDb } from "../types.js";
import * as friendlymq from '../index.js';
import { HttpError } from "../utils/HttpError.js";
import { queryObject } from "../../../postgres-helpers/index.ts";
import { MultiStep, MultiStepJobQueueDbPayload, MultiStepTest, Steps, isMultiStepJobQueueDb, isMultiStepTest } from "./types.js";
import z from "https://deno.land/x/zod@v3.22.4/index.ts";
import * as postgres from "https://deno.land/x/postgres@v0.17.0/mod.ts";
import * as dblog from "../../../dblog.ts";
import { LogItem } from "../../../workflows/products/utils/product_log/types.ts";





type NextStepOptions = {
    testing?: {
        prevent_fan_out: boolean
    }
}

export function createMultiStep<T extends object, PayloadSchema extends z.Schema<T> = z.Schema<T>>(
    id: string,
    queue_name: string,
    steps: Steps<T>,
    schema?: PayloadSchema
) {

    if( (new Set(steps.map(x => x.id))).size!==steps.length ) {
        throw new Error("Duplicate IDs in the steps are not allowed. MultiStep ID: "+id);
    }

    // TODO Have a safety check to see if identical multi-step 'id' for a given queue_name created in this environment, as that would indicate a problem 
    const multiStep:MultiStep<T> = {
        id,
        queue_name,
        create: async (payload: T, transaction?:postgres.Transaction) => {
            const query = multiStep.makeAddJobQuery(payload, steps[0].id, steps[0].custom_timeout_milliseconds);
            await friendlymq.addJobByQuery(query, transaction);
        },
        makeAddJobQuery: (payload: T, step_id?: string, customTimeout?: number) => {
            if (step_id === undefined) step_id = steps[0].id;
            if (!steps.find(step => step.id === step_id)) throw new Error("Unknown step id");

            if (schema) {
                const parseResult = schema.safeParse(payload);
                if (!parseResult.success) {
                    console.log("MultiStep parse fail", parseResult.error, payload, { id, queue_name });
                    throw new Error("MultiStep payload schema mismatch");
                }
            }

            const finalPayload: MultiStepJobQueueDbPayload<T> = {
                ...payload,
                multi_step_id: id,
                step_id
            }
            return friendlymq.makeAddJobQuery(multiStep.queue_name, finalPayload, undefined, undefined, customTimeout);
        },
        runStep: async (step_id = '', payload:MultiStepJobQueueDbPayload<T>, jobID:number) => {
            const idx = multiStep.steps.findIndex(x => x.id === step_id);
            if (idx === -1) {
                throw new HttpError('Unknown step ID - was it implemented?', 400);
            }
            const step = multiStep.steps[idx];
            const nextStep = multiStep.steps[idx + 1];
            const next_step = nextStep? {
                id: nextStep.id,
                custom_timeout_milliseconds: nextStep.custom_timeout_milliseconds
            } : undefined;
            

            const release_action = await step.handler(payload, jobID);

            return {next_step, release_action};
        },
        steps,
        schema
    }
    return multiStep;
}

/**
 * Variant of createMultiStep where schema is required, and type is fully inferred from schema 
 */
// deno-lint-ignore no-explicit-any
export function createMultiStepWithSchema<K extends string, S extends z.ZodSchema<any>>(
    id: K,
    queue_name: string,
    steps: Steps<z.infer<S>>,
    schema: S
): MultiStep<z.infer<S>> {
    return createMultiStep(id, queue_name, steps, schema)
}

/**
 * Variant of createMultiStep, to make creating declarations cleaner, e.g. `const declarations = {...createMultiStepWithSchemaAsRecord('v1'), ...createMultiStepWithSchemaAsRecord('v2')}` is equivelent to `const declarations =  {v1:MultiStep, v2: MultiStep}`.
 * Note TypeScript can fully infer the type of the final object, so this is possible: `declarations.v1.start(payload)`, and it'll be fully typed, including the payload (against the schema).
 * It achieves this by returning the MultiStep as {[id]: MultiStep}.
 * It also fully types the MultiStep just from the schema. 
 */
// deno-lint-ignore no-explicit-any
export function createMultiStepWithSchemaAsRecord<K extends string, S extends z.ZodSchema<any>>(
    id: K,
    queue_name: string,
    steps: Steps<z.infer<S>>,
    schema: S
): { [P in K]: MultiStep<z.infer<S>> } {
    return {
        [id]: createMultiStep(id, queue_name, steps, schema)
    } as { [P in K]: MultiStep<z.infer<S>> }
}


/**
 * Tests each given multiStep to make sure that: 1) the queue exists for it 2) the queue endpoint is a runNextStep handler configured for the same multiStep.
 * Use it in a test suite to cover all multiSteps.
 * @param multiSteps 
 */
// deno-lint-ignore no-explicit-any
export async function testMultiStepConfig(multiSteps: MultiStep<any>[]) {
    const queues = await queryObject<{ queue_name: string, endpoint_method: string, endpoint_url: string }>({ q: `SELECT queue_name, endpoint_method, endpoint_url FROM friendlymq.queue_config`, args: [] })
    for (const multiStep of multiSteps) {
        // Check the queue exists
        const queue = queues.find(queue => queue.queue_name === multiStep.id);
        if (!queue) throw new Error(`Queue did not exist: ${multiStep.id}`);

        // Fire a test with the multi_step_id at the end point, and how it responds
        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        };
        const apiKey = await friendlymq.getQueueEndPointApiKey(queue.queue_name);
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
        const body: MultiStepTest = { testing_multi_step_id: multiStep.id };

        let url = queue.endpoint_url;
        if (queue.endpoint_method === 'GET') {
            const urlObject = new URL(queue.endpoint_url);
            urlObject.searchParams.set('body', JSON.stringify(body));
            url = urlObject.toString();
        }


        // Run the fetch 
        const response = await fetch(url, {
            method: queue.endpoint_method,
            headers: queue.endpoint_method === 'POST' ? headers : undefined,
            body: queue.endpoint_method === 'POST' ? JSON.stringify(body) : undefined,
        });

        const responseBody = await response.json();
        if (!response.ok) {
            throw new Error(`${response.status} Queue end point (${queue.endpoint_method} ${queue.endpoint_url}) not multi-step (or wrong kind). Received: ${JSON.stringify(responseBody)}`);
        }

    }
}

// deno-lint-ignore no-explicit-any
export async function handleMultistepEndpoint(requestBody: unknown, availableMultiSteps: MultiStep<any>[], options?: NextStepOptions) {
    // Is it a test? 
    if (isMultiStepTest(requestBody)) {
        const multiStepForTest = availableMultiSteps.find(x => x.id === requestBody.testing_multi_step_id);
        if (!multiStepForTest) {
            throw new HttpError('Test failed. This is not the expected handler.', 400);
        }
        console.log("Happily aborting multi-step OK: it's just a test");
        return;
    }

    // Is it a job queue + multi-step item? 
    if (isMultiStepJobQueueDb(requestBody)) {


        // Does it match any ID of the available multi steps? 
        const multiStep = availableMultiSteps.find(x => x.id === requestBody.payload.multi_step_id);
        if (!multiStep) {
            throw new HttpError('The requested MultiStep is not available at this endpoint. Hint: check availableMultisteps. Requested: ' + requestBody.payload.multi_step_id, 400);
        }

        // TODO Validate the schema of the payload 

        // Run it
        try {
            
            const {next_step, release_action} = await multiStep.runStep(requestBody.payload.step_id || '', requestBody.payload, requestBody.job_id);
            const final_release_action = release_action? release_action : 'complete';
            await friendlymq.releaseJob(requestBody.job_id, final_release_action);

            // Add a job to the queue to run this function again, for the next step 
            if( final_release_action==='complete' ) {
                if (next_step && !options?.testing?.prevent_fan_out) {
                    await friendlymq.addJobByQuery(multiStep.makeAddJobQuery(requestBody.payload, next_step.id, next_step.custom_timeout_milliseconds));
                }
            }
        } catch(e) {
            
    
            

            console.warn("MultiStep job failed", requestBody, e);
            await friendlymq.releaseJob(requestBody.job_id, 'failed');

            if( e instanceof Error ) {
                const logDetails:LogItem = {
                    type: 'error',
                    event: 'unknown_error_handling_multistep',
                    error: {
                        message: e.message
                    },
                    additional: {
                        requestBody
                    },
                    created_at: (new Date)
                };

                dblog.insert_log(logDetails);
            }


            throw e;
        }


    } else {
        // If it's an actual job (just not a multi-step), release it so it doesn't clog the queue. (It's just routed incorrectly). 
        if (isJobQueueDb(requestBody)) {
            await friendlymq.releaseJob(requestBody.job_id, 'failed');
        }
        // Always throw an error
        throw new HttpError(`The data was not a MultiStep job type. The queue shouldn't have routed it to this endpoint. Job data: ${JSON.stringify(requestBody)}`, 400);
    }

}
