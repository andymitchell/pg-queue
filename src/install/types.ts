export type PgqFileReader = {
    read:(absolutePath:string) => Promise<string | undefined>;
    write:(absolutePath:string, content: string, append?: boolean, appendingSeparatorOnlyIfFileExists?:string) => Promise<void>;
    copy_file:(absolutePathSource:string, absolutePathDestination: string) => Promise<void>;
    list_files:(absolutePathDirectory:string, includeAbsoluteDirectory?: boolean) => Promise<string[]>;
    make_directory(absolutePathDirectory:string):Promise<void>;
    remove_directory(absolutePathToDirectory:string, force?:boolean):Promise<void>;
    remove_file(absolutePathToFile:string):Promise<void>;
    has_directory(absolutePathDirectory:string):Promise<boolean>;
    has_file(absolutePathToFile:string):Promise<boolean>;
}