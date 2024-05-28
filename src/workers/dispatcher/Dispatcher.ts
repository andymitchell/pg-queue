/* 
Only use this if you can't use dispatcher directly inside Postgres (it requires pg_net and pg_cron to be installed in postgres)
It can be run in a long worker (set exitAfterSeconds to undefined), or called by a cron as a HTTP endpoint (in which case make exitAfterSeconds match the cycle of the cron, and fall under the time limit of the http endpoint).
*/

/*
#MANUAL_RELEASE

Manual release = the job http end point is responsible for releasing the job (instead of this loop). 
That means this doesn't need to stay alive long enough to track every spawned job finishes.


*/


import { pgqc } from "../../pg-queue";
import {  QueueConfigActiveEndpointDb, QueueConfig, pgqcc } from "../../pg-queue-config";
import { DEFAULT_SCHEMA, Queryable} from "../../types";
import { sleep } from "@andyrmitchell/utils";



type DispatcherOptions = {
    testing?: {
        max_loops?: number,
        call_synchronously?: boolean,
        exit_after_inactive_seconds?: number
    }
}

export class Dispatcher {
    private db: Queryable;
    private schemaName: string;
    private exitAfterSeconds?:number;
    private options?: DispatcherOptions;

    constructor(db: Queryable, exitAfterSeconds = 30, schemaName = DEFAULT_SCHEMA, options?: DispatcherOptions) {
        this.db = db;
        this.schemaName = schemaName ?? DEFAULT_SCHEMA;
        this.exitAfterSeconds = exitAfterSeconds ?? undefined;
        this.options = options;

        this.startLoop();
    }

    private async startLoop() {
        // Stop it getting clogged
        await pgqc.checkAndReleaseTimedOutJobs(this.db, this.schemaName);
        
        // Get the queues this works for (those that use a http end point)
        const queueRows = await pgqcc.listQueues(this.db, {endpoint_active: true}, this.schemaName);
        const queues:QueueConfigActiveEndpointDb[] = queueRows.filter((config:QueueConfig):config is QueueConfigActiveEndpointDb => {
            if( config.endpoint_active ) {
                if( !config.endpoint_manual_release ) { // #MANUAL_RELEASE
                    console.debug("Can only process manual config, because this Edge function probably cannot keep alive long enough to check the job completed. Therefore the called http job must release itself.");
                    return false;
                }
                return true;
            }
            return false;
        });
        const queueNames = queues.map(config => config.queue_name);
        
        
        // Loop until an exit is required:
        
        const exitAtTs = this.exitAfterSeconds? Date.now() + (this.exitAfterSeconds * 1000) : (Date.now() * 2);
        let lastActivityTs = Date.now();
        let cancelRun = false;
        let loopsRemaining = typeof this.options?.testing?.max_loops==='number'? this.options.testing.max_loops : Infinity;
        while( Date.now() < exitAtTs && 
            !cancelRun && 
            --loopsRemaining>=0 && 
            (!this.options?.testing?.exit_after_inactive_seconds || ((Date.now()-lastActivityTs)/1000) < this.options?.testing?.exit_after_inactive_seconds) 
            ) {
            // Periodically let clogged jobs time out 
            const secondsRemaining = Math.round((exitAtTs-Date.now())/1000);
            if( (secondsRemaining % 15)===0 && secondsRemaining!==0 && secondsRemaining!==this.exitAfterSeconds ) {
                await pgqc.checkAndReleaseTimedOutJobs(this.db, this.schemaName);
            }

            

            // Pick the next job 
            const nextJob = await pgqc.pickNextJob(this.db, undefined, queueNames, undefined, undefined, this.schemaName);
            if( nextJob ) {
                //console.log('#JOBLOOP nextJob', nextJob);
                const queue = queues.find(x => x.queue_name===nextJob.queue_name);
                if( !queue ) throw new Error("queue should always be present since it selected jobs based on a range it knows about");

                
                const callEndpoint = async () => {
                    try {
                        // Prep for the Fetch: generate headers, body and url 
                        const headers:Record<string, string> = {
                            'Content-Type': 'application/json'
                        };
                        const apiKey = await pgqcc.getQueueEndPointApiKey(this.db, queue.queue_name, this.schemaName);
                        if( apiKey ) headers['Authorization'] = `Bearer ${apiKey}`;
                        const body = nextJob;

                        let url = queue.endpoint_url;
                        if (queue.endpoint_method === 'GET') {
                            const urlObject = new URL(queue.endpoint_url);
                            urlObject.searchParams.set('body', JSON.stringify(nextJob));
                            url = urlObject.toString();
                        }

                        // Run the fetch 
                        const response = await fetch(url, {
                            method: queue.endpoint_method,
                            headers: queue.endpoint_method === 'POST' ? headers : undefined,
                            body: queue.endpoint_method === 'POST' ? JSON.stringify(body) : undefined,
                        });
                
                        // Close the response
                        const responseData = await response.json();

                        // Check for rate limiting (HTTP status 429)
                        if (response.status === 429) {
                            cancelRun = true;
                            console.warn('Rate limited by endpoint, cancelling run.');
                        } else if (!response.ok) {
                            console.warn(`${response.status} The endpoint '${queue.endpoint_url}' could not process the job. Is it correctly set up to handle jobs for ${queue.queue_name}?\nJob data sent: ${JSON.stringify(body)}\nError received: ${JSON.stringify(responseData)}`);
                        } else {
                            // Success. Nothing to do as as Job releases (#MANUAL_RELEASE)
                            
                        }
                    } catch (error) {
                        // TODO Do a release job here just to log the error (even though the multi-step might have also done that)
                        console.warn(`Unknown error sending job to endpoint '${queue.endpoint_url}':`, error);
                    }
                };

                if( this.options?.testing?.call_synchronously ) {
                    // In the testing environment, we don't want the call to fall out of step with any environment changes we might have made (e.g. mocking 'fetch')
                    await callEndpoint();
                } else {
                    // Push the job out to a http end point (no need to wait for a response #MANUAL_RELEASE)
                    callEndpoint();
                }
                lastActivityTs = Date.now();
                
            } else {
                // Edge Functions time out after 100ms CPU use. Don't waste cycles:
                // If nothing in the queue, relax for a bit before hitting the db again.
                await sleep(500); 
            }
        }
    }
}
