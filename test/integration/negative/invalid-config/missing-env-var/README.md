# missing-env-var example

This example is deliberately broken, on purpose. Two feature-owned contracts:

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

The committed [`.env`](.env) satisfies `database`'s `DATABASE_URL` completely.
`payments`' required `STRIPE_KEY` is absent: not blank, not commented out, but
never set. Running this example demonstrates two things at once:

1. **`validateEnv()` reports the failure clearly.** It throws an aggregated
   `EnvValidationError` naming exactly `STRIPE_KEY` and the `payments` contract
   that owns it. It is not a generic "something is wrong" message, and not a raw
   stack trace from deep inside application code.
2. **A working feature doesn't get to run because it wasn't the broken
   one.** `database`'s `DATABASE_URL` is completely valid. Even so, `src/app.ts`
   never executes at all (it would read both `databaseEnv.DATABASE_URL` and
   `paymentsEnv.STRIPE_KEY`). `validateEnv()` validates every registered
   feature together, once, before any feature code runs. There is no
   partial-success state where the features with valid configuration
   proceed while only the broken one is blocked.

## Run it

```bash
npm install
npm start
```

`npm start` runs `generate:env`, which succeeds: static discovery never reads
environment values, only schema shape (see
[ADR 0002](../../specs/decisions/0002-static-analysis-never-execution.md)). It
then boots `src/app.ts`. Its first line is a side-effect import of
`src/startup.ts`, which calls `validateEnv()` and throws before anything else in
`app.ts` runs. The process exits non-zero with a message naming `STRIPE_KEY` and
`payments`. `database` is never mentioned as a failure, because it isn't one.

## Fixing it

Add a `STRIPE_KEY` line to `.env` and re-run `npm start`. Any non-empty value
satisfies the schema's validator; this example has no format requirement on it.
Both features now validate successfully and `src/app.ts` prints both
resolved values.

## Why this is its own example, not a variation on an existing one

[`examples/application`](../../../../../examples/application/) and
[`paypal-consumer`](../../../positive/enterprise/paypal-consumer/) both mention
that deleting a required variable produces an aggregated `EnvValidationError`.
But that is prose in a README, not something that gets automatically
re-verified every time `env-cap` changes.

This example gives that specific behavior its own committed, permanently-broken
fixture and its own regression test
([`missing-env-var.test.ts`](missing-env-var.test.ts)). The test actually runs
the example and asserts on the real failure content. It does not rely on a
maintainer to notice a regression by reading prose.
