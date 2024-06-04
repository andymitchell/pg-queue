
import { fileIoNode, getPackageDirectory } from "@andyrmitchell/file-io";
import { compileMigrationFileName, listMigrationFiles, prepareSqlFile } from "./listMigrationFiles"


describe('listMigrationFiles', () => {

    test('basic', async () => {
        const files = await listMigrationFiles(fileIoNode);
        expect(files[0]!.file_description).toBe('schema');
        expect(files[0]!.timestamp).toBe('00000000000001');
        expect(files[0]!.file_extension).toBe('.sql');
        expect(files[0]!.schema).toBe(undefined);
        
    })

    test('prepareSqlFile', async () => {
        const path = `${await getPackageDirectory()}/postgres/migrations`;
        const compiled = await compileMigrationFileName(fileIoNode, path, 'schema_test', 'BIGSCHEME');
        
        expect(compiled.file.replace(/^\d+/, '')).toBe('_pgq_$$BIGSCHEME$$_schema_test.sql');

        
        const sqlFile = prepareSqlFile(path, compiled.file);
        
        expect(sqlFile.file_description).toBe('schema_test');
        expect(sqlFile.file_extension).toBe('.sql');
        expect(sqlFile.schema).toBe('BIGSCHEME');

        
    })

})