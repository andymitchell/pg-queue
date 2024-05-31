import { PgqFileReader } from "../types";
import { promises as fs } from 'fs';
import { stripTrailingSlash } from "./stripTrailingSlash";

export const pgqFileReaderNode:PgqFileReader = {
    async read(absolutePath) {
        try {
            const content = await fs.readFile(absolutePath, 'utf-8');
            return content;
        } catch(e) {
            console.warn(`Error reading file: ${absolutePath}`);
            return undefined;
        }
    },
    async write(absolutePath, content, append, appendingSeparatorOnlyIfFileExists?:string) {
        if (append) {
            const hasFile = await pgqFileReaderNode.has_file(absolutePath);
            if( hasFile && appendingSeparatorOnlyIfFileExists ) content = `${appendingSeparatorOnlyIfFileExists}${content}`
            await fs.appendFile(absolutePath, content);
        } else {
            await fs.writeFile(absolutePath, content);
        }
    },
    async copy_file(source, destination) {
        await fs.copyFile(source, destination);
    },
    async list_files(absolutePathDirectory, includeAbsoluteDirectory) {
        let files = await fs.readdir(absolutePathDirectory);
        if( includeAbsoluteDirectory ) {
            absolutePathDirectory = stripTrailingSlash(absolutePathDirectory);
            files = files.map(file => `${absolutePathDirectory}/${file}`);
        }
        return files;
    },
    async make_directory(absolutePathToDirectory) {
        await fs.mkdir(absolutePathToDirectory, {recursive: true});
    },
    async remove_directory(absolutePathToDirectory, force) {
        if( !await pgqFileReaderNode.has_directory(absolutePathToDirectory) ) return;

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
        if( !await pgqFileReaderNode.has_file(absolutePathToFile) ) return;
        await fs.rm(absolutePathToFile);
    },
    async has_directory(absolutePathDirectory) {
        try {
            const stat = await fs.stat(absolutePathDirectory);
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