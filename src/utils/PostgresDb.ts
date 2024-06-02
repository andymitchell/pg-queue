import { DbQuery, Queryable } from "../types";
import postgres from 'postgres'



export class PostgresDb implements Queryable {
    
    private sql:postgres.Sql;

    constructor(options?:postgres.Options<Record<string, postgres.PostgresType<any>>>) {
        this.sql = postgres(options);
    }

    async exec(q: string): Promise<void> {
        await this.sql.unsafe(q);
    }

    async query<T extends Record<string, any> = Record<string, any>>(query: DbQuery): Promise<{ rows: T[]; }> {
        
        const rows = await this.sql.unsafe(query.q, query.args, {prepare: true}) as T[];
        return {rows};
    
    }
}