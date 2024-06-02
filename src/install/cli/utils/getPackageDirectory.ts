import { packageDirectorySync } from 'pkg-dir';


/**
 * Find the nearest ancestor with a package.json 
 * 
 * E.g. if in ./node_modules/pg-queue, it'll return "<path to>/node_modules/pg-queue"
 * @returns 
 */
export function getPackageDirectory() {
    return packageDirectorySync();
}

