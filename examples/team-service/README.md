# Team service example

_"How does this help my team?"_ This is the second flagship [example](../README.md). It is for a team running a service with several features, several owners and a drift check in CI.

Four capabilities, two teams:

```text
features/
  postgres/env.schema.ts   DATABASE_URL                          active, data-platform-team
  mongodb/env.schema.ts    DATABASE_URL, MONGODB_REPLICA_SET     shipped inactive, data-platform-team
  prisma/env.schema.ts     DATABASE_PROVIDER                     always active, data-platform-team
  auth/env.schema.ts       SESSION_SECRET (classification: secret)  security-team
scripts/
  generate-docs/run.ts     writes ENVIRONMENT.md, OWNERSHIP.md and .env.example
  generate-docs/check.ts   the drift check for those three files
src/
  startup.ts               validateEnv() runs here, once
  app.ts                   each feature's code imports its own contract
```

No feature imports another or a shared `env.ts`. Each schema has a `createEnv()` call for validation and a `documentEnv()` call for the generator. Each field has a reason:

| Field                              | Where                              | Why                                                                                     |
| ---------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------- |
| `category`                         | Every feature                      | Groups the decisions: `database` (pick one), `orm` (a layer on top), `auth` (unrelated) |
| `exclusiveGroup: "database"`       | `postgres` and `mongodb`           | One `DATABASE_URL`, one database; two active at once is a build error                   |
| `active`                           | `postgres: true`, `mongodb: false` | Mongo ships in the repository but is not wired in                                       |
| `owner`                            | Every feature                      | Two teams appear in the ownership matrix                                                |
| `classification: "secret"`         | `SESSION_SECRET`, `DATABASE_URL`   | Gives the generated security review real rows                                           |
| `expiresAt`, `refreshInstructions` | Both secrets                       | Fills the lifecycle report                                                              |

## Cross-team ownership

`postgres/env.schema.ts` sets `owner: "security-team"` on `DATABASE_URL`, overriding the contract's `data-platform-team`. The connection string holds a credential, and here security-team rotates credentials.

`effectiveOwner()` from `@maverickcer/env-cap/build` reads the variable's own `owner` first, then the contract's. The reports differ by level, on purpose:

- `docs/ENVIRONMENT.md` shows `security-team` for `DATABASE_URL`, in the catalog and the ownership matrix.
- `docs/OWNERSHIP.md` lists contracts, so it still shows `data-platform-team` for `postgres`. It answers "who runs this capability".

## Rotation reminders

`SESSION_SECRET` and `DATABASE_URL` both declare `expiresAt`. As either date approaches, `npm run docs:reports` marks it "expiring soon" in `docs/ENVIRONMENT.md`. Two teams track their own secrets in one shared report.

## `active` is a build-time switch

`active: false` on `mongoEnv` excludes it from the generated manifest:

1. `validateEnv()` never requires `mongodb`'s variables.
2. Reading `mongoEnv.DATABASE_URL` throws `EnvNotReadyError`, so `src/app.ts` does not import `mongoEnv`.
3. `docs/ENVIRONMENT.md` still documents `mongodb`, marked disabled, and leaves it out of the active-variable count.

## Run it

Build the repository root first ([examples/README.md](../README.md#before-you-run-one)). The committed `.env` holds placeholder values.

| Step | Command         | Exit code | Line of output to look for                |
| ---- | --------------- | --------- | ----------------------------------------- |
| 1    | `npm install`   | `0`       | none                                      |
| 2    | `npm start`     | `0`       | `Environment validated successfully.`     |
| 3    | `npm run check` | `0`       | `All generated artifacts are up to date.` |

`npm start` runs `docs:reports`, then boots `src/app.ts`, which also prints `Prisma provider: postgresql`. `docs:reports` runs the CLI for the manifest and `docs/env.evidence.json` ([ADR 0046](../../specs/decisions/0046-cli-restricted-to-runtime-and-evidence-output.md)), then `scripts/generate-docs/run.ts` for the Markdown reports and `.env.example`.

`test/examples/team-service.test.ts` runs steps 2 and 3 in CI's `examples` job, which does not yet block a merge.

## The drift check: `npm run check`

`npm run check` runs the CLI with `--check` ([ADR 0016](../../specs/decisions/0016-check-mode-compute-before-compare-never-partial-write.md)), then `scripts/generate-docs/check.ts`. Together they recompute every generated file in memory and compare it with the committed copy. Nothing is written.

Try it:

1. Edit `SESSION_SECRET`'s `description` in `features/auth/env.schema.ts`.
2. Run `npm run check` without regenerating.
3. Expect exit code `1`, a `STALE` row for `docs/env.evidence.json`, and a line ending `are stale or missing. Run without --check to regenerate.`

The same test file makes that edit and asserts the failure. Wire `npm run check` into your own CI to fail a pull request whose generated files are out of date.

## Try swapping the database backend

1. Set `active: true` in `mongodb/env.schema.ts` and `active: false` in `postgres/env.schema.ts`.
2. Change the import in `src/app.ts` from `postgresEnv` to `mongoEnv`.
3. Run `npm run docs:reports`. The manifest now requires `DATABASE_URL` and `MONGODB_REPLICA_SET`, and `.env.example` comments out postgres's line.

Now set `mongodb` to `active: true` without touching `postgres`, and run `npm run docs`. Expect a non-zero exit and this error:

```text
Exclusive group "database"
--------------------------
[error] "mongodb" and "postgres" are both active and both declare
exclusiveGroup "database" -- only one active contract per exclusive group is
allowed. Set active: false on whichever one isn't in use.
```

A service can ship every backend it supports, but two active at once fail the build. `test/build/exclusive-group.test.ts` pins the message; CI does not run this step.
