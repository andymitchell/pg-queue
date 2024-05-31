import { z } from "zod";
import { sqlFilterReaderNode } from "../install/utils/sqlFileReaderNode";

import { TestDb } from "../utils/TestDb";
import { MultiStepPgQueue } from "./MultiStepPgQueue";
import { PgTestable } from "@andyrmitchell/pg-testable";


// Keep it cached betweeen tests
let provider:PgTestable;
beforeAll(async () => {
    provider = new PgTestable({type: 'pglite'});
})
afterAll(async () => {
    await provider.dispose();
})

describe('MultiStepPgQueue', () => {


    test('MultiStepPgQueue basic', async () => {

        const db = new TestDb(sqlFilterReaderNode, provider);

        const state: {
            current_step?: {
                id: string,
                jobID: number,
                payload: any
            }
        } = {};

        const queueName = 'test_q1';
        

        const msq = new MultiStepPgQueue(
            db,
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

    test('MultiStepPgQueue longrunner style', async () => {

        const db = new TestDb(sqlFilterReaderNode, provider);

        const state: {
            current_step?: {
                id: string,
                jobID: number,
                payload: any
            }
        } = {};

        const queueName = 'test_q1';
        

        const msq = new MultiStepPgQueue(
            db, 
            queueName,
            [
                {
                    id: 'no1',
                    handler: async (payload, jobID) => {
                        state.current_step = {id: 'no1', jobID, payload};
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

        await msq.addJob({
            name: 'Alice'
        });

        const resultCount1 = await db.query({q: `SELECT * FROM ${db.schema}.job_queue`, args: []});
        expect(resultCount1.rows.length).toBe(2);
        expect(resultCount1.rows[0]!.payload.name).toBe('Bob');
        expect(resultCount1.rows[1]!.payload.name).toBe('Alice');
        
        const result1 = await msq.processNextJob();
        expect(result1.status).toBe('ok'); if( result1.status!=='ok') throw new Error("noop - typeguard");
        expect(result1.had_job).toBe(true);

        const resultCount2 = await db.query({q: `SELECT * FROM ${db.schema}.job_queue`, args: []});
        expect(resultCount2.rows.length).toBe(1);

        const result2 = await msq.processNextJob();
        expect(result2.status).toBe('ok'); if( result2.status!=='ok') throw new Error("noop - typeguard");
        
        const resultCount3 = await db.query({q: `SELECT * FROM ${db.schema}.job_queue`, args: []});
        expect(resultCount3.rows.length).toBe(0);

        const result3 = await msq.processNextJob();
        expect(result3.status).toBe('ok'); if( result3.status!=='ok') throw new Error("noop - typeguard");
        expect(result3.had_job).toBe(false);

    })

});