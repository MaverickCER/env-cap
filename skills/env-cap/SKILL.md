---
name: env-cap
description: Guidance for AI coding agents using or extending @maverickcer/env-cap. Load before creating or editing env.schema.ts files, runtime/build APIs, processors, validators, CLI behavior, or artifact generation.
---

# env-cap Usage Skill

## Purpose

`env-cap` gives each capability (feature, service, package) its own environment contract — declared once as a static schema, validated at runtime, documented and aggregated at build time. Load this skill for any `env.schema.ts` edit; `createEnv()`/`documentEnv()`/`validateEnv()` usage; `generateEnvManifest()`/`generateDocumentation()`/`generateUsageReport()`/`generateEnvArtifacts()`/CLI usage; processor/validator work; or changes to env-cap's own `src/runtime`, `src/build`, `src/helpers`, `src/cli`. Skip it for env-var work with no env-cap schema involved (plain `dotenv`, raw CI secrets).

## Core Principles

Non-negotiable. Verify any change respects these before finishing.

1. **Static analysis only — schemas are never executed.** (ADR 0002) The build package parses `env.schema.ts` files as TypeScript AST; it never `import()`s, `require()`s, or `eval()`s them. Only literal expressions resolve — spreads, factory calls, and re-exports resolve as "unknown" and surface as warnings. Schema objects passed to `createEnv()`/`documentEnv()` must be static literals.

2. **Capability ownership — never a global env object.** (ADR 0003) Each `createEnv()` call is scoped to, and exported by, the module that owns it (`paymentsEnv`, `databaseEnv`). There is no merge step. Access always goes through the owning contract — `paymentsEnv.STRIPE_KEY`, never `env.payments.STRIPE_KEY`.

3. **Runtime config and documentation are separate calls on the same schema object.** (ADR 0001) `createEnv(schema, options)` reads only `default`/`processor`/`validator` — that's the runtime's entire vocabulary. `documentEnv(schema, docs)` is a second, inert call over the same object; it returns `void` and exists only as an AST marker for the build system. Never put description/owner/expiresAt fields in `createEnv()`; never expect `documentEnv()` to affect runtime behavior.

4. **Public API surface only.** `package.json#exports` exposes exactly `.`, `./build`, `./helpers`, `./eslint-plugin`, `./schema`, and `./package.json`. Import only from these entry points — never `dist/*.cjs` internals, `src/**/*.ts` paths, or unexported build internals (e.g. the dependency-graph engine).

5. **Runtime and build are strictly separated and mechanically enforced.** (ADR 0001, 0002) `src/build` uses `node:fs`/`node:path`/`typescript` and must never be imported from runtime/browser code. `src/runtime` has zero filesystem access and zero dependencies. Enforced by `test/helpers/tree-shaking.test.ts` and the gzip budget below — not just convention.

6. **Runtime size and vocabulary stay minimal.** (ADR 0004, 0007, 0008) `dist/index.js` and `dist/helpers.js` are held to a 3072-byte gzip budget each (`npm run size`). No `/client` vs `/server` split. `EnvDefinition` has exactly three optional fields — `default`, `processor`, `validator` — no `required` flag, no environment-marker field.

7. **Contracts self-redact; errors never carry values.** (ADR 0006) `createEnv()`'s return object overrides inspect/toString/toJSON to print only `EnvContract("name") { N variable(s) }`, and is frozen. Validation errors are built from variable name, contract name/source, failure kind, and the developer's own error message — never raw or processed values. This protects the _object_ only: once a value is extracted (`paymentsEnv.STRIPE_KEY`, spread, destructure), the extracting code is responsible for it.

## Avoid

- **Deep/internal imports** — `dist/*.cjs`, `src/build/dependency-graph.ts`, anything not re-exported by the three entry points.
- **Importing `@maverickcer/env-cap/build` into runtime or browser code** — it's Node-only, dev/CI-only.
- **Calling any `generate*()` at application startup or on a request path** — build-time only; wire it into an npm script or CI step.
- **Dynamically constructed schemas** — `createEnv(buildSchema())`, `createEnv({ ...shared })`, re-exporting a contract from another module. AST discovery can't resolve these; write the schema as a literal directly in the call.
- **Documentation fields inside `createEnv()`'s schema** — `EnvDefinition` only has `default`/`processor`/`validator`. `description`/`owner`/`expiresAt`/`category` belong in `documentEnv()` only.
- **The field name `transformer`** — renamed to `processor` (ADR 0007), no alias.
- **Hand-rolling a global merged env object** by spreading multiple contracts together — defeats the ownership model.
- **Reading a contract before `validateEnv()` has run** — throws `EnvNotReadyError`.
- **Spreading or `Object.entries()`-ing a whole contract "just to inspect it"** — `console.log(paymentsEnv)` is safe by design, but `{...paymentsEnv}` triggers every getter and produces a plain object with every real value.
- **Embedding raw values in custom processor/validator error messages** — those message strings surface verbatim in thrown errors.
- **Adding a runtime dependency, or Node/TS-only logic, to `src/runtime` or `src/helpers`** — both are gzip-budgeted and must stay isomorphic.
- **Fetching live values or metadata inside `env.schema.ts`** — static `expiresAt` goes in `documentEnv()`; dynamic data goes through the separate `liveExpirationDates` callback (ADR 0012), kept in its own module.
- **Treating two capabilities declaring the same variable name as automatically wrong** — allowed and common; only provably conflicting processor/validator return types are a hard error.
- **Trying to relax an exclusive-group violation** — always a hard error (ADR 0009), no throw/warn knob. Set the old contract's `active: false` first.

## AI Workflow

When working with env-cap:

1. Read the existing `env.schema.ts` (and neighboring ones in the same project) before editing — match its processor/validator/documentation conventions.
2. Identify or preserve capability ownership — a variable belongs in the schema owned by the feature/package that consumes it, never an unrelated one.
3. Prefer existing `@maverickcer/env-cap/helpers` processors/validators over hand-written logic.
4. Keep every schema entry a statically analyzable literal.
5. Add or update the matching `documentEnv()` entry in the same file.
6. Regenerate dependent generated artifacts if the schema changed (manifest, docs, `.env.example`, ownership report).
7. Run the Validation Checklist below.

## Never Assume

If the source doesn't clearly establish one of these, inspect neighboring files before inventing a new pattern:

- Which capability owns a variable.
- What a processor or validator actually does — read its implementation, don't guess from its name.
- Where generated artifacts live for this project (check the `generate:env` script, or search for `AUTO-GENERATED FILE`).
- Whether a variable is meant to be required — there's no `required` flag; check for a validator that rejects empty values.

## Priorities

When a change is under-specified, preserve in this order: architecture (Core Principles) → public API compatibility → runtime behavior → build behavior → documentation.

## Architecture Overview

Four independent entry points, each its own build output and `package.json` export (plus `./schema`, a static JSON Schema file, and `./package.json`):

| Export                               | Source               | Environment           | Purpose                                                                                  |
| ------------------------------------ | -------------------- | --------------------- | ---------------------------------------------------------------------------------------- |
| `@maverickcer/env-cap`               | `src/runtime/`       | isomorphic, zero deps | `createEnv`, `documentEnv`, `validateEnv`, `resetEnvCache`, error types, `isEnvContract` |
| `@maverickcer/env-cap/build`         | `src/build/`         | Node-only, dev/CI     | discovery, AST analysis, artifact generation                                             |
| `@maverickcer/env-cap/helpers`       | `src/helpers/`       | isomorphic, optional  | `processors` / `validators`                                                              |
| `@maverickcer/env-cap/eslint-plugin` | `src/eslint-plugin/` | Node-only, optional   | `no-raw-process-env` lint rule                                                           |

The `env-cap` CLI (`src/cli/`) is a thin wrapper around `generateEnvArtifacts()`. `GenerateDocumentationResult.contracts` is a summary (file/exportName/contractName/variableCount/active/documented); `GenerateDocumentationResult.catalog` sits alongside it with the same per-variable descriptive content (`description`/`owner`/`expiresAt`/`extra` metadata, ...) `renderDocs()` puts in the generated Markdown Catalog, keyed by variable name within each contract — the field that makes `--json` a full mirror of the docs artifact, not just its findings.

Typical shape: each feature/package owns an `env.schema.ts` colocated with its code; a build script runs `generate*()` across all discovered schemas; the app calls `validateEnv()` once at startup, then each capability reads its own contract (never a merged global object).

## Consumer Usage

Covers the common case: adding or changing a variable in an app or package that consumes env-cap.

### Define and document a contract

```ts
// features/database/env.schema.ts
import { createEnv, documentEnv } from "@maverickcer/env-cap"
import { processors, validators } from "@maverickcer/env-cap/helpers"

const databaseSchema = {
  DATABASE_URL: { processor: processors.url() },
  PORT: { default: 5432, processor: processors.number(), validator: validators.range(1, 65535) },
}

export const databaseEnv = createEnv(databaseSchema, { name: "database", source: import.meta.url })

documentEnv(databaseSchema, {
  owner: "data-platform-team",
  variables: {
    DATABASE_URL: { description: "Postgres connection string.", required: true },
    PORT: { description: "Database port." },
  },
})
```

Always pass `source: import.meta.url` — there's no portable way for `createEnv()` to discover its own caller. Optional/composable capabilities also use `category`, `exclusiveGroup`, and `active` in `documentEnv()` (see `examples/composable-boilerplates/features/postgres/env.schema.ts`) — a build fails if two _active_ contracts share an `exclusiveGroup`.

### Validate at startup

```ts
// src/startup.ts — before any capability code executes
import { validateEnv } from "@maverickcer/env-cap"
import { manifest } from "./generated/env.manifest.js"

await validateEnv({ values: process.env, manifest })
```

Returns `{ contractCount, variableCount }`, never resolved values. Read values afterward through each contract (`paymentsEnv.STRIPE_KEY`). Initializes once per process; later calls return the cached result.

### Generate artifacts (build script or CI step — never application code)

```ts
import { generateEnvArtifacts } from "@maverickcer/env-cap/build"

await generateEnvArtifacts({
  root,
  manifest: { location: "src/generated/env.manifest.ts" },
  docs: { location: "docs/ENVIRONMENT.md", envExample: { location: ".env.example" } },
  usage: { report: { location: "docs/OWNERSHIP.md" } },
})
```

Use a single-purpose orchestrator (`generateEnvManifest()`/`generateDocumentation()`/`generateUsageReport()`) if only one artifact is needed. `onIncompatibility`/`onUndocumented` default to `"warn"`; pass `"throw"` (or CLI `--strict`/`--strict-docs`/`--strict-ownership`) for stricter CI gates. Exclusive-group violations are always a hard error regardless. CLI equivalent: `npx env-cap --location src/generated/env.manifest.ts --docs docs/ENVIRONMENT.md --env-example .env.example --strict --strict-docs`. Add `--json` for a machine-readable report (same result, wrapped in a versioned `{ schemaVersion, kind, toolVersion, ok }` envelope — ADR 0013) instead of formatted text; the first-party GitHub Action (`action.yml`) runs the CLI with `--json` and turns it into PR annotations/a sticky comment.

### Reusable packages

A package ships its own `src/env.schema.ts` exactly like an app feature (`examples/paypal-addon`) — discovered by a consumer's `generateEnvArtifacts()` when its `include` glob reaches the installed package, or by the package's own `generate:env` script scoped to its own `root`.

### Live/external metadata

Dynamic values (e.g. a secret's real rotation date) can't live in a schema file — it's only ever statically parsed. Pass a `liveExpirationDates` callback to `generateEnvArtifacts()`/`generateDocumentation()` instead; it's invoked once, after discovery, with every discovered variable name, and its ISO-date results become per-variable `expiresAt` overrides (`examples/aws-secrets-manager/src/live-expirations.ts`, ADR 0012). Auth/caching/retries for that call are the consumer's own responsibility.

## Maintainer Notes (modifying env-cap's own source)

Not relevant to consumers — only for changes inside this package.

1. Place code by responsibility, per `specs/architecture.md`'s boundary table: processing/validating/caching → `src/runtime/`; discovery/AST/linking/generation → `src/build/`; optional processor/validator implementations → `src/helpers/`; the `no-raw-process-env` lint rule → `src/eslint-plugin/`. A field read only by the generator belongs in `src/build`, not `src/runtime/types.ts`.
2. Check `specs/decisions/000*.md` before crossing a Core Principle — either the change is wrong or it needs its own new ADR.
3. Only add an export to `src/runtime/index.ts`/`src/build/index.ts`/`src/helpers/index.ts` if it's genuinely meant to be public, justified like existing lower-level primitives (`discoverSchemaFiles`, `linkFiles`).
4. Match tests to module: `src/runtime/*` → `test/runtime/*.test.ts`, `src/build/*` → `test/build/*.test.ts`, `src/helpers/*` → `test/helpers/*.test.ts`, `src/cli/*` → `test/cli/*.test.ts`.
5. Any change to `GenerateEnvArtifactsResult` (or a type it's built from) is simultaneously a change to `--json`'s public, versioned wire contract (ADR 0013) — decide whether it needs a `JSON_SCHEMA_VERSION` bump in `src/cli/json.ts`, and keep `scripts/github-action/report.mjs`'s finding collectors (`collectManifestFindings`/`collectDocumentationFindings`/`collectOwnershipFindings`/`collectErrorFindings`) in sync; that script is plain JS with no type dependency on `src/cli/json.ts`, so nothing else will catch a drift for you.

## Validation Checklist

- [ ] Run `npm run typecheck`.
- [ ] Run `npm test`.
- [ ] If `src/runtime` or `src/helpers` changed: run `npm run size`.
- [ ] If public exports changed: confirm it's intentional and justified by real, documented external use — otherwise revert the export.
- [ ] If `env.schema.ts` changed: add/update the matching `documentEnv()` entry, then regenerate dependent artifacts via the project's `generate:env` script. Never hand-edit a file marked `AUTO-GENERATED FILE. DO NOT EDIT.`
- [ ] Confirm no secret/raw environment values appear in thrown error messages, logs, or committed example files.
- [ ] Confirm architecture boundaries hold: no `node:fs`/TypeScript in runtime or helpers; no runtime import in build; every schema entry is a static literal.

## Mental Model

env-cap is two independent systems sharing one schema object: runtime validates values, build statically analyzes schemas. Neither executes the other's responsibility. If a change mixes runtime and build concerns, it's probably wrong.
