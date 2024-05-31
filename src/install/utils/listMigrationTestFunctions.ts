import { PGQ_SCHEMA_PLACEHOLDER } from "../../types";
import { PgqFileReader } from "../types";
import { listMigrationFiles } from "./listMigrationFiles";

export async function listMigrationTestFunctions(reader:PgqFileReader, schema:string):Promise<string[]> {

    const migrationFiles = await listMigrationFiles(reader);

    const migrationTestFileUris = migrationFiles.filter(x => x.file_base_sans_timestamp_and_schema.endsWith('_tests')).map(x => x.uri);

    let functionNames:string[] = [];
    for( const uri of migrationTestFileUris ) {
        const content = await reader.read(uri);
        const contentFunctionNames = content? extractFunctionNames(content, schema) : [];
        functionNames = [...functionNames, ...contentFunctionNames];
    }

    
    return functionNames;

}


function extractFunctionNames(contents: string, schema:string, schemaPlaceholder = PGQ_SCHEMA_PLACEHOLDER): string[] {
    const regExp = new RegExp(`CREATE OR REPLACE FUNCTION\\s+"?${schemaPlaceholder}"?\\.([a-zA-Z_][a-zA-Z0-9_]*)`, 'g');
    const matches = contents.matchAll(regExp);
    const functionNames: string[] = [];

    for (const match of matches) {
        if (match[1]) {
            functionNames.push(`"${schema}".${match[1]}`);
        }
    }

    return functionNames;
}