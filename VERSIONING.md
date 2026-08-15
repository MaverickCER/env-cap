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
  options, from `env-cap/build`.
- **CLI flags**: every flag listed in `env-cap --help`.
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
  package.json field (see [ADR 0014](specs/decisions/0014-cross-package-schema-discovery.md))
  -- once it is promoted out of Experimental status (see below).
- **The ESLint plugin**: `@maverickcer/env-cap/eslint-plugin`'s exported rule
  name(s), each rule's `RuleOptions` shape, and the default `env.schema.ts`/
  `.tsx` allowlist -- see [ADR 0017](specs/decisions/0017-eslint-plugin-entry-point.md).

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

The `packages` option (cross-package schema discovery, ADR 0014) is the
first surface to ship this way.

`env-cap/build`'s lower-level discovery/linking primitives -- everything
`./build` exports beyond the four documented generator orchestrators above,
e.g. `discoverSchemaFiles`, `linkFiles`, `parseSchemaFile`, `renderManifest`,
`renderDocs`, `detectCompatibilityIssues`, `detectExclusiveGroupIssues`, and
their accompanying types -- are Experimental under this same policy. They are
real, public, re-exported surface (not Private -- see below), justified for
custom tooling (CI scripts, bundler plugins) per `src/build/index.ts`'s own
doc comment, but have not yet been through a real feedback cycle as a
committed, individually-stable contract the way the four orchestrators have.
A breaking change to any of them is not a semver violation today; each is
promoted to Stable independently once real usage shows its current shape is
right, the same promotion path `packages` itself is following.

**`@maverickcer/env-cap/evidence`** (`defineEvidenceProjection`, and the
`EvidenceModel` shape it projects over) ships Experimental for the same
reason -- see [ADR 0031](specs/decisions/0031-evidence-entry-point.md) and
[ADR 0032](specs/decisions/0032-evidence-projection-provenance-mechanism.md).
The mechanism (automatic read-only enforcement, field-level provenance
tracking) is new enough that real projection authorship -- both env-cap's own
reference projections and a consumer's custom ones -- is likely to surface a
better shape for `EvidenceProjectionResult.sources` in particular (currently
flat `EvidenceModel` field-path strings, not yet resolved into structured
`EvidenceReference`s -- see ADR 0032's Consequences).

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
promise that it is already fully locked in at `0.x`. The Experimental and
Private tiers behave the same before and after 1.0: Experimental surfaces
may change at any version; Private internals always may.

See [`SECURITY.md`](SECURITY.md#supported-versions) for the related, and
separate, question of which versions receive security fixes.
