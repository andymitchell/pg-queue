import { sleep } from "@andyrmitchell/utils";
import { sqlFilterReaderNode } from "../install/utils/sqlFileReaderNode"
import { TestDb } from "../utils/TestDb"
import { PgQueue } from "./PgQueue";


// Keep it cached betweeen tests
let dbs:TestDb[] = []
beforeAll(async () => {
    dbs.push(new TestDb(sqlFilterReaderNode, 'pglite'));
})
afterAll(async () => {
    for( const db of dbs ) {
        await db.close();
    }
})

describe('PgQueue', () => {

    test('PgQueue add job', async () => {
        const db = new TestDb(sqlFilterReaderNode, 'pglite');

        const queue = new PgQueue<{name: string}>(db.db, 'test_q1', db.schema);

        await queue.addJob({name: 'Bob'});

        const result = await db.db.query({q: `SELECT * FROM ${db.schema}.job_queue`, args: []});
        expect(result.rows.length).toBe(1);

        
        

    }, 1000*20);

    test('PgQueue pick and release job', async () => {
        const db = new TestDb(sqlFilterReaderNode, 'pglite');

        const queue = new PgQueue<{name: string}>(db.db, 'test_q1', db.schema);

        await queue.addJob({name: 'Bob'});

        // Pick it
        const job = await queue.pickNextJob();
        expect(!!job).toBe(true); if( !job ) throw new Error("noop - typeguard");
        expect(job.job.payload.name).toBe('Bob');

        // Confirm processing in db
        const result = await db.db.query({q: `SELECT * FROM ${db.schema}.job_queue`, args: []});
        expect(result.rows.length).toBe(1);
        expect(result.rows[0]?.status).toBe('processing');

        // Confirm cannot pick another
        const job2 = await queue.pickNextJob();
        expect(job2).toBe(undefined);

        // Release it
        job.release('complete');
        const result2 = await db.db.query({q: `SELECT * FROM ${db.schema}.job_queue`, args: []});
        expect(result2.rows.length).toBe(0);
        
        // Pick again - confirm cannot
        const job3 = await queue.pickNextJob();
        expect(job3).toBe(undefined);
    

    }, 1000*20);

    test('PgQueue pick and fail job', async () => {
        const db = new TestDb(sqlFilterReaderNode, 'pglite');

        const queue = new PgQueue<{name: string}>(db.db, 'test_q1', db.schema);
        queue.getConfig().set({
            pause_between_retries_milliseconds: 100,
            timeout_milliseconds: 30000,
            timeout_with_result: "complete",
            max_concurrency: 10
        })

        await queue.addJob({name: 'Bob'});

        // Pick it
        const job = await queue.pickNextJob();
        expect(!!job).toBe(true); if( !job ) throw new Error("noop - typeguard");
        expect(job.job.payload.name).toBe('Bob');

        // Fail it
        job.release('failed');
        const result2 = await db.db.query({q: `SELECT * FROM ${db.schema}.job_queue`, args: []});
        expect(result2.rows.length).toBe(1);

        // Pick again - confirm cannot
        const job3 = await queue.pickNextJob();
        expect(job3).toBe(undefined);
        
        await sleep(200);

        // Pick again after retry timeout - should work
        const job4 = await queue.pickNextJob();
        expect(!!job4).toBe(true); if( !job4 ) throw new Error("noop - typeguard");
    

    }, 1000*20);

})