# Enterprise platform example

_"How does this help my organization?"_ This is the third flagship [example](../README.md), for platform engineers and reviewers. It covers reports, manifests, evidence generation, and a configuration-governance report built from env-cap's source-position evidence (ADR 0036, ADR 0037).

> **Illustrative only.** The domain, a matter tracker for a law practice, exists so that the stored data is plausibly sensitive. The report it produces supports a review of this example. It says nothing about any real organization.

## A real application, on purpose

Every other example is a plain Node script. This one is a running [TanStack Start](https://tanstack.com/start) app backed by MongoDB, so env-cap meets server functions, a database and external services.

- `npm run dev` starts a dev server for a person to browse.
- `npm start` runs a headless smoke test: sign up, create a matter, add and toggle a task, attach a file, close the matter. It uses `mongodb-memory-server` and a local `s3rver`, so it needs no running database or S3 service; `mongodb-memory-server` downloads a MongoDB binary on first use.

The domain is disposable. Removing the matter and task code must leave the env-cap integration pattern obvious and intact.

## Six capabilities

```text
src/capabilities/
  database/env.schema.ts       MONGODB_URI, AUDIT_LOG_RETENTION_DAYS       data-platform-team
  auth/env.schema.ts           SESSION_SECRET                              security-team
  oauth-github/env.schema.ts   GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET      security-team
  email/env.schema.ts          RESEND_API_KEY, EMAIL_FROM_ADDRESS          platform-team
  storage/env.schema.ts        S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID,
                               S3_SECRET_ACCESS_KEY, S3_ENDPOINT?          compliance-team
  observability/env.schema.ts  LOG_LEVEL, SENTRY_DSN?                      platform-team
```

| Capability                              | What it shows                                                | What the smoke test exercises                                      |
| --------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------ |
| `database` (mongoose)                   | A real embedded MongoDB                                      | Every query, against `mongodb-memory-server`                       |
| `auth` (bcryptjs, jose)                 | Local sessions with no external service                      | Sign-up and session handling                                       |
| `oauth-github` (plain `fetch`)          | Several secrets that must be classified and rotated together | Redirect-URL building and the login page; not the GitHub handshake |
| `email` (resend)                        | One secret paired with one non-secret setting                | The console fallback when `RESEND_API_KEY` is unset                |
| `storage` (`@aws-sdk/client-s3`)        | A storage credential set                                     | Upload and download against a local `s3rver`                       |
| `observability` (pino, optional Sentry) | A capability that works with no variables set                | That Sentry does not throw without a DSN                           |

Every processor and validator here is hand-written; the example does not use `./helpers`.

## Run it

Build the repository root first ([examples/README.md](../README.md#before-you-run-one)). The committed `.env` holds placeholder values.

| Step | Command                 | Exit code          | Line of output to look for                   |
| ---- | ----------------------- | ------------------ | -------------------------------------------- |
| 1    | `npm install`           | `0`                | none                                         |
| 2    | `npm run generate:env`  | `0`                | none; writes the manifest, docs and evidence |
| 3    | `npm run check`         | `0`                | `All generated artifacts are up to date.`    |
| 4    | `npm run test:evidence` | `0`                | A line containing `passed`                   |
| 5    | `npm start`             | `0`                | `Headless smoke test passed`                 |
| 6    | `npm run dev`           | runs until stopped | none; open the printed URL                   |

CI's `examples` job runs steps 3, 4 and 5 (`test/examples/enterprise-platform.test.ts`). That job does not yet block a merge.

## Two drift checks, for two kinds of drift

1. **`npm run check`** recomputes the manifest, docs, `.env.example`, ownership report and evidence file in memory. It compares each with the committed copy and exits `1` on any difference, without writing. Edit a capability's `description` and run it again without `generate:env`: it reports `docs/ENVIRONMENT.md` as stale.
2. **`npm run test:evidence`** catches configuration that is undocumented, not stale. A new secret with no documentation link would pass `check`, because the docs would regenerate cleanly. It fails this test.

## The configuration-governance report

`evidence/projections/configuration-governance.ts` holds this organization's policy rules. env-cap supplies the facts (`classification`, `metadata`, `legalBasis` and the rest); this file decides what they imply. Its three rules:

| Rule                               | Fires when                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| `credential-without-documentation` | A `secret` or `credential` variable has no `metadata.documentation` link                         |
| `sensitive-without-legal-basis`    | A secret, credential or `pii` variable declares no `legalBasis`                                  |
| `audit-required-but-not-found`     | An `auditRequired: true` variable has no consumer anywhere in the scanned code; this is an error |

`evidence/configuration-governance.test.ts` proves each rule fires on a synthetic fixture. It then runs all three on this app's real schemas and expects zero findings. It calls `generateEvidenceModel()` directly, with no database, server or browser, so an application failure cannot mask an evidence failure.

`expected/output.json` is the smoke test's own fixture, not a copy of env-cap output.
