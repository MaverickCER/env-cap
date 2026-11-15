# multiple-active-exclusive-capabilities example

This example is deliberately broken, on purpose. It starts from the same three
features as [`examples/team-service`](../../../../../examples/team-service/)
(`postgres`, `mongodb`, `prisma`), with one change.
[`features/mongodb/env.schema.ts`](features/mongodb/env.schema.ts) now sets
`active: true`, while [`features/postgres/env.schema.ts`](features/postgres/env.schema.ts)
is still `active: true` too.

Both share `exclusiveGroup: "database"`. They're declared as genuine
alternatives: one physical database, one `DATABASE_URL`. Having both active at
once is exactly the condition
[ADR 0009](../../specs/decisions/0009-exclusive-groups-are-always-errors.md) exists
to catch. `generateEnvManifest()` rejects this unconditionally, every time,
regardless of `onIncompatibility` settings. There is no way to make this
configuration generate successfully without changing one of the two `active`
flags.

## Run it

```bash
npm install
npm run generate:env
```

This **always fails**. `npm run typecheck`/`npm start` fail identically, since
both run `generate:env` first. Expect output naming the exclusive group and both
contracts:

```
Exclusive group "database"
--------------------------
[error] "mongodb" and "postgres" are both active and both declare
exclusiveGroup "database". Only one active contract per exclusive group is
allowed. Set active: false on whichever one isn't in use.
```

## Why there's no committed `docs/ENVIRONMENT.md`, `docs/OWNERSHIP.md`, or generated manifest

Generation never succeeds for this schema configuration, so there is no valid
generated output to commit. Every other example in this repo commits its
generated artifacts so you can see them change in a diff. This one doesn't, and
can't.

A stale copy from before `mongodb` was flipped to `active: true` would be
actively misleading. It would suggest this configuration once worked and might
again. In fact it can never regenerate successfully as long as both contracts
stay active. The absence of these files is the point, not an oversight.

## Fixing it

Set `active: false` on either `features/postgres/env.schema.ts` or
`features/mongodb/env.schema.ts`, never both (prisma still needs a database to
target). Then re-run `npm run generate:env`. It now succeeds and writes a
manifest and docs, exactly as `examples/team-service` already demonstrates for
the postgres-active, mongodb-dormant default.

## Why this is its own example, not a variation on an existing one

`examples/team-service`'s own README documents this exact failure as something
to trigger by hand ("Now try flipping mongodb to `active: true` without touching
postgres..."). That is prose a reader can try once, not something re-verified
automatically every time `env-cap` changes.

This example gives the exclusive-group guardrail its own committed,
permanently-broken fixture. It also has its own regression test
([`multiple-active-exclusive-capabilities.test.ts`](../multiple-active-exclusive-capabilities.test.ts)).
That test actually runs `generate:env` and asserts on the real failure content.
