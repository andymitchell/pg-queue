## The 'No Maintenance' Postgres Queue

Ideal for solo / small teams who already use Postgres. 

This library is designed to eliminate all sources of dev ops or maintenance headaches, letting you focus on building features.

- **Powered by Postgres**:
    - **No New Software Needed**: Integrate seamlessly with your existing stack. The core queue operations (add job, pick job, release/retry job) are all handled by Postgres functions.
    - **Standard for Robustness**: Postgres is renowned for its data integrity and reliability, ensuring your queue operations are rock-solid.

- **Language Agnostic**:
    - **Universal Compatibility**: Use it from any environment with a database connector. The native (plpgsql) Postgres functions enable you to add and manage jobs effortlessly. Includes a TypeScript client for added convenience.

- **Infinitely Scalable Worker Fleet**:
    - **Serverless Integration**: Automatically dispatch jobs to serverless HTTP workers. Specify the serverless function for each queue and let the system handle the rest. (You can also use traditional long-running workers.)

- **Simplified Complex Workflows**:
    - **Declarative Steps**: Turn multi-step jobs into a simple, readable array of functions in TypeScript. Each step is retried until successful, ensuring robustness and clarity.

- **Lifetime Dependability**:
    - **MIT Licensed**: Depend on it indefinitely without fear of business changes or price hikes. And you own your own data location, for privacy law (e.g. GDPR) compliance.

### Thoughtful Details

- **Effortless Migrations**:
    - **SQL or TypeScript**: Generate SQL migration files or use the TypeScript client to install updates directly into Postgres.

- **Robust Testing**:
    - **PgTap and TypeScript Tests**: Integrate seamlessly with your existing testing suite or CI/CD pipeline, ensuring confidence in every deployment.

- **Queue Essentials with Postgres Advantages**:
    - **Transactional Safety**: Queue jobs conditional on a larger transaction succeeding, ensuring consistency and reliability.
    - **Fast and Reliable**: Utilizes SKIP LOCKED for efficient job handling.
    - **Automatic Retries and Concurrency Control**: Manage spikes without overwhelming your workers.

## How it works

### Installing / Updating

**Install and update is the same process**. The installation process is idempotent, so you can run it multiple times in the same schema, and you'll safely get the latest version. 

#### Installing using the CLI to generate .sql migration files

1. In Terminal, navigate to the root of your code (if you have an existing package.json, or existing sql migration files, the root should include both of these).
2. `npm i @andyrmitchell/pg-queue@latest`
3. `npx pg-queue-install`

#### Installing via a live Postgres connection from a TypeScript environment

1. `npm i @andyrmitchell/pg-queue@latest`
2. `install(reader:PgqFileReader, db:Queryable, config: {schema_name?:string})`
    - PgqFileReader and Queryable are abstractions for the file system and Postgres respectively
        - It comes with a PgqFileReader for Node: `pgcFileReaderNode`. Otherwise you'll need to implement the interface PgqFileReader.
        - It comes with a Queryable for TypeScript/postgres that uses 'postgres' (from npm): `PostgresDb`
    - If you don't provide a schema_name, it'll use the exported const DEFAULT_SCHEMA

#### Testing

As every Postgres installation is unique, you should have test scripts on your production server that confirm the queue works as expected.

##### Generating PgTap tests for your existing SQL deployment test

The Install CLI steps above will also let you specify a sql tests directory, and install the the PgTap .sql files into it.

### Uninstalling 

You can just drop the schema: 
`DROP SCHEMA $1 CASCADE`

Where `$1` is the custom schema name you used, otherwise it's the exported const DEFAULT_SCHEMA. 

### Adding a job to a queue

```typescript
const db = new PostgresDb({/*TODO psql terms*/});
const queue = new PgQueue<{payload_data_can_be_anything:boolean}>(db, 'test_queue_1', 'optional_custom_schema_1');
queue.addJob({payload_data_can_be_anything: true})
```

When this is later picked by a worker, it'll receive the payload data.

### Setting max concurrency on a queue 

```typescript
const db = new PostgresDb({/*TODO psql terms*/});
const queueConfig = new PgQueueConfig(db, 'test_queue_1', 'optional_custom_schema_1');
await queueConfig.set({
    max_concurrency: 25
});
```

### Declaring a multi-step workflow, and starting a job on it

Multi Step Workflows use the standard PgQueue underneath, but automatically handle setting up the next job for the next step. 

```typescript
const db = new PostgresDb({/*TODO psql terms*/});

const msq = new MultiStepPgQueue(
    db,
    'test_multistep_queue_1',
    [
        {
            id: 'no1',
            handler: async (payload, jobID) => {
                // Do something, e.g. read a value from the payload, process it, and write it to the database
                if( payload.name==='Bob' ) {
                }
            }
        },
        {
            id: 'no2',
            handler: async (payload, jobID) => {
                // Do something, e.g. read a value from the database, process it, and write it to the database
            }
        }
    ],
    z.object({name: z.string()}), // Payload format in Zod, given to the step handler
    undefined, 
    'optional_custom_schema_1'
)

await msq.addJob({
    name: 'Bob'
});
```

### Serverless Function Workers

You need to set up a Dispatcher, which continually picks available jobs off the queue and passes them to the handler at a http endpoint (specified per queue); and then put the queue-specific job handler at the http endpoint. 

#### Set up a Job Dispatcher

##### Serverless Function Dispatcher

[See](`https://www.github.com/andymitchell/pg-queue/blob/src/workers/dispatcher/examples/endpoint-poll.example.ts`)

##### Long-running Dispatcher

[See](`https://www.github.com/andymitchell/pg-queue/blob/src/workers/dispatcher/examples/longrunning.example.ts`)


##### Postgres Native Dispatcher

This removes the need for a separate Dispatcher, by letting Postgres run it internally (using pg_net and pg_cron). 

**To finish implementing (See Roadmap)**

#### Set up a Job Handler

##### For a queue

[See](`https://www.github.com/andymitchell/pg-queue/blob/src/workers/examples/endpoint-queue.example.ts`)


##### For a multi-step workflow

[See](`https://www.github.com/andymitchell/pg-queue/blob/src/workers/examples/endpoint-multi-step-queue.example.ts`)


### A long-running worker 

These continually loop, trying to pick a job off the queue and completing it. 

#### For a queue 

[See](`https://www.github.com/andymitchell/pg-queue/blob/src/workers/examples/longrunning-queue.example.ts`)

#### For a multi-step workflow

[See](`https://www.github.com/andymitchell/pg-queue/blob/src/workers/examples/longrunning-multi-step-queue.example.ts`)



## Why make a new queue in 2024? 

There are many appealing options:
- Durable Execution paradigms
    - Temporal.io
    - Inngest.com
    - Hatchet.run
- Open source queues
    - riverqueue.com
    - rabbitmq.com
- Postgres native, open source queues
    - Pg-Boss

With the exception of Pg-Boss, all of these require either a cloud package or a dedicated server deployment in a specific language. I.e. there's either cost in maintenance (self hosting an esoteric system) or cloud (subscriptions, and data location concerns for privacy laws). 

Pg-Boss solved those issues, but still lacked: 
- Pushing jobs to serverless handlers. (Instead, you maintain/scale a fleet of long-running workers.)
- Language independence - it's written in Node, rather than being primarily in Postgres. 
- Simplifying multi-step workflows, by replacing spaghetti-ish job spawning with a single array of functions. 
- TypeScript source code


     

## Scaling


### Why Postgres? 

- https://news.ycombinator.com/item?id=37636841
- https://adriano.fyi/posts/2023-09-24-choose-postgres-queue-technology/


### Reduce worker costs / bottlenecks (at the expense of more dev ops): replace serverless 

Combining queues with serverless functions eliminates needing to think about managing a worker fleet. 

But serverless has two drawbacks:
- Once your queue is fast moving, being charged per invocation might become expensive. 
    - This is a champagne problem: your service is probably popular enough to afford dev ops. 
- Serverless providers typically cap CPU run time, so it might not be able to finish an intensive job, leading to endless retries.

You can replace it with either:
- Your own http API end point
- A traditional worker that picks jobs from the queue, and processes them 

There's a lot of great platforms out there for hosting long running workers:
- Render.com
- Digital Ocean
- Porter.run
- Fly.io

### When it's time to move beyond a simple queue

Temporal.io (as well as inngest.com, and perhaps hatchet.run) introduce new coding primitives that abstract away all the complexigty of logic for retrying failed asyncs (e.g. failed network requests, runtime time outs, such as waiting on a backend to process something). 

For traditional queues, riverqueue.com looks really nice. 


## What maintenance hassles remain? 

In pursuit of transparency, some of the issues you might face:

- If your worker code fails, you'll need to fix it like any other software; and optionally restart affected jobs. 
- At a certain scale, Postgres will start to creak. But that's probably much further away than you think: https://news.ycombinator.com/item?id=37636841
    - I'm also certain that the tables/functions can be further optimised. See the Roadmap.
- You still need to *think* in terms of queues: e.g. starting a job, executing code for each job. (I mention this only because some solutions, such as Temporal.io and Inngest, aim to abstract even that away, by just letting you write "const x = await backgroundJobX(); await backgroundJobY(x)" with the queue advantages of complete fault tolerance and spike-smoothing background processes). 




## Roadmap

### Finish the Postgres-native dispatcher (using pg_net)

I paused development because at the time, pg_net wasn't mature enough to use with local testing development. It has since been updated.

### Review the latest ideas
- Postgres queues
    - https://news.ycombinator.com/item?id=40077233
    - https://news.ycombinator.com/item?id=37636841
    - https://news.ycombinator.com/item?id=39643136
    - https://news.ycombinator.com/item?id=39315833
    - https://news.ycombinator.com/item?id=39092849
- Back pressure in systems
    - https://news.ycombinator.com/item?id=39041477 
    - https://news.ycombinator.com/item?id=39813660
    - https://news.ycombinator.com/item?id=29220338

### Gain visibility into execution
The main pain points:
- Are jobs routinely failing, especially if it's a (broken) step in a workflow (alarm, restart)
    - Why is a job routinely failing? What is its history of attempts? What happened to the worker?
- Are jobs very slow to start (alarm)
- Is back pressure threatening to collapse the system (alarm / 429 the incoming requests)

#### Support 3rd party observability
Plug in logging systems. Most likely they'll want to subscribe/listen to all activity on the queue, but it could be done imperatively by the TypeScript classes too. 

### Fairness: don't let one customer dominate your background workers
Extend the concurrency logic to not just limit concurrency on a queue, but also on a group within that queue. Each job will be allotted to a group (most likely a customer ID).

### Elegant queue invocation and outcome usage 

Example 1: Client creates a new thing
- Client sends a write to a Collection {collection: 'bundles', type: 'create', data: {bundle_name: 'Customer X'}}
- In Postgres, adding an item to the Collection triggers it to be added as a job to a queue workflow (perhaps this rule is defined in a DDL for the Collection)
- The workflow runs in the background
- When it's complete, the worker updates Postgres with the result and releases the job in a single transaction (for robustness)
- Back in the client the Collection data live updates with the change, which is reflected in the UI 

#### Notably in that example: 
- The developer hasn't needed to explicitly think about invoking a job, or handling the result 
- There's just a one time job to set up the trigger rule, and the multi-step workflow 
    - There would be alarms/reporting for any disruption to the queue - otherwise it's hands off 

Example 2: respond to a new Gmail message (e.g. for AI processing)
- Watch Gmail history for new messages (this could be a Collection itself, that uses a Postgres store to persist the latest history ID per mailbox, and has a DDL to trigger invoking a job on the queue)



### Worker code that uses Durable Execution but without lock in

Temporal.io, Inngest, etc. are enticing, but there is lock in to their platform (or complexity self-hosting their systems).

Some ideas:
- Expand multi-step workflow to be good enough, without fully embracing the new code model. E.g. let one step have multiple children, pass data objects between steps, etc. 


### Eject button: switch away to any other queue tool

This is achieved when the above Roadmap items are complete
- Job invocation from client apps that use a totally agnostic interface 
- Hot-switchable worker workflows



### Optimise Postgres

## Build 

### Troubleshooting 

#### Jest pains 

In theory it should be simple to get ESM working with Jest (all the code is written for ESM); but I've found switching the whole npm package to ESM to be full of sharks. So it's commonjs for now, with caveats for certain ESM modules / techniques (below).

Longer term the package should move to ESM, but for now...

##### Importing 3rd party ESM modules

Jest will complain about "import" statements. So tell Jest to not try to transform those packages, just use them.

In jest.config.ts:
```
transformIgnorePatterns: [
    // Don't transform node_modules for any other ES modules you use
    '/node_modules/(?!lodash-es|dot-prop|\@electric\-sql\/pglite|pkg-dir|find-up-simple|inquirer|chalk|ansi-styles|filenamify|filename-reserved-regex)'
],
```

##### Getting import.meta.url working with Jest

Follow this: https://stackoverflow.com/questions/64961387/how-to-use-import-meta-when-testing-with-jest to use the babel plugin: https://github.com/javiertury/babel-plugin-transform-import-meta 

In jest.config.ts, I had to make the file explicit to use Babel instead of ts-jest:
```
transform: {
        // Use babel-jest to transform JS files
        '^.+\\.(js|jsx)$': 'babel-jest',
        '^.+getCurrentDirectory\\.ts$': 'babel-jest',
        // Use ts-jest for ts/tsx files
        '^.+\\.(ts|tsx)$': 'ts-jest',
    },
```

An alternative solution would have been to create a __mocks__ folder, with getCurrentDirectory.ts, and then update jest.config.js with: 
```
moduleNameMapper: {
    '^./getCurrentDirectory$': '<rootDir>/path/to/__mocks__/getCurrentDirectory.ts',
},
```