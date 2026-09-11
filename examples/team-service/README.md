# Team service example

*"How does this help my team?"* -- the second of env-cap's three flagship
examples (see [`../README.md`](../README.md)), aimed at an engineering team
running a real service: multiple capabilities, multiple owners, a security
review, and a CI gate that fails a PR when generated artifacts drift.

Four capabilities, two real teams:

```
features/
  postgres/env.schema.ts   <- DATABASE_URL                (active by default, data-platform-team)
  mongodb/env.schema.ts    <- DATABASE_URL, MONGODB_REPLICA_SET (shipped dormant, data-platform-team)
  prisma/env.schema.ts     <- DATABASE_PROVIDER            (always active, data-platform-team)
  auth/env.schema.ts       <- SESSION_SECRET (classification: secret)  (security-team)
scripts/
  generate-manifest.mjs    <- build-time only, never imported by the app
src/
  startup.ts               <- validateEnv() runs here, once
  app.ts                   <- capability code imports its own contract directly
```

None of the four import each other or a shared `env.ts`. Each schema is
split into a `createEnv()` call (processor/validator/default -- the
runtime-relevant fields `validateEnv()` reads) and a `documentEnv()` call
right below it (`category`, `exclusiveGroup`, `active`, `owner`,
`classification`, and a free-form `metadata` record -- generator-only
fields, never retained at runtime). Every field here is used for a
specific, real reason, not as a feature showcase:

- **`category`** splits the boilerplate into the real decisions a project
  has to make: `"database"` (postgres vs. mongodb -- pick one), `"orm"`
  (prisma -- a layer on top of whichever database is chosen, not an
  alternative to it), and `"auth"` (session handling -- unrelated to either).
- **`exclusiveGroup: "database"`** is on postgres and mongodb only. They're
  genuinely mutually exclusive -- one `DATABASE_URL`, one physical database.
  It's deliberately *not* on prisma or auth, neither of which is an
  alternative to anything else here.
- **`active`**: `postgres: true`, `mongodb: false`. Postgres is the default;
  Mongo ships in the repo but isn't wired in. Shipping it dormant costs
  nothing at runtime (see below) and one commented-out line in
  `.env.example`.
- **`owner`** is where this example earns its name: `postgres`/`mongodb`/
  `prisma` are all `data-platform-team`'s; `auth` is `security-team`'s. A
  real service has more than one team's name in its ownership matrix, and
  the generated `docs/OWNERSHIP.md` reflects exactly that split.
- **`classification: "secret"`** on `SESSION_SECRET` (and, per below,
  `postgres`'s `DATABASE_URL`) is what gives the generated security review
  something real to enumerate.
- **`setupInstructions`/`expiresAt`/`refreshInstructions`** on both secrets
  turn the generated lifecycle report and security review from an empty
  table into a genuinely useful one -- see "Rotation reminders" below.

## Cross-team ownership: when a variable's owner isn't its contract's owner

Every variable so far has inherited its owner from its contract: postgres's
`DATABASE_URL` is `data-platform-team`'s because the postgres *contract* is.
But real ownership doesn't always nest that cleanly. `postgres/env.schema.ts`
sets `owner: "security-team"` directly on `DATABASE_URL` itself, overriding
the contract's `data-platform-team` -- the connection string embeds a live
credential, and at this org, credential rotation is security-team's
responsibility even though data-platform-team runs the database capability
around it.

`effectiveOwner()` (`env-cap/build`) is what resolves this: it
reads the variable's own `owner` first, falling back to the contract's only
if the variable didn't set one. Every generated report that shows
per-variable ownership uses it, so:

- `docs/ENVIRONMENT.md`'s **catalog entry** for `DATABASE_URL` and its
  **ownership matrix** both show `security-team` for this one variable.
- `docs/OWNERSHIP.md`'s **dependency ownership table**, by contrast, is
  intentionally *contract*-level -- it still lists postgres's owner as
  `data-platform-team`, because that table answers "who runs this
  capability," not "who owns this specific credential."

Both are correct, at their own level, at the same time. That's the actual
shape of cross-team coordination this example exists to show: a team can own
running a capability without owning every credential inside it, and
`env-cap`'s generated docs represent that split instead of flattening it to
one name.

## Rotation reminders: two secrets, two teams, two schedules

`SESSION_SECRET` (security-team, in `auth/`) and `DATABASE_URL`
(effectively security-team, in `postgres/`, per above) both set
`expiresAt`/`refreshInstructions`/`setupInstructions` now, so
`docs/ENVIRONMENT.md`'s lifecycle report and security review sections have
two real rows instead of reading "Variables with `expiresAt` set: 0." Run
`npm run docs` as either date approaches and watch the docs mark it
"expiring soon" -- this is the same mechanism `examples/application`
demonstrates for a single owner; here it's two different teams each
tracking their own secret's rotation on their own schedule, surfaced in one
shared report either team (or a platform team auditing both) can read.

## `active` is a real build-time gate, not a cosmetic flag

Setting `active: false` on `mongoEnv` excludes it from the generated
contract entirely:

- `validateEnv()` never requires `DATABASE_URL`/`MONGODB_REPLICA_SET` on
  mongodb's account -- only postgres's copy of `DATABASE_URL` is required.
- Reading `mongoEnv.DATABASE_URL` throws `EnvNotReadyError` -- the same
  error already thrown for any contract never passed to `validateEnv()`.
  That's why `src/app.ts` only imports `postgresEnv`, `prismaEnv`, and
  `authEnv` -- importing `mongoEnv` there would be a latent bug, not a
  convenience.
- `docs/ENVIRONMENT.md` (generated, but committed rather than gitignored --
  run `npm run docs` to regenerate it and review the diff) still
  documents `mongodb` in full, marked disabled, in the catalog -- plus it
  shows up in the ownership matrix and, since it's inactive, doesn't count
  toward the security review's "active" variable total.

## Run it

```bash
npm install
cp .env.example .env
npm start
```

`npm start` runs `docs` (writing `src/generated/env.manifest.ts`,
`docs/ENVIRONMENT.md`, `docs/OWNERSHIP.md`, `docs/env.evidence.json` (+ its
`.fingerprint` sidecar, ADR 0038), and `.env.example` -- all committed, not
gitignored, so you can see them change in a diff) and then boots
`src/app.ts`, which validates the environment and prints the active
configuration.

## The CI gate: `check`

```bash
npm run check
```

runs the packaged `env-cap` CLI binary with `--check` (ADR 0016) instead of
`docs` -- it recomputes every artifact in memory and
compares it against what's committed, without writing anything, exiting `1`
if anything is stale or missing. This is the actual shape of the check a
real team wires into CI: a schema change lands, someone forgets to re-run
`docs`, and the PR fails loudly instead of shipping documentation
that's already wrong. Try it: edit `SESSION_SECRET`'s `description` in
`features/auth/env.schema.ts` and run `npm run check` again without
first running `docs` -- it reports `docs/ENVIRONMENT.md` as stale
and exits non-zero.

## Try swapping the database backend

Flip `active` on both files -- `mongodb/env.schema.ts` to `true`, `postgres/env.schema.ts`
to `false` -- and swap `src/app.ts`'s import from `postgresEnv` to `mongoEnv`.
Re-run `npm run docs`: the contract now requires `DATABASE_URL` and
`MONGODB_REPLICA_SET`, and `.env.example` shows postgres's line commented out
instead.

Now try flipping mongodb to `active: true` *without* touching postgres:

```bash
npm run docs
```

```
Exclusive group "database"
--------------------------
[error] "mongodb" and "postgres" are both active and both declare
exclusiveGroup "database" -- only one active contract per exclusive group is
allowed. Set active: false on whichever one isn't in use.
```

That's the guardrail `exclusiveGroup` exists for: a service can ship every
backend it supports, but two of them running at once is a build-time error,
not a silent double-wire.
