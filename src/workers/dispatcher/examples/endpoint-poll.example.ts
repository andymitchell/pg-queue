import { PostgresDb } from "../../../utils/PostgresDb";
import { Dispatcher } from "../Dispatcher";


const db = new PostgresDb({/*TODO psql terms*/});

export function serveOverHttp(req:Request) {
    
    // It'll keep going until the function/www times out - but might as well set a timeout anyway 
    const dispatcher = new Dispatcher(db, 30);
}