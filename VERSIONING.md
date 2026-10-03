# Versioning and API stability

`env-cap` follows [Semantic Versioning](https://semver.org/). This document
defines what that promise actually covers, since "semver" alone doesn't say
which surface it applies to. Three tiers exist:

## Stable

Covered by semver. A breaking change to any of the following requires a
major version bump (once the package reaches 1.0 -- see
[Pre-1.0 status](#pre-10-status) below):

- **Public runtime APIs**: `createEnv`, `validateEnv`, `documentEnv`,
  `resetEnvCache`, `isEnvContract`, and the exported error classes
  (`EnvValidationError`, `EnvNotReadyError`) from the package root.
- **Documented build APIs**: `generateEnvManifest`, `generateDocumentation`,
  `generateUsageReport`, `generateEnvArtifacts` and their documented
  options, from `@maverickcer/env-cap/build`.
- **`@maverickcer/env-cap/node`** (`nodeBuildFileSystem`): the only sanctioned way to give
  `./build` a filesystem, and required by every generator script `init` scaffolds.
- **CLI flags**: every flag listed in `env-cap --help`, and the CLI's exit codes.
- **`--json` output**: versioned independently via its own `schemaVersion`
  field -- see [ADR 0013](specs/decisions/0013-json-output-is-a-versioned-mirror.md).
  A purely additive field never requires a `schemaVersion` bump; a changed
  or removed field does.
- **The published JSON Schema** (`schemas/env-cap-report.schema.json`, the
  `@maverickcer/env-cap/schema` export), kept in lockstep with `--json`'s
  documented shape and generated directly from it -- see
  [ADR 0019](specs/decisions/0019-published-json-schema-generated-from-types.md).
  Follows the same additive-only rule as `--json` itself.
- **The generated manifest schema**: the shape of the file
  `generateEnvManifest()`/`generateEnvArtifacts()` writes.
- **Documented configuration conventions**: for example, the `envCap.schema`
  package.json field (see [ADR 0014](specs/decisions/0014-cross-package-schema-discovery.md)).
- **The ESLint plugin**: `@maverickcer/env-cap/eslint-plugin`'s exported rule
  name(s), each rule's `RuleOptions` shape, and the default `env.schema.ts`/
  `.tsx` allowlist -- see [ADR 0017](specs/decisions/0017-eslint-plugin-entry-point.md).
- **The `packages` option** (cross-package schema discovery, ADR 0014) and
  **`tsconfig` option** (TypeScript path-alias resolution, ADR 0023) on every
  generator.
- **`@maverickcer/env-cap/build`'s lower-level discovery/linking primitives** --
  everything `./build` exports beyond the four generator orchestrators,
  e.g. `discoverSchemaFiles`, `linkFiles`, `parseSchemaFile`, `renderManifest`,
  `renderDocs`, `detectCompatibilityIssues`, `detectExclusiveGroupIssues`,
  `generateEvidenceModel`, `getEvidenceModel`/`computeSourceFingerprint`,
  `renderUsageReport`, and their accompanying types.
- **`@maverickcer/env-cap/evidence`** (`defineEvidenceProjection`, and the `EvidenceModel`
  shape it projects over) -- see [ADR 0031](specs/decisions/0031-evidence-entry-point.md)
  and [ADR 0032](specs/decisions/0032-evidence-projection-provenance-mechanism.md).
- **The persisted evidence artifact** (`docs/env.evidence.json` or wherever a
  project's `evidence.location`/`--evidence <path>` points) -- a direct,
  literal serialization of `EvidenceModel`.
- **The `init` CLI subcommand**'s scaffolded file set and template contents
  -- see [ADR 0042](specs/decisions/0042-init-cli-subcommand-scaffolds-only.md).
- **The composite GitHub Action** (`action.yml`): its input and output names and meanings, and
  the PR comment's sections. The major tag it is used through (`uses: MaverickCER/env-cap@v0`
  while the package is 0.x, `@v1` from 1.0.0) moves only within a major version.
- **Supported toolchain**: Node.js `>=22`, and the TypeScript versions named in the
  `typescript` peer range. The build-time scanner needs TypeScript's classic compiler API; a
  TypeScript major that removes it is unsupported until a release says otherwise, and the CLI says
  so instead of failing with an import error.

All promoted from Experimental per [ADR 0045](specs/decisions/0045-promote-experimental-surfaces-to-stable.md)
-- see that ADR for why each one had already cleared this tier's own
graduation criterion (below).

## Experimental

Explicitly labeled as such, in the README, the relevant option's own JSDoc,
and the ADR that introduces it. An Experimental surface may change shape --
including in a breaking way -- in a minor or patch release, without that
being a semver violation. This is not a loophole for casual churn: a feature
ships Experimental because it is genuinely new enough that real-world
feedback is likely to reveal a better shape, not because we're unwilling to
commit to _something_. Once a feature has been through at least one real
feedback cycle without a need to break it, its ADR's Status moves from
Proposed/Experimental to Accepted, and it becomes Stable.

Nothing currently ships Experimental -- see [ADR 0045](specs/decisions/0045-promote-experimental-surfaces-to-stable.md)
for the most recent round of promotions. A future feature genuinely new
enough to warrant it will be added here, explicitly, with its own ADR.

## Private

Never covered by semver, may change at any time without notice:

- Internal modules and functions not re-exported from `.`, `./build`, or
  `./helpers`.
- Parsing/AST-traversal implementation details (e.g. exactly how
  `src/build/parse.ts` walks a source file).
- The dependency-ownership engine's internals (`scan-dependencies.ts`,
  `dependency-graph.ts`) -- see [ADR 0010](specs/decisions/0010-dependency-ownership-engine-scope-boundary.md).
- Any behavior not documented in the README, a JSDoc comment on a public
  export, or an ADR.

## Pre-1.0 status

`env-cap` has not yet reached a `1.0` release. Per [Keep a
Changelog](https://keepachangelog.com/en/1.1.0/)/semver convention, **minor
versions may include breaking changes to the Stable tier before 1.0** --
this document defines _scope_ (what would eventually be covered), not a
promise that it is already fully locked in at `0.x`.

How a `0.x` bump is chosen: the shared release tooling from
`internal-package-contract` deflates one level below 1.0.0 -- a breaking change
releases a minor, a feature a patch, and the API-contract gate requires only a
minor for a breaking API diff -- so **nothing automated can publish `1.0.0`**.
Crossing to 1.0.0 takes a human-authored `major` changeset, and that release
pull request is not auto-merged. The Experimental and Private tiers behave the
same before and after 1.0: Experimental surfaces may change at any version;
Private internals always may.

See [`SECURITY.md`](SECURITY.md#supported-versions) for the related, and
separate, question of which versions receive security fixes.
