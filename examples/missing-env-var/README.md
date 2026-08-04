# missing-env-var example

This example is deliberately broken, on purpose. Two capability-owned contracts:

```
features/
  database/env.schema.ts   <- DATABASE_URL (fully satisfied by .env)
  payments/env.schema.ts   <- STRIPE_KEY   (required, absent from .env)
scripts/
  generate-manifest.mjs    <- build-time only, never imported by the app
src/
  startup.ts               <- validateEnv() runs here, once
  app.ts                   <- never reached -- see below
```

The committed [`.env`](.env) satisfies `database`'s `DATABASE_URL` completely, but
`payments`' required `STRIPE_KEY` is absent -- not blank, not commented out, just
never set. Running this example demonstrates two things at once:

1. **`validateEnv()` reports the failure clearly.** It throws an aggregated
   `EnvValidationError` naming exactly `STRIPE_KEY` and the `payments` contract that
   owns it -- not a generic "something is wrong" message, and not a raw stack trace
   from deep inside application code.
2. **A working capability doesn't get to run just because it wasn't the broken
   one.** `database`'s `DATABASE_URL` is completely valid, but `src/app.ts` --
   which would read both `databaseEnv.DATABASE_URL` and `paymentsEnv.STRIPE_KEY` --
   never executes at all. `validateEnv()` validates every registered capability
   together, once, before any capability code runs; there is no partial-success
   state where the capabilities with valid configuration proceed while only the
   broken one is blocked.

## Run it

```bash
npm install
npm start
```

`npm start` runs `generate:env` (which succeeds -- static discovery never reads
environment values, only schema shape, see
[ADR 0002](../../specs/decisions/0002-static-analysis-never-execution.md)), then
boots `src/app.ts`. Its first line is a side-effect import of `src/startup.ts`,
which calls `validateEnv()` and throws before anything else in `app.ts` runs. The
process exits non-zero with a message naming `STRIPE_KEY` and `payments` --
`database` is never mentioned as a failure, because it isn't one.

## Fixing it

Add a `STRIPE_KEY` line to `.env` (any non-empty value satisfies the schema's
validator -- this example has no format requirement on it) and re-run `npm start`.
Both capabilities now validate successfully and `src/app.ts` prints both resolved
values.

## Why this is its own example, not a variation on an existing one

[`examples/basic-node`](../basic-node/) and
[`examples/paypal-consumer`](../paypal-consumer/) both mention that deleting a
required variable produces an aggregated `EnvValidationError` -- but as prose in a
README, not as something that gets automatically re-verified every time `env-cap`
changes. This example exists so that specific behavior has its own committed,
permanently-broken fixture and its own regression test
([`test/examples/missing-env-var.test.ts`](../../test/examples/missing-env-var.test.ts)) that
actually runs it and asserts on the real failure content, instead of relying on a
maintainer to notice a regression by reading prose.
