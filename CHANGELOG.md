# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
once it reaches 1.0. Before 1.0, minor versions may include breaking changes.

## [Unreleased]

## [0.1.0] - 2026-08-02

Initial release.

- Runtime: `createEnv()` / `validateEnv()` / `documentEnv()` -- capability-owned,
  lazily-resolved environment contracts with no global env object.
- Build: `generateEnvManifest()` / `generateDocumentation()` / `generateUsageReport()` /
  `generateEnvArtifacts()` -- static AST discovery and artifact generation, never
  importing or executing schema files.
- Helpers: `@maverickcer/env-cap/helpers` -- optional, tree-shakeable
  processor/validator convenience functions.
- CLI: `npx env-cap` for CI/release-pipeline artifact generation.
- CLI: a published JSON Schema for `--json` output (`schemas/env-cap-report.schema.json`,
  also exported as `@maverickcer/env-cap/schema`) for external, non-TypeScript
  tooling to validate or codegen against -- generated directly from
  `src/cli/json.ts`'s types, never hand-authored, so the two can't silently
  drift apart. See [ADR 0019](specs/decisions/0019-published-json-schema-generated-from-types.md).
- GitHub Action: a new `rotation-alert` input (default `true`) opens/updates a
  GitHub issue -- and auto-closes it once resolved -- when a run has no PR to
  comment on (a `schedule`/`workflow_dispatch`/plain-`push` trigger) and finds
  an expiring or expired variable, so a dormant repository still gets a real,
  emailed alert. See [ADR 0018](specs/decisions/0018-rotation-alert-issue-on-non-pr-runs.md).
- ESLint: new `@maverickcer/env-cap/eslint-plugin` subpath export, a
  `no-raw-process-env` rule that flags direct `process.env` access outside a
  capability's own `env.schema.ts`, with an `allow` glob-list escape hatch for
  legitimate build-time bootstrap code (e.g. a resolver reading a raw
  `VAULT_TOKEN` to authenticate to a secrets manager before any contract
  exists to go through). See [ADR 0017](specs/decisions/0017-eslint-plugin-entry-point.md).
- CLI: new `--check` flag verifies every requested artifact (manifest/docs/
  `.env.example`/ownership report) is up to date without writing anything --
  a CI drift guard for a schema change that forgot a local regeneration.
  `--json`'s envelope gains an additive `checkResult: { ok, stale }` field.
  See [ADR 0016](specs/decisions/0016-check-mode-compute-before-compare-never-partial-write.md).
- CLI: a leading `⚠ N unresolved/dropped-schema warning(s) found` banner
  prints before the rest of a non-JSON run's output whenever a schema
  couldn't be statically resolved -- purely additive visibility, no change
  to exit-code semantics.
- Docs: SECURITY.md commits to a concrete post-1.0 security-backport policy (latest
  minor of the previous major, minimum six months after a new major ships, extendable
  but never shortened once stated) -- see
  [ADR 0015](specs/decisions/0015-security-backport-window.md).
- Build: `GenerateDocumentationResult.catalog` -- the full per-variable documentation
  content (description, owner, `expiresAt`, `extra` metadata, ...) alongside the
  existing `contracts` summary, keyed by variable name within each contract.
- CLI: `--json` flag emits a versioned, machine-readable report (`{ schemaVersion,
  kind, toolVersion, ok, ... }`) instead of formatted text, for CI checks, PR
  annotations, and dashboards. Exit-code semantics are unchanged.
- GitHub Action: a first-party, dependency-free composite Action (`action.yml`) runs
  the CLI with `--json` and turns the result into inline PR annotations and a sticky
  summary comment.
- Build: **Experimental** cross-package schema discovery -- a new `packages`
  option (and CLI `--package <name>`, repeatable) on `generateEnvManifest()`/
  `generateDocumentation()`/`generateUsageReport()`/`generateEnvArtifacts()` lets a
  project discover a schema that ships inside a separately-published, installed
  package via an explicit allowlist, never an implicit scan of `node_modules`. See
  [ADR 0014](specs/decisions/0014-cross-package-schema-discovery.md) and
  [`VERSIONING.md`](VERSIONING.md) for the Experimental-surface policy this ships
  under. `examples/paypal-addon`/`examples/paypal-consumer` now demonstrate it
  against a real packed tarball, not a monorepo-sibling workaround.
- Docs: `GenerateUsageReportResult` gains `parseWarnings`, surfacing schema-discovery
  and package-resolution warnings from the `--ownership`/usage pass, matching the
  other two generators (purely additive; no `schemaVersion` bump per ADR 0013).
- New `VERSIONING.md` codifying the stable/Experimental/private semver scope, and
  `ADOPTION.md` synthesizing the security model, versioning stance, and migration
  cost for technical decision-makers.
- README: runtime support matrix, a Troubleshooting section keyed by exported error
  class, and a "Reusable packages" section documenting cross-package discovery.
- Specs: backfilled [ADR 0010](specs/decisions/0010-dependency-ownership-engine-scope-boundary.md)
  (dependency-ownership engine's scope boundary) and
  [ADR 0011](specs/decisions/0011-shared-discovery-compute-atomic-write-non-atomic.md)
  (shared discovery, compute-atomic but not write-atomic `generateEnvArtifacts()`),
  both already-implemented decisions that were referenced by number but never
  written down until now.
- Governance: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1),
  `CODEOWNERS`, and tailored issue/PR templates.
- CI: GitHub Actions pinned to commit SHAs; Node matrix refreshed to currently
  maintained LTS lines (`18.x`/`22.x`/`24.x` required, `26.x` Current as a
  non-blocking signal) while `engines.node` stays `>=18.0.0`, unchanged, since
  nothing in the code requires newer; a new cross-runtime job runs the same
  conformance suite under Bun and Deno's own native test runners, not just
  Node/vitest; an `examples` job installs and typechecks/runs all seven
  reference examples against the real, just-built package.
- Adopted `@typescript-eslint`'s `strict-type-checked` + `stylistic-type-checked`
  ESLint configuration (`npm run lint`, its own step in CI) with
  every finding fixed or explicitly, narrowly justified -- including two real bugs
  this caught: an untyped `new Map()` fallback that silently widened a chain of
  values to `any`, and `EnvContract`'s type not declaring the `toString()` override
  `create.ts` actually implements.
- `vitest.config.ts` now enforces coverage thresholds (lines/branches/functions/
  statements) in CI, not just locally informational reporting.
- Runtime/build error classes (`EnvValidationError`, `EnvNotReadyError`,
  `EnvManifestGenerationError`, `EnvDocumentationGenerationError`,
  `EnvUsageAnalysisError`, `EnvProjectGenerationError`) gain a stable, Stable-tier
  `code` field for programmatic handling that doesn't depend on `.name`/`instanceof`.
- Release: adopted [Changesets](https://github.com/changesets/changesets) plus a
  new `release.yml` workflow publishing via npm's OIDC trusted publishing -- no
  `NPM_TOKEN` secret, provenance-attested by default. See `CONTRIBUTING.md`'s
  release-process section for the one-time, human-only npmjs.com setup step this
  requires.
- Website: dark mode (follows `prefers-color-scheme`, overridable via a new header
  toggle, persisted); a dependency-free `Cmd+K`/`Ctrl+K` search over the page's own
  sections and FAQ entries; an `aria-live` announcement for the copy-button
  confirmation; a fixed borderline (~4.55:1) muted-text contrast token to ~7.2-7.6:1;
  named links to specific ADRs from the Security and Adoption sections instead of a
  generic repository link; `sitemap.xml` plus a `Sitemap:` line in `robots.txt`;
  a Getting Started mention of the ESLint plugin and `--json`/`--check`; removed
  several leftover, never-referenced CSS classes (`.card`, `.callout--warning`,
  `.callout--success`, `.comparison-table .is-positive`).

[Unreleased]: https://github.com/maverickcer/env-cap/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/maverickcer/env-cap/releases/tag/v0.1.0
