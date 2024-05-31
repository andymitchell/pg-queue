// Use MultiStepQueue.processNextJob in a loop (perhaps sleeping is had_job is false)

import { sleep } from "@andyrmitchell/utils";
import { PostgresDb } from "../../..";
import { generateExampleWorkflow } from "../../../multi-step-pg-queue/example";

export async function main() {
    const db = new PostgresDb({/*TODO psql terms*/});

    const workflows = generateExampleWorkflow(db);

    while(true) {
        const result = await workflows.v1.processNextJob();
        if( result.status!=='ok' || !result.had_job ) {
            // Back off
            await sleep(500);
        }
    }
}
main();