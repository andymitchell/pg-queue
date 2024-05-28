import { sqlFilterReaderNode } from "../install/utils/sqlFileReaderNode"
import { TestDb } from "../utils/TestDb"
import { PgQueueConfig } from "./PgQueueConfig";

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

describe('PgQueueConfig', () => {

    test('PgQueueConfig set', async () => {
        const db = new TestDb(sqlFilterReaderNode, 'pglite');

        const queueConfig = new PgQueueConfig(db.db, 'test_q1', db.schema);
        await queueConfig.set({
            max_concurrency: 25
        });

        const configObj = await queueConfig.get();
        expect(configObj?.max_concurrency).toBe(25);

    })

})