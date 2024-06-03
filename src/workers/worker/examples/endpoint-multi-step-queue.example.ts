// Loop over all workflows, or a known workflow, and see if any match the job - and process it

import { generateExampleWorkflow } from "../../../multi-step-pg-queue/example";
import { PostgresDb } from "../../../utils/PostgresDb";



const db = new PostgresDb({/*TODO psql terms*/});

const workflows = generateExampleWorkflow(db);
const workflowsList = Object.values(workflows);


export async function serveOverHttp(req:Request) {
    
    const body = await req.json();

    for( const workflow of workflowsList ) {
        if( workflow.ownsJob(body) ) {
            await workflow.processJob(body); // Will also release it
            break;
        }
    }

    // Suggested use
    //  Put the workflows in a module, or even in a registry (e.g. npm) to facilitate sharing in different environments
    //  You can also just use one workflow per end point 
    
}