import { sqlFilterReaderNode } from "../install/utils/sqlFileReaderNode";
import { TestDb } from "./TestDb";

test('basic TestDb with pglite', async () => {
    const tester = new TestDb(sqlFilterReaderNode, 'pglite');
    const result = await tester.db.query({
        q: `SELECT * FROM ${tester.schema}.job_queue`,
        args: []
    });
    // Really testing it doesn't crash - i.e. it's installed and returns
    expect(result.rows.length).toBe(0);
})

test('reuses cache in TestDb with pglite', async () => {
    const tester1 = new TestDb(sqlFilterReaderNode, 'pglite');
    const tester2 = new TestDb(sqlFilterReaderNode, 'pglite');


    expect(tester1.schema===tester2.schema).toBe(false);

    // tester1 should have access to tester2's schema (if the same instance)
    const result = await tester1.db.query({
        q: `SELECT * FROM ${tester2.schema}.job_queue`,
        args: []
    });
    // Really testing it doesn't crash - i.e. it's installed and returns
    expect(result.rows.length).toBe(0);

    
})

test('forceFresh prevents reusing cache in TestDb with pglite', async () => {
    const tester1 = new TestDb(sqlFilterReaderNode, 'pglite');
    const tester2 = new TestDb(sqlFilterReaderNode, 'pglite', true);


    // tester1 should have access to tester2's schema (if the same instance)
    let hasError = false;
    try {
        const result = await tester1.db.query({
            q: `SELECT * FROM ${tester2.schema}.job_queue`,
            args: []
        });
    } catch(e) {
        hasError = true;
    }
    
    expect(hasError).toBe(true);
    
})

test('after close, nothing can query', async () => {
    const tester1 = new TestDb(sqlFilterReaderNode, 'pglite');

    await tester1.close();

    let hasError = false;
    try {
        const result = await tester1.db.query({
            q: `SELECT * FROM ${tester1.schema}.job_queue`,
            args: []
        });
    } catch(e) {
        hasError = true;
    }
    
    expect(hasError).toBe(true);
    
})

test('closing 1 does not kill another', async () => {
    const tester1 = new TestDb(sqlFilterReaderNode, 'pglite');
    const tester2 = new TestDb(sqlFilterReaderNode, 'pglite');

    await tester2.close();

    
    // Expect tester1 still runs fine
    const result = await tester1.db.query({
        q: `SELECT * FROM ${tester1.schema}.job_queue`,
        args: []
    });
    expect(result.rows.length).toBe(0);

    // tester1 should error trying to access to tester2's schema, now it's removed 
    let hasError = false;
    try {
        const result = await tester1.db.query({
            q: `SELECT * FROM ${tester2.schema}.job_queue`,
            args: []
        });
    } catch(e) {
        hasError = true;
    }
    
    expect(hasError).toBe(true);
    
})

test('fully kills db when all are closed', async () => {
    const tester1 = new TestDb(sqlFilterReaderNode, 'pglite');
    const tester2 = new TestDb(sqlFilterReaderNode, 'pglite');

    // @ts-ignore
    expect(TestDb.providers.length).toBe(1);

    await tester1.close();
    await tester2.close();

    // @ts-ignore
    expect(TestDb.providers.length).toBe(0);
})