# Enterprise platform example

*"How does this help my organization?"* -- the third of env-cap's three flagship
examples (see [`../README.md`](../README.md)), aimed at platform/compliance:
reports, manifests, evidence generation, and a configuration-governance evidence
report built on env-cap's exact source-position evidence (ADR 0036/0037).

> **Illustrative only, not legal advice.** The domain -- a confidential
> legal-practice matter tracker -- exists to make "as if the information
> stored was sensitive" true without bolting it on artificially. It does not
> certify any real organization's compliance posture.

## The one deliberate exception in this repo

Every other example/fixture in this package is a plain Node script. This one
is a real, running [TanStack Start](https://tanstack.com/start) app backed by
MongoDB, because the whole point of this tier is demonstrating env-cap
against genuine application shape -- server functions, a database, real
external services -- not another script. `npm run dev` starts a real dev
server; `npm start` runs a full headless smoke test (signup, create a matter,
add a task, toggle it, attach a file, close the matter) against
`mongodb-memory-server` and a local `s3rver` instance, no external services
required.

## The domain is deliberately disposable

This is the third flagship *example*, not a second product. Its
architectural invariant: removing the matter/task/todo-list mechanics must
leave the env-cap integration pattern obvious and intact. The quality bar is
"a production-grade demonstration of env-cap," never "a production-grade
legal case-management application."

## Six capabilities, each demonstrating something specific

```
src/capabilities/
  database/env.schema.ts       <- MONGODB_URI, AUDIT_LOG_RETENTION_DAYS       (data-platform-team)
  auth/env.schema.ts           <- SESSION_SECRET                              (security-team)
  oauth-github/env.schema.ts   <- GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET      (security-team)
  email/env.schema.ts          <- RESEND_API_KEY, EMAIL_FROM_ADDRESS         (platform-team)
  storage/env.schema.ts        <- S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID,
                                   S3_SECRET_ACCESS_KEY, S3_ENDPOINT?         (compliance-team)
  observability/env.schema.ts  <- LOG_LEVEL, SENTRY_DSN?                      (platform-team)
```

| Capability | What it actually demonstrates |
|---|---|
| `database` (mongoose) | A real embedded Mongo via `mongodb-memory-server` -- every getter/mutator genuinely exercised in CI, not mocked. |
| `auth` (bcryptjs + jose) | Hand-rolled sessions -- pure local crypto, no external dependency, fully real in CI. |
| `oauth-github` (plain `fetch`, no SDK) | **Multiple interdependent secrets that must be classified and rotated together** -- a pattern the single-secret capabilities can't show. Redirect-URL construction and the login page's conditional rendering are real-tested; the actual GitHub handshake is not (no local GitHub emulator exists) -- stated here, not hidden. |
| `email` (resend) | **One secret credential paired with one non-secret companion config value** -- a mixed classification within a single capability. Falls back to a console log when `RESEND_API_KEY` is unset, genuinely exercised as "declared, gracefully degraded" in the headless smoke test. |
| `storage` (`@aws-sdk/client-s3` + `s3rver`) | Real: `s3rver` (a pure-JS embedded S3-compatible server) gives a genuine local target, so case-file attachment upload/download is actually exercised in CI. |
| `observability` (pino always, `@sentry/node` optional) | **A capability that's fully "complete" with zero variables set** -- `pino` runs regardless of credentials; Sentry no-ops with no DSN, tested only for "doesn't throw." |

`helpers` is the one part of env-cap deliberately **not** used here -- every
processor/validator in every capability schema is hand-written, proving the
package doesn't require them.

## Two separate tests, on purpose

- **`npm run test:evidence`** (`evidence/configuration-governance.test.ts`) -- the
  evidence-contract test. Calls `generateEvidenceModel()` directly against
  this package's own real capability schemas and asserts the
  configuration-governance projection's output: every sensitive variable's owner/purpose/legal-basis/
  retention/audit facts, its three distinct declaration positions
  (`createEnv()`, `documentEnv()`, and the variable's own schema property --
  never collapsed into one), its real access positions, and its
  `"proven"/"asserted"/"uncertain"/"not-found"` evidence category. **No
  Mongo, no TanStack Start dev server, no browser.** A change that breaks
  evidence generation is never masked by, or confused with, a change that
  breaks the application.
- **`npm start`** (`src/main-headless.ts`) -- the application smoke test.
  Calls the real server functions directly, in-process, against a real
  `mongodb-memory-server` and `s3rver`, diffing its output against
  `expected/output.json`.

## The configuration-governance evidence report

`evidence/projections/configuration-governance.ts` is where the
credential-documentation/legal-basis/audit *policy* rules live -- named for
what it actually enforces, not the domain it happens to run against.
env-cap core exposes the generic facts (`classification`, `metadata`,
`legalBasis`, ...); this file, not env-cap, decides what those facts imply
for this organization (see ADR 0024/ADR 0035's "env-cap doesn't decide what
compliance means" stance). Three rules, each independently unit-tested
against a synthetic fixture in `evidence/configuration-governance.test.ts`
so the rule's own correctness is proven without depending on this app's
real (deliberately clean) documentation:

- `credential-without-documentation` -- a `classification: "secret"` or
  `"credential"` variable (an API key, a connection string, an OAuth secret
  -- the things an on-call engineer or an auditor actually needs to go find
  and manage) with no `metadata.documentation` link. Deliberately scoped to
  credential-shaped classifications, not `"pii"` -- a personal-data field
  and an API key fail an audit for different reasons, and this rule is
  about the latter: for an enterprise organization, "where do I even find
  this secret to rotate or verify it" is a far more common, far more
  concrete gap than an unstated purpose. See `STRIPE_KEY` in
  [`examples/application`](../application/) for the convention this checks:
  `metadata: { documentation: "<url>" }`.
- `sensitive-without-legal-basis` -- any secret/credential/pii variable with no stated legal basis.
- `audit-required-but-not-found` -- an `auditRequired: true` variable env-cap found no consumer for anywhere in the scanned surfaces (an error, not a warning: you cannot audit access to something that's never read).

This real deployment's own six capabilities are all thoroughly documented on
purpose -- running the evidence-contract test against them produces **zero**
policy findings, a "here's what a clean audit looks like" result, distinct
from (and complementary to) the synthetic fixtures that prove each rule
actually fires when a real gap exists.

## Protecting against unwanted configuration in CI

Two independent gates, catching two independent kinds of drift -- neither
one substitutes for the other:

- **`npm run verify:env`** runs the packaged `env-cap` CLI binary with
  `--check` (ADR 0016) -- the same mechanism [`team-service`](../team-service/)
  demonstrates, applied here to six capabilities instead of four: recomputes
  the manifest, docs, `.env.example`, ownership report, and persisted
  evidence artifact (`docs/env.evidence.json`, ADR 0038) in memory, compares
  each against what's committed, and exits `1` if anything's stale or
  missing, without writing anything. Try it: edit any capability's
  `description` in `src/capabilities/*/env.schema.ts` and run
  `npm run verify:env` again without first running `generate:env` -- it
  reports `docs/ENVIRONMENT.md` as stale and exits non-zero. This catches
  "the schema changed but nobody regenerated the docs."
- **`npm run test:evidence`** catches a materially different class of
  problem: not stale documentation, but an actually *ungoverned* piece of
  sensitive configuration -- a new `classification: "pii"` variable added
  with no `purpose`, a secret with no `legalBasis`, an `auditRequired`
  variable nothing in the scanned surfaces ever reads. None of those make
  `--check` fail (the docs would regenerate just fine); all three fail this
  test, per the three policy rules above. This is what actually satisfies
  "protect against unwanted configurations during CI" for an org that cares
  about *what* was configured, not just whether the docs are in sync.

`test:evidence` (alongside `npm start`, the application smoke test) already
runs in this repo's own CI, in the `examples` job of
[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) -- a
policy-rule regression or an undocumented sensitive variable fails the build
today, not just in theory.

## Running it

```
npm install
npm run generate:env     # manifest, docs, .env.example, ownership report, evidence
npm run verify:env       # CI-gate: --check, fails on any drift from committed artifacts
npm run test:evidence    # CI-gate: evidence-contract test -- no Mongo, no server
npm start                # headless application smoke test
npm run dev              # real dev server, for a human to browse
```

`npm run dev` walkthrough: sign up, create a matter, add a task, toggle it,
optionally log in with GitHub if `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`
are set, log out.
