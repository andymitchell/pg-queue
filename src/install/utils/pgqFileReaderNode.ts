import { PgqFileReader } from "../types";
import { promises as fs } from 'fs';
import { stripTrailingSlash } from "./stripTrailingSlash";

function getErrorMessage(e:unknown) {
    if( e instanceof Error ) {
        return e.message;
    }
    return 'na';
}

export const pgqFileReaderNode:PgqFileReader = {
    async read(absolutePath) {
        try {
            const content = await fs.readFile(absolutePath, 'utf-8');
            return content;
        } catch(e) {
            throw new Error(`Cannot read file ${absolutePath}. Error: ${getErrorMessage(e)}`);
        }
    },
    async write(absolutePath, content, append, appendingSeparatorOnlyIfFileExists?:string) {
        try {
            if (append) {
                const hasFile = await pgqFileReaderNode.has_file(absolutePath);
                if( hasFile && appendingSeparatorOnlyIfFileExists ) content = `${appendingSeparatorOnlyIfFileExists}${content}`
                await fs.appendFile(absolutePath, content);
            } else {
                await fs.writeFile(absolutePath, content);
            }
        } catch(e) {
            throw new Error(`Cannot write file ${absolutePath}. Error: ${getErrorMessage(e)}`);
        }
    },
    async copy_file(source, destination) {
        try {
            await fs.copyFile(source, destination);
        } catch(e) {
            throw new Error(`Cannot copy file ${source} to ${destination}. Error: ${getErrorMessage(e)}`);
        }
    },
    async list_files(absolutePathDirectory, includeAbsoluteDirectory) {
        try {
            let files = await fs.readdir(absolutePathDirectory);
            if( includeAbsoluteDirectory ) {
                absolutePathDirectory = stripTrailingSlash(absolutePathDirectory);
                files = files.map(file => `${absolutePathDirectory}/${file}`);
            }
            return files;
        } catch(e) {
            throw new Error(`Cannot list files ${absolutePathDirectory}. Error: ${getErrorMessage(e)}`);
        }
    },
    async make_directory(absolutePathToDirectory) {
        try {
            await fs.mkdir(absolutePathToDirectory, {recursive: true});
        } catch(e) {
            throw new Error(`Cannot make directory ${absolutePathToDirectory}. Error: ${getErrorMessage(e)}`);
        }
    },
    async remove_directory(absolutePathToDirectory, force) {
        try {
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
        } catch(e) {
            throw new Error(`Cannot remove directory ${absolutePathToDirectory}. Error: ${getErrorMessage(e)}`);
        }
    },
    async remove_file(absolutePathToFile) {
        try {
            if( !await pgqFileReaderNode.has_file(absolutePathToFile) ) return;
            await fs.rm(absolutePathToFile);    
        } catch(e) {
            throw new Error(`Cannot remove file ${absolutePathToFile}. Error: ${getErrorMessage(e)}`);
        }
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