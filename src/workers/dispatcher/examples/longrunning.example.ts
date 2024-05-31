
import { PostgresDb } from "../../../utils/PostgresDb";
import { Dispatcher } from "../Dispatcher";

const db = new PostgresDb({/*TODO psql terms*/});

export function main() {
    
    // Run with no timeout - go until the process terminates 
    const dispatcher = new Dispatcher(db);

    // TODO How will we orchestrate the long-running process (i.e. to restart if it fails). Maybe a cron to start every X seconds, that quits if one is already running?
}
main();