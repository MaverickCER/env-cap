# AGENTS.md

Guidance for AI coding agents (Codex, Cursor, Copilot, Continue, and others reading this
convention) working in `env-cap`'s own source, or in an application that consumes
`@maverickcer/env-cap`. Claude Code reads the fuller, more detailed version of this same
guidance from [`skills/env-cap/SKILL.md`](skills/env-cap/SKILL.md) — read that file
instead if your tooling supports it; this file is a self-contained distillation for
agents that don't.

## What this package is

`env-cap` gives each capability (a feature folder or an installable package) its own
environment contract — declared once as a static schema, validated at runtime, documented
and aggregated at build time. There is no global `env` object.

## Non-negotiable invariants

1. **Static analysis only — schemas are never executed.** The build package
   (`@maverickcer/env-cap/build`) parses `env.schema.ts` files as TypeScript AST; it never
   `import()`s, `require()`s, or `eval()`s them. Only literal expressions resolve — a
   spread, a factory call, or a re-export resolves as "unknown" and surfaces as a warning,
   never a guess. Keep every schema object passed to `createEnv()`/`documentEnv()` a
   static literal.
2. **Capability ownership — never a global env object.** Each `createEnv()` call is
   scoped to, and exported by, the module that owns it (`paymentsEnv`, `databaseEnv`).
   Access always goes through the owning contract — `paymentsEnv.STRIPE_KEY`, never
   `env.payments.STRIPE_KEY`. Never introduce a merged/global wrapper object.
3. **Runtime config and documentation are separate calls on the same schema object.**
   `createEnv(schema, options)` reads only `default`/`processor`/`validator`/`context` —
   that is the runtime's entire vocabulary. `documentEnv(schema, docs)` is a second, inert
   call over the same object; it returns `void` and exists only as a build-time AST marker.
   Never put `description`/`owner`/`expiresAt` fields inside `createEnv()`; never expect
   `documentEnv()` to affect runtime behavior.
4. **Public API surface only.** `package.json#exports` exposes exactly `.`, `./build`,
   `./helpers`, `./eslint-plugin`, `./schema`, and `./package.json`. Import only from
   these — never `dist/*.cjs` internals, `src/**/*.ts` paths, or an unexported build
   internal (e.g. the dependency-graph engine).
5. **Runtime and build are strictly separated.** `src/build` uses `node:fs`/`node:path`/
   `typescript` and must never be imported from runtime/browser code. `src/runtime` has
   zero filesystem access and zero dependencies, and is held to a 3KB gzip budget
   (`npm run size`).
6. **Contracts self-redact; errors never carry values.** `console.log(paymentsEnv)`
   prints only `EnvContract("payments") { N variable(s) }`. Validation errors are built
   from variable name, contract name/source, failure kind, and the developer's own error
   message — never raw or processed values. Never write a processor/validator error
   message that embeds the raw value.
7. **Validation contexts are participation filters, not security or detection.** A schema
   entry may set `context: "server"` (or any application-defined string); `validateEnv({
activeContexts })` skips any variable whose `context` isn't in that list — no default/
   processor/validator runs for it, and reading it throws `EnvNotReadyError`. env-cap never
   detects or infers `activeContexts` (no `window`/`NODE_ENV` sniffing inside the package —
   the application always computes and passes it explicitly), `context` never restricts who
   can read a resolved value, and it is **not** a bundling boundary: a `context: "server"`
   variable in the same manifest as `context: "client"` variables still ships its
   definition to a client bundle that imports that manifest. Use separate discovery/
   manifests per contract when a variable must never reach client-bound code at all (see
   `specs/decisions/0004-no-client-server-package-split.md` and
   `specs/decisions/0022-validation-contexts.md`).

## Avoid

- Deep/internal imports (`dist/*.cjs`, `src/build/dependency-graph.ts`, anything not
  re-exported by the public entry points).
- Importing `@maverickcer/env-cap/build` into runtime or browser code — it is Node-only,
  dev/CI-only.
- Calling any `generate*()` function at application startup or on a request path —
  build-time only, wired into an npm script or CI step.
- Dynamically constructed schemas (`createEnv(buildSchema())`, `createEnv({ ...shared })`,
  re-exporting a contract from another module) — static AST discovery cannot resolve
  these.
- Documentation fields inside `createEnv()`'s schema — those belong in `documentEnv()`
  only.
- The field name `transformer` — renamed to `processor`, no alias exists.
- Reading a contract before `validateEnv()` has run — throws `EnvNotReadyError`.
- Spreading or `Object.entries()`-ing a whole contract "just to inspect it" —
  `console.log(paymentsEnv)` is safe by design, but `{...paymentsEnv}` triggers every
  getter and produces a plain object with every real value.
- Manually constructing a contract collection when a generated manifest is available —
  regenerate it instead: run the project's `generate:env` script if one exists, or call
  `generateEnvManifest({ location: "src/generated/env.manifest.ts" })` from
  `@maverickcer/env-cap/build`, or run `npx env-cap --location
src/generated/env.manifest.ts` from the CLI. Never hand-assemble the collection it
  produces.
- Validation managers, service locators, providers, registries, or other initialization
  frameworks around `validateEnv()` — call it directly from the application's existing
  startup path.

## Migrating an existing app onto env-cap

- Generated manifests are meant to be consumed by `validateEnv()` at runtime, and
  generated artifacts (manifest, docs, `.env.example`, ownership report) are meant to be
  consumed by tooling — prefer them over anything manually maintained, and treat them as
  the source of truth.
- To generate a manifest: check for an existing `generate:env` (or similarly named) npm
  script first and run that. If none exists, either call
  `generateEnvManifest({ location: "src/generated/env.manifest.ts" })` (import from
  `@maverickcer/env-cap/build`) from a build script, or run the CLI directly —
  `npx env-cap --location src/generated/env.manifest.ts` (add `--docs`, `--env-example`,
  `--strict`, etc. as needed; see the Public API map and `skills/env-cap/SKILL.md` for the
  full option set). Commit the generated file only if the project already commits
  generated artifacts; otherwise wire the command into CI.
- Prefer migrations that are small, reviewable PRs covering one capability at a time,
  preserve existing validation and runtime behavior, and avoid new infrastructure unless
  it's actually required. See [`specs/migrations/`](specs/migrations/) for guide-by-guide
  detail.

## Public API map

| Export                               | Source               | Environment           | Purpose                                                                                                                                                                                |
| ------------------------------------ | -------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@maverickcer/env-cap`               | `src/runtime/`       | isomorphic, zero deps | `createEnv`, `documentEnv`, `validateEnv`, `resetEnvCache`, error types, `isEnvContract`                                                                                               |
| `@maverickcer/env-cap/build`         | `src/build/`         | Node-only, dev/CI     | discovery, AST analysis, artifact generation (see `VERSIONING.md` — only the four `generate*()` orchestrators are Stable; the lower-level primitives it also exports are Experimental) |
| `@maverickcer/env-cap/helpers`       | `src/helpers/`       | isomorphic, optional  | `processors` / `validators`                                                                                                                                                            |
| `@maverickcer/env-cap/eslint-plugin` | `src/eslint-plugin/` | Node-only, optional   | `no-raw-process-env` lint rule                                                                                                                                                         |

## Before finishing a change

- Run `npm run typecheck` and `npm test`.
- If `src/runtime` or `src/helpers` changed, run `npm run size`.
- If public exports changed, confirm it's intentional and justified — otherwise revert
  the export.
- If an `env.schema.ts` changed, add/update the matching `documentEnv()` entry and
  regenerate dependent generated artifacts via the project's `generate:env` script. Never
  hand-edit a file marked `AUTO-GENERATED FILE. DO NOT EDIT.`
- Confirm no secret/raw environment value appears in a thrown error message, a log, or a
  committed example file.

## Full reference

For architecture rationale, the complete decision history, migration guides, and
maintainer-only notes on modifying `env-cap`'s own source, see
[`specs/architecture.md`](specs/architecture.md), [`specs/decisions/`](specs/decisions/),
[`specs/migrations/`](specs/migrations/), and
[`skills/env-cap/SKILL.md`](skills/env-cap/SKILL.md).
