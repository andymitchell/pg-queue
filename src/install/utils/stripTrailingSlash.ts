export function stripTrailingSlash(path:string):string {
    if( !path ) debugger;
    return path.endsWith('/')? path.slice(0, -1) : path;
}