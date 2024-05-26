// Set up an endpoint per queue 

import { PgQueue } from "../../../pg-queue";
import { Queryable } from "../../../types";
import { PostgresDb } from "../../../utils/PostgresDb";


const db = new PostgresDb({/*TODO psql terms*/});

const queue = new PgQueue(db, 'test_q1');

export async function serveOverHttp(req:Request) {
    
    const body = await req.json();

    // Check this given queue owns it
    if( queue.ownsJob(body) ) {
        try {
            // <Do queue-specific processing here> 

            queue.releaseJob(body.job_id, 'complete');
        } catch(e) {
            queue.releaseJob(body.job_id, 'failed');
        }
    }

    
}