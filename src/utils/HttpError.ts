export class HttpError extends Error {
    public status: Readonly<number>;
    constructor(message:string, status: number) {
        super(message);
        this.status = status;
    }
}