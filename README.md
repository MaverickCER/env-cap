# env-cap

<!-- TODO(readme-badges): uncomment once @maverickcer/env-cap has been published to npm
     for the first time (release.yml's first successful `npm publish`). The CI, license,
     coverage, size, TypeScript, zero-deps, and Node-version badges below would all
     already render correctly before that point too (none of them depend on npm
     registry data) -- they're bundled into this same commented block anyway so the
     badge row appears all at once, rather than rolling out in a visibly staggered,
     half-finished-looking way across two separate edits. -->
<!--
[![CI](https://img.shields.io/github/actions/workflow/status/maverickcer/env-cap/ci.yml?branch=main&label=CI)](https://github.com/maverickcer/env-cap/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/%40maverickcer%2Fenv-cap)](https://www.npmjs.com/package/@maverickcer/env-cap)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Coverage](https://img.shields.io/endpoint?url=https://maverickcer.github.io/env-cap/coverage-badge.json)](https://github.com/maverickcer/env-cap/actions/workflows/ci.yml)
[![Bundle size](https://img.shields.io/endpoint?url=https://maverickcer.github.io/env-cap/size-badge.json)](specs/decisions/0008-gzip-size-budget.md)
[![Zero runtime dependencies](https://img.shields.io/badge/runtime_deps-0-brightgreen)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-3178c6)](README.md#installation)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](README.md#installation)
-->

Configuration is an application contract.

`env-cap` treats configuration the same way applications already declare their APIs, data models, and dependencies. Every variable has a reason to exist, a capability that depends on it, an owner responsible for it, and a lifecycle that can be managed.

Secure secret storage manages where values live. Environment validators ensure applications receive valid configuration at startup. `env-cap` reveals why applications still depend on that configuration by connecting environment requirements to the code that consumes them.

See [why env-cap exists](https://maverickcer.github.io/env-cap/#problem), [why capability ownership](https://maverickcer.github.io/env-cap/#why-context), and [the architecture](https://maverickcer.github.io/env-cap/#architecture) for the reasoning behind this approach.

**When this isn't worth adopting:** if your application is small, one team owns all configuration decisions, environment variables are few and stable, and you already have enough visibility into your dependencies, `env-cap` may add more structure than you need. A validation library alone (Zod, envalid, t3-env) or plain `dotenv` may be the better fit.

`env-cap` is designed for applications where configuration dependencies become difficult to understand as the number of capabilities, teams, services, or reusable packages grows. It helps teams answer:

- Why does this variable exist?
- Which capability depends on it?
- Who owns it?
- Is it still needed?
- When should it be rotated?

See the [migration guides](specs/migrations/) for how to adopt `env-cap` alongside existing tools.

## Installation

```bash
npm install @maverickcer/env-cap
```

Node.js 18+. TypeScript 5+ is only needed for build-time manifest generation (`npm install -D typescript`) — the runtime works in plain JavaScript.

---

## AI-Assisted Integration

Using an AI coding assistant can accelerate env-cap adoption, but successful integration requires understanding both your application's architecture and env-cap's design principles.

For a repository-aware integration review prompt, see:

[AI Integration Prompt](./PROMPT.md)

---

## Quick start

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

```ts
// app.ts
import { validateEnv } from "@maverickcer/env-cap"
import { manifest } from "./generated/env.manifest"
import { paymentsEnv } from "./features/payments/env.schema"

await validateEnv({ manifest, values: process.env })

paymentsEnv.STRIPE_KEY // validated, typed, capability-scoped
```

`manifest` comes from `generateEnvManifest()` — see [Core workflow](#2-generate-the-project-view) below. The rest of this section walks through a fuller example with documentation metadata.

### Runtime support matrix

| Environment                                                    | `.` (runtime)                 | `./helpers` | `./build` (CLI/tooling)                                       |
| -------------------------------------------------------------- | ----------------------------- | ----------- | ------------------------------------------------------------- |
| Node.js 18+ (CJS or ESM)                                       | ✅                            | ✅          | ✅                                                            |
| Browser bundle (Webpack/Vite/esbuild/etc.)                     | ✅                            | ✅          | ❌ not applicable — build-only, never bundle this into an app |
| Edge/serverless (Cloudflare Workers, Vercel Edge, Deno Deploy) | ✅                            | ✅          | ❌ not applicable                                             |
| Bun                                                            | ✅ (conformance-tested in CI) | ✅          | ✅                                                            |
| Deno                                                           | ✅ (conformance-tested in CI) | ✅          | ✅                                                            |

The runtime (`.` and `./helpers`) has zero dependencies, never touches the filesystem, and never imports Node-specific APIs — see [`specs/architecture.md`](specs/architecture.md). `./build` is Node-only developer tooling (uses `node:fs`/`node:path` and the TypeScript compiler API) meant for CI/npm-script use, never for shipping to a browser. Both ESM and CommonJS builds are published for every entry point (`package.json#exports`).

---

## Documented example

Most applications start with a centralized environment configuration model:

```ts
// src/env.ts

import { createEnv } from "@maverickcer/env-cap"

const schema = {
  DATABASE_URL: {
    validator(value: string) {
      return value.startsWith("postgres://") || "Expected a PostgreSQL connection string."
    },
  },

  STRIPE_KEY: {
    validator(value: string) {
      return value.startsWith("sk_") || 'Expected a Stripe secret key starting with "sk_".'
    },
  },

  SENDGRID_API_KEY: {
    validator(value: string) {
      return value.startsWith("SG.") || "Expected a SendGrid API key."
    },
  },
}

export const env = createEnv(schema)
```

This approach works well while one application owns all configuration decisions.

As applications grow, the challenge becomes understanding the relationship between configuration and the capabilities that depend on it:

- Which feature requires `STRIPE_KEY`?
- Can this variable be removed when a feature is removed?
- Who owns its rotation?
- Which service depends on this secret?
- Is this configuration still required?

`env-cap` can move those contracts closer to the capabilities that consume them, while still generating a complete application-wide view when teams need operational visibility.

---

## Capability-owned contracts

Each capability defines its own environment requirements while the application can still generate a complete project-wide view.

```ts
// features/payments/env.schema.ts

import { createEnv, documentEnv } from "@maverickcer/env-cap"

const paymentsSchema = {
  STRIPE_KEY: {
    validator(value: string) {
      return value.startsWith("sk_") || 'Expected a Stripe secret key starting with "sk_".'
    },
  },
}

export const paymentsEnv = createEnv(paymentsSchema, {
  name: "payments",
})

documentEnv(paymentsSchema, {
  category: "Payments",
  owner: "payments-team",
  metadata: {
    service: "Payment Processing API",
    criticality: "Production-critical",
  },
  variables: {
    STRIPE_KEY: {
      description:
        "Stripe secret API key used by the payment service to create charges and process refunds.",
      owner: "payments-team",
      expiresAt: "2027-01-01",
      rotationCadence: "90 days",
      classification: "secret",
      storageProvider: "AWS Secrets Manager",
      accessPolicy: "Restricted to payment service runtime credentials.",
      validationReason:
        "Ensures the payment service cannot start with missing or malformed Stripe credentials.",
    },
  },
})
```

The application still receives one validated startup boundary:

```ts
await validateEnv({
  manifest,
  values: process.env,
})
```

But ownership follows usage:

```ts
paymentsEnv.STRIPE_KEY
```

The capability that owns the dependency owns access to it. There is no global configuration object requiring every capability to access configuration through a centralized namespace:

```ts
env.payments.STRIPE_KEY
```

Instead, each capability exposes only the configuration it owns.

At application startup, `validateEnv()` provides fail-fast verification across the complete application when paired with a generated manifest:

```ts
import { validateEnv } from "@maverickcer/env-cap"
import { manifest } from "./generated/env.manifest"

await validateEnv({
  manifest,
  values: process.env,
})
```

The generated manifest provides a complete project-wide view without requiring runtime centralization. `validateEnv()` discovers every registered capability contract, validates required environment dependencies before the application serves traffic, and aggregates failures into a single validation error.

This allows teams to maintain local ownership while preserving operational visibility:

- Missing variables are detected before the application serves traffic.
- Invalid values across multiple capabilities are reported together instead of failing one at a time.
- Each capability retains ownership of its validation rules.
- Operations teams maintain visibility into application-wide configuration requirements.

Runtime access remains capability-scoped, while validation remains application-wide.

---

## Helpers

`@maverickcer/env-cap/helpers` provides optional convenience functions for common processor and validator patterns.

Helpers are intentionally not the core `env-cap` workflow. They are provided for smaller applications, prototypes, and straightforward configuration requirements where a lightweight convenience API is useful.

Already using Zod, envalid, or another validation library? Keep it and integrate it directly with env-cap contracts — helpers exist for when a lighter API is enough, not as a reason to switch.

```ts
import { createEnv } from "@maverickcer/env-cap"
import { processors, validators } from "@maverickcer/env-cap/helpers"

export const databaseEnv = createEnv(
  {
    DATABASE_URL: {
      processor: processors.url(),
      validator: validators.required(),
    },

    PORT: {
      default: 5432,
      processor: processors.number(),
      validator: validators.range(1, 65535),
    },
  },
  {
    name: "database",
  },
)
```

Available helpers include common processors and validators with composition utilities. They can be
found at [src/helpers/index.ts](./src/helpers/index.ts)

When possible, prefer validation rules that communicate domain intent directly alongside the capability contract. These may be custom `Processor<T>` and `Validator<T>` functions or existing validators from your application's validation stack.

```ts
validator(value: string) {
  return value.startsWith("sk_") ||
    'Expected a Stripe secret key starting with "sk_".';
}
```

A named validation rule explains why the dependency exists and gives future maintainers context that a generic helper cannot always provide.

The helper package is optional and has no impact on the core runtime when unused. When all runtime features are included, `env-cap` remains within its 3 KB gzip budget. `createEnv()` and `validateEnv()` remain the core APIs and provide the foundation for capability-owned configuration, while helpers provide convenient building blocks for common processor and validator patterns.

---

## Core workflow

### 1. Define your environment contract

`env-cap` works with both centralized configuration and capability-owned contracts.

For existing applications, start by wrapping your current environment requirements:

```ts
import { createEnv } from "@maverickcer/env-cap"

export const env = createEnv(
  {
    DATABASE_URL: {
      validator(value: string) {
        return value.startsWith("postgres://") || "Expected a PostgreSQL connection string."
      },
    },
    PORT: {
      default: 3000,
      processor(value: string) {
        return Number(value)
      },
    },
  },
  {
    name: "application",
  },
)
```

As applications grow, contracts can move closer to the capabilities that consume them:

```
src/
├── features/
│   ├── payments/
│   │   └── env.schema.ts
│   ├── database/
│   │   └── env.schema.ts
│   └── notifications/
│       └── env.schema.ts
```

A capability can also be a reusable package:

```
packages/
└── paypal-addon/
    └── src/env.schema.ts
```

The ownership model is identical whether the contract belongs to the application, an internal package, or a published dependency.

---

### 2. Generate the project view

During development or CI:

```ts
import { generateEnvManifest } from "@maverickcer/env-cap/build"

await generateEnvManifest({
  location: "src/generated/env.manifest.ts",
})
```

The build process creates the application-wide view required for:

- environment manifests
- documentation
- `.env.example` files
- configuration reports

Schemas are analyzed statically.

They are never imported or executed during discovery.

This provides project-wide visibility without requiring runtime configuration to become centralized.

#### Manifest change tracking

Alongside `location`, `generateEnvManifest()` (and `generateEnvArtifacts()`'s `manifest` pass) also writes a
sidecar snapshot file next to the manifest — `src/generated/env.manifest.ts` gets a sibling
`src/generated/env.manifest.snapshot.json` — and returns a `changes` field summarizing what's different
about `documentEnv()` metadata since that snapshot was last written:

```ts
const result = await generateEnvManifest({ location: "src/generated/env.manifest.ts" })

console.log(result.changes.addedVariables) // newly documented this run
console.log(result.changes.updatedVariables) // field-level before/after for anything that changed
console.log(result.changes.removedVariables) // no longer discovered at all
```

**Commit the snapshot file, the same as you already commit `env.manifest.ts` itself.** "Since last
execution" means since the last commit on your branch — that's what makes the diff meaningful in CI and
reviewable in a pull request, not just a local curiosity. See
[ADR 0021](specs/decisions/0021-manifest-change-report-persisted-snapshot.md) for the full reasoning.

- **A diff is expected** any time a `documentEnv()` call's `description`/`owner`/`expiresAt`/
  `refreshInstructions`/`required`/`extra` changes, or a contract's `active`/`category`/`exclusiveGroup`
  changes — anything that isn't schema shape itself.
- **Regeneration is automatic.** Every normal `generate:env`/CI run already rewrites the snapshot; there's
  no separate "update the snapshot" step to remember.
- **A diff signals real drift worth a second look** when it shows up somewhere nobody meant to touch —
  an `updatedVariables` entry for a variable nobody intended to edit, or an `addedContracts`/
  `removedContracts` entry from a change that was supposed to be unrelated.

The CLI's normal (non-`--check`) output prints the same summary as a "Manifest changes since last
execution" section; run with `--json` for the same data in machine-readable form.

Separately, when two _active_ contracts document the same variable key with different metadata (e.g. two
features that happen to reuse a name, each with its own `description`/`owner`), that's reported as a
`duplicate-variable-documentation` warning in `result.warnings` — always a warning, never a hard error
(static analysis can't prove two descriptions are "wrong," only different), gated by the same
`onIncompatibility` option as every other compatibility warning.

---

### 3. Validate once during startup

```ts
import { validateEnv } from "@maverickcer/env-cap"
import { manifest } from "./generated/env.manifest"

await validateEnv({
  manifest,
  values: process.env,
})
```

At startup, `validateEnv()` verifies the complete application environment boundary.

After validation:

```ts
env.DATABASE_URL
```

or:

```ts
paymentsEnv.STRIPE_KEY
```

returns the processed value according to the contract that owns it.

Before validation completes:

```ts
paymentsEnv.STRIPE_KEY
```

throws:

```ts
EnvNotReadyError
```

Validation failures are aggregated:

```ts
EnvValidationError
```

so applications receive the complete startup failure state instead of discovering missing or invalid variables one at a time.

Runtime access can remain centralized for simpler applications or become capability-scoped as ownership boundaries grow. Validation remains application-wide.

---

## Validation contexts

A schema entry may declare which **validation context** it belongs to. `validateEnv()` accepts the validation
contexts active for a given run, and skips every variable that doesn't match:

```ts
DATABASE_URL: {
  context: "server",
  validator: validators.required(),
}
```

```ts
await validateEnv({
  manifest,
  values: process.env,
  activeContexts: ["server"],
})
```

**Matching rule:** a variable with no `context` participates in every run. A variable with a `context`
participates only when `activeContexts` contains that exact string — no prefix matching, wildcards, or
hierarchy. A skipped variable never runs its `default`/`processor`/`validator`, and reading it throws
`EnvNotReadyError`, exactly as if `validateEnv()` had never run for it.

`context` is entirely application-defined — env-cap never interprets, detects, or infers it. `"server"` and
`"client"` are just one example; a validation context can represent anything a validation run needs to
distinguish:

```ts
DATABASE_URL: { context: "server", validator: validators.required() }
STRIPE_LIVE_KEY: { context: "production", validator: validators.required() }
QUEUE_CONCURRENCY: { context: "worker", default: 4 }
DEBUG_TRACE_ENDPOINT: { context: "development" }
```

A run may activate more than one context at once — `activeContexts: ["server", "production"]` matches a
variable declaring either. This works the same regardless of framework: `env-cap` never inspects `window` or
`NODE_ENV` itself, the application computes `activeContexts` once, explicitly, before calling `validateEnv()`:

```ts
// Works the same in a Next.js, TanStack Start, or plain Node app -- env-cap
// never inspects window/NODE_ENV itself; the application does, once, before
// calling validateEnv().
await validateEnv({
  values: typeof window === "undefined" ? process.env : window.__ENV__,
  manifest,
  activeContexts: [
    typeof window === "undefined" ? "server" : "client",
    process.env.NODE_ENV === "production" ? "production" : "development",
  ],
})
```

When at least one variable declares a `context`, the generated manifest also exports every context it found,
named to match `activeContexts` itself so it can be passed straight through:

```ts
// src/generated/env.manifest.ts (generated)
export const activeContexts = ["client", "server"]
export const manifest = [/* ... */]
```

```ts
import { activeContexts, manifest } from "./generated/env.manifest"

await validateEnv({ manifest, values: process.env, activeContexts })
```

This is every context the manifest has — a convenient starting point, not a pre-scoped default. Importing it
unmodified into every process defeats the point of scoping contexts per deployment target in the first place;
narrow it (or import it under another name and filter it) the same way `src/server.ts`/`src/client.ts` in
[`examples/validation-contexts`](examples/validation-contexts) each hand-write their own narrowed
`activeContexts: ["server"]` / `["client"]` instead of using this export directly.

> **Validation contexts are not a bundling or security boundary, and not authorization.** They control whether
> `validateEnv()` processes a variable — nothing else. Putting a `context: "server"` variable in the same
> schema as `context: "client"` variables, feeding one manifest that a client bundle imports, does **not**
> keep the server-context variable's definition (including any literal `default`) out of that bundle —
> `activeContexts` filtering happens after the schema is already wherever it's going to be. If a variable must
> never reach a browser bundle at all, keep using separate discovery/generated manifests per contract (see
> ["Runtime and build-time are intentionally separate"](#runtime-and-build-time-are-intentionally-separate)
> and [ADR 0004](specs/decisions/0004-no-client-server-package-split.md)) — validation contexts are a
> complement to that boundary, not a replacement for it. Likewise, a string like `context: "admin"` does not
> restrict _who_ can read a value; it only decides whether a given run validates it. See
> [ADR 0022](specs/decisions/0022-validation-contexts.md) for the full set of invariants this feature commits to.

---

## Reusable packages

A configuration contract can ship as its own installable package instead of living only inside the consuming application's source tree.

This works for both centralized application schemas and capability-owned contracts. A reusable package can expose the environment requirements it owns, allowing consuming applications to validate and generate visibility artifacts without manually copying configuration definitions.

See [`examples/paypal-addon`](examples/paypal-addon)/[`examples/paypal-consumer`](examples/paypal-consumer) for a complete, runnable example (one of several runnable examples — see [`examples/`](examples/) for the full set and suggested reading order).

Discovery still never walks `node_modules` during its general file-discovery pass (`generateEnvManifest()`'s `include`/`exclude` globs), and that guarantee is unconditional.

Making a package-shipped contract discoverable is a opt-in mechanism (see [`VERSIONING.md`](VERSIONING.md) and [ADR 0014](specs/decisions/0014-cross-package-schema-discovery.md)):

```ts
// consuming app's build script
await generateEnvArtifacts({
  packages: ["@acme/payments-sdk"], // explicit allowlist -- never implicit
  manifest: { location: "src/env.manifest.ts" },
})
```

The publishing package takes on two obligations:

1. Declare `"envCap": { "schema": "./src/env.schema.ts" }` in its own `package.json`, pointing at its real, uncompiled `.ts` source (ship that file via `"files": ["dist", "src/env.schema.ts"]` alongside the compiled `dist/` used at runtime).

2. Re-export the `createEnv()`-produced contract under the same name from its main entry point, so:

```ts
import { paypalEnv } from "@acme/paypal-addon"
```

resolves to the same contract discovered during build-time analysis.

Resolution never calls `readdir` on `node_modules` — it reads exactly one `package.json` per allow-listed package to find the declared field, then exactly one declared file, validated (path, extension, symlink target, size) before it is parsed.

See `SECURITY.md`'s "Avoids unnecessary traversal of dependency directories" section for the exact bounds.

---

## TypeScript path aliases (paths/baseUrl)

If your project organizes its own source with a `tsconfig.json` path alias (`"@/lib/env"`, `"~/schema/env"`, ...), `env-cap` resolves it automatically — no configuration required:

```ts
// tsconfig.json
{ "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["src/*"] } } }
```

```ts
// src/consumer.ts
import { paymentsEnv } from "@/features/payments/env.schema.js"
paymentsEnv.STRIPE_KEY
```

Without this, a contract only ever imported through an alias would be misreported as `abandoned` in the Dependency & Ownership Report, or its `documentEnv()` call left unlinked — the same class of false positive [ADR 0010](specs/decisions/0010-dependency-ownership-engine-scope-boundary.md)'s ownership engine exists to avoid.

See [`examples/tsconfig-aliases`](examples/tsconfig-aliases) for a complete, runnable example, and [`examples/tsconfig-aliases-consumer`](examples/tsconfig-aliases-consumer) for the same producer/consumer pairing [Reusable packages](#reusable-packages) uses — proving this composes correctly with cross-package discovery (ADR 0014) in one real install (one of several runnable examples — see [`examples/`](examples/) for the full set and suggested reading order).

Unlike [Reusable packages](#reusable-packages) above, this is on by default (see [`VERSIONING.md`](VERSIONING.md) and [ADR 0023](specs/decisions/0023-tsconfig-path-alias-resolution.md)): a project's own `tsconfig.json` never crosses a trust/versioning boundary the way an installed package does, so there's no safety reason to require opt-in. `env-cap` auto-detects `tsconfig.json` at `root`, exactly (no upward directory search, unlike bare `tsc`). Pass `tsconfig: "<path>"` to point at a different file (useful in monorepos where the relevant config isn't at `root`), or `tsconfig: false` to disable alias resolution entirely:

```ts
await generateEnvArtifacts({
  tsconfig: "tsconfig.build.json", // or `false` to disable
  manifest: { location: "src/env.manifest.ts" },
})
```

The actual `paths`/`baseUrl` matching is delegated entirely to the TypeScript compiler (`ts.resolveModuleName()`, the same function `tsc`/`tsserver` themselves use), never resolves into `node_modules` (that boundary stays exclusively [ADR 0014](specs/decisions/0014-cross-package-schema-discovery.md)'s), and only ever resolves to a real `.ts`/`.tsx` file.

---

## Architecture

### Runtime and build-time are intentionally separate

`env-cap` separates application execution from project-wide analysis.

```
Environment contract
        |
        |
   +----+----+
   |         |
Runtime   Build-time
   |         |
createEnv  AST analysis
   |         |
validateEnv generate artifacts
   |
Typed access
```

Runtime:

- validates configuration
- exposes typed values
- contains no filesystem access
- does not discover files dynamically

Build-time:

- discovers contracts
- generates documentation
- creates manifests and operational visibility artifacts

This separation keeps application startup deterministic while allowing development and platform workflows to understand the complete configuration surface.

A project can begin with a centralized environment contract and adopt capability-owned contracts where ownership boundaries provide value. The runtime model remains the same: contracts define validated access, while build-time tooling provides application-wide visibility.

For the reasoning behind capability-owned configuration — code ownership, reusable packages, and platform visibility without runtime centralization — see [Why capability ownership?](https://maverickcer.github.io/env-cap/#why-context) on the website.

---

## Migration

`env-cap` is designed for incremental adoption.

Keep your existing tools and validation approach. Introduce contracts where they provide value, then move toward stronger ownership boundaries as your application grows.

### From dotenv

Continue loading variables with dotenv.

Add validated contracts on top:

```ts
import { createEnv } from "@maverickcer/env-cap"

export const env = createEnv({
  DATABASE_URL: {
    validator(value: string) {
      return value.startsWith("postgres://") || "Expected a PostgreSQL connection string."
    },
  },
})
```

No loader replacement is required.

### From process.env

Replace scattered access:

```ts
process.env.STRIPE_KEY
```

with validated contract access:

```ts
env.STRIPE_KEY
```

As ownership boundaries become useful, contracts can move closer to the capabilities that consume them:

```ts
paymentsEnv.STRIPE_KEY
```

### From Zod, envalid, or t3-env

Keep your existing validation logic.

`env-cap` organizes configuration ownership, lifecycle visibility, and application-wide validation boundaries; it does not replace specialized validation libraries.

Existing validators can be integrated directly:

```ts
validator(value) {
  return existingValidator(value) || "Invalid value";
}
```

No large rewrite is required.

---

## Security model

`env-cap` is intentionally limited in scope.

The runtime:

- does not store secrets
- does not fetch secrets
- does not transmit telemetry
- does not execute lifecycle commands
- does not log secret values
- does not include documentation metadata in runtime contracts

Runtime contracts protect against accidental exposure:

```ts
console.log(paymentsEnv)
```

outputs:

```txt
EnvContract("payments") { 1 variable(s) }
```

not:

```txt
{
  STRIPE_KEY: "sk_live_..."
}
```

Explicit access remains required:

```ts
paymentsEnv.STRIPE_KEY
```

Secret storage, rotation, and infrastructure management remain responsibilities of dedicated systems.

Full threat model, and what stays an application responsibility: [`SECURITY.md`](SECURITY.md). Decision-maker-level summary (bundle size, supply chain, LTS stance): [`ADOPTION.md`](ADOPTION.md).

---

## Troubleshooting

Every error `env-cap` throws belongs to one of these classes. When debugging a CI failure or a startup crash, start by checking which one was received.

| Error                             | Thrown by                 | Common cause                                                                                                                                                           | Fix                                                                                                                                                                                                   |
| --------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EnvNotReadyError`                | Reading `someEnv.KEY`     | A contract was accessed before `validateEnv()` completed validation                                                                                                    | Call `await validateEnv({ manifest, values })` during startup before application code accesses validated configuration                                                                                |
| `EnvValidationError`              | `validateEnv()`           | One or more variables failed their processor or validator                                                                                                              | Read `error.failures` — one entry per variable, each naming the contract, variable, and developer-supplied message. It never contains raw or processed values (see [Security model](#security-model)) |
| `EnvManifestGenerationError`      | `generateEnvManifest()`   | A provable contract conflict (for example, two contracts define incompatible processor return types for the same variable name), or `location` resolves outside `root` | Read `error.issues`; resolve the conflicting definitions or correct the output path                                                                                                                   |
| `EnvDocumentationGenerationError` | `generateDocumentation()` | An undocumented contract or variable with `onUndocumented: "throw"`, or an output path escaping `root`                                                                 | Add the missing `documentEnv()` metadata, or use `"warn"` while incrementally documenting existing configuration                                                                                      |
| `EnvUsageAnalysisError`           | `generateUsageReport()`   | An unused contract or unowned variable with `onOwnershipIssue: "throw"`                                                                                                | Remove the unused configuration, confirm it is consumed outside the scanned repository, or lower the setting to `"warn"`                                                                              |
| `EnvProjectGenerationError`       | `generateEnvArtifacts()`  | Any of the above errors aggregated across requested generation steps (manifest/docs/usage)                                                                             | Apply the fix for the underlying error. `generateEnvArtifacts()` combines failures into one result instead of failing independently per generation step                                               |

**"My schema file's variable isn't showing up in the generated manifest/docs."**

Discovery only understands statically analyzable patterns — an inline object literal or a directly resolvable local/imported `const`.

A dynamically constructed schema (`createEnv(buildSchema())`) or a spread (`createEnv({ ...shared })`) may produce a parse warning instead of silently guessing.

Check `result.parseWarnings` or the CLI's non-JSON output for the specific reason (see [ADR 0002](specs/decisions/0002-static-analysis-never-execution.md)).

**"A contract imported through a `tsconfig.json` path alias shows up as abandoned / a `documentEnv()` call through an alias is unresolved."**

Confirm `tsconfig.json` is actually at `root` (auto-detection doesn't search upward) and declares `paths`/`baseUrl`, or that an explicit `tsconfig` option points at the right file. Confirm `tsconfig` wasn't set to `false`.

This mechanism is Experimental (see [`VERSIONING.md`](VERSIONING.md) and [ADR 0023](specs/decisions/0023-tsconfig-path-alias-resolution.md)) -- see [TypeScript path aliases](#typescript-path-aliases-pathsbaseurl) above.

**"A package's contract isn't discoverable even though I listed it in `packages`."**

Check `result.parseWarnings` for a `"(package) <name>"`-prefixed entry.

The allow-listed package must declare a valid `envCap.schema` field pointing to real `.ts`/`.tsx` source inside its own directory (see [Reusable packages](#reusable-packages)).

This mechanism is Experimental (see [`VERSIONING.md`](VERSIONING.md)).

---

## CLI

Generate artifacts directly from the command line:

```bash
npx env-cap \
  --location src/generated/env.manifest.ts \
  --docs docs/ENVIRONMENT.md \
  --env-example .env.example \
  --strict \
  --strict-docs
```

The CLI is designed for development workflows, CI pipelines, and platform automation.

By default, `.env.example` generation never overwrites a file that already exists there — it writes a
timestamped sibling instead, for you to diff/merge by hand. Pass `--env-example-on-existing overwrite` to
replace it directly, or `--env-example-on-existing skip` to write nothing at all when one is already
present (the same three modes are available as `envExample.onExisting` when calling `generateDocumentation()`/
`generateEnvArtifacts()` directly — see `EnvExampleOnExisting`).

Common uses include:

- generating environment manifests
- generating documentation and `.env.example` files
- enforcing configuration ownership rules
- detecting undocumented or stale configuration changes
- producing machine-readable reports for automation

### `--json`

Add `--json` to emit a machine-readable report instead of formatted terminal output.

The output contains the same generated artifact information returned by `generateEnvArtifacts()` wrapped in a stable JSON envelope:

```bash
npx env-cap \
  --docs docs/ENVIRONMENT.md \
  --ownership docs/OWNERSHIP.md \
  --json
```

Example:

```jsonc
{
  "schemaVersion": 1,
  "kind": "env-cap-report",
  "toolVersion": "0.1.0",
  "ok": true,
  "docs": {
    "docsPath": "...",
    "catalog": [/* documented contracts, owners, and documentEnv() metadata */],
    "documentation": { "undocumentedVariables": [], "expiringSoon": [] },
  },
  // "manifest" and "usage" appear when their matching flags are passed
}
```

The full field-by-field shape -- including `docs.catalog` entries, `manifest`, and
`usage` -- is defined by the [published JSON Schema](#published-json-schema) below
rather than repeated here.

`--json` changes output formatting only. Exit-code behavior remains unchanged.

New fields may be added without a `schemaVersion` change. Consumers should ignore properties they do not recognize.

See [ADR 0013](specs/decisions/0013-json-output-is-a-versioned-mirror.md).

#### Published JSON Schema

A real, published JSON Schema for the `--json` envelope lives at
[`schemas/env-cap-report.schema.json`](schemas/env-cap-report.schema.json), also
resolvable as `@maverickcer/env-cap/schema` -- for external, non-TypeScript tooling
(a Go service, a Python dashboard, a generic CI linter) to validate or codegen
against without hand-transcribing the shape above.

It's generated directly from `src/cli/json.ts`'s own types (never hand-authored), so
the two can't silently drift apart, and it evolves under the same additive-only rule
already established for `--json` itself: a new optional field is never a breaking
schema change; a changed or removed field is.

See [ADR 0019](specs/decisions/0019-published-json-schema-generated-from-types.md).

### `--check`

Add `--check` to verify generated artifacts are current without modifying files.

This is useful as a CI drift check when a schema changes but generated artifacts were not updated:

```bash
npx env-cap \
  --location src/generated/env.manifest.ts \
  --docs docs/ENVIRONMENT.md \
  --check
```

The command exits:

- `0` when generated artifacts match the expected output
- `1` when artifacts are missing or stale

`--check` never writes to or modifies committed files, even when drift is detected.

With `--json`, the response includes an additive `checkResult` field containing the comparison result.

See [ADR 0016](specs/decisions/0016-check-mode-compute-before-compare-never-partial-write.md).

---

## GitHub Action

The first-party GitHub Action runs `env-cap --json` and integrates configuration analysis into pull requests and scheduled maintenance workflows.

It provides:

- machine-readable configuration reports
- inline pull request annotations
- sticky summary comments
- scheduled rotation monitoring

Example:

```yaml
# .github/workflows/env-cap.yml
name: env-cap

on:
  pull_request:

permissions:
  contents: read
  pull-requests: write

jobs:
  report:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: maverickcer/env-cap@v1
        with:
          args: "--docs docs/ENVIRONMENT.md --ownership docs/OWNERSHIP.md --strict-docs"
```

| Input               | Default               | Purpose                                                                                            |
| ------------------- | --------------------- | -------------------------------------------------------------------------------------------------- |
| `args`              | _(required)_          | Arguments passed to `env-cap --json`, such as `--docs`, `--ownership`, and strict validation flags |
| `working-directory` | `.`                   | Directory where `env-cap` executes                                                                 |
| `version`           | _(latest)_            | Version to execute through `npx` when `env-cap` is not installed locally                           |
| `comment`           | `true`                | Creates or updates a sticky pull request summary comment                                           |
| `annotations`       | `true`                | Emits GitHub workflow annotations for detected issues                                              |
| `rotation-alert`    | `true`                | Enables scheduled expiration reporting outside pull requests                                       |
| `report-key`        | _(working-directory)_ | Identifies this report when multiple workflows run against the same pull request                   |

The Action does not create its own policy layer. Pass/fail behavior always follows the CLI exit code and configured flags such as `--strict`, `--strict-docs`, and `--strict-ownership`.

### Monorepos

For monorepos running multiple `env-cap` checks in parallel, provide a unique `report-key` for each invocation.

This prevents separate jobs from overwriting each other's pull request comments.

For teams that want a single combined report across multiple packages, upload each job's `--json` output as an artifact and aggregate the results in a final workflow step.

### Reusable packages and external contracts

Contracts discovered from explicitly included packages are reported through the same annotations and summary surfaces as local contracts.

Because `node_modules` is not part of a pull request diff, findings originating from installed packages cannot render as inline changed-file annotations. The sticky summary comment remains the complete reporting surface.

See [Reusable packages](#reusable-packages) for the package discovery model.

---

### Scheduled rotation alerts

The same Action can run independently of pull requests to monitor configuration lifecycle metadata.

This is useful for detecting variables that are approaching expiration or have exceeded their documented rotation window.

Example:

```yaml
# .github/workflows/env-cap-rotation.yml
name: env-cap rotation check

on:
  schedule:
    - cron: "0 9 * * 1"
  workflow_dispatch:

permissions:
  contents: read
  issues: write

jobs:
  check-rotation:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: maverickcer/env-cap@v1
        with:
          args: "--docs docs/ENVIRONMENT.md --expiring-within-days 45"
```

When running without a pull request context, the Action can create or update a GitHub issue containing expiring or expired configuration entries.

Once all reported variables are resolved, the issue is automatically closed.

Set `rotation-alert: "false"` to disable issue-based rotation reporting.

See [ADR 0018](specs/decisions/0018-rotation-alert-issue-on-non-pr-runs.md).

---

## ESLint plugin

`@maverickcer/env-cap/eslint-plugin` provides a `no-raw-process-env` rule that helps enforce environment ownership boundaries.

It flags direct `process.env` access outside approved contract definitions, making configuration ownership enforceable through tooling rather than relying only on team conventions.

```bash id="2x8x4q"
npm install -D eslint
```

```js id="f7m2s9"
// eslint.config.js

import envCapPlugin from "@maverickcer/env-cap/eslint-plugin"

export default [
  {
    files: ["**/*.ts"],
    plugins: {
      "env-cap": envCapPlugin,
    },
    rules: {
      "env-cap/no-raw-process-env": "error",
    },
  },
]
```

By default, `env.schema.ts` and `env.schema.tsx` files are exempt because their purpose is to define the environment contract consumed by `createEnv()`.

Other files must access validated contracts instead of reading environment variables directly.

For example:

```ts id="y5j4ka"
process.env.STRIPE_KEY
```

becomes:

```ts id="6f2r0m"
paymentsEnv.STRIPE_KEY
```

The rule does not prevent legitimate infrastructure or build-time code from accessing raw environment variables.

For approved exceptions, provide an explicit allow list:

```js id="3f7v9n"
rules: {
  "env-cap/no-raw-process-env": [
    "error",
    {
      allow: ["scripts/bootstrap-secrets.ts"],
    },
  ],
}
```

One-off exceptions can also use the standard ESLint disable comment:

```ts id="x0k6ps"
// eslint-disable-next-line env-cap/no-raw-process-env
process.env.BOOTSTRAP_TOKEN
```

The goal is not to eliminate every direct environment read. The goal is to make ownership boundaries intentional and reviewable.

See [ADR 0017](specs/decisions/0017-eslint-plugin-entry-point.md).

---

Common questions about dotenv/Zod overlap, centralized configuration, AST analysis, incremental adoption, and ownership models are answered in the [FAQ](https://maverickcer.github.io/env-cap/#faq).

---

## Performance characteristics

env-cap is designed to add predictable configuration validation without introducing
runtime complexity into every environment variable access.

Runtime behavior:

- Environment initialization: O(N), where N is the number of defined variables.
- Initial validation: O(N), where N is the number of variables being validated.
- Variable lookup after initialization: O(1).
- Repeated validation after the initial pass: O(1) through cached validation state.

This means applications pay validation and setup costs once during initialization,
rather than repeatedly processing configuration during normal execution.

For comparison, conventional configuration patterns typically perform one of two
operations:

1. Build a configuration object and access properties:
   - Object construction: O(N)
   - Property lookup: O(1)

2. Build a configuration object with inline processing/validation:
   - Object construction: O(N)
   - Processing cost: O(N)
   - Validation cost: O(N)

env-cap follows the second model's safety benefits while separating processing,
validation, and access so repeated application usage remains constant-time.

See the [performance documentation](./PERFORMANCE.md) for benchmark methodology
and regression tracking.

---

## Status

`env-cap` is currently in 0.x.

Per [`VERSIONING.md`](VERSIONING.md), minor releases may still include breaking changes to stable APIs before the first major release.

The architecture is considered stable, but APIs may continue to evolve based on production usage and feedback.

See [`VERSIONING.md`](VERSIONING.md) for:

- semver guarantees
- Experimental features (currently cross-package schema discovery and tsconfig path-alias resolution)
- private implementation details

See [`ADOPTION.md`](ADOPTION.md) for a decision-maker summary covering:

- security posture
- migration considerations
- versioning and LTS approach

---

## License

MIT
