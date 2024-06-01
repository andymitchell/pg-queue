import { sleep } from "@andyrmitchell/utils";
import { PgQueue, PostgresDb } from "../../..";

export async function main() {
    const db = new PostgresDb({/*TODO psql terms*/});

    const queue = new PgQueue(db, 'test_q1');

    

    while(true) {
        const result = await queue.pickNextJob();
        if( result ) {
            try {
                // <Do queue-specific processing here> 
    
                queue.releaseJob(result.job.job_id, 'complete');
            } catch(e) {
                queue.releaseJob(result.job.job_id, 'failed');
            }
        } else {
            // Chill - the queue is empty
            await sleep(500);
        }
    }
}
main();