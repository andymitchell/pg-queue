import { cwd } from 'process';

/**
 * E.g. if invoked as "node ./dist/main.js", this will return "<path to .>"
 * @returns 
 */
export async function getInvocationDirectory() {
    return cwd();
}