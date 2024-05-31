import { PgTestable, PgTestableInstance, PgTestableVirtual } from "@andyrmitchell/pg-testable";
import { DbQuery, Queryable } from "../types";
import { SqlFileReader, install } from "../install/module";







export class TestDb implements Queryable {

    

    schema: Readonly<string>;
    
    private db:PgTestableVirtual;
    private provider:PgTestableInstance;
    private ownsProvider?: boolean;
    private halt:{closed?: boolean};
    private loaded:Promise<void>;

    constructor(reader:SqlFileReader, provider?:PgTestableInstance) {
        
        this.halt = {};

        if( provider ) {
            this.provider = provider;
        } else {
            this.provider = new PgTestable({type: 'pglite'});
            this.ownsProvider = true;
        }
        
        this.db = new PgTestableVirtual(this.provider);
        this.schema = this.db.getSchema();

        this.loaded = new Promise<void>(async resolve => {
            const queryableWithoutLoadingHold = makeQueryable(this.db);
            await install(reader, queryableWithoutLoadingHold, {schema_name: this.schema});
            resolve();
        });
        
    }
    async exec(q: string, transaction?: Queryable | undefined): Promise<void> {
        if( this.halt?.closed ) throw new Error("Closed");
        await this.loaded;
        await (transaction ?? this.db).exec(q);
    }
    async query<T extends Record<string, any> = Record<string, any>>(query: DbQuery, transaction?: Queryable | undefined): Promise<{ rows: T[]; }> {
        if( this.halt?.closed ) throw new Error("Closed");
        await this.loaded;
        if( transaction ) {
            return await transaction.query(query);
        } else {
            return await this.db.query(query.q, query.args);
        }
    }

    schemaScope(identifier:string):string {
        return this.db.schemaScope(identifier);
    }
    

    async close() {
        if( this.halt.closed ) return;
        this.halt.closed = true;

        await this.loaded; // Must finish creating before dropping

        await this.db.dispose();

        if( this.ownsProvider ) {
            this.provider.dispose();
        }
    }


}

function makeQueryable(instance: PgTestableInstance, loadingStatus?:Promise<void>, halt?: {closed?: boolean}):Queryable {
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