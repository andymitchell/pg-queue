import { PGlite } from "@electric-sql/pglite";
import { SqlFileReader } from "./types";
import { Queryable } from "../types";
import { sqlFilterReaderNode } from "./utils/sqlFileReaderNode";
import { install } from "./module";
import { v4 as uuidv4 } from "uuid";
import { PgTestable, PgTestableInstance } from '@andyrmitchell/pg-testable';
import { listMigrationTestFunctions } from "./utils/listMigrationTestFunctions";



export function generateUniqueSchema(): string {
    return `test_${uuidv4().replace(/\-/g, '')}`;
}

let dbPglite: PGlite;

let reader: SqlFileReader;
let queryablePglite: Queryable;

beforeAll(async () => {
    dbPglite = new PGlite();

    reader = sqlFilterReaderNode;

    queryablePglite = {
        exec: async (q, tx) => {
            await (tx ?? dbPglite).exec(q);
        },
        query: async (query, tx) => {

            if (tx) {
                return tx.query(query);
            } else {
                return await dbPglite.query(query.q, query.args);
            }
        },
    }



});

afterAll(async () => {
    if (dbPglite) await dbPglite.close();

})






describe('migration sql', () => {

    test('sql installs without error', async () => {

        const customSchema = generateUniqueSchema();

        let error = false;
        try {
            await install(reader, queryablePglite, {
                'schema_name': customSchema
            });
        } catch (e) {
            error = true;
            if (e instanceof Error) {
                console.warn("install failed: " + e.message);
            }
            debugger;
        }

        expect(error).toBe(false);

        


    });

    test('sql is idempotent, without data loss (which allows cleaner migration files: you can replace existing files, rather than appending extra files)', async () => {
        const customSchema = generateUniqueSchema();
        const config = {
            'schema_name': customSchema
        };

        // Run 1
        await install(reader, queryablePglite, config);

        // Add a job
        await dbPglite.query(`INSERT INTO "${customSchema}".job_queue (queue_name, payload) VALUES($1, $2)`, ['q1', JSON.stringify({ id: '1' })]);
        const result1 = await dbPglite.query(`SELECT * FROM "${customSchema}".job_queue`);
        expect(result1.rows.length).toBe(1);

        // Run 2
        let error_run2 = false;
        try {
            await install(reader, queryablePglite, config);
        } catch (e) {
            error_run2 = true;
            if (e instanceof Error) {
                console.warn("install run 2 failed: " + e.message);
            }
            debugger;
        }
        expect(error_run2).toBe(false);

        // Check job still present
        const result2 = await dbPglite.query(`SELECT * FROM "${customSchema}".job_queue`);
        expect(result2.rows.length).toBe(1);
    });

    test('latest is compatible with the full _replaced history (that a consumer might have)', async () => {
        const customSchema = generateUniqueSchema();
        const config = {
            'schema_name': customSchema
        };

        // Run
        let error_run2 = false;
        try {
            await install(reader, queryablePglite, {
                ...config,
                include_replaced_migration_files: true
            });
        } catch (e) {
            error_run2 = true;
            if (e instanceof Error) {
                console.warn("install run 2 failed: " + e.message);
            }
            debugger;
        }
        expect(error_run2).toBe(false);

        

    });

    test('get_table_defaults function', async () => {

        const customSchema = generateUniqueSchema();

    
        await install(reader, queryablePglite, {
            'schema_name': customSchema
        });

        const result = await dbPglite.query<{defaults:Record<string, any>, timeout_milliseconds: number, endpoint_active: boolean}>(`SELECT defaults, (defaults->>'timeout_milliseconds')::INTEGER as timeout_milliseconds, (defaults->>'endpoint_active')::BOOLEAN as endpoint_active  FROM (SELECT "${customSchema}".get_table_defaults($1) AS defaults) a`, ['queue_config']);
        
        expect(result.rows[0]!.timeout_milliseconds).toBe(30000);
        expect(result.rows[0]!.endpoint_active).toBe(false);

    });

    test('run tap-compatible tests ok', async () => {

        // TODO pglite will stop breaking throws_ok pgtap test, so swap out pgmock to pglite 0.1.6+ to be much faster: https://github.com/electric-sql/pglite/issues/92
        const dbPgmock: PgTestableInstance = new PgTestable({type: 'pgmock'});
        const queryablePgmock: Queryable = {
            exec: async (q, tx) => {
                await (tx ?? dbPgmock).exec(q);
            },
            query: async (query, tx) => {

                if (tx) {
                    return tx.query(query);
                } else {
                    const result = await dbPgmock.query<any>(query.q, query.args);
                    return result;
                }
            },
        }

        
        const customSchema = generateUniqueSchema();
        const config = {
            'schema_name': customSchema
        };


        await install(reader, queryablePgmock, config);

        const testFunctions = await listMigrationTestFunctions(reader, customSchema);
        
        
        await dbPgmock.query(`BEGIN;`);
        let testsError:Error | undefined;
        try {
            for( const testFunction of testFunctions ) {
                await dbPgmock.query(`SELECT ${testFunction}();`);
            }
        } catch(e) {
            if( e instanceof Error ) {
                testsError = e;
            }
            throw e;
        } finally {
            await dbPgmock.query(`ROLLBACK;`);
        }

        expect(testsError).toBe(undefined);
        

        await dbPgmock.dispose();

    }, 1000 * 60 * 5);

})