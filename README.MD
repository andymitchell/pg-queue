## USP / Goal

The simplest queue to drop into a new project.

TODO Give some simple examples that demo both it, and also generally how a queue alleviates common problems (like AI)

### It aims to elminate all sources of dev ops or maintenance hassle. 

- "It's *just* Postgres"
    - You don't need any new software in the stack: the core queue is powered by Postgres and Postgres functions (add job, pick job, release/retry job). 
    - If you have pg_cron and pg_net available, as Supabase does, you can drive the entire queue from Postgres (it will call out to serverless/http workers to complete each job). 
        - Otherwise you only need one worker to pick/dispatch jobs. 
    - Enclosed in its own Postgres schema: it won't clash
    - It works in your language. You can use it from anywhere with a database connector: you just call the simple Postgres functions to add a job, pick a job, etc. (It also comes with a TypeScript client).
- "It *is* Postgres"
    - The standard for data robustness, especially when you need the confidence of using your queue alongside transactions
- No need to think about scaling a worker fleet: it can dispatch jobs to serverless http workers
    - For a given queue, tell it which serverless function will handle its jobs.
- Simplify complex workflows: get a declarative overview and fault tolerance
    - Complex multi-step jobs (e.g. receive user input, generate an AI response, pipeline that into another tool) need a queue for robustness, in case any stage fails and needs to be retried, but can quickly start looking like spaghetti when you try to understand what impacts what. 
        - Declaratively define the steps each job in a queue will go through, as a simple TypeScript array of functions.
        - It's both easy to read, and will retry a step until it completes giving you confidence. 
- A foundation that lasts a lifetime: MIT license
    - You can depend on it forever: no one will surprise you by going out of business or hiking prices and forcing you to urgently refactor your system.
    - It's DIY simple: you're not making a trade off between spending money on a cloud provider or handling your own dev ops

#### It sweats the little details
- Easy migrations
    - For the latest version you can either: 
        - Generate SQL migration files (since the last time you ran it), and put them into your database migrations directory
        - Use the TypeScript client to directly install into Postgres
- Confident testability
    - You can generate PgTap SQL files to make it part of your database migration tests
    - There are Typescript-powered tests you can run from existing local testing suite, or CI/CD 
- Architected as independent components 
    - You could replace any component but keep the others: the queue (e.g. replace it with Redis), serverless worker dispatching, multi-step workflows. 
        - There are some great other queueing tools out there... 
            - New coding primitives that abstract away logic for retrying failed asyncs (e.g. failed network requests, runtime time outs, such as waiting on a backend to process something): temporal.io, inngest.com, cadenceworkflow.io
                - These are a more flexible representations of our simple multi-step workflows, but you're committed to depending on them long-term as they significantly alter your architectural style. I.e. there's major lock in risk. It's on our Roadmap to abstract this.
            - Just really elegant queues: hatchet.run (has an emphasis on load balancing for customer fairness), riverqueue.com
            - Other pure open source: pg-boss 
            - The industry heavyweights: rabbitmq.com 
- The usual things you expect from a queue, with the advantages of Postgres:
    - Transactional safety: jobs can be queued as part of a bigger transaction, and fail with the transaction (e.g. don't add a user job to a queue until you're confident the user was created in the database).
    - Fast and robust with SKIP LOCKED
    - Retries failed items 
    - Limit concurrency so your workers aren't overwhelmed by spikes

#### What maintenance hassles remain? 

In pursuit of transparency, some of the issues you might face:

- If your worker code fails, you'll need to fix it like any other software; and optionally restart affected jobs. 
- At a certain scale, Postgres will start to creak. But that's probably much further away than you think: https://news.ycombinator.com/item?id=37636841
    - I'm also certain that the tables/functions can be further optimised. See the Roadmap.
- You still need to *think* in terms of queues: e.g. starting a job, executing code for each job. (I mention this only because some solutions, such as Temporal.io and Inngest, aim to abstract even that away, by just letting you write "const x = await backgroundJobX(); await backgroundJobY(x)" with the queue advantages of complete fault tolerance and spike-smoothing background processes). 

## Scaling

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

## Why Postgres? 

- https://news.ycombinator.com/item?id=37636841


## Roadmap

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
- Is back pressure threatening to collapse the system (alarm / 429 incoming)

#### Support 3rd party observability
Plug in logging systems. Most likely they'll want to subscribe/listen to all activity on the queue, but it could be done imperatively by the TypeScript classes too. 

### Fairness: don't let one customer dominate your background workers
Extend the concurrency logic to not just limit concurrency on a queue, but also on a group within that queue. Each job will be allotted to a group (most likely a customer ID).

### Elegant queue invocation and outcome usage 

Example: Client creates a new thing
- Client sends a write to a Collection {collection: 'bundles', type: 'create', data: {bundle_name: 'Customer X'}}
- In Postgres, adding an item to the Collection triggers it to be added as a job to a queue workflow (perhaps this rule is defined in a DDL for the Collection)
- The workflow runs in the background
- When it's complete, the worker updates Postgres with the result and releases the job in a single transaction (for robustness)
- Back in the client the Collection data live updates with the change, which is reflected in the UI 

Notably in that example: 
- The developer hasn't needed to explicitly think about invoking a job, or handling the result 
- There's just a one time job to set up the trigger rule, and the multi-step workflow 
    - There would be alarms/reporting for any disruption to the queue - otherwise it's hands off 

Example: respond to a new Gmail message (e.g. for AI processing)
- Watch Gmail history for new messages (this could be a Collection itself, that uses a Postgres store to persist the latest history ID per mailbox, and has a DDL to trigger invoking a job on the queue)



### Worker code that uses Durable Execution but without lock in

Temporal.io, Inngest, etc. are enticing, but there is lock in to their platform (or complexity self-hosting their systems).

Some ideas:
- Expand multi-step workflow to be good enough, without fully embracing the new code model. E.g. let one step have multiple children, pass data objects between steps, etc. 
- Abstract the common functionality into proxy functions, that can route through to a specific provider
    - The great thing will be to able to hot switch: 
        - Turn on a shadow queue, where a invocation of a workflow is first placed into postgres, then picked and invoked
        - When the provider's workflow is complete, it updates postgres to mark it done
        - Upon hot switching, find incomplete jobs, resend them to the new provider (and ignore any final completion from the old workflow)
* Actually implement the Temporal/Inngest model with our own functions, but keeping to just being a Postgres server to coordinate it all (for dev ops simplicity)

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