import { packageDirectorySync } from 'pkg-dir';
import { getInvokedScriptDirectory } from './getInvokedScriptDirectory';


/**
 * Find the nearest ancestor with a package.json, including when it's consumed within node modules. 
 * Use it to find relative paths from the root that are consistent in deployment.
 * 
 * E.g. if in ./node_modules/pg-queue, it'll return "<path to>/node_modules/pg-queue"
 * @returns 
 */
export async function getPackageDirectory():Promise<string> {
    return packageDirectorySync({cwd: await getInvokedScriptDirectory()})!;
}

