/**
 * E.g. if invoked as "node ./dist/main.js", this will return "<path-to>/dist"
 * @returns 
 */
export async function getInvokedScriptDirectory() {
    
    if (typeof __dirname !== 'undefined') {
        // CommonJS environment
        return __dirname;
    } else {
        
    
        // ES Module environment
        // @ts-ignore
        const { fileURLToPath } = await import('url');
        // @ts-ignore
        const { dirname } = await import('path');

        // @ts-ignore handled by the test for __dirname
        const esmUrl = import.meta.url;
        
        const __filename = fileURLToPath(esmUrl);
        return dirname(__filename);
    
    }
}