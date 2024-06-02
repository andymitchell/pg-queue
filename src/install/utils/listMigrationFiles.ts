
import { getInvokedScriptDirectory } from "../cli/utils/getInvokedScriptDirectory";
import { PgqFileReader } from "../types";
import { stripTrailingSlash } from "./stripTrailingSlash";
import filenamify from 'filenamify';


export type SqlFile = {
    uri: string, 
    path: string, 
    file: string, 
    file_base: string,
    file_extension: string,
    timestamp: string,
    schema?: string,
    file_base_sans_timestamp_and_schema:string
}

const SCHEMA_SEPERATOR = filenamify('__$');

export async function listMigrationFiles(reader:PgqFileReader, sourcePath?:string, filterSchema?: string, includeReplaced?: boolean):Promise<SqlFile[]> {
    
    if( !sourcePath ) sourcePath = `${await getInvokedScriptDirectory()}/../postgres/migrations`
    sourcePath = stripTrailingSlash(sourcePath);

    if( !reader.has_directory(sourcePath) ) {
        throw new Error("Cannot listMigrationFiles. Unknown sourcePath: "+sourcePath);
    }

    const prepareSqlFile = (path:string, file:string):SqlFile => {
        const match = /^(\d+)/.exec(file);
        const timestamp = match && match[1]? match[1] : ''
        if( timestamp==='' ) throw new Error(`Unexpected sql file format: no timestamp for ${file}`);

        const file_base = file.replace(/\.sql$/i, '');
        const file_sans_timestamp = file_base.replace(''+timestamp, '');
        const schemaSplit = file_sans_timestamp.split(SCHEMA_SEPERATOR);
        const file_base_sans_timestamp_and_schema = schemaSplit[0];
        if( !file_base_sans_timestamp_and_schema ) throw new Error(`Unexpected sql file format: no file_sans_timestamp_and_schema for ${file}`)
        const schema:string | undefined = schemaSplit[1] ?? undefined;

        
        return {
            uri: `${path}/${file}`,
            path,
            file, 
            file_base,
            file_extension: '.sql',
            timestamp,
            schema,
            file_base_sans_timestamp_and_schema
        }
    }
    const prepareSqlFiles = (path:string, files:string[]):SqlFile[] => files
        .filter(file => file.endsWith('.sql') && (!filterSchema || file.endsWith(`${SCHEMA_SEPERATOR}${filenamify(filterSchema)}.sql`)))
        .map(file => prepareSqlFile(path, file))

    let files:SqlFile[] = prepareSqlFiles(sourcePath, await reader.list_files(sourcePath, false));

    const sourceReplacedPath = `${sourcePath}/_replaced`;
    if( includeReplaced ) {
        const replacedFiles:SqlFile[] = prepareSqlFiles(sourceReplacedPath, await reader.list_files(sourceReplacedPath, false));
        files = [...files, ...replacedFiles].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    }

    
    return files

    
}

function padZero(number:number, maxLength:number) {
    return number.toString().padStart(maxLength, '0');
}

export async function compileMigrationFileName(reader:PgqFileReader, path:string, file_sans_timestamp_and_schema:string, schema:string):Promise<{uri:string, file:string}> {
    // Prepare vars
    path = stripTrailingSlash(path);
    file_sans_timestamp_and_schema = file_sans_timestamp_and_schema.replace(/\.sql$/i, '');
    

    const existingFileNames = await listMigrationFiles(reader, path);
    const peakTimestamp:number = existingFileNames.reduce((prev, cur) => parseInt(cur.timestamp)>prev? parseInt(cur.timestamp) : prev, 0);
    

    const file_sans_timestamp = `${file_sans_timestamp_and_schema}${SCHEMA_SEPERATOR}${filenamify(schema)}.sql`;

    const date = new Date();
    let timestamp:string;
    let file:string = '';
    for( let iteration = 1; iteration < 100000; iteration++ ) {
        timestamp = generateMigrationTimestamp(date, iteration);
        file = `${timestamp}${file_sans_timestamp}`;
        const currentTimestamp:number = parseInt(timestamp);
        if( currentTimestamp>peakTimestamp && !existingFileNames.some(x => x.file.indexOf(timestamp)>-1) ) break;
    }
    if( !file ) throw new Error("noop - typeguard");
    return {
        uri: `${path}/${file}`,
        file
    }
}

export function generateMigrationTimestamp(date = new Date(), iteration = 1):string {
    return `${date.getFullYear()}${padZero(date.getMonth()+1, 2)}${padZero(date.getDate(), 2)}${padZero(iteration, 6)}`;
}