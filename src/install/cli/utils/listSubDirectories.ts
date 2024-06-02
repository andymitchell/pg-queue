import { promises as fs } from 'fs';
import * as path from 'path';

export async function listSubDirectories(initialDirectoryAbsolutePath: string, excludeDirectories?:string[], filterNames?:RegExp) {
    const results: string[] = [];

    async function recursiveSearch(dir: string) {
        
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const excluded = excludeDirectories && excludeDirectories.includes(entry.name);
            if( !excluded ) {
                const fullPath = path.join(dir, entry.name);

                if (entry.isDirectory()) {
                    const passFilter = !filterNames || filterNames.test(fullPath);
                    if( passFilter ) {
                        results.push(fullPath);
                    }

                    await recursiveSearch(fullPath);
                }
            }
        }
    }

    await recursiveSearch(initialDirectoryAbsolutePath);
    
    return results;
}