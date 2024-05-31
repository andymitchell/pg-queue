import { PgTestable } from "@andyrmitchell/pg-testable";
import { pgqFileReaderNode } from "../install/utils/pgqFileReaderNode"
import { TestDb } from "../utils/TestDb"
import { PgQueueConfig } from "./PgQueueConfig";

// Keep it cached betweeen tests
let provider:PgTestable;
beforeAll(async () => {
    provider = new PgTestable({type: 'pglite'});
})
afterAll(async () => {
    await provider.dispose();
})

describe('PgQueueConfig', () => {

    test('PgQueueConfig set', async () => {
        const db = new TestDb(pgqFileReaderNode, provider);

        const queueConfig = new PgQueueConfig(db, 'test_q1', db.schema);
        await queueConfig.set({
            max_concurrency: 25
        });

        const configObj = await queueConfig.get();
        expect(configObj?.max_concurrency).toBe(25);

    })

})