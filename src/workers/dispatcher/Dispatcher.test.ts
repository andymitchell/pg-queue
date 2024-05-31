import fetchMock from 'jest-fetch-mock';
import { TestDb } from '../../utils/TestDb';
import { sqlFilterReaderNode } from '../../install/utils/sqlFileReaderNode';
import { PgQueue } from '../../pg-queue';
import { QueueConfig } from '../../pg-queue-config/types';
import { Dispatcher } from './Dispatcher';
import { sleep } from '@andyrmitchell/utils';
import { PgTestable } from '@andyrmitchell/pg-testable';
fetchMock.enableMocks(); // CALL BEFORE OTHER IMPORTS

// Keep it cached betweeen tests
let provider:PgTestable;
beforeAll(async () => {
    provider = new PgTestable({type: 'pglite'});
})
afterAll(async () => {
    await provider.dispose();
})

beforeEach(() => {
    fetchMock.resetMocks();
});


describe('Dispatcher', () => {

    test('Dispatcher for queue', async () => {

        const db = new TestDb(sqlFilterReaderNode, provider);
        const queueName = 'test_q1';
        const q = new PgQueue<{name: string}>(db, queueName, db.schema);
        const endpoint_url = 'https://fakedomain.com/test_q1';

        // Set up the queue config to call and endpoint, as GET
        const config:Partial<QueueConfig> = {
            timeout_milliseconds: 30000,
            timeout_with_result: 'complete',
            max_concurrency: 10,
            pause_between_retries_milliseconds: 100
        };
        await q.getConfig().set(config);
        await q.getConfig().setEndpoint(true, {
            endpoint_method: 'POST',
            endpoint_bearer_token_location: 'inline',
            endpoint_bearer_token_inline_value: '',
            endpoint_url,
            endpoint_timeout_milliseconds: 30000,
            endpoint_manual_release: true
        })
        

        // Set an auth key
        const authToken = 'authSecret123';
        await q.setQueueEndPointApiKey(authToken);

        const state:{job_counter:number} = {
            job_counter: 0
        }

        // Set up the fetch on that endpoint, with a response
        fetchMock.mockIf(/.*fakedomain\.com.*/, async req => {
            if( req.url.startsWith(endpoint_url) ) {
                const auth = req.headers.get('Authorization');
                const token = auth?.split(' ')[1];
                if( token===authToken ) {
                    state.job_counter++;
                    return {
                        status: 200,
                        body: JSON.stringify({error: undefined})
                    }
                } else {
                    return {
                        status: 403,
                        body: JSON.stringify({error: 'Invalid auth'})
                    }
                }
                
            }
            return {
                status: 404,
                body: JSON.stringify({error: "not found"})
            }
              
        });

        // Add a job
        q.addJob({name: 'Bob'});

        // Dispatch
        const dispatcher = new Dispatcher(db, 5, db.schema);
        // TODO Improve: Dispatcher could fire events 
        // TODO Have a way to close it
        // TODO Have a way to verify it's closed
        
        // Sleep+while until job clears in db (up to timeout) - prove it called it
        await sleep(2000);
        expect(state.job_counter).toBe(1);
        

        
    }, 1000*20);

})