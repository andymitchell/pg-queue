import { PgTestable } from "@andyrmitchell/pg-testable";

import { TestDb } from "../utils/TestDb"
import { PgQueueConfig } from "./PgQueueConfig";
import { IPgQueueConfig } from "./types";
import { fileIoNode } from "@andyrmitchell/file-io";

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
        const db = new TestDb(fileIoNode, provider);

        const queueConfig = new PgQueueConfig(db, 'test_q1', db.schema);
        await queueConfig.set({
            max_concurrency: 25
        });

        const configObj = await queueConfig.get();
        expect(configObj?.max_concurrency).toBe(25);

        

    })

})