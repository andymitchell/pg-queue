import { MultiStepPgQueue } from "./MultiStepPgQueue";

import { Queryable } from "../types";
import { z } from "zod";



/**
 * 
 * @param db 
 * @returns 
 */
export function generateExampleWorkflow(db:Queryable) {
    const workflow = {
        'v1': new MultiStepPgQueue(db, 'v1', [
            {
                id: 'step1',
                handler: async (payload) => {

                }
            },
            {
                id: 'step2',
                handler: async (payload) => {
                    
                }
            }
        ],
        z.object({name: z.string()})
        )
    }

    return workflow;
}

// TODO verifyIds as a standalone thing for runtime alignment of id and class id
// TODO Option to clone a workflow/multiple-step-queue with a new db? 
//  Or seperate ID+Steps, so they can be baked into any class (with a runtime db/schema)? Maybe even just steps (and possible custom ID), no queue. Ah, keep queue. 

