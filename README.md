# env-cap

[![CI](https://img.shields.io/github/actions/workflow/status/maverickcer/env-cap/ci.yml?branch=main&label=CI)](https://github.com/maverickcer/env-cap/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/%40maverickcer%2Fenv-cap)](https://www.npmjs.com/package/@maverickcer/env-cap)
[![Coverage](https://img.shields.io/endpoint?url=https://maverickcer.github.io/env-cap/coverage-badge.json)](https://github.com/MaverickCER/env-cap/blob/main/vitest.config.ts)
[![Bundle size](https://img.shields.io/endpoint?url=https://maverickcer.github.io/env-cap/size-badge.json)](specs/decisions/0008-gzip-size-budget.md)
[![Socket Badge](https://badge.socket.dev/npm/package/@maverickcer/env-cap/latest)](https://socket.dev/npm/package/@maverickcer/env-cap)
[![Node](https://img.shields.io/node/v/%40maverickcer%2Fenv-cap)](https://www.npmjs.com/package/@maverickcer/env-cap)
[![License](https://img.shields.io/npm/l/%40maverickcer%2Fenv-cap)](LICENSE)

**Define who owns your environment variables, why they exist, and where they are used.**

`env-cap` turns environment configuration into capability-owned contracts you can version, review, validate, document, and query. It keeps `dotenv`, Zod, envalid, t3-env, your secret manager, and plain `process.env` exactly where they are, and adds the layer they do not provide: ownership, lifecycle, and project-wide evidence about whether declared configuration is actually consumed.

[Why](#why-it-exists) · [See it run](#see-it-run) · [Install](#install-and-verify) · [Fit](#fit-and-capabilities) · [Limits](#limits-and-when-not-to-use-it) · [Security](#security-and-supply-chain) · [Maturity](#maturity-versioning-and-support) · [Docs](#documentation)

## Why it exists

**Benefit:** every environment variable has an owner, a reason to exist, and a lifecycle you can query, so a rotation deadline or an orphaned secret is found by a report instead of an outage.

**Problem:** a configuration value can be perfectly valid and still be a problem. A secret manager stores a credential securely and a validator confirms its shape, but neither says why the variable exists, which capability depends on it, who owns it, when it should be rotated or retired, or whether anything still consumes it. That knowledge drifts into wikis, Slack threads, and memory, until the application accepts a variable that nobody owns, nobody uses, or nobody remembers to retire.

**Who it is for:** platform and staff engineers responsible for configuration across teams or packages, and teams whose environment has outgrown a single `.env` convention.

**Why it matters:** an undetected expiry or an unowned secret is a security and availability risk that no validator can see, because the value itself is well-formed.

## How it differs

| Tool                   | What it solves                                          | What remains unanswered                                                             |
| ---------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `dotenv`               | Loads values from a `.env` file                         | Who owns the value, why it exists, whether it is still used, when it expires        |
| Zod / envalid / t3-env | Validates value shape and types                         | Whether the variable is still needed, who owns it, or what capability depends on it |
| Secret manager         | Stores and manages secrets                              | Which capability in the codebase actually consumes the secret                       |
| `env-cap`              | Defines ownership, lifecycle, and consumption contracts | Does not replace loading, secret storage, or application-specific validation        |

`env-cap` is additive: use it with your existing validator or processor, or with its lightweight helpers when a validation library is unnecessary. [Migration guides](specs/migrations/README.md) cover `dotenv`, Zod, envalid, and t3-env, including cases where switching is not worth it.

## What it does

A capability declares the environment it owns next to the validation it already needs. A build-time pass reads those declarations and your source, and writes a project-wide manifest, documentation, an ownership report, and an evidence artifact. At runtime the application validates its environment against that manifest and reads typed, capability-scoped values.

```text
declare → generate → validate → consume
```

### See it run

**Every environment variable has an owner, a reason to exist, and a lifecycle you can query.**

A capability declares the environment it owns alongside the validation already needed at runtime:

```ts
// features/payments/env.schema.ts

import { createEnv, documentEnv } from "@maverickcer/env-cap"

const paymentsSchema = {
  STRIPE_KEY: {
    validator: (value: string) => value.startsWith("sk_") || 'Expected a key starting with "sk_".',
  },
}

export const paymentsEnv = createEnv(paymentsSchema, { name: "payments" })

documentEnv(paymentsSchema, {
  owner: "payments-team",
  variables: {
    STRIPE_KEY: {
      description: "Stripe secret key used to create charges and process refunds.",
      owner: "payments-team",
      expiresAt: "2027-01-01",
      sensitivity: "secret",
    },
  },
})
```

Generate, then validate: the build-time analysis writes the manifest your code imports
(`./generated/env.manifest`) and the evidence artifact, with one command (`npx env-cap init` scaffolds
the same thing as a script, `scripts/generate-env.mjs`). The manifest and the
persisted evidence artifact -- the two outputs a real project actually reads
at runtime/in CI (see [ADR 0046](specs/decisions/0046-cli-restricted-to-runtime-and-evidence-output.md))
-- come from the CLI itself; the human-facing docs/ownership report come
from a small script calling `@maverickcer/env-cap/build` directly (see
`examples/application/scripts/generate-docs`):

```text
$ npx env-cap --include src/env.ts --location src/generated/env.manifest.ts --evidence docs/env.evidence.json
Wrote manifest: src/generated/env.manifest.ts
Discovered 1 contract(s).
Wrote evidence: docs/env.evidence.json

$ npx tsx scripts/generate-docs/run.ts
[generate-docs] wrote docs/ENVIRONMENT.md (1 contract(s)), .env.example, and docs/OWNERSHIP.md (0 abandoned, 2 unconsumed owned variable(s)).

1 variable(s)/contract(s) expiring soon or already expired:
  - STRIPE_KEY in env: 2026-09-01 (expired Nd ago)

2 unconsumed owned variable(s):
  - DATABASE_URL in app
  - STRIPE_KEY in app
```

This is real output from [`examples/application`](https://github.com/MaverickCER/env-cap/tree/main/examples/application)'s own `npm run docs` and `npm run docs:reports` scripts, not a mockup. The age (`Nd`) is counted from the day you run it, so it is shown as `N` here instead of a number that would rot.

The important part is what the analysis can establish: `STRIPE_KEY` has an ownership and expiration record, its declared expiration has passed, and `DATABASE_URL` and `STRIPE_KEY` are declared as owned but are not consumed by the analyzed application. Those are facts about the application's configuration and dependencies, not merely the result of a value validator.

### Evidence it works

- **Real fixtures:** the output above comes from a runnable example that is also a regression test, and two more stages (a [team service](https://github.com/MaverickCER/env-cap/tree/main/examples/team-service) and an [enterprise platform](https://github.com/MaverickCER/env-cap/tree/main/examples/enterprise-platform)) show the model at scale.
- **Enforced in CI:** coverage is a ratchet that may only move up, mutation score is a gate ([CODE_REVIEW.md](CODE_REVIEW.md)), and the README's own demo is re-run and compared on every change.
- **Runtime-tested:** the runtime and helpers are verified against real Node, Bun, and Deno in CI, not assumed isomorphic.
- **Hard size budget:** the runtime and helpers entry points each stay under 3 KB gzip, enforced before publish ([ADR 0008](specs/decisions/0008-gzip-size-budget.md)).
- **Verifiable release:** published with npm OIDC provenance and no long-lived token ([SECURITY.md](SECURITY.md#supply-chain-posture)).

## Install and verify

**Prerequisites:** Node.js `>=22`. TypeScript 5, 6, or 7 is needed only for the build-time generator (the runtime works in plain JavaScript); the [runtime and TypeScript requirements](GUIDE.md#runtime-support-matrix) are in the Guide.

```sh
npm install @maverickcer/env-cap
npx env-cap init                  # scaffolds env.schema.ts and scripts/generate-env.mjs
npm install --save-dev typescript # the generator parses your schema with it
node scripts/generate-env.mjs
```

`init` never overwrites existing files and never edits `package.json`. **Verify it works:** the generator prints `Discovered 1 contract(s).` and writes the manifest, `docs/ENVIRONMENT.md`, and an ownership report. Then validate once at startup and read values through the contract:

```ts
import { validateEnv } from "@maverickcer/env-cap"
import { manifest } from "./generated/env.manifest"
import { paymentsEnv } from "./features/payments/env.schema"

await validateEnv({ manifest, values: process.env })
paymentsEnv.STRIPE_KEY
```

The smallest contract is one `createEnv` call with a validator per variable ([Core workflow](GUIDE.md#core-workflow) has the complete generate and validate cycle).

## Fit and capabilities

**Use cases:** find expired or unowned secrets before they page someone; document every variable from the code instead of a wiki; let each team own the variables its feature needs; give CI bots and coding agents concrete facts (`payments owns STRIPE_KEY`, `STRIPE_KEY is declared but unconsumed`) instead of "configuration check failed".

**Core capabilities:**

- Capability-scoped contracts with validators, ownership, sensitivity, and expiry ([model](GUIDE.md#capability-owned-contracts)).
- A project-wide manifest, environment docs, `.env.example`, and an ownership and unconsumed-variable report, generated by static analysis that never executes your schema files.
- A persisted evidence artifact for change tracking, a CLI, a [GitHub Action](GUIDE.md#github-action), scheduled rotation alerts, and an [ESLint plugin](GUIDE.md#eslint-plugin).
- Adoption from one centralized schema to per-feature and per-package contracts; the manifest stays project-wide however the schema is organized.

**How it works:** the runtime and the build tooling are separate on purpose. Runtime validation needs no dependencies and no filesystem; the build pass analyzes your source and runs only in development and CI ([Architecture](specs/architecture.md)).

**Integration:** it works beside the validator and secret manager you already use, so nothing is replaced. **Runtimes:** Node.js 22+, browser bundles, edge runtimes, Bun, and Deno for the runtime; the build entry is Node-only ([support matrix](GUIDE.md#runtime-support-matrix)). **Configuration and extension:** plug any `Validator<T>` or `Processor<T>` function into a contract, share contracts from a reusable package, and resolve TypeScript path aliases ([Guide](GUIDE.md)).

## Limits and when not to use it

- **Skip it when** the application is small, one team owns every configuration decision, there are only a few stable variables, ownership is already obvious, or you do not need project-wide evidence about usage. A validation library or `dotenv` may be all you need.
- **Trade-offs:** it adds a build step and a declaration per variable, and its reports are only as accurate as those declarations. It cannot see variables read from outside the code it analyzes.
- **Install weight:** the build entry bundles a TypeScript 6 compiler (about 24 MB unpacked) used only in development and CI; the runtime never reaches it, which CI verifies ([Adoption guide](ADOPTION.md#bundle-size-and-performance)).
- **Automation:** agents and bots can consume the same manifests and evidence, but a structured finding does not guarantee a correct fix; the automation owns its retry and validation loop. See the [AI integration prompt](PROMPT.md).

## Security and supply chain

- **Guarantees:** the runtime never persists, retrieves, rotates, or logs secrets, and contracts redact themselves when logged or serialized ([runtime security model](SECURITY.md#runtime-security-model)).
- **Trust boundaries:** the build tool parses schema files as ASTs and never imports or executes them, but it does not sandbox the rest of your build, and a validator you write can still log ([build-time model](SECURITY.md#build-time-security-model), [your responsibilities](SECURITY.md#application-responsibilities)).
- **Dependencies and licence:** zero runtime dependencies in the runtime and helpers entry points; the build entry bundles one compiler. MIT licensed.
- **Release integrity:** npm OIDC trusted publishing with provenance ([supply-chain posture](SECURITY.md#supply-chain-posture)). Report a vulnerability through [SECURITY.md](SECURITY.md#reporting-a-vulnerability).

## Maturity, versioning and support

Pre-1.0 (see the npm badge for the current version). Per [VERSIONING.md](VERSIONING.md), a minor release may include a breaking change to the Stable tier before 1.0, so pin accordingly. Security fixes target the latest published `0.x` only; there is no backport branch until 1.0 ([Adoption guide](ADOPTION.md#versioning-stability-and-long-term-support)).

- **Upgrade and migrate:** read the [CHANGELOG](CHANGELOG.md) on every minor; [migration guides](specs/migrations/README.md) cover adoption from other tools.
- **Release history:** [CHANGELOG](CHANGELOG.md) and [GitHub releases](https://github.com/MaverickCER/env-cap/releases); the process is in [RELEASING.md](RELEASING.md).
- **Bugs and requests:** [open an issue](https://github.com/MaverickCER/env-cap/issues); see [SUPPORT.md](SUPPORT.md).
- **Troubleshooting:** the [Guide's troubleshooting section](GUIDE.md#troubleshooting).

## Documentation

- **[Guide](GUIDE.md)**: the complete generate and validate workflow, validation contexts, reusable packages, path aliases, CLI, GitHub Action, ESLint plugin, and performance.
- **[Adoption guide](ADOPTION.md)**: the decision-maker summary of security, bundle size, and versioning.
- **[API reference](https://maverickcer.github.io/env-cap/api/)**: every exported symbol, generated from source.
- **[Architecture](specs/architecture.md)** and **[ADRs](https://github.com/MaverickCER/env-cap/tree/main/specs/decisions)**: why it is designed this way.
- **[Examples](https://github.com/MaverickCER/env-cap/tree/main/examples)**: runnable application, team-service, and enterprise-platform examples.
- **Part of the MaverickCER toolkit:** `@maverickcer/env-cap` governs configuration and `data-cap` governs application data; `repo-contract` and `internal-package-contract` are how they are verified ([toolkit overview](https://github.com/MaverickCER/internal-package-contract/blob/main/TOOLKIT.md)).

## Next steps

- **Evaluate:** read the [Adoption guide](ADOPTION.md), then try env-cap against one real schema.
- **Integrate:** follow the [Guide](GUIDE.md#core-workflow) and the [examples](https://github.com/MaverickCER/env-cap/tree/main/examples).
- **Verify:** inspect the [security model](SECURITY.md#runtime-security-model) and the [architecture](specs/architecture.md).

Contributing: [CONTRIBUTING.md](CONTRIBUTING.md) covers setup, the change workflow, ADRs and changesets; [CODE_REVIEW.md](CODE_REVIEW.md) covers review. License: MIT, see [LICENSE](LICENSE).
