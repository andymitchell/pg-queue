

import { PgqFileReader } from "../types";
import { stripTrailingSlash } from "./stripTrailingSlash";
import filenamify from 'filenamify';
import { getPackageDirectory } from "../cli/utils/getPackageDirectory";


export type SqlFile = {
    uri: string, 
    path: string, 
    file: string, 
    file_base: string,
    file_extension: string,
    timestamp: string,
    schema?: string,
    file_description:string // E.g. in 00000000000007_pgq_dispatcher_data.sql, or 00000000000007_pgq_$$schemename$$_dispatcher_data.sql, this will be 'dispatcher_data'
}

const PREFIX = '_pgq_';
const SCHEMA_SEPERATOR = '$$';



export async function listMigrationFiles(reader:PgqFileReader, sourcePath?:string, filterSchema?: string, includeReplaced?: boolean):Promise<SqlFile[]> {
    

    if( !sourcePath ) {
        sourcePath = `${await getPackageDirectory()}/postgres/migrations`;
    }
    sourcePath = stripTrailingSlash(sourcePath);

    if( !reader.has_directory(sourcePath) ) {
        throw new Error("Cannot listMigrationFiles. Unknown sourcePath: "+sourcePath);
    }

    
    const schemaPart = filterSchema? compileSchemaFilePart(filterSchema) : '';
    const prepareSqlFiles = (path:string, files:string[]):SqlFile[] => files
        .filter(file => file.endsWith('.sql') && (!filterSchema || file.indexOf(schemaPart)>-1))
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

function compileSchemaFilePart(schema:string, trailingUnderscore = true):string {
    return `${SCHEMA_SEPERATOR}${filenamify(schema)}${SCHEMA_SEPERATOR}${trailingUnderscore? '_' : ''}`
}
function extractFileDescriptionAndSchema(fileName:string):{file_description: string, schema?: string} {
    
    let fileNameEdit = fileName;
    

    fileNameEdit = fileNameEdit.replace(/^(\d+)/, ''); // Remove timestamp
    fileNameEdit = fileNameEdit.replace(/\.sql$/i, ''); // Remove extension

    // Extract schema
    let schema:string | undefined = undefined;
    let file_description:string;
    let filePartAfterPrefix = fileNameEdit.indexOf(PREFIX)>-1? (fileNameEdit.split(PREFIX)[1] ?? '') : fileNameEdit; // Includes description, and maybe schema

    if( filePartAfterPrefix.indexOf(SCHEMA_SEPERATOR)>-1 ) {
        // Remove the preceding seperator
        if( filePartAfterPrefix.indexOf(SCHEMA_SEPERATOR)===0 ) filePartAfterPrefix = filePartAfterPrefix.replace(SCHEMA_SEPERATOR, '');

        
        const schemaSplit = filePartAfterPrefix.split(SCHEMA_SEPERATOR);
        schema = schemaSplit[0]!;
        file_description = schemaSplit[schemaSplit.length-1] ?? '';
    } else {
        file_description = filePartAfterPrefix;
    }

    file_description = file_description.replace(/^\_+/, '');
    file_description = file_description.replace(/\_+$/, '');

    if( !file_description ) {
        debugger;
        throw new Error("Missing file description");
    }

    return {file_description, schema};

}

export const prepareSqlFile = (path:string, file:string):SqlFile => {
    
    
    const match = /^(\d+)/.exec(file);
    const timestamp = match && match[1]? match[1] : ''
    if( timestamp==='' ) throw new Error(`Unexpected sql file format: no timestamp for ${file}`);

    const file_base = file.replace(/\.sql$/i, '');
    const fileDescriptionAndSchema = extractFileDescriptionAndSchema(file_base);
    
    return {
        uri: `${path}/${file}`,
        path,
        file, 
        file_base,
        file_extension: '.sql',
        timestamp,
        schema: fileDescriptionAndSchema.schema,
        file_description: fileDescriptionAndSchema.file_description
    }
}

export async function compileMigrationFileName(reader:PgqFileReader, path:string, file_description:string, schema:string):Promise<{uri:string, file:string}> {
    if( schema.indexOf('$')>-1 ) throw new Error("Schema cannot have $ in it");
    // Prepare vars
    path = stripTrailingSlash(path);
    file_description = file_description.replace(/\.sql$/i, '');
    

    const existingFileNames = await listMigrationFiles(reader, path);
    const peakTimestamp:number = existingFileNames.reduce((prev, cur) => parseInt(cur.timestamp)>prev? parseInt(cur.timestamp) : prev, 0);
    

    const file_sans_timestamp = `${PREFIX}${compileSchemaFilePart(schema)}${file_description}.sql`;

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