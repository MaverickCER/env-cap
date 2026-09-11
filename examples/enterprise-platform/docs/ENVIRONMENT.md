<!-- GENERATED FILE -- do not edit by hand. Run `npx env-cap` to regenerate. -->

> Machine-generated engineering artifact assembled from statically-provable code facts and author-declared documentation. It can support a security, privacy, or compliance review. It does not itself establish compliance with any standard.

> Projected from env-cap's Evidence Model (ADR 0031/0038), the same source every other generated artifact draws from.

# Environment Variables

_Produced by `env-cap --docs`._

_Generated 2026-09-11T05:55:39.460Z_

## Changes since last report

No changes.

## Table of contents

- [Catalog](#catalog)
  - [auth](#contract-auth)
  - [database](#contract-database)
  - [email](#contract-email)
  - [oauth-github](#contract-oauth-github)
  - [observability](#contract-observability)
  - [storage](#contract-storage)
- [Ownership matrix](#ownership-matrix)
- [Lifecycle report](#lifecycle-report)
- [Security review](#security-review)

## Catalog

<a id="catalog"></a>

<a id="contract-auth"></a>
## auth

Source: `src/capabilities/auth/env.schema.ts`
- Active: yes
- Category: auth
- Owner: security-team

<a id="auth-session_secret"></a>
### `SESSION_SECRET`

Signs and verifies staff session tokens (jose, HS256).

- Default: no
- Processor: no
- Validator: yes
- Owner: security-team
- Sensitivity: secret
- Required: yes
- Purpose: Maintain authenticated staff sessions for access to confidential matter data.
- Legal basis: Necessary for providing the service -- without a session, no staff member can be authenticated to view privileged case data.
- Retention: Rotated on security-team's own schedule; rotating invalidates every existing session.
- Audit required: yes
- Documentation: https://vault.internal/security-team/session-secret

<a id="contract-database"></a>
## database

Source: `src/capabilities/database/env.schema.ts`
- Active: yes
- Category: database
- Owner: data-platform-team

<a id="database-audit_log_retention_days"></a>
### `AUDIT_LOG_RETENTION_DAYS`

How many days of audit-log entries (who accessed which matter, when) are kept before rotation.

- Default: yes
- Processor: yes
- Validator: yes
- Owner: data-platform-team
- Purpose: Support the firm's record-keeping and audit obligations for client matters.
- Legal basis: Legal record-keeping obligation (attorney work-product / client file retention).
- Retention: The audit log itself is retained for exactly this many days, then rotated out.

<a id="database-mongodb_uri"></a>
### `MONGODB_URI`

MongoDB connection string for the case-tracker's primary database.

- Default: no
- Processor: yes
- Validator: yes
- Owner: data-platform-team
- Sensitivity: credential
- Required: yes
- Purpose: Store and retrieve matter, task, and user records.
- Legal basis: Contractual necessity -- the service cannot function without its database.
- Retention: Connection string itself is never persisted outside the deployment's secret store.
- Audit required: yes
- Documentation: https://www.mongodb.com/docs/manual/reference/connection-string/

<a id="contract-email"></a>
## email

Source: `src/capabilities/email/env.schema.ts`
- Active: yes
- Category: notifications
- Owner: platform-team

<a id="email-email_from_address"></a>
### `EMAIL_FROM_ADDRESS`

"From" address on outgoing case-notification emails.

- Default: yes
- Processor: yes
- Validator: yes
- Owner: platform-team
- Required: no

<a id="email-resend_api_key"></a>
### `RESEND_API_KEY`

Resend API key for sending case-update notification emails to staff. Unset: notifications are logged to console instead of sent.

- Default: no
- Processor: no
- Validator: no
- Owner: platform-team
- Sensitivity: secret
- Required: no
- Purpose: Notify assigned staff when a matter or task they own changes.
- Legal basis: Legitimate interest -- operational notifications, not marketing.
- Documentation: https://resend.com/api-keys

<a id="contract-oauth-github"></a>
## oauth-github

Source: `src/capabilities/oauth-github/env.schema.ts`
- Active: yes
- Category: auth
- Owner: security-team
- Purpose: Let firm staff sign in with their existing GitHub-backed SSO identity, avoiding a second password to manage.
- Legal basis: Legitimate interest -- reduces credential-sprawl risk for staff accessing confidential matter data.

<a id="oauth-github-github_client_id"></a>
### `GITHUB_CLIENT_ID`

OAuth app client ID, registered in the firm's GitHub organization settings.

- Default: no
- Processor: no
- Validator: no
- Owner: security-team
- Sensitivity: credential
- Required: yes
- Purpose: Let firm staff sign in with their existing GitHub-backed SSO identity, avoiding a second password to manage.
- Legal basis: Legitimate interest -- reduces credential-sprawl risk for staff accessing confidential matter data.
- Retention: Rotated only if the GitHub OAuth app itself is recreated; not time-boxed.
- Documentation: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app

<a id="oauth-github-github_client_secret"></a>
### `GITHUB_CLIENT_SECRET`

OAuth app client secret -- must be rotated together with GITHUB_CLIENT_ID if the app is ever recreated.

- Default: no
- Processor: no
- Validator: no
- Owner: security-team
- Sensitivity: secret
- Required: yes
- Purpose: Let firm staff sign in with their existing GitHub-backed SSO identity, avoiding a second password to manage.
- Legal basis: Legitimate interest -- reduces credential-sprawl risk for staff accessing confidential matter data.
- Retention: Rotate immediately if ever exposed; otherwise on the same cadence as GITHUB_CLIENT_ID.
- Audit required: yes
- Documentation: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app

<a id="contract-observability"></a>
## observability

Source: `src/capabilities/observability/env.schema.ts`
- Active: yes
- Category: observability
- Owner: platform-team

<a id="observability-log_level"></a>
### `LOG_LEVEL`

Minimum level pino logs at.

- Default: yes
- Processor: yes
- Validator: yes
- Owner: platform-team

<a id="observability-sentry_dsn"></a>
### `SENTRY_DSN`

Sentry DSN for error reporting. Unset: Sentry is never initialized; pino logging still runs.

- Default: no
- Processor: no
- Validator: no
- Owner: platform-team
- Sensitivity: credential
- Legal basis: Legitimate interest -- operational error monitoring, not user tracking.
- Documentation: https://docs.sentry.io/product/sentry-basics/dsn-explainer/

<a id="contract-storage"></a>
## storage

Source: `src/capabilities/storage/env.schema.ts`
- Active: yes
- Category: storage
- Owner: compliance-team
- Purpose: Store case-file attachments -- potentially privileged, client-confidential documents.
- Legal basis: Attorney-client privilege and contractual necessity -- the firm must retain and produce case documents.
- Data residency: us-east-1

<a id="storage-s3_access_key_id"></a>
### `S3_ACCESS_KEY_ID`

Access key ID for the case-file attachment bucket.

- Default: no
- Processor: no
- Validator: no
- Owner: compliance-team
- Sensitivity: credential
- Required: yes
- Purpose: Store case-file attachments -- potentially privileged, client-confidential documents.
- Legal basis: Attorney-client privilege and contractual necessity -- the firm must retain and produce case documents.
- Data residency: us-east-1
- Audit required: yes
- Documentation: https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html

<a id="storage-s3_bucket"></a>
### `S3_BUCKET`

Bucket holding case-file attachments.

- Default: no
- Processor: yes
- Validator: no
- Owner: compliance-team
- Required: yes
- Purpose: Store case-file attachments -- potentially privileged, client-confidential documents.
- Legal basis: Attorney-client privilege and contractual necessity -- the firm must retain and produce case documents.
- Data residency: us-east-1

<a id="storage-s3_endpoint"></a>
### `S3_ENDPOINT`

Override endpoint for a local/test S3-compatible server (s3rver). Unset in production -- the real AWS endpoint is used.

- Default: no
- Processor: no
- Validator: no
- Owner: compliance-team
- Purpose: Store case-file attachments -- potentially privileged, client-confidential documents.
- Legal basis: Attorney-client privilege and contractual necessity -- the firm must retain and produce case documents.
- Data residency: us-east-1

<a id="storage-s3_region"></a>
### `S3_REGION`

AWS region the bucket lives in.

- Default: yes
- Processor: yes
- Validator: no
- Owner: compliance-team
- Purpose: Store case-file attachments -- potentially privileged, client-confidential documents.
- Legal basis: Attorney-client privilege and contractual necessity -- the firm must retain and produce case documents.
- Data residency: us-east-1

<a id="storage-s3_secret_access_key"></a>
### `S3_SECRET_ACCESS_KEY`

Secret access key for the case-file attachment bucket -- gates access to potentially privileged client documents.

- Default: no
- Processor: no
- Validator: no
- Owner: compliance-team
- Sensitivity: pii
- Required: yes
- Purpose: Store case-file attachments -- potentially privileged, client-confidential documents.
- Legal basis: Attorney-client privilege and contractual necessity -- the firm must retain and produce case documents.
- Retention: Rotated quarterly per compliance-team's key-rotation schedule.
- Data residency: us-east-1
- Audit required: yes
- Documentation: https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html

## Ownership matrix

<a id="ownership-matrix"></a>

| Owner | Variables |
|---|---|
| compliance-team | [`S3_ACCESS_KEY_ID` (storage)](#storage-s3_access_key_id), [`S3_BUCKET` (storage)](#storage-s3_bucket), [`S3_ENDPOINT` (storage)](#storage-s3_endpoint), [`S3_REGION` (storage)](#storage-s3_region), [`S3_SECRET_ACCESS_KEY` (storage)](#storage-s3_secret_access_key) |
| data-platform-team | [`AUDIT_LOG_RETENTION_DAYS` (database)](#database-audit_log_retention_days), [`MONGODB_URI` (database)](#database-mongodb_uri) |
| platform-team | [`EMAIL_FROM_ADDRESS` (email)](#email-email_from_address), [`RESEND_API_KEY` (email)](#email-resend_api_key), [`LOG_LEVEL` (observability)](#observability-log_level), [`SENTRY_DSN` (observability)](#observability-sentry_dsn) |
| security-team | [`SESSION_SECRET` (auth)](#auth-session_secret), [`GITHUB_CLIENT_ID` (oauth-github)](#oauth-github-github_client_id), [`GITHUB_CLIENT_SECRET` (oauth-github)](#oauth-github-github_client_secret) |

## Dependency graph

<a id="dependency-graph"></a>

One row per unique variable name; more than one location means more than one feature declares it (see the package README's "Duplicate variables" section for how that's handled at runtime).

| Variable | Declared in |
|---|---|
| `AUDIT_LOG_RETENTION_DAYS` | [database (`src/capabilities/database/env.schema.ts`)](#database-audit_log_retention_days) |
| `EMAIL_FROM_ADDRESS` | [email (`src/capabilities/email/env.schema.ts`)](#email-email_from_address) |
| `GITHUB_CLIENT_ID` | [oauth-github (`src/capabilities/oauth-github/env.schema.ts`)](#oauth-github-github_client_id) |
| `GITHUB_CLIENT_SECRET` | [oauth-github (`src/capabilities/oauth-github/env.schema.ts`)](#oauth-github-github_client_secret) |
| `LOG_LEVEL` | [observability (`src/capabilities/observability/env.schema.ts`)](#observability-log_level) |
| `MONGODB_URI` | [database (`src/capabilities/database/env.schema.ts`)](#database-mongodb_uri) |
| `RESEND_API_KEY` | [email (`src/capabilities/email/env.schema.ts`)](#email-resend_api_key) |
| `S3_ACCESS_KEY_ID` | [storage (`src/capabilities/storage/env.schema.ts`)](#storage-s3_access_key_id) |
| `S3_BUCKET` | [storage (`src/capabilities/storage/env.schema.ts`)](#storage-s3_bucket) |
| `S3_ENDPOINT` | [storage (`src/capabilities/storage/env.schema.ts`)](#storage-s3_endpoint) |
| `S3_REGION` | [storage (`src/capabilities/storage/env.schema.ts`)](#storage-s3_region) |
| `S3_SECRET_ACCESS_KEY` | [storage (`src/capabilities/storage/env.schema.ts`)](#storage-s3_secret_access_key) |
| `SENTRY_DSN` | [observability (`src/capabilities/observability/env.schema.ts`)](#observability-sentry_dsn) |
| `SESSION_SECRET` | [auth (`src/capabilities/auth/env.schema.ts`)](#auth-session_secret) |

## Lifecycle report

<a id="lifecycle-report"></a>

| Variable | Owner | Expires | Refresh instructions |
|---|---|---|---|
| [`SESSION_SECRET`](#auth-session_secret) | security-team | -- | -- |
| [`AUDIT_LOG_RETENTION_DAYS`](#database-audit_log_retention_days) | data-platform-team | -- | -- |
| [`MONGODB_URI`](#database-mongodb_uri) | data-platform-team | -- | -- |
| [`EMAIL_FROM_ADDRESS`](#email-email_from_address) | platform-team | -- | -- |
| [`RESEND_API_KEY`](#email-resend_api_key) | platform-team | -- | -- |
| [`GITHUB_CLIENT_ID`](#oauth-github-github_client_id) | security-team | -- | -- |
| [`GITHUB_CLIENT_SECRET`](#oauth-github-github_client_secret) | security-team | -- | -- |
| [`LOG_LEVEL`](#observability-log_level) | platform-team | -- | -- |
| [`SENTRY_DSN`](#observability-sentry_dsn) | platform-team | -- | -- |
| [`S3_ACCESS_KEY_ID`](#storage-s3_access_key_id) | compliance-team | -- | -- |
| [`S3_BUCKET`](#storage-s3_bucket) | compliance-team | -- | -- |
| [`S3_ENDPOINT`](#storage-s3_endpoint) | compliance-team | -- | -- |
| [`S3_REGION`](#storage-s3_region) | compliance-team | -- | -- |
| [`S3_SECRET_ACCESS_KEY`](#storage-s3_secret_access_key) | compliance-team | -- | -- |

## Security review

<a id="security-review"></a>

- Total contracts: 6
- Total variable declarations: 14 (14 from active contracts)
- Unique variable names: 14
- Variables with `expiresAt` set: 0
  - Already expired: 0
  - Expiring within 30 days: 0
- Variables marked `required: true`: 7
- Variables with refresh instructions: 0
- Variables with no assigned owner: 0
- Variable names declared by more than one contract: 0
- Undocumented contracts: 0
- Undocumented variables: 0
