# AGENTS.md

Rules for coding agents working with `env-cap`, both in an application that uses it and in this
repository's own source. If your tooling loads skill files, load
[`skills/env-cap/SKILL.md`](skills/env-cap/SKILL.md) instead: it is the fuller version of the
application rules, generated from the package.

## What this package is

In `env-cap`, each feature (a folder or an installable package; the docs also call it a
capability) declares its environment variables in a **contract**: a static schema object passed to
`createEnv()` and `documentEnv()`. The application validates every contract once at startup. A build
step reads the contracts as source and writes the manifest, docs, `.env.example` and ownership
report. Values are always read through the contract that owns them.

## Contract rules

1. **Schemas are static literals, read as source.** The build entry (`@maverickcer/env-cap/build`)
   parses `env.schema.ts` files as TypeScript syntax trees and never runs them. Only literal
   expressions resolve. A spread, a factory call or a re-export resolves as "unknown" and surfaces
   as a warning. So declare each schema as a literal object in the module that owns it, and pass
   that one binding to `createEnv()` and `documentEnv()`.
2. **Each contract belongs to the module that declares it.** That module exports it (`paymentsEnv`,
   `databaseEnv`), and code reads `paymentsEnv.STRIPE_KEY` from it. Keep contracts separate; a
   merged or global env object defeats ownership.
3. **`createEnv()` holds runtime fields; `documentEnv()` holds documentation.** `createEnv(schema,
options)` reads only `default`, `processor`, `validator` and `context`. `documentEnv(schema, docs)`
   is an inert second call over the same object: it returns `void` and exists only as a build-time
   marker. So `description`, `owner` and `expiresAt` go in `documentEnv()`. The field is `processor`;
   the old name `transformer` has no alias.
4. **Import from the public entry points only.** They are listed in the
   [Public API map](#public-api-map) below. Internal paths (`dist/*.cjs`, `src/**/*.ts`, the
   dependency-graph engine in `src/build/dependency-graph.ts`) are not public.
5. **Runtime and build stay apart.** `src/runtime` imports no Node module, has no filesystem access
   and is held to a 3 KB gzip budget (`npm run size`). `src/build` uses `node:path` and
   `typescript`, and takes a `BuildFileSystem` from its caller. Only `src/cli` imports `node:fs`
   (ADR 0040). Runtime and browser code import neither `./build` nor `./node`.
6. **Errors and logs carry names, not values.** `console.log(paymentsEnv)` prints only
   `EnvContract("payments") { N variable(s) }`. Validation errors are built from the variable name,
   the contract name and source, the failure kind and your own message. Write processor and
   validator messages that describe the expected shape without quoting the value. To inspect a
   contract, log it; spreading it or calling `Object.entries()` on it reads every real value.
7. **`context` filters which variables take part in validation.** A schema entry may set
   `context: "server"` or any application-defined string. `validateEnv({ activeContexts })` skips a
   variable whose `context` is not listed: no default, processor or validator runs, and reading it
   throws `EnvNotReadyError`. The application computes `activeContexts` and passes it explicitly;
   the package never infers it. `context` is neither an access control nor a bundling boundary: a
   client bundle that imports a manifest ships every definition in it. To keep a variable out of
   client code, give it its own discovery run and manifest
   ([ADR 0004](specs/decisions/0004-no-client-server-package-split.md),
   [ADR 0022](specs/decisions/0022-validation-contexts.md)).

## In an application

- Call `validateEnv()` once, directly from the application's existing startup path, before any
  contract is read. Reading earlier throws `EnvNotReadyError`. Wrappers such as validation managers,
  service locators or registries add nothing.
- Run the `generate*()` functions from an npm script or CI step; they are build-time only.
- Treat generated files as the source of truth. To change one, change its contract and regenerate
  it, in this order of preference:
  1. the project's `generate:env` script (or a similarly named one), if it exists;
  2. `generateEnvManifest({ location: "src/generated/env.manifest.ts" })` from
     `@maverickcer/env-cap/build`, called in a build script;
  3. `npx env-cap --location src/generated/env.manifest.ts`, adding `--evidence` or `--strict` as
     needed (`npx env-cap --help` lists every flag).
- The CLI writes only the manifest and the evidence file. The docs catalog, `.env.example` and the
  ownership report come from `generateEnvArtifacts()`, `generateDocumentation()` or
  `generateUsageReport()` in a build script (ADR 0046). There are no `--docs`, `--ownership` or
  `--env-example` flags.
- Commit generated files only if the project already commits generated files; otherwise wire the
  command into CI.
- Migrate one feature per pull request, keep its validation and runtime behavior unchanged, and
  add infrastructure only when the migration needs it. [`specs/migrations/`](specs/migrations/) has
  a guide per starting point (`dotenv`, a central schema, Zod, envalid, t3-env).

## Public API map

<!-- ipc:begin entry-points -->

| Export                               | Source               | Environment                                                   | Tier   | Purpose                                                                                                                                                      |
| ------------------------------------ | -------------------- | ------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@maverickcer/env-cap`               | `src/runtime/`       | No Node module or Node global                                 | Stable | `createEnv`, `documentEnv`, `validateEnv`, `resetEnvCache`, `isEnvContract` and the error types                                                              |
| `@maverickcer/env-cap/build`         | `src/build/`         | Node only, in development and CI                              | Stable | Discovery, AST analysis and artifact generation. The four `generate*()` orchestrators and the lower-level primitives are Stable (ADR 0045, `VERSIONING.md`). |
| `@maverickcer/env-cap/helpers`       | `src/helpers/`       | No Node module; `processors.base64()` returns a Node `Buffer` | Stable | `processors` and `validators`                                                                                                                                |
| `@maverickcer/env-cap/node`          | `src/node/`          | Node only, in development and CI                              | Stable | `nodeBuildFileSystem`, the `BuildFileSystem` adapter a build script hands to `./build`                                                                       |
| `@maverickcer/env-cap/evidence`      | `src/evidence/`      | No Node module or Node global                                 | Stable | `defineEvidenceProjection`, pure transforms over the Evidence Model (Stable, see `VERSIONING.md`)                                                            |
| `@maverickcer/env-cap/eslint-plugin` | `src/eslint-plugin/` | Node only, inside the project's ESLint                        | Stable | The `no-raw-process-env` and `no-node-fs` lint rules                                                                                                         |
| `@maverickcer/env-cap/schema`        | `schemas/`           | Static JSON                                                   | Stable | The JSON Schema for `env-cap --json` output (`env-cap-report.schema.json`) and the model schemas under `./schema/*`                                          |

<!-- ipc:end entry-points -->

## Before finishing a change

Each step is done when its command exits 0 or its condition holds.

1. `npm run typecheck` and `npm test` pass.
2. If `src/runtime`, `src/helpers` or `src/evidence` changed, `npm run size` passes.
3. If a public export changed, the change is intended; otherwise the export is restored.
4. If an `env.schema.ts` changed, its `documentEnv()` entry matches, and the generated files are
   regenerated by the project's `generate:env` script.
5. Every generated file was regenerated, not edited. A generated file starts with a comment that
   says `GENERATED FILE -- do not edit by hand`, or, for `.env.example`, with the line
   `# AUTO-GENERATED EXAMPLE FILE.`.
6. No secret or raw environment value appears in a thrown error message, a log or a committed
   example file.

## Full reference

- Why the architecture is shaped this way: [`specs/architecture.md`](specs/architecture.md).
- Why a specific rule exists: [`specs/decisions/`](specs/decisions/).
- Moving an existing application onto env-cap: [`specs/migrations/`](specs/migrations/).
- Every option of the generators and the CLI: [GUIDE.md](GUIDE.md).
