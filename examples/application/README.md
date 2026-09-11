# Application example

*"How does this make my code better?"* -- the first of env-cap's three
flagship examples (see [`../README.md`](../README.md)), aimed at an
individual developer adopting env-cap in their own project.

Most teams don't start with a schema file per feature -- they start with one
file, `env.ts` (or `config.ts`), that every part of the app imports from. This
example shows that `env-cap` doesn't require you to give that up on day one:
a single, centralized schema still gets fail-fast startup validation,
generated documentation, a generated `.env.example`, and an ownership/blast-radius
report -- the same benefits capability-owned adoption gets, just applied to
one contract instead of many.

```
src/
  env.ts                   <- one centralized schema/contract for the whole app
  generated/
    env.manifest.ts        <- generated, do not edit
  startup.ts                <- validateEnv() runs here, once
  server.ts                 <- app code imports the one contract directly
scripts/
  generate-manifest.mjs     <- build-time only, never imported by the app
features/
  database/env.schema.ts    <- reference only, unused: what this slice would
  payments/env.schema.ts       look like split into its own contract later
docs/
  ENVIRONMENT.md            <- generated
  OWNERSHIP.md              <- generated
  env.evidence.json          <- generated, the full EvidenceModel (see ADR 0038)
  env.evidence.json.fingerprint  <- generated, a content hash of what it was built from
```

The two files under `features/` are commented out and never discovered by
`docs` (it only includes `src/env.ts`). They exist purely as a
side-by-side reference for what splitting the schema apart, capability by
capability, would look like -- see
[`specs/migrations/from-centralized-schema.md`](../../specs/migrations/from-centralized-schema.md)
for the migration path itself, and [`../team-service`](../team-service) for a
working example of the fully split, multi-capability model.

## Run it

```bash
npm install
cp .env.example .env
npm start
```

`npm start` runs `docs` (writing `src/generated/env.manifest.ts`,
`docs/ENVIRONMENT.md`, and `docs/env.evidence.json` (+ its `.fingerprint`
sidecar) -- none of these are gitignored; all are committed on purpose
so regenerating them shows up as an ordinary diff, the same way you'd review
any other generated-but-tracked file) and then boots `src/server.ts`, which
validates the environment and prints the resolved config.

`.env.example` here is regenerated and overwritten directly on every run
(`onExisting: "overwrite"`) -- it's a live, always-current teaching artifact
in this example, not something meant to be hand-merged. The default library
behavior, if you don't pass `onExisting`, is the opposite: never touch an
existing file, write a timestamped sibling instead. See the root README's
CLI section for all three modes.

Try deleting `STRIPE_KEY` from `.env` and re-running `npm start` -- you'll get
an aggregated `EnvValidationError` naming the failing variable and contract,
not a stack trace from deep inside your app.

## Why this example uses one contract, not several

`env-cap`'s architecture supports capability-owned contracts (see
[`../team-service`](../team-service)), but that's an adoption target, not a
requirement. A single `createEnv()` call -- like the
one in `src/env.ts` here -- is a complete, valid, first-class use of the
library on its own. If your team already has one `env.ts` and isn't ready to
split it up, this is what keeping it looks like with `env-cap` layered on top:
the same file still gets startup validation, generated docs, a generated
`.env.example`, and an ownership report, before you've moved a single line of
configuration.
