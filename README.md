# env-cap

[![CI](https://img.shields.io/github/actions/workflow/status/maverickcer/env-cap/ci.yml?branch=main&label=CI)](https://github.com/maverickcer/env-cap/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/%40maverickcer%2Fenv-cap)](https://www.npmjs.com/package/@maverickcer/env-cap)
[![Coverage: the lowest of line, statement, function and branch coverage](https://img.shields.io/endpoint?url=https://maverickcer.github.io/env-cap/coverage-badge.json)](https://maverickcer.github.io/env-cap/coverage.json)
[![Mutation score: the share of applicable mutants the tests detect](https://img.shields.io/endpoint?url=https://maverickcer.github.io/env-cap/mutation-badge.json)](https://maverickcer.github.io/env-cap/mutation.json)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/MaverickCER/env-cap/badge)](https://scorecard.dev/viewer/?uri=github.com/MaverickCER/env-cap)
[![Bundle size: gzip size of the entry point against its budget](https://img.shields.io/endpoint?url=https://maverickcer.github.io/env-cap/size-badge.json)](https://maverickcer.github.io/env-cap/size.json)
![Socket Badge](https://badge.socket.dev/npm/package/@maverickcer/env-cap/latest)
[![Node](https://img.shields.io/node/v/%40maverickcer%2Fenv-cap)](https://www.npmjs.com/package/@maverickcer/env-cap)
[![License](https://img.shields.io/npm/l/%40maverickcer%2Fenv-cap)](LICENSE)

**Know who owns each environment variable, why it exists, and when it expires.**

`env-cap` adds ownership, lifecycle and usage evidence to the loader, validator and secret manager you already use. It does not load `.env` files or store secrets.

[Why](#why-it-exists) · [See it run](#see-it-run) · [Install](#install-and-verify) · [Fit](#fit-and-capabilities) · [Limits](#limits-and-when-not-to-use-it) · [Security](#security-and-supply-chain) · [Maturity](#maturity-versioning-and-support) · [Docs](#documentation)

## Why it exists

**The problem:** a variable can be well-formed and still be a problem. A validator checks its shape and a secret manager stores it. Neither says who owns it, what depends on it, when it must rotate, or whether anything still reads it.

**What changes:** each part of your code declares the variables it owns. A build step reports owners, expiry dates and declared variables that nothing reads. At startup, the application fails with the variable's name, never its value.

**Who it is for:** application developers who have shipped an undefined variable to production, and platform engineers who own configuration across teams.

## How it differs

| Tool                   | What it solves                                          | What remains unanswered                                                             |
| ---------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `dotenv`               | Loads values from a `.env` file                         | Who owns the value, why it exists, whether it is still used, when it expires        |
| Zod / envalid / t3-env | Validates value shape and types                         | Whether the variable is still needed, who owns it, or what capability depends on it |
| Secret manager         | Stores and manages secrets                              | Which capability in the codebase actually consumes the secret                       |
| `env-cap`              | Defines ownership, lifecycle, and consumption contracts | Does not replace loading, secret storage, or application-specific validation        |

Keep your existing validator: any function that returns `true` or a message plugs into a contract. [Migration guides](specs/migrations/README.md) cover `dotenv`, Zod, envalid and t3-env, including when to stay put.

## What it does

Each entry point has one reader. The [Guide](GUIDE.md) tells each reader's story in full.

| Entry point                                   | Written for                          | What it gives you                                                                         |
| --------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------- |
| `@maverickcer/env-cap`                        | Application developers               | One startup check that names every failing variable, and contracts that redact themselves |
| `@maverickcer/env-cap/helpers`                | The same developers                  | Small processors and validators, tree-shaken when unused                                  |
| `@maverickcer/env-cap/build`, CLI, Action     | Platform engineers who own CI        | A manifest, docs and an evidence file from static analysis; `--check` fails on drift      |
| `@maverickcer/env-cap/evidence`               | Reviewers who need an inventory      | Findings, lifecycle data and SARIF that support a review                                  |
| `@maverickcer/env-cap/node`, `/eslint-plugin` | Build-script authors and lint owners | The `node:fs` adapter `./build` needs, and two lint rules                                 |

```text
declare → generate → validate → consume
```

### See it run

A contract declares the variables it owns next to their validation. This excerpt is from [`examples/application/src/env.ts`](https://github.com/MaverickCER/env-cap/blob/main/examples/application/src/env.ts), the file CI runs:

```ts
// examples/application/src/env.ts (excerpt: other variables and fields omitted)
import { createEnv, documentEnv, type RawEnv } from "@maverickcer/env-cap"
import { processors } from "@maverickcer/env-cap/helpers"

const schema = {
  DATABASE_URL: { processor: processors.toURL() },
  STRIPE_KEY: {
    processor: (value: unknown): string => String(value ?? ""),
    validator: (value: string, rawEnv: RawEnv) => {
      if (rawEnv["PAYMENT_PROVIDER"] !== "stripe") return true
      return value.length > 0 || "Stripe key is required when PAYMENT_PROVIDER=stripe."
    },
  },
}

export const env = createEnv(schema, { name: "app", source: import.meta.url })

documentEnv(schema, {
  owner: "platform-team",
  variables: {
    DATABASE_URL: { description: "Postgres connection string.", required: true },
    STRIPE_KEY: {
      description: "Stripe secret key used to authenticate server-side API calls.",
      required: true,
      expiresAt: "2026-09-01",
    },
  },
})
```

The CLI writes the manifest your code imports and the evidence file ([ADR 0046](specs/decisions/0046-cli-restricted-to-runtime-and-evidence-output.md)). A short script calls `@maverickcer/env-cap/build` for the human-facing docs and ownership report:

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

This is output from [`examples/application`](https://github.com/MaverickCER/env-cap/tree/main/examples/application) (`npm run docs:reports`). `N` stands for the days since 2026-09-01, counted on the day you run it.

The report states facts a validator cannot see. `STRIPE_KEY` is declared to expire on 2026-09-01, and that date has passed. `DATABASE_URL` and `STRIPE_KEY` are declared in the `app` contract, but the analysis found no code that reads them.

### Evidence it works

- **Real output:** CI's `examples` job re-runs the block above and compares its expiry and unconsumed lists with this README (`npm run verify:readme-example`). That job does not yet block a merge.
- **Coverage floors:** 90% branches, 100% functions, 95% lines and statements, enforced by the `contract` job (`vitest.config.ts`). A pull request can lower a floor; reviewers treat that as a reviewed change.
- **Mutation testing:** the `contract` job fails on any surviving, timed-out or uncovered Stryker mutant in `src/`. Managed copies under `src/_ipc/`, `scripts/`, and mutants silenced by a disable comment are not counted.
- **Runtimes:** the runtime, helpers and evidence entries run on Node 22 and 24 in blocking jobs. They also run under Bun, Deno and a Web-globals VM; the Bun and Deno job is not yet merge-blocking.
- **Size budgets:** 3 KB gzip for the runtime, 4 KB for helpers and 3 KB for evidence, enforced by the `Size` check ([ADR 0008](specs/decisions/0008-gzip-size-budget.md)). The budget measures the entry file, not your bundle.

## Install and verify

**Prerequisites:** Node.js `>=22`. Your own TypeScript is optional. The generator uses it when it is version 5 or 6, and otherwise the bundled TypeScript 6 compiler. CI tests the newest 5.x only; the 5.0 floor is untested. The runtime works in plain JavaScript ([requirements](GUIDE.md#requirements)).

```sh
npm install @maverickcer/env-cap
npx env-cap init                  # writes env.schema.ts and scripts/generate-env.mjs
node scripts/generate-env.mjs
```

`init` writes two files and skips any file that already exists. Without a valid `package.json` it exits `1` and writes nothing. `test/cli/init.test.ts` pins these rules and the templates. **Verify it works:** the script exits `0` and prints `Discovered 1 contract(s).` CI pins the script's text but does not run it. Report an issue if that line differs.

Then validate once at startup and read values through the contract. `init` writes `env.schema.ts` into `src/` when that folder exists, otherwise into the project root; adjust the import path to match:

```ts
import { validateEnv } from "@maverickcer/env-cap"
import { manifest } from "./generated/env.manifest"
import { exampleEnv } from "./env.schema"

await validateEnv({ manifest, values: process.env })
exampleEnv.EXAMPLE_API_URL
```

**Using an AI agent?** Give it [the skill](https://raw.githubusercontent.com/MaverickCER/env-cap/main/skills/env-cap/SKILL.md), a short manual generated from this package's exports.

## Fit and capabilities

**Use cases:** find expired or unowned secrets before they page someone. Generate variable documentation from the code instead of a wiki. Let each team own the variables its feature needs. Give CI bots facts such as "`STRIPE_KEY` is declared but unconsumed".

**Core capabilities:**

- Capability-scoped contracts with validators, owners, sensitivity and expiry dates ([contracts](GUIDE.md#capability-owned-contracts)).
- A manifest, environment docs, `.env.example` and an ownership report, from static analysis that never imports your schema files.
- A persisted evidence file, a CLI, a [GitHub Action](GUIDE.md#github-action), scheduled rotation reports and an [ESLint plugin](GUIDE.md#eslint-plugin).
- One central schema or one contract per feature or package; the manifest stays project-wide either way.

**How it works:** the runtime and the build tooling are separate entry points. The runtime has no filesystem access, which lint and a tarball scan enforce. The build pass runs only in development and CI ([Architecture](GUIDE.md#runtime-and-build-time-are-intentionally-separate)).

**Runtimes:** Node.js 22 and 24 are tested. Bun, Deno and a browser-style bundle run in CI for the runtime, helpers and evidence entries; edge runtimes are not tested ([support matrix](GUIDE.md#runtime-support-matrix)). **Package managers:** npm is supported. pnpm, Yarn 1 and Yarn Berry are tested only for installing the tarball and importing every entry ([details](GUIDE.md#package-managers)).

## Limits and when not to use it

- **Skip it when** one team owns every variable, there are few of them, and ownership is obvious. A validator or `dotenv` may be all you need.
- **Trade-offs:** it adds a build step and a declaration per variable. Its reports are only as accurate as those declarations, and it cannot see variables read outside the analyzed code.
- **Install weight:** the one dependency is a TypeScript 6 compiler bundled in the tarball. Only the build entry loads it, and a CI step fails if a runtime entry can reach it ([Adoption guide](ADOPTION.md#bundle-size-and-performance)).
- **Dynamic schemas:** a schema built by a function, or a spread at the top of a schema object, produces a parse warning. A spread nested inside a variable's definition or its `documentEnv()` entry is skipped without one. Nothing is guessed.
- **Automation:** bots can read the same manifest and evidence. A structured finding does not make a fix correct; see the [AI integration prompt](PROMPT.md).

## Security and supply chain

- **Runtime:** it has no filesystem access and reads only the `values` you pass; lint and the tarball scan enforce the first, the tarball scan and a browser-bundle test the second. Both scans are textual. Contracts redact themselves when logged or serialized, but spreading a contract reads every value ([runtime model](SECURITY.md#runtime-security-model)).
- **Errors:** validation errors carry variable and contract names and your own messages, never values (tested). A validator message that embeds the value is passed through.
- **Build:** schema files are parsed as syntax trees and never imported or run (tested). It does not sandbox the rest of your build ([build-time model](SECURITY.md#build-time-security-model)).
- **Dependencies:** what installing the package adds is generated from `package.json` into the [Adoption guide](ADOPTION.md#security--threat-model). MIT licensed.
- **Release integrity:** releases publish from CI over npm OIDC with a provenance attestation, and the repository stores no npm token. A manual last-resort publish carries no attestation ([supply chain](SECURITY.md#supply-chain-posture)).
- **Report a vulnerability** privately: [SECURITY.md](SECURITY.md#reporting-a-vulnerability).

## Maturity, versioning and support

Pre-1.0; the npm badge shows the current version. Before 1.0, a minor release may break the Stable tier, so pin a version ([VERSIONING.md](VERSIONING.md)). Security fixes target the latest `0.x` only, with no backport branch before 1.0.

- **Upgrade:** read the [CHANGELOG](CHANGELOG.md) on every minor; [migration guides](specs/migrations/README.md) cover adoption from other tools.
- **Releases:** [GitHub releases](https://github.com/MaverickCER/env-cap/releases); a person merges every release pull request ([RELEASING.md](RELEASING.md)).
- **Bugs and requests:** [open an issue](https://github.com/MaverickCER/env-cap/issues); see [SUPPORT.md](SUPPORT.md).
- **Troubleshooting:** the [Guide's troubleshooting table](GUIDE.md#troubleshooting).

## Documentation

- **[Guide](GUIDE.md):** one story per entry point and reader, the CLI options, the GitHub Action and the ESLint plugin.
- **[Adoption guide](ADOPTION.md):** what adopting costs, what it needs, and what it refuses to do.
- **[Security](SECURITY.md):** the reviewer's model of what is enforced, where, and what is not.
- **[API reference](https://maverickcer.github.io/env-cap/api/):** every exported symbol, generated from source.
- **[Architecture](specs/architecture.md)** and **[ADRs](https://github.com/MaverickCER/env-cap/tree/main/specs/decisions):** why it is designed this way.
- **[Examples](https://github.com/MaverickCER/env-cap/tree/main/examples):** runnable application, team-service, enterprise-platform and Next.js examples.
- **Toolkit:** `data-cap` governs application data; `repo-contract` and `internal-package-contract` verify both ([toolkit overview](https://github.com/MaverickCER/internal-package-contract/blob/main/TOOLKIT.md)).

## Next steps

- **Evaluate:** read the [Adoption guide](ADOPTION.md), then try env-cap on one real schema.
- **Integrate:** follow the [Guide](GUIDE.md#core-workflow) and run an [example](https://github.com/MaverickCER/env-cap/tree/main/examples).
- **Verify:** check the [security model](SECURITY.md#runtime-security-model) against the tests it names.

Contributing: [CONTRIBUTING.md](CONTRIBUTING.md) covers setup and changesets; [CODE_REVIEW.md](CODE_REVIEW.md) covers review. License: MIT, see [LICENSE](LICENSE).
