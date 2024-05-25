import { z } from "zod";
import { sqlFilterReaderNode } from "../install/utils/sqlFileReaderNode";

import { TestDb } from "../utils/TestDb";
import { MultiStepPgQueue } from "./MultiStepPgQueue";


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

describe('MultiStepPgQueue', () => {


    test('MultiStepPgQueue basic', async () => {

        const db = new TestDb(sqlFilterReaderNode, 'pglite');

        const state: {
            current_step?: {
                id: string,
                jobID: number,
                payload: any
            }
        } = {};

        const queueName = 'test_q1';
        

        const msq = new MultiStepPgQueue(
            db.db, 
            queueName,
            [
                {
                    id: 'no1',
                    handler: async (payload, jobID) => {
                        state.current_step = {id: 'no1', jobID, payload};
                    }
                },
                {
                    id: 'no2',
                    handler: async (payload, jobID) => {
                        state.current_step = {id: 'no2', jobID, payload};
                    }
                }
            ],
            z.object({name: z.string()}),
            undefined, 
            db.schema
        )
        const q = msq.getRawQueue();

        await msq.addJob({
            name: 'Bob'
        });

        const job1 = await q.pickNextJob();
        expect(!!job1).toBe(true); if( !job1 ) throw new Error("noop - typeguard");


        expect(msq.ownsJob(job1.job)).toBe(true);

        await msq.processJob(job1.job);
        expect(state.current_step?.id).toBe('no1');

        const job2 = await q.pickNextJob();
        expect(!!job2).toBe(true); if( !job2 ) throw new Error("noop - typeguard");

        await msq.processJob(job2.job);
        expect(state.current_step?.id).toBe('no2');

        const job3 = await q.pickNextJob();
        expect(job3).toBe(undefined);


    })

});