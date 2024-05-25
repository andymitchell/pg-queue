
type EventName = string;
type EventPayload = Record<string, unknown>;
type FunckyEvent = {name: EventName, data: EventPayload}
type FunckyFunction = {id: FunctionID, trigger: FunctionTrigger | FunctionTrigger[], handler: FunctionHandler}; 

// WRITING FUNCTIONS

type FunctionID = string;
type MatchDotProp = string; // A 'match' (e.g. data.userid) will compare the incoming event against the FunctionCallback's event, on the 'match' dotprop value

type FunctionOptions = {
    id: FunctionID,
    concurrency?: {
        limit: number
    },
    cancelOn?: {event: EventName, match: MatchDotProp}[]
};
type FunctionTrigger = {event: EventName, cron?: string};
interface Step {
    run<T = unknown>(id: FunctionID, stepCallback: () => void): Promise<T>
    waitForEvent(id:FunctionID, details: {event: EventName, match: MatchDotProp, timeout: string}): Promise<void>;
    sleep(ms:number):Promise<void>
}

type FunctionHandler = (details: {event: FunckyEvent | FunckyEvent[], step: Step}) => Promise<void>;
type CreateFunction = (options:FunctionOptions, trigger: FunctionTrigger | FunctionTrigger[], handler: FunctionHandler) => FunckyFunction;

// SENDING EVENTS

type SendEvent = (event: FunckyEvent | FunckyEvent[]) => Promise<void>;

// COORDINATING EVENTS

type ServeHandler = (req:Request) => void;
type Serve = (details: {functions:FunckyFunction[]}) => ServeHandler;


// #############








const doSomeAPI = async () => undefined;

const createFunction:CreateFunction = (options, trigger, handler) => {

    // Create a package that can be sent to 

    return {
        id: options.id,
        trigger, 
        handler
    };
}

const serve:Serve = (details) => {
    // Register with the COORDINATOR
    
    return (request) => {
        // http end point processing
        // Route incoming events to their functions
    }
};

const helloWorld = createFunction({id: 'hello-world'}, {event: 'new-product'}, async ({event, step}) => {
    return doSomeAPI();
})

const firstSteps = createFunction({id: 'hello-world-first-steps'}, {event: 'new-product'}, async ({event, step}) => {

    await step.run('step-1', () => {
        return doSomeAPI();
    })
    
    await step.run('step-2', () => {
        return doSomeAPI();
    })
})

serve({functions: [helloWorld, firstSteps]});