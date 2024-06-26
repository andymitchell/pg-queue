


import { cli } from "./cli"
import { DEFAULT_SCHEMA } from "../../types";
import { SqlFile, generateMigrationTimestamp, listMigrationFiles } from "../utils/listMigrationFiles";
import filenamify from "filenamify";
import { Answer, IUserInput, QuestionChain, fileIoNode, getPackageDirectory, stripTrailingSlash } from "@andyrmitchell/file-io";

let migrationDestPath:string;
let testDestPath:string;



beforeAll(async () => {
    migrationDestPath = `${stripTrailingSlash(await getPackageDirectory())}/test_cli/migrations`;
    testDestPath = `${stripTrailingSlash(await getPackageDirectory())}/test_cli/tests`;
})
beforeEach(async () => {
    await fileIoNode.remove_directory(migrationDestPath, true);
    await fileIoNode.make_directory(migrationDestPath);

    await fileIoNode.remove_directory(testDestPath, true);
    await fileIoNode.make_directory(testDestPath);
});
afterEach(async () => {
    await fileIoNode.remove_directory(migrationDestPath, true);
    await fileIoNode.remove_directory(testDestPath, true);
})

describe('Test file copy', () => {
    
    const schema = DEFAULT_SCHEMA;


    class TestUserInput implements IUserInput {
        async ask(questionChain: QuestionChain): Promise<Answer> {
            if( questionChain.name==='migrations-dir' ) {
                return {type: 'single', answer: migrationDestPath};
            }
            if( questionChain.name==='tests-dir' ) {
                return {type: 'single', answer: testDestPath};
            }
            if( questionChain.name==='schema' ) {
                return {type: 'single', answer: schema};
            }
            return {type: 'abort', answer: undefined};
        }
        close(): void {
            throw new Error("Method not implemented.");
        }
    }


    test('Copy basic', async () => {
        
        const userInput:IUserInput = new TestUserInput();
        const migrationFiles = await listMigrationFiles(fileIoNode);
    
        // Run it
        await cli(userInput, fileIoNode);

        const getPgqSchema = (files:SqlFile[]) => files.find(x => x.file_description==='schema');

        // Expect all the files to be at the destination
        const migratedFiles1 = await listMigrationFiles(fileIoNode, migrationDestPath);
        expect(migrationFiles.length).toBe(migratedFiles1.length);    
        expect(migratedFiles1[0]!.file.indexOf(filenamify(schema))>-1).toBe(true);

    
        debugger;
    }, 1000*60*2)

    test('Will reissue envspecific install on 2nd run, even if no changes ', async () => {
        
        const userInput:IUserInput = new TestUserInput();
        const migrationFiles = await listMigrationFiles(fileIoNode);
    
        // Run it
        await cli(userInput, fileIoNode);

        // Run 2
        await cli(userInput, fileIoNode);
        const migratedFiles2 = await listMigrationFiles(fileIoNode, migrationDestPath, schema);
        expect(migratedFiles2.length).toBe(migrationFiles.length+1); // The +1 is because it reissues envspecific_install #ENVSPECIFIC_INSTALL

        debugger;
    }, 1000*60*2)

    test('Will replace a missing file', async () => {
        
        const userInput:IUserInput = new TestUserInput();
        const migrationFiles = await listMigrationFiles(fileIoNode);
    
        // Run it
        await cli(userInput, fileIoNode);

        const getPgqSchema = (files:SqlFile[]) => files.find(x => x.file_description==='schema');

        // Expect all the files to be at the destination
        const migratedFiles1 = await listMigrationFiles(fileIoNode, migrationDestPath);
        expect(migrationFiles.length).toBe(migratedFiles1.length);    
        expect(migratedFiles1[0]!.file.indexOf(filenamify(schema))>-1).toBe(true);

        debugger;
    
        // Now delete a migrated file, and rerun: expect the same number of files as before (it replaces the missing one)
        await fileIoNode.remove_file(getPgqSchema(migratedFiles1)!.uri);
        await cli(userInput, fileIoNode);
        const migratedFiles2 = await listMigrationFiles(fileIoNode, migrationDestPath, schema);
        expect(migratedFiles2.length).toBe(migrationFiles.length+1); // The +1 is because it reissues envspecific_install #ENVSPECIFIC_INSTALL

        // Expect the replaced one to have a higher increment
        const previousHigh = parseInt(migratedFiles1[migratedFiles1.length-1]!.timestamp);
        const replacedTimestamp = parseInt(getPgqSchema(migratedFiles2)!.timestamp);
        expect(replacedTimestamp>previousHigh).toBe(true);

    
        debugger;
    }, 1000*60*2)

    test('Simulate updating a file - expect it to be replaced with later version', async () => {

        
        const userInput:IUserInput = new TestUserInput();
        const migrationFiles = await listMigrationFiles(fileIoNode);
    
        await cli(userInput, fileIoNode);

    
        // Get the copied files
        const migratedFiles1 = await listMigrationFiles(fileIoNode, migrationDestPath, schema);

        // Edit the first migrated file, so our app sees it's a different version (concluding it's older)
        fileIoNode.write(migratedFiles1[0]!.uri, 'edit', {append: true});
        
        // Run it again
        await cli(userInput, fileIoNode);

        // Expect there to be one extra file
        const migratedFiles2 = await listMigrationFiles(fileIoNode, migrationDestPath, schema);
        expect(migratedFiles2.length).toBe(migratedFiles1.length+2); // The +2 is because it also reissues envspecific_install #ENVSPECIFIC_INSTALL

    }, 1000*60*2)

    test('Copy with an existing sql - does it increment beyond it', async () => {

        
        const userInput:IUserInput = new TestUserInput();
        const migrationFiles = await listMigrationFiles(fileIoNode);
    
    
        // Now put another sql file in there, on today's date, and make sure it works around it (no identical timestamps)
        const otherSqlFile = `${migrationDestPath}/${generateMigrationTimestamp(new Date(), 1)}_not_related.sql`;
        fileIoNode.write(otherSqlFile, "testing");
    
        await cli(userInput, fileIoNode);
        const migratedFiles3 = await listMigrationFiles(fileIoNode, migrationDestPath, schema);
        expect(migrationFiles.length).toBe(migratedFiles3.length);
        const expectedFirstTimestamp = generateMigrationTimestamp(new Date(), 2);
        expect(migratedFiles3[0]!.timestamp+'').toBe(expectedFirstTimestamp);
    
    
        
    }, 1000*10)

    
})
