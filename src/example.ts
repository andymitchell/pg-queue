import { z } from "zod";
import { createMultiStepPgQueue } from "./multi-step-pg-queue/MultiStepPgQueue";

const workflows = {
    'v1': createMultiStepPgQueue(
        {query:async (q, t) => ({rows: []})}, 
        'workflow_v1', 
        [
            {
                id: '',
                handler: async (payload) => {
                    
                }
            },
            {
                id: 'PRODUCT_RANDOMISER',
                handler: async (payload) => {
                    
                }
            }
        ],
        z.object({id: z.string()})
    )
}

workflows.v1.addJob({'id': '1'});
