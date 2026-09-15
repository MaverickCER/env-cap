# env-cap

[![CI](https://img.shields.io/github/actions/workflow/status/maverickcer/env-cap/ci.yml?branch=main&label=CI)](https://github.com/maverickcer/env-cap/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/%40maverickcer%2Fenv-cap)](https://www.npmjs.com/package/@maverickcer/env-cap)
[![Bundle size](https://img.shields.io/endpoint?url=https://maverickcer.github.io/env-cap/size-badge.json)](specs/decisions/0008-gzip-size-budget.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-3178c6)](#quick-start)

**Define who owns your environment variables, why they exist, and where they are used.**

`env-cap` turns environment configuration into capability-owned contracts you can version, review, validate, document, and query.

It does not replace your existing configuration tools. `dotenv`, Zod, envalid, t3-env, secret managers, and plain `process.env` can stay exactly where they are. `env-cap` adds the layer they do not provide: **ownership, lifecycle, and project-wide evidence about whether declared configuration is actually consumed.**

[See it run](#see-it-run) · [Quick Start](#quick-start) · [Why env-cap](#why-not-just-use-existing-tools)

## See it run

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

Run the build-time analysis against a real project:

```text
$ npx env-cap --location src/generated/env.manifest.ts --docs docs/ENVIRONMENT.md --ownership docs/OWNERSHIP.md

Wrote manifest: src/generated/env.manifest.ts

Discovered 1 contract(s).

Wrote docs: docs/ENVIRONMENT.md

1 variable(s)/contract(s) expiring soon or already expired:

  - STRIPE_KEY in env: 2026-09-01 (expired 9d ago)

Wrote dependency ownership report: docs/OWNERSHIP.md

2 unconsumed owned variable(s):

  - DATABASE_URL in app

  - STRIPE_KEY in app
```

This is real CLI output from [`examples/application`](examples/application), not a mockup.

The important part is what the analysis can establish:

- `STRIPE_KEY` has an ownership and expiration record.
- Its declared expiration has passed.
- `DATABASE_URL` and `STRIPE_KEY` are declared as owned but are not consumed by the analyzed application.

Those are facts about the application's configuration and dependencies, not merely the result of a value validator.

## Why it exists

A configuration value can be perfectly valid and still be a problem.

A secret manager can store a credential securely. A validator can confirm that it has the expected shape. Neither answers:

- Why does this variable exist?
- Which capability actually depends on it?
- Who owns it?
- When should it be reviewed, rotated, or retired?
- Is anything still consuming it?

As applications grow, those answers tend to move into documentation, team knowledge, Slack messages, tickets, and conventions.

That creates a different class of configuration failure:

**the application can accept a variable that nobody owns, nobody uses, or nobody remembers to retire.**

`env-cap` makes those decisions part of the code.

A capability declares the environment it owns. A build-time pass turns those declarations into a project-wide manifest, documentation, ownership information, and evidence about what the codebase actually consumes.

The distinction is simple:

> **Validators answer whether a value is valid.
> env-cap answers why the value exists, who owns it, and whether the application still uses it.**

## Quick Start

**Start with one capability.**

```bash
npm install @maverickcer/env-cap
npx env-cap init
```

`init` scaffolds the same setup shown below: an `env.schema.ts` contract and a `scripts/generate-env.mjs` generator. It never overwrites existing files and never modifies `package.json`.

`init` is Experimental. See [VERSIONING.md](VERSIONING.md).

If you prefer to create the contract yourself, the minimum setup is:

```ts
// features/payments/env.schema.ts

import { createEnv } from "@maverickcer/env-cap"

export const paymentsEnv = createEnv(
  {
    STRIPE_KEY: {
      validator: (value: string) =>
        value.startsWith("sk_") || 'Expected a key starting with "sk_".',
    },
  },
  { name: "payments" },
)
```

Then validate the generated project manifest before using the capability:

```ts
// app.ts

import { validateEnv } from "@maverickcer/env-cap"

import { manifest } from "./generated/env.manifest"
import { paymentsEnv } from "./features/payments/env.schema"

await validateEnv({
  manifest,
  values: process.env,
})

paymentsEnv.STRIPE_KEY
```

The normal flow is:

```text
declare → generate → validate → consume
```

`generateEnvManifest()` produces the project-wide manifest. Runtime validation uses that manifest against the environment values supplied by the application.

See the [Guide's Core workflow](GUIDE.md#core-workflow) for the complete generate/validate cycle.

Node.js `>=18`. TypeScript 5+ is only required for build-time manifest generation; the runtime works in plain JavaScript. See the [runtime support matrix](GUIDE.md#runtime-support-matrix) for Node, browser bundles, edge runtimes, Bun, and Deno.

## Why not just use existing tools?

`env-cap` is deliberately additive.

| Tool                   | What it solves                                          | What remains unanswered                                                             |
| ---------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `dotenv`               | Loads values from a `.env` file                         | Who owns the value, why it exists, whether it is still used, when it expires        |
| Zod / envalid / t3-env | Validates value shape and types                         | Whether the variable is still needed, who owns it, or what capability depends on it |
| Secret manager         | Stores and manages secrets                              | Which capability in the codebase actually consumes the secret                       |
| `env-cap`              | Defines ownership, lifecycle, and consumption contracts | Does not replace loading, secret storage, or application-specific validation        |

**You keep your existing tools.**

Use `env-cap` with your existing validator or processor, or use its lightweight helpers when a dedicated validation library is unnecessary. What env-cap adds is the layer around the value: ownership, lifecycle, and project-wide evidence about whether declared configuration is actually consumed.

You do not have to migrate away from an existing configuration library to adopt env-cap. The [migration guides](specs/migrations/) document the adoption path for `dotenv`, Zod, envalid, and t3-env, including cases where switching is unnecessary.

## From one schema to a whole organization

```text
one schema, one team
      |  ownership boundaries start to matter
capability-owned schemas, one per feature
      |  share it
reusable package contracts
      |  scale it
organization-wide configuration ownership
```

A capability contract records what a variable is for, who owns it, how sensitive it is, when it expires, and whether the codebase still consumes it. Start with a single centralized schema and move toward capability- or package-owned contracts only as ownership boundaries start to matter — `generateEnvManifest()` produces one project-wide manifest regardless of how many contracts contribute to it, so validation, documentation, and ownership reporting never depend on how the schema is organized.

The [`examples/`](examples/) directory has three runnable stages of that model — [`examples/application`](examples/application), [`examples/team-service`](examples/team-service), and [`examples/enterprise-platform`](examples/enterprise-platform) — and the [Guide](GUIDE.md#capability-owned-contracts) covers the full walkthrough.

## You probably don't need it when

A validation library or `dotenv` may be enough when:

- the application is small;
- one team owns every configuration decision;
- there are only a few environment variables;
- variables rarely change;
- ownership and lifecycle are already obvious;
- you do not need project-wide evidence about configuration usage.

`env-cap` becomes more useful when configuration starts crossing capability, team, package, or organizational boundaries.

## Works with automated contributors

AI coding agents, CI bots, and release automation can consume the same manifests and evidence artifacts as human contributors.

A structured finding such as:

```text
payments owns STRIPE_KEY
STRIPE_KEY is declared but unconsumed
```

gives automation a concrete fact to investigate.

That is more useful than a generic failure such as:

```text
configuration check failed
```

The repository can therefore use the same configuration contract to guide both human and automated changes.

See the [AI Integration Prompt](./PROMPT.md) for a repository-aware review workflow.

## Status

`env-cap` is currently in `0.x`.

Per [VERSIONING.md](VERSIONING.md), a minor release may include a breaking change to a Stable-tier API before 1.0. Pin according to your upgrade policy.

The architecture is considered stable; APIs may continue to evolve based on production usage.

## Learn more

- **[Guide](GUIDE.md)** — capability-owned contracts, the complete generate/validate workflow, validation contexts, reusable packages, path aliases, CLI, GitHub Action, ESLint plugin, and performance characteristics.

- **[Security](SECURITY.md)** — threat model, secret-handling boundaries, and application responsibilities.

- **[Adoption guide](ADOPTION.md)** — decision-maker summary covering security posture, bundle size, and versioning/LTS considerations.

- **[Migration guides](specs/migrations/)** — adoption alongside `dotenv`, Zod, envalid, or t3-env.

- **[API reference](https://maverickcer.github.io/env-cap/api/)** — every exported symbol, generated from source.

- **[Architecture](specs/architecture.md)** and **[ADRs](specs/decisions/)** — why env-cap is designed this way.

- **[Examples](examples/)** — runnable application, team-service, and enterprise-platform examples.

## If this is useful

If capability-owned configuration matches how you think about environment variables, try env-cap against one real schema.

If it does not fit your application's configuration model, [open an issue](https://github.com/MaverickCER/env-cap/issues) and explain why.

## Contributing

Start with [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, the change workflow, ADRs, and changeset-based versioning.

[CODE_REVIEW.md](CODE_REVIEW.md) covers the reviewer-side process.

Maintainers can see [RELEASING.md](RELEASING.md) for the release process.

## License

MIT
