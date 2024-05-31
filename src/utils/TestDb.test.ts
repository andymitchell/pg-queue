import { PgTestable } from "@andyrmitchell/pg-testable";
import { pgqFileReaderNode } from "../install/utils/pgqFileReaderNode";
import { TestDb } from "./TestDb";

describe('TestDb', () => {


    test('basic TestDb with pglite', async () => {
        const tester = new TestDb(pgqFileReaderNode);
        const result = await tester.query({
            q: `SELECT * FROM ${tester.schema}.job_queue`,
            args: []
        });
        // Really testing it doesn't crash - i.e. it's installed and returns
        expect(result.rows.length).toBe(0);
    })

    test('reuses cache in TestDb with pglite', async () => {
        const provider = new PgTestable({type: 'pglite'});
        const tester1 = new TestDb(pgqFileReaderNode, provider);
        const tester2 = new TestDb(pgqFileReaderNode, provider);


        expect(tester1.schema===tester2.schema).toBe(false);

        // tester1 should have access to tester2's schema (if the same instance)
        const result = await tester1.query({
            q: `SELECT * FROM ${tester2.schema}.job_queue`,
            args: []
        });
        // Really testing it doesn't crash - i.e. it's installed and returns
        expect(result.rows.length).toBe(0);

        
    })


    test('after close, nothing can query', async () => {
        const tester1 = new TestDb(pgqFileReaderNode);

        await tester1.close();

        let hasError = false;
        try {
            const result = await tester1.query({
                q: `SELECT * FROM ${tester1.schema}.job_queue`,
                args: []
            });
        } catch(e) {
            hasError = true;
        }
        
        expect(hasError).toBe(true);
        
    })

    test('closing 1 does not kill another', async () => {
        const provider = new PgTestable({type: 'pglite'});
        const tester1 = new TestDb(pgqFileReaderNode, provider);
        const tester2 = new TestDb(pgqFileReaderNode, provider);

        await tester2.close();

        
        // Expect tester1 still runs fine
        const result = await tester1.query({
            q: `SELECT * FROM ${tester1.schema}.job_queue`,
            args: []
        });
        expect(result.rows.length).toBe(0);

        // tester1 should error trying to access to tester2's schema, now it's removed 
        let hasError = false;
        try {
            const result = await tester1.query({
                q: `SELECT * FROM ${tester2.schema}.job_queue`,
                args: []
            });
        } catch(e) {
            hasError = true;
        }
        
        expect(hasError).toBe(true);
        
    })

})