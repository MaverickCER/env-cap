# env-cap Guide

The reference manual: capability-owned contracts in depth, the full generate/validate workflow, validation contexts, reusable packages, tsconfig path aliases, runtime/build-time architecture, migration notes, the security model, troubleshooting, the CLI, the GitHub Action, the ESLint plugin, and performance characteristics.

For the pitch, quick start, and adoption reasoning, see [README.md](README.md). For why the package is built the way it is, see [specs/architecture.md](specs/architecture.md) and the [ADRs](specs/decisions/).

- [Runtime support matrix](#runtime-support-matrix)
- [Documented example](#documented-example)
- [Capability-owned contracts](#capability-owned-contracts)
- [Helpers](#helpers)
- [Core workflow](#core-workflow)
- [Validation contexts](#validation-contexts)
- [Reusable packages](#reusable-packages)
- [TypeScript path aliases (paths/baseUrl)](#typescript-path-aliases-pathsbaseurl)
- [Architecture](#architecture)
- [Migration](#migration)
- [Security model](#security-model)
- [Troubleshooting](#troubleshooting)
- [CLI](#cli)
- [GitHub Action](#github-action)
- [ESLint plugin](#eslint-plugin)
- [Performance characteristics](#performance-characteristics)

## Runtime support matrix

| Environment                                                    | `.` (runtime)                 | `./helpers` | `./build` (CLI/tooling)                                       |
| -------------------------------------------------------------- | ----------------------------- | ----------- | ------------------------------------------------------------- |
| Node.js 18+ (CJS or ESM)                                       | ✅                            | ✅          | ✅                                                            |
| Browser bundle (Webpack/Vite/esbuild/etc.)                     | ✅                            | ✅          | ❌ not applicable — build-only, never bundle this into an app |
| Edge/serverless (Cloudflare Workers, Vercel Edge, Deno Deploy) | ✅                            | ✅          | ❌ not applicable                                             |
| Bun                                                            | ✅ (conformance-tested in CI) | ✅          | ✅                                                            |
| Deno                                                           | ✅ (conformance-tested in CI) | ✅          | ✅                                                            |

The runtime (`.` and `./helpers`) has zero dependencies, never touches the filesystem, and never imports Node-specific APIs — see [`specs/architecture.md`](specs/architecture.md). `./build` is Node-only developer tooling (uses `node:path` and the TypeScript compiler API — never `node:fs`, see [ADR 0040](specs/decisions/0040-library-surfaces-do-not-acquire-node-fs.md)) meant for CI/npm-script use, never for shipping to a browser. Both ESM and CommonJS builds are published for every entry point (`package.json#exports`).

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
      sensitivity: "secret",
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

## Helpers

`env-cap/helpers` provides optional convenience functions for common processor and validator patterns.

Helpers are intentionally not the core `env-cap` workflow. They are provided for smaller applications, prototypes, and straightforward configuration requirements where a lightweight convenience API is useful.

Already using Zod, envalid, or another validation library? Keep it and integrate it directly with env-cap contracts — helpers exist for when a lighter API is enough, not as a reason to switch.

```ts
import { createEnv } from "@maverickcer/env-cap"
import { processors, validators } from "env-cap/helpers"

export const databaseEnv = createEnv(
  {
    DATABASE_URL: {
      processor: processors.toURL(),
      validator: validators.required(),
    },

    PORT: {
      default: 5432,
      processor: processors.toNumber(),
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

```text
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

```text
packages/
└── paypal-addon/
    └── src/env.schema.ts
```

The ownership model is identical whether the contract belongs to the application, an internal package, or a published dependency.

### 2. Generate the project view

During development or CI:

```ts
import { generateEnvManifest } from "env-cap/build"

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

#### Change tracking via the persisted evidence artifact

`generateEnvManifest()` no longer tracks its own change history — that moved to a separate, optional
artifact: the full `EvidenceModel`, env-cap's canonical fact model covering the contract graph,
dependency/ownership findings, lifecycle data, and a change report diffed against whatever was
previously persisted. `generateEnvArtifacts()` always computes it; passing `evidence` also writes it
to disk:

```ts
const result = await generateEnvArtifacts({
  manifest: { location: "src/generated/env.manifest.ts" },
  evidence: { location: "docs/env.evidence.json" },
})

console.log(result.evidence.change.manifest.addedVariables) // newly documented this run
console.log(result.evidence.change.manifest.updatedVariables) // field-level before/after for anything that changed
console.log(result.evidence.change.manifest.removedVariables) // no longer discovered at all
```

`evidence.location` is independent of `manifest.location` — requesting it needs no other pass, and a
project with no `.ts` manifest at all can still generate a pure evidence report. Writing it also
writes a paired `docs/env.evidence.json.fingerprint` sidecar, a cheap content hash a later read
(`getEvidenceModel()`, for a report/projection script that doesn't want to pay for a full recompute
on every invocation) uses to skip regenerating when nothing relevant has changed.

**Commit both files, the same as you already commit `env.manifest.ts` itself.** "Since last
execution" means since the last commit on your branch — that's what makes the diff meaningful in CI and
reviewable in a pull request, not just a local curiosity. See
[ADR 0038](specs/decisions/0038-always-computed-evidence-model-backs-generate-check-docs.md) for the
full reasoning (superseding [ADR 0021](specs/decisions/0021-manifest-change-report-persisted-snapshot.md)'s
original manifest-adjacent design).

- **A diff is expected** any time a `documentEnv()` call's `description`/`owner`/`expiresAt`/
  `refreshInstructions`/`required`/`extra` changes, or a contract's `active`/`category`/`exclusiveGroup`
  changes — anything that isn't schema shape itself.
- **Regeneration is automatic.** Every `generate:env`/CI run that passes `--evidence` already
  rewrites both files; there's no separate "update the snapshot" step to remember.
- **A diff signals real drift worth a second look** when it shows up somewhere nobody meant to touch —
  an `updatedVariables` entry for a variable nobody intended to edit, or an `addedContracts`/
  `removedContracts` entry from a change that was supposed to be unrelated.

The CLI's normal (non-`--check`) output prints the same summary as an "Evidence changes since the
last persisted snapshot" section whenever `--evidence <path>` is passed; run with `--json --evidence
<path>` for the same data in machine-readable form.

Separately, when two _active_ contracts document the same variable key with different metadata (e.g. two
features that happen to reuse a name, each with its own `description`/`owner`), that's reported as a
`duplicate-variable-documentation` warning in `result.warnings` — always a warning, never a hard error
(static analysis can't prove two descriptions are "wrong," only different), gated by the same
`onIncompatibility` option as every other compatibility warning.

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
[`test/integration/positive/team/validation-contexts`](test/integration/positive/team/validation-contexts)
each hand-write their own narrowed `activeContexts: ["server"]` / `["client"]` instead of using this
export directly.

> **Validation contexts are not a bundling or security boundary, and not authorization.** They control whether
> `validateEnv()` processes a variable — nothing else. Putting a `context: "server"` variable in the same
> schema as `context: "client"` variables, feeding one manifest that a client bundle imports, does **not**
> keep the server-context variable's definition (including any literal `default`) out of that bundle —
> `activeContexts` filtering happens after the schema is already wherever it's going to be. If a variable must
> never reach a browser bundle at all, keep using separate discovery/generated manifests per contract (see
> ["Runtime and build-time are intentionally separate"](#architecture)
> and [ADR 0004](specs/decisions/0004-no-client-server-package-split.md)) — validation contexts are a
> complement to that boundary, not a replacement for it. Likewise, a string like `context: "admin"` does not
> restrict _who_ can read a value; it only decides whether a given run validates it. See
> [ADR 0022](specs/decisions/0022-validation-contexts.md) for the full set of invariants this feature commits to.

## Reusable packages

A configuration contract can ship as its own installable package instead of living only inside the consuming application's source tree.

This works for both centralized application schemas and capability-owned contracts. A reusable package can expose the environment requirements it owns, allowing consuming applications to validate and generate visibility artifacts without manually copying configuration definitions.

See [`test/integration/positive/enterprise/paypal-addon`](test/integration/positive/enterprise/paypal-addon)/[`test/integration/positive/enterprise/paypal-consumer`](test/integration/positive/enterprise/paypal-consumer) for a complete, runnable example (see [`examples/`](examples/) for the three flagship, human-facing examples, and [`test/integration/`](test/integration/) for every other runnable scenario).

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

## TypeScript path aliases (paths/baseUrl)

If your project organizes its own source with a `tsconfig.json` path alias (`"@/lib/env"`, `"~/schema/env"`, ...), `env-cap` resolves it automatically — no configuration required:

```ts
// tsconfig.json
{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }
```

```ts
// src/consumer.ts
import { paymentsEnv } from "@/features/payments/env.schema.js"
paymentsEnv.STRIPE_KEY
```

Without this, a contract only ever imported through an alias would be misreported as `abandoned` in the Dependency & Ownership Report, or its `documentEnv()` call left unlinked — the same class of false positive [ADR 0010](specs/decisions/0010-dependency-ownership-engine-scope-boundary.md)'s ownership engine exists to avoid.

See [`test/integration/positive/enterprise/tsconfig-aliases`](test/integration/positive/enterprise/tsconfig-aliases) for a complete, runnable example, and [`test/integration/positive/enterprise/tsconfig-aliases-consumer`](test/integration/positive/enterprise/tsconfig-aliases-consumer) for the same producer/consumer pairing [Reusable packages](#reusable-packages) uses — proving this composes correctly with cross-package discovery (ADR 0014) in one real install (see [`examples/`](examples/) for the three flagship, human-facing examples, and [`test/integration/`](test/integration/) for every other runnable scenario).

Unlike [Reusable packages](#reusable-packages) above, this is on by default (see [`VERSIONING.md`](VERSIONING.md) and [ADR 0023](specs/decisions/0023-tsconfig-path-alias-resolution.md)): a project's own `tsconfig.json` never crosses a trust/versioning boundary the way an installed package does, so there's no safety reason to require opt-in. `env-cap` auto-detects `tsconfig.json` at `root`, exactly (no upward directory search, unlike bare `tsc`). Pass `tsconfig: "<path>"` to point at a different file (useful in monorepos where the relevant config isn't at `root`), or `tsconfig: false` to disable alias resolution entirely:

```ts
await generateEnvArtifacts({
  tsconfig: "tsconfig.build.json", // or `false` to disable
  manifest: { location: "src/env.manifest.ts" },
})
```

The actual `paths`/`baseUrl` matching is delegated entirely to the TypeScript compiler (`ts.resolveModuleName()`, the same function `tsc`/`tsserver` themselves use), never resolves into `node_modules` (that boundary stays exclusively [ADR 0014](specs/decisions/0014-cross-package-schema-discovery.md)'s), and only ever resolves to a real `.ts`/`.tsx` file.

## Architecture

### Runtime and build-time are intentionally separate

`env-cap` separates application execution from project-wide analysis.

```text
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

For the reasoning behind capability-owned configuration — code ownership, reusable packages, and platform visibility without runtime centralization — see [Why capability ownership?](https://maverickcer.github.io/env-cap/#why-context) on the website, and [specs/architecture.md](specs/architecture.md) for the full technical treatment.

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

See [`specs/migrations/`](specs/migrations/) for the full, tool-specific guides this section summarizes.

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

## Troubleshooting

Every error `env-cap` throws belongs to one of these classes. When debugging a CI failure or a startup crash, start by checking which one was received.

| Error                             | Thrown by                 | Common cause                                                                                                                                                           | Fix                                                                                                                                                                                                   |
| --------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EnvNotReadyError`                | Reading `someEnv.KEY`     | A contract was accessed before `validateEnv()` completed validation                                                                                                    | Call `await validateEnv({ manifest, values })` during startup before application code accesses validated configuration                                                                                |
| `EnvValidationError`              | `validateEnv()`           | One or more variables failed their processor or validator                                                                                                              | Read `error.failures` — one entry per variable, each naming the contract, variable, and developer-supplied message. It never contains raw or processed values (see [Security model](#security-model)) |
| `EnvManifestGenerationError`      | `generateEnvManifest()`   | A provable contract conflict (for example, two contracts define incompatible processor return types for the same variable name), or `location` resolves outside `root` | Read `error.issues`; resolve the conflicting definitions or correct the output path                                                                                                                   |
| `EnvDocumentationGenerationError` | `generateDocumentation()` | `location`/`envExample.location` resolves outside `root` (undocumented contracts/variables never throw — see below)                                                    | Correct the output path                                                                                                                                                                               |
| `EnvUsageAnalysisError`           | `generateUsageReport()`   | `report.location` resolves outside `root` (unused/unowned findings never throw — see below)                                                                            | Correct the output path                                                                                                                                                                               |
| `EnvProjectGenerationError`       | `generateEnvArtifacts()`  | Any of the above errors aggregated across requested generation steps (manifest/docs/usage), or a provable manifest-pass compatibility/exclusive-group issue            | Apply the fix for the underlying error. `generateEnvArtifacts()` combines failures into one result instead of failing independently per generation step                                               |

**Documentation completeness and dependency ownership never throw.** An undocumented contract/variable
or an unconsumed owned dependency is a heuristic signal, not a provable defect the way a manifest
compatibility conflict is — both have real, common false-positive causes (a webhook handler in another
repo, a shell script reading the variable, a package outside the `packages` allowlist). They're
reported as `Finding`s (`documentation`/`ownership` families) on the persisted evidence artifact
instead; gate CI on them yourself by reading `--evidence`'s `finding` field if you want that
enforced. See [ADR 0038](specs/decisions/0038-always-computed-evidence-model-backs-generate-check-docs.md).

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

## CLI

Generate artifacts directly from the command line:

```bash
npx env-cap \
  --location src/generated/env.manifest.ts \
  --docs docs/ENVIRONMENT.md \
  --env-example .env.example \
  --evidence docs/env.evidence.json \
  --strict
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
resolvable as `env-cap/schema` -- for external, non-TypeScript tooling
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
          args: "--docs docs/ENVIRONMENT.md --ownership docs/OWNERSHIP.md --evidence docs/env.evidence.json"
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

The Action does not create its own policy layer. Pass/fail behavior always follows the CLI exit code and `--strict` (the one provable, manifest-pass error category — see [Troubleshooting](#troubleshooting)). Documentation/ownership findings never fail the run on their own; read them from `--evidence`'s output and gate on them in your own workflow step if you want that enforced.

### Monorepos

For monorepos running multiple `env-cap` checks in parallel, provide a unique `report-key` for each invocation.

This prevents separate jobs from overwriting each other's pull request comments.

For teams that want a single combined report across multiple packages, upload each job's `--json` output as an artifact and aggregate the results in a final workflow step.

### Reusable packages and external contracts

Contracts discovered from explicitly included packages are reported through the same annotations and summary surfaces as local contracts.

Because `node_modules` is not part of a pull request diff, findings originating from installed packages cannot render as inline changed-file annotations. The sticky summary comment remains the complete reporting surface.

See [Reusable packages](#reusable-packages) for the package discovery model.

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

## ESLint plugin

`env-cap/eslint-plugin` provides a `no-raw-process-env` rule (and its filesystem analogue `no-node-fs`, below) that helps enforce environment ownership boundaries.

It flags direct `process.env` access outside approved contract definitions, making configuration ownership enforceable through tooling rather than relying only on team conventions.

```bash id="2x8x4q"
npm install -D eslint
```

```js id="f7m2s9"
// eslint.config.js

import envCapPlugin from "env-cap/eslint-plugin"

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

### `no-node-fs`

The plugin also ships `no-node-fs`, the filesystem analogue of `no-raw-process-env`. It flags any `import`, `require`, or dynamic `import()` of `node:fs` (or `fs`, and their `/promises` subpaths) so a module accepts a filesystem capability from its caller instead of acquiring one implicitly — the discipline `env-cap`'s own `./build` surface follows (see [ADR 0040](specs/decisions/0040-library-surfaces-do-not-acquire-node-fs.md)).

```js id="n0d3fs"
rules: {
  "env-cap/no-node-fs": [
    "error",
    {
      // globs for the executable entry points that legitimately construct
      // the concrete node:fs adapter -- nothing is exempt by default.
      allow: ["src/cli/**", "scripts/**"],
    },
  ],
}
```

Nothing is exempt unless you list it: the rule never guesses at what counts as an executable capability boundary. A consuming project that runs `env-cap/build` from its own script imports the ready-made adapter from `env-cap/node` (`{ nodeBuildFileSystem }`) rather than reaching for `node:fs` itself.

Common questions about dotenv/Zod overlap, centralized configuration, AST analysis, incremental adoption, and ownership models are answered in the [FAQ](https://maverickcer.github.io/env-cap/#faq).

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

See the [performance documentation](./benchmark/README.md) for benchmark methodology
and regression tracking.

## Documentation index

| Doc                                                                                       | For                                                          |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| This Guide + the [docs site](https://maverickcer.github.io/env-cap/)                      | Using `env-cap` in an application                            |
| [API reference](https://maverickcer.github.io/env-cap/api/)                               | Every exported symbol, generated from the types              |
| [`specs/architecture.md`](specs/architecture.md) + [`specs/decisions/`](specs/decisions/) | Why the package is shaped the way it is (ADRs)               |
| [`specs/migrations/`](specs/migrations/)                                                  | Adopting `env-cap` alongside dotenv / Zod / envalid / t3-env |
| [`ADOPTION.md`](ADOPTION.md)                                                              | Decision-maker summary: security, size, LTS                  |
| [`SECURITY.md`](SECURITY.md)                                                              | Full threat model and application responsibilities           |
| [`VERSIONING.md`](VERSIONING.md)                                                          | What semver covers; Stable / Experimental / Private tiers    |
| [`CONTRIBUTING.md`](CONTRIBUTING.md)                                                      | Making a change                                              |
| [`CODE_REVIEW.md`](CODE_REVIEW.md)                                                        | What a reviewer checks before merging                        |
| [`RELEASING.md`](RELEASING.md)                                                            | Maintainer release process                                   |
| [`SUPPORT.md`](SUPPORT.md)                                                                | Where to ask questions and file bugs                         |
