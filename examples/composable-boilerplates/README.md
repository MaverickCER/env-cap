# Composable boilerplates example

Two interchangeable database backends -- `postgres`, `mongodb` -- plus an ORM
layer, `prisma`, that targets whichever one is active. All three ship at
once, the way an internal platform team might bundle every backend option a
generated project could choose, without forcing every team to fork the
template just to pick one:

```
features/
  postgres/env.schema.ts   <- DATABASE_URL                (active by default)
  mongodb/env.schema.ts    <- DATABASE_URL, MONGODB_REPLICA_SET (shipped dormant)
  prisma/env.schema.ts     <- DATABASE_PROVIDER            (always active)
scripts/
  generate-manifest.mjs    <- build-time only, never imported by the app
src/
  startup.ts               <- validateEnv() runs here, once
  app.ts                   <- capability code imports its own contract directly
```

None of the three import each other or a shared `env.ts`. Each schema is
split into a `createEnv()` call (processor/validator/default -- the
runtime-relevant fields `validateEnv()` reads) and a `documentEnv()` call
right below it (`category`, `exclusiveGroup`, `active`, `owner`, and a
free-form `metadata` record -- generator-only fields, never retained at
runtime). Every field here is used for a specific, real reason, not as a
feature showcase:

- **`category`** splits the boilerplate into the two real decisions a
  project has to make: `"database"` (postgres vs. mongodb -- pick one) and
  `"orm"` (prisma -- a layer on top of whichever database is chosen, not an
  alternative to it).
- **`exclusiveGroup: "database"`** is on postgres and mongodb only. They're
  genuinely mutually exclusive -- one `DATABASE_URL`, one physical database.
  It's deliberately *not* on prisma, which isn't an alternative to either.
- **`active`**: `postgres: true`, `mongodb: false`. Postgres is the default;
  Mongo ships in the repo but isn't wired in. Shipping it dormant costs
  nothing at runtime (see below) and one commented-out line in
  `.env.example` -- far cheaper than the alternative of every team deleting
  and re-adding backend code by hand, or a central schema listing every
  backend's variables whether or not a given deployment uses them.
- **`owner`** (contract-level, on `documentEnv`) plus a `runbook` entry in
  `metadata` is the kind of thing an actual platform team wants surfaced --
  who to ask, where the on-call runbook lives -- mirroring how
  `examples/basic-node`'s `payments` capability uses `owner`/`expiresAt`/
  `refreshInstructions` at the *variable* level for its Stripe key.

## `active` is a real build-time gate, not a cosmetic flag

Setting `active: false` on `mongoEnv` excludes it from the generated
contract entirely:

- `validateEnv()` never requires `DATABASE_URL`/`MONGODB_REPLICA_SET` on
  mongodb's account -- only postgres's copy of `DATABASE_URL` is required.
- Reading `mongoEnv.DATABASE_URL` throws `EnvNotReadyError` -- the same
  error already thrown for any contract never passed to `validateEnv()`.
  That's why `src/app.ts` only imports `postgresEnv` and `prismaEnv`:
  importing `mongoEnv` there would be a latent bug, not a convenience.
- `docs/ENVIRONMENT.md` (generated, but committed rather than gitignored --
  run `npm run generate:env` to regenerate it and review the diff) still
  documents `mongodb` in full, marked disabled, in the
  catalog -- plus it shows up in the ownership matrix and, since it's
  inactive, doesn't count toward the security review's "active" variable
  total. That's the comprehensive reference. `.env.example`, by contrast,
  stays purely operational: it only
  requires what the *active* configuration needs, plus mongodb's one unique
  variable (`MONGODB_REPLICA_SET`) shown commented-out for visibility --
  `DATABASE_URL` isn't repeated there since postgres already covers it.

## Run it

```bash
npm install
cp .env.example .env
npm start
```

`npm start` runs `generate:env` (writing `src/generated/env.manifest.ts`,
`docs/ENVIRONMENT.md`, and `.env.example` -- all three are committed, not
gitignored, so you can see them change in a diff; `.env.example` is
regenerated and overwritten directly on every run here, `onExisting:
"overwrite"`, rather than the library's default of leaving it untouched and
writing a timestamped sibling) and then boots `src/app.ts`, which validates
the environment and prints the active configuration.

## Try swapping the database backend

Flip `active` on both files -- `mongodb/env.schema.ts` to `true`, `postgres/env.schema.ts`
to `false` -- and swap `src/app.ts`'s import from `postgresEnv` to `mongoEnv`.
Re-run `npm run generate:env`: the contract now requires `DATABASE_URL` and
`MONGODB_REPLICA_SET`, and `.env.example` shows postgres's line commented out
instead.

Now try flipping mongodb to `active: true` *without* touching postgres:

```bash
npm run generate:env
```

```
Exclusive group "database"
--------------------------
[error] "mongodb" and "postgres" are both active and both declare
exclusiveGroup "database" -- only one active contract per exclusive group is
allowed. Set active: false on whichever one isn't in use.
```

That's the guardrail `exclusiveGroup` exists for: a boilerplate can ship
every backend it supports, but two of them running at once is a build-time
error, not a silent double-wire.
