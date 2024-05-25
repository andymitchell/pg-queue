import { PgTestable, PgTestableDbs, PgTestableInstance } from "@andyrmitchell/pg-testable";
import { Queryable } from "../types";
import { SqlFileReader, install } from "../install/module";
import { v4 as uuidv4 } from "uuid";
import { PostgresHelpers, sleep } from "@andyrmitchell/utils";

export function generateUniqueSchema(): string {
    return `test_${uuidv4().replace(/\-/g, '')}`;
}


type Provider = {type:PgTestableDbs, instance:PgTestableInstance<any>, locks:string[]};

export class TestDb {

    private static providers:Provider[] = []

    schema: Readonly<string>;
    db: Readonly<Queryable>;

    private id:string;
    private type:PgTestableDbs;
    private provider:Provider;
    private halt:{closed?: boolean};
    private loaded:Promise<void>;

    constructor(reader:SqlFileReader, type:PgTestableDbs = 'pglite', forceFresh?:boolean) {
        this.id = uuidv4();
        this.type = type ?? 'pglite';
        this.schema = generateUniqueSchema();
        this.halt = {};

        this.provider = this.getProvider(reader, forceFresh);

        this.loaded = new Promise<void>(async resolve => {
            const queryableWithoutLoadingHold = makeQueryable(this.provider.instance);
            await install(reader, queryableWithoutLoadingHold, {schema_name: this.schema});
            resolve();
        });
        this.db = makeQueryable(this.provider.instance, this.loaded, this.halt);
    }

    private getProvider(reader:SqlFileReader, forceFresh?:boolean):Provider {
        let provider = TestDb.providers.find(x => x.type===this.type);
        const cached = !!provider;

        if( !provider || forceFresh ) {
            const instance = PgTestable.newDb(undefined, this.type);
            provider = {instance, type: this.type, locks: [this.id]};
            if( !cached ) {
                TestDb.providers.push(provider);
            }
        } else {
            provider.locks.push(this.id);
        }

        return provider;
    }

    

    async close() {
        if( this.halt.closed ) return;
        this.halt.closed = true;

        await this.loaded; // Must create schema before dropping

        await this.provider.instance.exec(`DROP SCHEMA ${PostgresHelpers.escapeIdentifier(this.schema)} cascade;`);

        this.provider.locks = this.provider.locks.filter(x => x!==this.id);
        
        
        // Make sure no one else wants to use the cached provider
        await sleep(300);

        if( this.provider.locks.length===0 ) {
            TestDb.providers = TestDb.providers.filter(x => x.instance!==this.provider.instance);
            await this.provider.instance.dispose();
        }
    }


}

function makeQueryable(instance: PgTestableInstance<any>, loadingStatus?:Promise<void>, halt?: {closed?: boolean}):Queryable {
    return {
        exec: async (q, transaction) => {
            if( halt?.closed ) throw new Error("Closed");
            if( loadingStatus ) await loadingStatus;
            await (transaction ?? instance).exec(q);
        },
        query: async (query, transaction) => {
            if( halt?.closed ) throw new Error("Closed");
            if( loadingStatus ) await loadingStatus;
            if( transaction ) {
                return await transaction.query(query);
            } else {
                return await instance.query(query.q, query.args);
            }
        },
    }
}