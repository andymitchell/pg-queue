import { DEFAULT_SCHEMA, GLOBAL_MATCH_PGQ_SCHEMA_PLACEHOLDER, Queryable } from "../../types";


import { SqlFileReader } from "../types";
import { listMigrationFiles } from "../utils/listMigrationFiles";

type Config = {
    schema_name?: string,
    include_replaced_migration_files?: boolean
}
const DEFAULT_CONFIG:Required<Config> = {
    schema_name: DEFAULT_SCHEMA,
    include_replaced_migration_files: false
}

export async function install(reader:SqlFileReader, db:Queryable, config?:Config) {
    const fullConfig:Required<Config> = Object.assign({}, DEFAULT_CONFIG, config);

    let migrationFiles = (await listMigrationFiles(reader, undefined, undefined, fullConfig.include_replaced_migration_files)).map(x => x.uri);

    if( migrationFiles.length===0 ) {
        throw new Error("No migrations found");
    }
    
    
    // Verify all paths before start
    for( const path of migrationFiles ) {
        const contents = await reader.read(path);
        if( !contents ) throw new Error(`Cannot migrate: ${path} is missing`);
    }

    // Run migrations 
    for( const path of migrationFiles ) {
        let content = (await reader.read(path))!;

        
        content = content.replace(GLOBAL_MATCH_PGQ_SCHEMA_PLACEHOLDER, fullConfig.schema_name);

        
        try {
            await db.exec(content);
        } catch(e) {
            debugger;
            throw e;
        }
    }

    // Do cron set up 
    const hasCronResult = await db.query<{is_cron_job_scheduling_available:boolean}>({q: `SELECT ${fullConfig.schema_name}.is_cron_job_scheduling_available();`, args: []});
    if( hasCronResult.rows[0]?.is_cron_job_scheduling_available ) {
        await db.exec(`SELECT "${fullConfig.schema_name}".set_cron_schedule_in_seconds();`);
    }

}