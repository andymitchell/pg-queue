TRADITIONAL QUEUES VS. SERVERLESS VS SERVERLESS + INNGEST'S FUNCTION MODEL

'Funcky' - this proposal's code name - is really just the smallest interpretation of Inngest possible, to get a better feel for it. And understand how it might be implemented by us (but Inngest can be self hosted, overcoming data 3rd party fears, so that doesn't make sense right now. But it's good know we _could_ do it, as an escape hatch.)


# WHAT IS ADVANTAGEOUS VS. A REGULAR QUEUE


## Revisiting a traditional Queue

Long-running workers repeatedly poll a central queue to ask for jobs. That adds two constraints:
1. The Queue can only pass the Message out once - you cannot have multiple event listeners for a single Message
    It's because this system scales by adding more duplicate workers, greedily grabbing jobs, and it would be wrong for them to repeat the same job. 
2. Scaling is your problem. 
    You must manage an appropriately sized fleet of duplicate workers. In contrast, http servers have broadly solved the scaling problem. 

## Serverless (or at least http)

This is the major advantage. Instead of long-running workers polling, a central event loop picks jobs and 'pushes' them to a http endpoint. 

### Scaling 
Http Servers - especially serverless - have essentially solved the scaling problem. You don't need to manage a fleet of workers. 

### Simple tech stack 

A traditional worker likely exists in a different environment, which means: 
- A server to maintain (it's not common to see long-running serverless environments)
- No advantages of a monolith (aka it's nice to code in your existing API project)
    - Can't reuse libraries as easily 
    - Possibly a different language 

## Inngest's Event Routing step (when you add a Job, it adds it to multiple Queues who registered interest in that Job ID)

It means Messages can be shared by multiple listeners. 

This is desirable if you're using Messages as events, and you want multiple things to respond to an event. 

## Inngest's Function Management 

### Just one central endpoint

You have to rig up the API just once. After that, you can easily write additional functions very quickly in a nearly natural way. 

### Declaring Functions as Event Listeners

Use createFunction to make your function be invoked in response to events. 

It's not dissimilar to the declarative nature of useHook dependences in React either, saying "execute when something changes". 

### Steps in Functions

They're essentially super Promises, which makes them very intuitive to work with. Only now you can:
- Be confident they'll retry until they succeed, neatly abstracting away the pain of waiting for an API to come back online 
- Await for an unearthly amount of time (months, if you wanted)
- Neatly conceptualise a long-running flow. 
    - Vs Traditionally:
        - When a job finishes, it might call other jobs to continue. But that path is buried across many files. It's spaghetti. 
        - If a worker has multiple steps for a job, and one fails, they'll all rerun. 
            - There's an extra burden to make sure each step is idempotent (e.g. checking the data store to see if it already completed.).



# MAPPING BETWEEN INNGEST'S APPROACH AND A SIMPLER SERVERLESS QUEUE

This assumes you're using serverless functions and pushing jobs to them (instead of a traditional long-running worker polling and pulling jobs).

## Make the queue work with serverless

Make sure there's an event loop that repeatedly pick jobs and sends it to serverless
- dispatcher does this if you want it to run in Postgress 
    - Postgres handles the "did it complete" problem neatly, without requiring the function to release its job from the queue, because pg_net has a table of successful calls (and it's long running itself, so it can wait for calls to complete).
- A long running process loops and picks jobs and calls the end point, then releases when they succeed 
- A 3rd party CRON calls a http function (acting as a manager), which picks jobs constantly and uses 'fetch' to call their serverless function. 
    - The weakness here is it can't know if the job completes, because it likely times out quite quickly (seconds for Supabase; 15 mins for Digital Ocean)
    - For each job, it could first call a wrapper http end point, that then calls the real one, and likely lasts long enough to close it out. But you've just doubled your function invocation costs. 
    - Or the job could just declare itself complete straight to the queue, but that increases coupling (as the endpoint now needs to know a queue exists). 

Plus, you almost certaintly want to limit concurrency on a queue, and probably implement exponential backoff in response to a 429, otherwise it can overwhelm your serverless infrastructure - or at least the provider's rate limits. 

## Example: a new product 

### Inngest 
In Inngest, you might declare something like: 
createFunction('handle-new-product', 'new-product', () => {
    step.run('generate-keywords', () => {

    });
    step.run('generate-titles', () => {

    })
})

### A single queue (new-product) but the Jobs have 'task_stage'

Constraint that you don't do more than one thing per stage, or else you have to handle idempotence on retries. 

The handler at ./new-product would look something like this: 
if( !event.task_stage ) {
    // Setup
    sendEvent({...event, task_stage: 'generate_keywords});
    return
}
if( event.task_stage==='generate_keywords' ) {
    ...
}

It still needs to declare itself complete at the end, but at least that's now just in one place. 

### Queue per function, mapped to a http end point 
Start with the /new-product API endpoint:
- It does a preliminary step, then sends the event 'generate-keywords', handled by the /generate-keywords end point 

It needs an Event Loop picks and routes jobs.

### Queue per function, mapped to http end point, but they clean up 

It could be a Queue setting that any event handler won't release the job after. 
Instead, it'll let the endpoint handler release it. Useful if we don't have the dispatcher or other long running CRON available. 




# HOW FUNCTIONS AND STEPS CAN BE IMPLEMENTED

## Preliminary Warning

Inngest's client is open source, and its server can be self hosted. There's really no reason to do this. But if you really wanted too... 

## Coordinator Setup

There's COORDINATOR (a central server) who receives FunckyFunctions and FunckyEvents from one or more HOSTS (a http server containing a single /serve endpoint).
Upon receiving a meta package from the HOST (during setting up Serve), the COORDINATOR creates a Queue for every FunckyFunction. The Queue has meta such as the HOSTS url (inferred from the registration call's header), the event names its interested in, the signing key.
    In addition to the events the FunckyFunction declares interest in, it also declares a '_step_<FunctionID>' (aka STEP_EVENT) event to listen to. 

## Functions
Upon receiving a FunckyEvent, the COORDINATOR will look at each Queue's meta to see if it wants that event, and adds it to the queue if so. 
The COORDINATOR has a main event loop, which for each Queue picks the next FunckyEvent from it, and sends it to that Queue's HOST.
    It adds additional meta to the FunckyEvent to specify the FunckyFunction ID of the Queue, so the HOST can route it. 
    It can potentially batch FunckyEvents for fewer http requests.
    It will sign each event with a signing key for the app. 
    If an event fails (either a callback from the HOST, or time out), it waits before a retry. 
The HOST receives the FunckyEvents, matches the additional meta identifying a FunckyFunction, add passes the FunckyEvent to it. 
    If it completes, it tells the COORDINATOR to release the event (no more retries).

## Steps
TODO: I've not looked at how Inngest does this - definitely check that out as well. 
The Step is created within a FunckyFunction, so all its functions (e.g. 'run') know the containing FunctionID. 
### run
Upon calling it:
- If it has run and its output is locally memoized, that is just returned.
- Else it 
    - Sends a STEP_EVENT, with meta containing the Step's unique ID (a dotpath of Step ID from the Function ID). 
    - Registers the step's handler as a function with the HOST (so it can route to it)
    - Halts the executions. 
The COORDINATOR sends the STEP_EVENT, and the HOST intercepts it and routes it to the step's handler function
    - If it succeeds:
        - Inform the COORDINATOR it's complete
        - Memoize the result
        - Call the Function Handler to rerun, this time getting beyond the step 

## How this differs from a regular Queue
- Queue has additional meta, and an extra step on addJob:
    - The meta is the events (job id's) its interested in
    - addJob might not receive a queue_name as a parameter, in which case: 
        - it looks at Queue meta to see which Queues are interested in the job id
        - Add the event to each matching queue
    - It must also provide an event loop (a CRON?) to pick jobs and push them to their Queue's http function. (Instead of a worker picking jobs by polling).
- Terminology: A job is called an event.
- The HOST should have a central endpoint for all events, and route them to the right function 
    - Note it doesn't strictly need this, it could create an endpoint per Queue. But it requires more work to set up each function end point, and it reduces the options for more efficient batch http calls.

TODO Temporary, what else the Queue needs:
- An additional bearer token approach, which is a SIGNING KEY known to the queue. 

