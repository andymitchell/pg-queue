import { DbQuery, Queryable } from "../types";
import postgres from 'postgres'



export class PostgresDb implements Queryable {
    
    private sql:postgres.Sql;

    constructor(options?:postgres.Options<Record<string, postgres.PostgresType<any>>>) {
        this.sql = postgres(options);
    }

    async exec(q: string, transaction?: Queryable | undefined): Promise<void> {
        if( transaction ) {
            await transaction.exec(q);
        } else {
            await this.sql.unsafe(q);
        }
    }

    async query<T extends Record<string, any> = Record<string, any>>(query: DbQuery, transaction?: Queryable | undefined): Promise<{ rows: T[]; }> {
        if( transaction ) {
            return await transaction.query(query);
        } else {
            const rows = await this.sql.unsafe(query.q, query.args, {prepare: true}) as T[];
            return {rows};
        }
    }
}