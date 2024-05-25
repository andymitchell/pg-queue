import { SqlFileReader } from "../types";
import { promises as fs } from 'fs';
import { stripTrailingSlash } from "./stripTrailingSlash";

export const sqlFilterReaderNode:SqlFileReader = {
    async read(absolutePathToSql) {
        try {
            const content = await fs.readFile(absolutePathToSql, 'utf-8');
            return content;
        } catch(e) {
            console.warn(`Error reading file: ${absolutePathToSql}`);
            return undefined;
        }
    },
    async write(absolutePathToSql, content, append, appendingSeparatorOnlyIfFileExists?:string) {
        if (append) {
            const hasFile = await sqlFilterReaderNode.has_file(absolutePathToSql);
            if( hasFile && appendingSeparatorOnlyIfFileExists ) content = `${appendingSeparatorOnlyIfFileExists}${content}`
            await fs.appendFile(absolutePathToSql, content);
        } else {
            await fs.writeFile(absolutePathToSql, content);
        }
    },
    async copy_file(source, destination) {
        await fs.copyFile(source, destination);
    },
    async list_files(absolutePathToSqlDirectory, includeAbsoluteDirectory) {
        let files = await fs.readdir(absolutePathToSqlDirectory);
        if( includeAbsoluteDirectory ) {
            absolutePathToSqlDirectory = stripTrailingSlash(absolutePathToSqlDirectory);
            files = files.map(file => `${absolutePathToSqlDirectory}/${file}`);
        }
        return files;
    },
    async make_directory(absolutePathToDirectory) {
        await fs.mkdir(absolutePathToDirectory, {recursive: true});
    },
    async remove_directory(absolutePathToDirectory, force) {
        if( !await sqlFilterReaderNode.has_directory(absolutePathToDirectory) ) return;

        const files = await fs.readdir(absolutePathToDirectory, {'recursive': true});
        if (files.length === 0 && !force) {
            console.log(`Directory ${absolutePathToDirectory} is empty. Skipping deletion.`);
            return;
        }

        if( force ) {
            await fs.rm(absolutePathToDirectory, {recursive: true, force: true});
        } else {
            await fs.rmdir(absolutePathToDirectory);
        }
    },
    async remove_file(absolutePathToFile) {
        if( !await sqlFilterReaderNode.has_file(absolutePathToFile) ) return;
        await fs.rm(absolutePathToFile);
    },
    async has_directory(absolutePathToSqlDirectory) {
        try {
            const stat = await fs.stat(absolutePathToSqlDirectory);
            return stat.isDirectory();
        } catch (error) {
            // If an error occurs, it means the path does not exist or is not accessible
            return false;
        }
    },
    async has_file(absolutePathToFile) {
        try {
            const stat = await fs.stat(absolutePathToFile);
            return stat.isFile();
        } catch (error) {
            // If an error occurs, it means the path does not exist or is not accessible
            return false;
        }
    }
};