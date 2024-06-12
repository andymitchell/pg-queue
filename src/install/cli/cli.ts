

import { compileMigrationFileName, listMigrationFiles } from '../utils/listMigrationFiles';
import { DEFAULT_SCHEMA, GLOBAL_MATCH_PGQ_SCHEMA_PLACEHOLDER } from '../../types';

import { IFileIo, IUserInput, QuestionChoice, getDirectoryFromUser, getInvocationDirectory, getPackageDirectory, listSubDirectories, stripTrailingSlash } from '@andyrmitchell/file-io';
import { listMigrationTestFunctions } from '../utils/listMigrationTestFunctions';




async function copyMigrations(reader:IFileIo, absoluteDestinationPath: string, schema: string): Promise<void> {

    absoluteDestinationPath = stripTrailingSlash(absoluteDestinationPath);

    const hasDestinationDirectory = await reader.has_directory(absoluteDestinationPath);
    if( !hasDestinationDirectory ) {
        throw new Error("Destination directory does not exist");
    }

    

    const migrationSourceFiles = await listMigrationFiles(reader);
    const existingMigrationDestinationFiles = await listMigrationFiles(reader, absoluteDestinationPath, schema);

    // Convenience lookups
    const existingMigrationDestinationFilesMap:Record<string, (typeof existingMigrationDestinationFiles)[number]> = {};
    existingMigrationDestinationFiles.forEach(x => {
        existingMigrationDestinationFilesMap[x.file_description] = x;
    });

    let successCount = 0;
    let seenEnvSpecificInstall = false;
    
    for( const file of migrationSourceFiles ) {
        const sourceUri = file.uri;
        const sourceContent = (await reader.read(sourceUri))!;
        const preparedContent = sourceContent.replace(GLOBAL_MATCH_PGQ_SCHEMA_PLACEHOLDER, schema);

        // See if destination file was found (matching the descriptive filename only, ignoring the timestamp which can change)
        const existingDestinationFile = existingMigrationDestinationFilesMap[file.file_description];

        // Track seeing envspecific_install. It'll throw an error if not found. Purpose: this migration file is always reissued, even if it exists unchanged at the destination, so that if the consumer's environment has changed (e.g. installed an extension), the functions get another chance to install. #ENVSPECIFIC_INSTALL
        const isEnvSpecificInstall = file.file_description==='envspecific_install';
        if( isEnvSpecificInstall ) {
            
            seenEnvSpecificInstall = true;
        }
        
        if( existingDestinationFile ) {
            // Issue an updated version, with the latest timestamp (only if it's changed )
            const existingDestinationUri = existingDestinationFile.uri;
            const destinationContent = await reader.read(existingDestinationUri);
            if( preparedContent && (destinationContent!==preparedContent || isEnvSpecificInstall) ) {
                const newDestinationUri = (await compileMigrationFileName(reader, absoluteDestinationPath, file.file_description, schema)).uri;
                await reader.write(newDestinationUri, preparedContent);
                successCount++
            }
        } else {
            const destinationUri = (await compileMigrationFileName(reader, absoluteDestinationPath, file.file_description, schema)).uri;
            // Convert the schema in the SQL, and attach the schema to the file name
            await reader.write(destinationUri, preparedContent);
            successCount++
        }

        
    }

    if( !seenEnvSpecificInstall ) {
        throw new Error("Expected to see envspecific_install migration. Did you rename the package's migration file and forget to update this code?");
    }

    console.log(`${successCount} migration files delivered to destination ${absoluteDestinationPath}`);
}

async function copyTests(reader:IFileIo, absoluteDestinationPath: string, schema: string): Promise<void> {

    absoluteDestinationPath = stripTrailingSlash(absoluteDestinationPath);

    const hasDestinationDirectory = await reader.has_directory(absoluteDestinationPath);
    if( !hasDestinationDirectory ) {
        throw new Error("Destination directory does not exist");
    }

    const testFunctions = await listMigrationTestFunctions(reader, schema);
    
    
    const existingTestDestinationFiles = await listMigrationFiles(reader, absoluteDestinationPath, schema);
    const TEST_FILE_DESCRIPTION = 'all_tests';
    for( const existing of existingTestDestinationFiles ) {
        if( existing.file_description.indexOf(TEST_FILE_DESCRIPTION)>-1 ) {
            reader.remove_file(existing.uri);
        }
    }

    const sql = `
create extension if not exists pgtap with schema extensions;

BEGIN;

select plan(${testFunctions.length});

${testFunctions.map((testFunction, index) => `SELECT lives_ok($$ SELECT ${testFunction}() $$, 'expect no error from function ${index+1}')`).join("\n")}

ROLLBACK;
    `.trim()

    const destinationUri = (await compileMigrationFileName(reader, absoluteDestinationPath, TEST_FILE_DESCRIPTION, schema)).uri;
    await reader.write(destinationUri, sql);

}

export async function cli(userInput:IUserInput, sqlFileReader:IFileIo) {
    console.log("Environment Overview", {'invocation_dir': getInvocationDirectory(), 'pkg_dir': await getPackageDirectory()});

    let currentDirectory = await getInvocationDirectory();
    
    currentDirectory = stripTrailingSlash(currentDirectory);
    
    const absoluteMigrationsDestinationPath = await getDirectoryFromUser(
        userInput,
        sqlFileReader,
        currentDirectory,
        'migrations-dir',
        "Where is your migrations directory (where the pg-queue SQL files will be placed)?",
        await listSubDirectories(currentDirectory, ['node_modules', '.git'], /migrations$/)
    )
    if( !absoluteMigrationsDestinationPath ) {
        console.warn("Aborting - no destination chosen");
        return;
    }

    let schema = await userInput.ask({
        type: 'input', 
        name: 'schema', 
        message: `Do you want to put the pg-queue tables and functions in a custom schema in your database? (Leave blank to use ${DEFAULT_SCHEMA})`
    });
    const chosenSchema = schema.type==='single'? schema.answer : DEFAULT_SCHEMA;
    

    const absoluteTestsDestinationPath = await getDirectoryFromUser(
        userInput,
        sqlFileReader,
        currentDirectory,
        'tests-dir',
        "Where is your db tests directory? (leave blank and no pg-tap test SQL files will be deployed)",
        await listSubDirectories(currentDirectory, ['node_modules', '.git'], /tests\/database$/)
    )
    
        
    await copyMigrations(sqlFileReader, absoluteMigrationsDestinationPath, chosenSchema);

    if( absoluteTestsDestinationPath ) {
        await copyTests(sqlFileReader, absoluteTestsDestinationPath, chosenSchema);
    }
}



