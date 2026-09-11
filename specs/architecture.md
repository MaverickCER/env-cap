# Architecture

Canonical current-state description of how `env-cap` is built and what guarantees its architecture
provides. [`decisions/`](decisions/) holds the reasoning trail (the ADRs); this document is the
destination those decisions arrived at, not the argument for them. For the product overview and
integration guidance, see [README.md](../README.md) and [GUIDE.md](../GUIDE.md).

- [Purpose](#purpose)
- [Core invariants](#core-invariants)
- [The five entry points](#the-five-entry-points)
- [`runtime/` — define, validate, cache, and expose environment values](#runtime--define-validate-cache-and-expose-environment-values)
- [`build/` — discover, analyze, link, and generate artifacts](#build--discover-analyze-link-and-generate-artifacts)
- [`helpers/` — optional processors and validators](#helpers--optional-processors-and-validators)
- [Documentation is parallel to runtime, not part of runtime state](#documentation-is-parallel-to-runtime-not-part-of-runtime-state)
- [Data flow](#data-flow)
- [Module layout](#module-layout)
- [Architectural decisions](#architectural-decisions)

## Purpose

`env-cap` treats an application's environment configuration as a set of capability-owned contracts,
not as loose strings read off `process.env`. It does not perform secret storage, rotation, or
retrieval itself: a capability declares the environment variables it depends on (`createEnv()`) and,
optionally, the documentation metadata that describes them (`documentEnv()`); `env-cap` validates
those declarations against real values at startup, and separately, at build time, discovers every
declared contract across a project to produce manifests, documentation, ownership reports, and a
canonical Evidence Model.

The architecture keeps two concerns from collapsing into one:

```text
runtime           -> validated, typed access to configuration a capability already declared owning
build-time         -> project-wide discovery, documentation, and ownership visibility
```

The runtime never discovers anything; it only validates what a generated manifest already told it to
expect. Build-time tooling never runs at startup; it only ever runs as an explicit CI/npm-script step.
Neither one substitutes for the other, and a consumer can use either independently — validation with no
generated artifacts at all (a hand-written manifest works), or discovery/documentation with no runtime
validation (a project that only wants the ownership report).

## Core invariants

These are the guarantees the rest of the design exists to uphold. Each links to the section that
describes its mechanics.

### Runtime and build-time are strictly separate

The runtime (`.`, `./helpers`) has zero npm dependencies, never touches the filesystem, never
discovers files, and never imports Node-specific APIs. `./build` is Node-only developer tooling,
never meant to reach a browser bundle — bundle-size and tree-shaking tests fail if runtime consumers
accidentally receive build tooling or unrelated helper code. See
[`runtime/`](#runtime--define-validate-cache-and-expose-environment-values) and
[`build/`](#build--discover-analyze-link-and-generate-artifacts) below, and
[ADR 0004](decisions/0004-no-client-server-package-split.md).

### The build tool never imports or executes a schema file

Discovery is AST analysis only (`build/parse.ts`, the TypeScript compiler API) — a schema file's
`createEnv()`/`documentEnv()` calls are read as syntax, never imported or run. This preserves the
safety boundary required for CI environments and large monorepos: a malicious or merely broken schema
file can't execute code just by being discovered. See
[`build/`](#build--discover-analyze-link-and-generate-artifacts) and
[ADR 0002](decisions/0002-static-analysis-never-execution.md).

### `./build` does not acquire filesystem access implicitly

`./build` never imports `node:fs` itself — every public options object requires a caller-supplied
`BuildFileSystem` capability. The `env-cap` CLI (`src/cli/`) is the executable boundary that
constructs the real `node:fs/promises` adapter and hands it in; a consumer running the generators
from their own Node script imports that same adapter from `env-cap/node`. This is the
same discipline `repo-contract`'s ADR-0011 established for `spawn`/`env`: a library surface should
not implicitly acquire a powerful ambient capability a caller did not explicitly provide. See
[ADR 0040](decisions/0040-library-surfaces-do-not-acquire-node-fs.md).

### Documentation is inert at runtime

`documentEnv()` is a source-level marker the build system discovers through AST analysis — it stores
nothing in memory and adds no fields to a runtime contract. `createEnv()`'s runtime contracts and
`documentEnv()`'s documentation metadata are separate concerns that happen to share a source file, not
one pipeline. See
[Documentation is parallel to runtime, not part of runtime state](#documentation-is-parallel-to-runtime-not-part-of-runtime-state).

### Runtime contracts are self-redacting

A contract's own `toString`/`console.log`/JSON representation never exposes resolved values —
`console.log(paymentsEnv)` prints `EnvContract("payments") { 1 variable(s) }`, never the underlying
secret. Explicit property access (`paymentsEnv.STRIPE_KEY`) remains required to read a value. See
[ADR 0006](decisions/0006-self-redacting-contracts.md) and [SECURITY.md](../SECURITY.md).

### Validation contexts gate participation, nothing else

A variable with no `context` participates in every run; a variable with a `context` participates only
when `activeContexts` contains that exact string — no prefix matching, no inference from ambient
signals, no effect on `EnvContract`'s TypeScript shape, and no authorization/bundling meaning. See
[Validation context invariants](#validation-context-invariants) below and
[ADR 0022](decisions/0022-validation-contexts.md).

### Manifest compatibility is the one blocking category

Of the three finding categories a generation run can produce — manifest compatibility/exclusive-group
issues, documentation completeness, and dependency ownership — only the first ever blocks
(`EnvProjectGenerationError`, nothing written). Documentation and ownership issues are heuristic
signals with real, common false-positive causes; they're recorded as `Finding`s on the persisted
Evidence Model instead, for a consumer to gate on explicitly if they want that enforced. See
[Data flow](#data-flow) and [ADR 0038](decisions/0038-always-computed-evidence-model-backs-generate-check-docs.md).

### The Evidence Model is always computed, independent of what's requested

`computeArtifacts()` always builds the full `EvidenceModel` — the manifest/docs/ownership/`--evidence`
flags only control which artifacts are additionally _written to disk_, never whether the underlying
model is computed. See [Data flow](#data-flow) and
[ADR 0038](decisions/0038-always-computed-evidence-model-backs-generate-check-docs.md).

## The five entry points

```

src/
├── runtime/        env-cap                 (runtime library)
├── build/          env-cap/build             (Node-only build tooling)
├── helpers/        env-cap/helpers           (optional utilities)
├── evidence/       env-cap/evidence          (Evidence Model projections)
└── eslint-plugin/  env-cap/eslint-plugin      (capability-owned-access lint rules)

```

Each directory corresponds to a separate package export with its own build
output (configured in `tsup.config.ts`). Importing one entry point does not
include the implementation of the others.

`build`, `eslint-plugin`, and `runtime` contain their own implementation with
zero cross-folder dependency, including internal utilities.
`globToRegExp()`, for example, is needed by both `build/discover.ts` and
`eslint-plugin/no-raw-process-env.ts`; rather than living in a shared
internal module both would depend on, each directory owns its own copy
(`build/glob.ts`, `eslint-plugin/glob.ts` -- see ADR 0017's "Alternatives
considered"). `helpers` and `evidence` each have exactly one cross-folder
import, and both are structural, not incidental. `helpers`' `processors.ts`/
`validators.ts` import `Processor`/`Validator` as types (erased at compile
time) from `runtime/index.ts`, because a helper's whole job is producing a
value that type-checks as the exact shape `createEnv()` expects -- that
contract can't be expressed without referencing runtime's own type.
`evidence/define-projection.ts` imports `EvidenceModel` as a type (also
erased at compile time) from `build/evidence-model.ts`, for the same reason:
a projector's whole job is a function _of_ that shape, which can't be named
without referencing it -- see ADR 0031. Neither edge is an oversight: it's
what lets any of these five directories move to its own repository
independent of the others, with `helpers`/`evidence` simply gaining
`env-cap`/`env-cap-build` as an ordinary
dependency the way any package depending on another package's published
types would.

`src/cli/` (the `env-cap` bin, not a `package.json#exports` subpath) has the
same kind of real, intentional dependency on `build` -- it imports
`env-cap/build`'s public surface (`src/build/index.ts`)
directly, never an internal `build/*.ts` file, since generating artifacts
from the command line requires the same engine `./build` exports. It is also
the one place `node:fs` is acquired to build the concrete `BuildFileSystem`
adapter `./build` requires (see [ADR 0040](decisions/0040-library-surfaces-do-not-acquire-node-fs.md)).
A split-out `cli` package would simply declare `env-cap-build`
as a normal npm dependency.

This separation is enforced through automated checks. The tree-shaking tests
and bundle-size checks fail if runtime consumers accidentally receive build
tooling or unrelated helper code, and `scripts/verify-no-ambient-fs.mjs`
fails if a published library entrypoint's packed output reaches for
`node:fs` outside the CLI/`./node`/`./eslint-plugin` exceptions.

```mermaid
flowchart TB
    subgraph RUNTIME["package root - runtime (isomorphic)<br/>zero npm dependencies, no fs, no Node APIs"]
        CREATE["createEnv()"]
        DOCFN["documentEnv()<br/>(inert at runtime - a marker only)"]
        VALIDATE["validateEnv()"]
        REG["registry (WeakMap) + cache"]
    end

    subgraph HELPERS["./helpers - optional"]
        PROC["processors.*"]
        VALID["validators.*"]
    end

    subgraph BUILD["./build - Node-only, dev/CI tooling<br/>never imports node:fs (ADR 0040)"]
        DISCOVER["discoverSchemaFiles()"]
        PARSE["parseSchemaFile()<br/>TS compiler API - parses AST,<br/>never imports/executes the file"]
        LINK["linkFiles()"]
        CHECKS["detectCompatibilityIssues()<br/>detectExclusiveGroupIssues()"]
        GEN["generateEnvManifest / Documentation /<br/>UsageReport / EnvArtifacts"]
        CHECKMODE["checkEnvArtifacts() - the --check flag"]
        DISCOVER --> PARSE --> LINK --> CHECKS --> GEN
        GEN -.->|"same discovery + link,<br/>compare instead of write"| CHECKMODE
    end

    subgraph EVIDENCE["./evidence - isomorphic, optional"]
        DEFPROJ["defineEvidenceProjection()"]
    end

    subgraph ESLINT["./eslint-plugin"]
        RULE["no-raw-process-env / no-node-fs rules"]
    end

    subgraph CLIBIN["env-cap bin - src/cli/<br/>constructs the real node:fs adapter"]
        MAIN["parseArgs() / main()"]
    end

    HELPERS -->|"type-only import:<br/>Processor / Validator"| RUNTIME
    EVIDENCE -->|"type-only import:<br/>EvidenceModel"| BUILD
    CLIBIN -->|"imports build's public<br/>src/build/index.ts +<br/>supplies BuildFileSystem"| BUILD
```

`build`, `eslint-plugin`, and `runtime` have no edges between them above
because none exist: each owns its own copy of shared internals (e.g.
`glob.ts`) rather than importing from another entry point. `helpers`' and
`evidence`'s single edges are both type-only and erased at compile time.
This is what the tree-shaking and bundle-size tests in the previous
paragraph actually verify.

## `runtime/` — define, validate, cache, and expose environment values

The runtime package contains only the functionality required while an
application is running.

Its core concepts are limited to:

- `default`
- `processor`
- `validator`
- `context` (a variable's validation context, see below and ADR 0022)

These are the only pieces of information required to transform raw
environment values into validated application configuration.

`createEnv()` (`runtime/create.ts`) creates a feature-owned environment
contract. `validateEnv()` (`runtime/validate.ts`) executes every registered
contract's processing pipeline against the provided environment values and
caches successful results through `runtime/cache.ts`. Before running that
pipeline for a given variable, it first checks whether the variable's
`context` (if any) is in the run's `activeContexts` -- a variable that
doesn't match is skipped entirely (no default/processor/validator runs) and
stays in its not-ready state, exactly as if this run had never happened for
it.

### Validation context invariants

A **validation context** is an application-defined string a variable may
declare (`context`) and a validation run may activate (`activeContexts`).
env-cap never interprets, detects, or infers these strings itself -- the
application always computes and passes `activeContexts` explicitly. The
following invariants are load-bearing; none should be relaxed without a new
ADR (see [ADR 0022](decisions/0022-validation-contexts.md)):

1. **Matching.** A variable without a `context` participates in every
   validation run. A variable with a `context` participates only when
   `activeContexts` contains that exact string. No prefix matching, no
   wildcards, no hierarchy, no inheritance.
2. **Not runtime detection.** env-cap never infers, detects, or defaults
   `activeContexts` from any ambient signal (`window`, `NODE_ENV`, a
   bundler `define`, etc.). The application always computes and passes it
   explicitly.
3. **Not cache identity.** `validateEnv()` stays one-shot per process: a
   second call while already `"ready"` returns the first call's result
   outright, without inspecting the second call's `activeContexts`. There
   is no per-context cache dimension.
4. **Not a type-level concept.** Validation contexts affect participation
   at `validateEnv()` time only -- they do not alter `EnvContract`'s
   TypeScript shape, `InferEnvValue`, or any generated type. Every schema
   key remains a property of `EnvContract<S>` regardless of `context`; an
   out-of-context key throws `EnvNotReadyError` at access time, exactly
   like any value read before `validateEnv()` has run.
5. **Not authorization.** Validation contexts are not an authentication,
   authorization, or access-control mechanism. They determine validation
   participation only, never who may read a resolved value.
6. **Not a bundling/security boundary.** Separate discovery/manifests (ADR 0004) remain the real mechanism for keeping server-only source out of
   client-bound code. `activeContexts` filtering happens after the schema
   is already wherever it's going to be -- it does not remove a variable's
   definition (or its `default` value) from a bundle that imports it.

`runtime/registry.ts` maintains the internal relationship between created
contracts and their schemas using a private `WeakMap`. This keeps internal
implementation details inaccessible to application code while allowing the
runtime to resolve values safely.

`runtime/errors.ts` defines the runtime error types used for validation
failures and invalid access states.

The runtime package intentionally:

- does not access the filesystem
- does not parse source code
- does not depend on Node-specific APIs
- has zero runtime npm dependencies

This keeps the runtime small, portable, and safe to include in browser,
edge, serverless, and Node environments.

## `build/` — discover, analyze, link, and generate artifacts

The build package contains developer tooling only. It exists to analyze a
project's environment schemas and generate artifacts; it is not part of an
application's runtime execution path.

The build pipeline is responsible for:

- discovering schema files (`build/discover.ts`)
- parsing TypeScript source into AST representations (`build/parse.ts`)
- evaluating safe literal expressions (`build/literal-eval.ts`)
- linking `createEnv()` and `documentEnv()` calls (`build/link.ts`)
- detecting compatibility concerns (`build/compatibility.ts`,
  `build/exclusive-group.ts`)
- scanning source files for variable access and deriving ownership findings
  (`build/scan-dependencies.ts`, `build/dependency-graph.ts`) -- a
  purely-syntactic, per-file walk that follows `contract.KEY` member access,
  object-destructuring, and one level of file-unique `const` aliasing, and
  records every shape it can't follow (a rest/nested/computed-key binding, a
  reassigned alias, the contract passed around as a value) as an explicit
  `escape` that widens a variable to `indeterminate`, never a false
  `unconsumed` (see ADR 0039)
- resolving live expiration overrides for documentation (`build/live-expirations.ts`)
- generating output artifacts (`build/manifest.ts`, `build/docs.ts`,
  `build/env-example.ts`, `build/usage-report.ts`)

`generateEnvManifest()` (`build/generate-manifest.ts`),
`generateDocumentation()` (`build/generate-documentation.ts`), and
`generateUsageReport()` (`build/generate-usage.ts`) each coordinate one of
these passes and are responsible for writing their own generated files.
`generateEnvArtifacts()` (`build/generate-env-artifacts.ts`) composes all
three into a single call sharing one discovery pass and one combined
blocking-failure check.

The build package never imports or executes application schema files. It
analyzes source structure instead of running user code. This preserves the
safety boundary required for CI environments and large monorepos.

See
[`decisions/0002-static-analysis-never-execution.md`](decisions/0002-static-analysis-never-execution.md)
for the reasoning behind AST analysis instead of dynamic imports.

Every public options object in `build/index.ts` also carries a required
`fs: BuildFileSystem` field -- `./build` itself never imports `node:fs`; see
[ADR 0040](decisions/0040-library-surfaces-do-not-acquire-node-fs.md) and the
[Core invariants](#core-invariants) above.

## `helpers/` — optional processors and validators

The helpers package provides reusable implementations of the
`Processor` and `Validator` function types defined by
`runtime/types.ts`.

Examples include common transformations and validation patterns that most
applications would otherwise need to implement manually.

The runtime package has no dependency on helpers. They are convenience
utilities, not part of the environment-contract execution model.

`processors` and `validators` are separate exports so applications can
include only the category they use.

## Documentation is parallel to runtime, not part of runtime state

The most important architectural separation is the distinction between
runtime configuration and human-facing documentation.

`createEnv()` defines the information required to process and validate
environment values.

`documentEnv()` defines information intended for developers, operators, and
generated artifacts, such as:

- descriptions
- ownership information
- lifecycle details
- expiration dates
- operational guidance

`documentEnv()` is intentionally inert at runtime. It exists as a source-level
marker that the build system can discover through AST analysis. It does not
store documentation data in memory or add documentation fields to runtime
contracts.

The relationship is therefore not a runtime pipeline:

```mermaid
flowchart TB
    SCHEMA["env.schema.ts"]

    SCHEMA --> CREATECALL["createEnv(schema)"]
    CREATECALL --> CONTRACT["runtime contract"]
    CONTRACT --> VALIDATECALL["validateEnv()"]
    VALIDATECALL --> VALUES["validated in-memory values"]

    SCHEMA --> DOCCALL["documentEnv(schema, docs)"]
    DOCCALL --> BUILDANALYSIS["build-time AST analysis only"]
    BUILDANALYSIS --> ARTIFACTS["manifest / documentation / example artifacts"]
```

The same schema file can contain both calls, but they serve different
consumers:

- application runtime consumes `createEnv()`
- build tooling consumes `documentEnv()`

## Data flow

```mermaid
flowchart TB
    subgraph AUTHOR["1 - Author time (capability owner)"]
        SCHEMA["features/payments/env.schema.ts<br/>createEnv(schema) + documentEnv(schema, docs)"]
    end

    subgraph BUILDTIME["2 - Build time - shared compute pipeline<br/>(explicit CLI / npm script / CI step, never automatic at startup)"]
        DISCOVER["discoverSchemaFiles()<br/>glob scan, + optional --package allowlist,<br/>+ optional tsconfig path-alias resolution"]
        PARSE["parseSchemaFile()<br/>TypeScript AST - static analysis,<br/>schema file is never imported/executed"]
        LINK["linkFiles()<br/>pairs createEnv()/documentEnv() calls<br/>into DiscoveredContract objects"]
        CHECKS{"detectCompatibilityIssues()<br/>detectExclusiveGroupIssues()<br/>blocking finding?"}
        THROW["EnvProjectGenerationError<br/>nothing written, either mode"]

        DISCOVER --> PARSE --> LINK --> CHECKS
        CHECKS -- yes --> THROW
    end

    SCHEMA -.->|explicit run| DISCOVER

    subgraph WRITE["2a - generateEnvArtifacts() (default: write)"]
        MANIFEST["env.manifest.ts<br/>renderManifest()"]
        DOCS["ENVIRONMENT.md<br/>renderDocs(), never blocks<br/>(findings, not throws - ADR 0038)"]
        EXAMPLE[".env.example<br/>renderEnvExample(), reconciled<br/>against the existing file"]
        OWNERSHIP["OWNERSHIP.md<br/>broader source scan -><br/>dependency graph -> ownership findings,<br/>never blocks (ADR 0038)"]
        EVIDENCE["docs/env.evidence.json<br/>+ .fingerprint sidecar<br/>full EvidenceModel, always computed,<br/>independent of manifest.location - ADR 0038"]
    end

    subgraph CHECKPATH["2b - checkEnvArtifacts() (--check: compare, never write)"]
        COMPARE["recompute every requested artifact,<br/>diff against what's already on disk<br/>(generatedAt/change normalized out<br/>for the evidence artifact - ADR 0038)"]
    end

    CHECKS -- "no, writing" --> MANIFEST & DOCS & EXAMPLE & OWNERSHIP & EVIDENCE
    CHECKS -- "no, check mode" --> COMPARE

    subgraph CI["3 - CI enforcement"]
        GHACTION["GitHub Action (action.yml)<br/>env-cap --json -> PR annotations +<br/>sticky summary comment"]
        ROTATION["rotation-alert GitHub issue<br/>on scheduled/non-PR runs -<br/>opens/auto-closes on expiringSoon"]
        GHACTION --> ROTATION
    end

    COMPARE -->|exit 1 on drift| GHACTION

    subgraph STARTUP["4 - Process startup"]
        IMPORT["application imports<br/>the generated manifest"]
        VALIDATECALL["validateEnv({ manifest,<br/>values: process.env, activeContexts })"]
        PERVAR["per variable: context match?<br/>-> default -> processor -> validator<br/>-> freeze into cache"]
        ERR["EnvValidationError<br/>aggregated failures"]
        CACHED["cached validated result<br/>(one-shot per process)"]

        IMPORT --> VALIDATECALL --> PERVAR
        PERVAR -- "any invalid" --> ERR
        PERVAR -- "all valid" --> CACHED
    end

    MANIFEST --> IMPORT

    subgraph RUNTIME_ACCESS["5 - Runtime access"]
        ACCESS["feature code imports the<br/>contract it owns:<br/>paymentsEnv.STRIPE_KEY"]
        NOTREADY["EnvNotReadyError<br/>if read before validateEnv() resolves"]
    end

    CACHED --> ACCESS
    ACCESS -. "read before ready" .-> NOTREADY
```

`generateEnvArtifacts()` and `checkEnvArtifacts()` share one
`computeArtifacts()` pass (discovery, parsing, linking, and blocking-finding
checks) and only diverge at the last step: write, or compare-and-report (see
[ADR 0011](decisions/0011-shared-discovery-compute-atomic-write-non-atomic.md)
and [ADR 0016](decisions/0016-check-mode-compute-before-compare-never-partial-write.md)).
Manifest, docs, `.env.example`, the ownership report, and the persisted
evidence artifact are each optional per invocation
(`--location`/`--docs`/`--ownership`/`--evidence`) and only appear above when
requested — except the `EvidenceModel` backing that last one, which
`computeArtifacts()` always builds regardless of whether `--evidence` was
passed; the flag only controls whether it's also written to disk (ADR 0038).
Manifest compatibility/exclusive-group issues are the one category that still
blocks (`CHECKS`, ADR 0009) — a documentation or ownership issue never does;
both are surfaced as `Finding`s on the evidence artifact instead, for a team
to gate on in its own CI step if it wants that enforced. The GitHub Action wraps whichever mode a workflow invokes
`env-cap --json` with.

### 1. Author time

A feature owner creates an environment schema:

```

features/payments/env.schema.ts

```

The file defines:

- the feature's environment variables
- processing rules
- validation rules
- optional documentation metadata

Importing the file creates the contract object but does not resolve
environment values.

### 2. Build time

`generateEnvManifest()` runs as an explicit development or CI step.

It:

1. discovers schema files
2. parses their ASTs
3. links `createEnv()` and `documentEnv()` calls
4. checks for detectable issues
5. generates requested artifacts

Possible outputs include:

- environment manifests
- documentation artifacts
- `.env.example` files

This process never runs automatically during application startup.

### 3. Process startup

The application imports the generated manifest and calls:

```ts
validateEnv({ manifest, values: process.env })
```

Validation happens once for the process lifetime.

Each contract, per variable:

1. checks whether the variable's `context` matches this run's
   `activeContexts` -- if not, skips every remaining step entirely and
   moves to the next variable (see "Validation context invariants" above)
2. reads its raw value
3. applies its default
4. runs its processor
5. runs its validator
6. stores the frozen validated result

```mermaid
flowchart LR
    START(["for each variable<br/>in the contract"]) --> CTX{"has a context,<br/>and it's not in<br/>activeContexts?"}
    CTX -- "yes - skip" --> SKIP["stays not-ready,<br/>as if this run<br/>never happened"]
    CTX -- "no - participates" --> RAW["read raw value"]
    RAW --> DEFAULT["apply default"]
    DEFAULT --> PROC["run processor"]
    PROC --> VALID["run validator"]
    VALID --> FREEZE["store frozen<br/>validated result"]
```

Failures are aggregated into `EnvValidationError` rather than stopping at
the first invalid variable.

### 4. Runtime access

Feature code imports the contract it owns:

```ts
paymentsEnv.STRIPE_KEY
```

There is no global environment object.

Accessing a value before validation completes throws `EnvNotReadyError`.
Successful access returns the validated value for that specific feature
contract.

## Module layout

The `src/` tree mirrors the five entry points described above:
`runtime/`, `build/` (and `build/resolution/`), `helpers/`, `evidence/`,
`eslint-plugin/`, plus `cli/` (the `env-cap` bin) and `node/` (the
`env-cap/node` executable-context entry that ships the CLI's
concrete `BuildFileSystem` adapter as a value for a consumer's own build
script). See [The five entry points](#the-five-entry-points) for the
dependency rules between them.

## Architectural decisions

| Boundary                                                                                                               | ADR                                                                                |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| One `createEnv` vs `createEnv` + `defineEnv`                                                                           | [0001](decisions/0001-runtime-documentation-separation.md)                         |
| Parsing instead of importing schema files                                                                              | [0002](decisions/0002-static-analysis-never-execution.md)                          |
| Per-feature contracts instead of global `env`                                                                          | [0003](decisions/0003-no-global-env-object.md)                                     |
| No `/client` or `/server` package split                                                                                | [0004](decisions/0004-no-client-server-package-split.md)                           |
| Warn by default instead of throwing                                                                                    | [0005](decisions/0005-warn-not-throw-by-default.md)                                |
| Self-redacting contracts                                                                                               | [0006](decisions/0006-self-redacting-contracts.md)                                 |
| `processor` terminology instead of `transformer`                                                                       | [0007](decisions/0007-processor-not-transformer.md)                                |
| Fixed gzip size budget on runtime/helpers                                                                              | [0008](decisions/0008-gzip-size-budget.md)                                         |
| Exclusive-group violations always error                                                                                | [0009](decisions/0009-exclusive-groups-are-always-errors.md)                       |
| Dependency-ownership engine's fixed scope, internals not public                                                        | [0010](decisions/0010-dependency-ownership-engine-scope-boundary.md)               |
| Shared discovery, compute-atomic but not write-atomic `generateEnvArtifacts()`                                         | [0011](decisions/0011-shared-discovery-compute-atomic-write-non-atomic.md)         |
| Live expiration overrides via callback, not AST                                                                        | [0012](decisions/0012-live-expiration-overrides-not-ast-functions.md)              |
| `--json` CLI output is a versioned mirror                                                                              | [0013](decisions/0013-json-output-is-a-versioned-mirror.md)                        |
| Cross-package schema discovery via explicit allowlist (Experimental)                                                   | [0014](decisions/0014-cross-package-schema-discovery.md)                           |
| Post-1.0 security-fix backport window (one major back, ≥6 months, never shortened once stated)                         | [0015](decisions/0015-security-backport-window.md)                                 |
| `--check` computes fully before comparing, and never partially writes                                                  | [0016](decisions/0016-check-mode-compute-before-compare-never-partial-write.md)    |
| A 4th public entry point (`./eslint-plugin`) for a capability-owned-access lint rule                                   | [0017](decisions/0017-eslint-plugin-entry-point.md)                                |
| Rotation-alert GitHub issue on non-PR Action runs (opens/auto-closes based on expiringSoon)                            | [0018](decisions/0018-rotation-alert-issue-on-non-pr-runs.md)                      |
| The published `--json` schema is generated from types, never hand-authored                                             | [0019](decisions/0019-published-json-schema-generated-from-types.md)               |
| Declaration maps emitted by a separate `tsc` pass, not tsup's own `dts` pipeline                                       | [0020](decisions/0020-declaration-maps-via-separate-tsc-pass.md)                   |
| The manifest change report is a persisted, committed JSON sidecar snapshot                                             | [0021](decisions/0021-manifest-change-report-persisted-snapshot.md)                |
| Generic, declarative validation contexts (`context`/`activeContexts`)                                                  | [0022](decisions/0022-validation-contexts.md)                                      |
| TypeScript path-alias resolution, on by default (Experimental)                                                         | [0023](decisions/0023-tsconfig-path-alias-resolution.md)                           |
| Seven canonical fact models (Contract/Dependency/Ownership/Lifecycle/Finding/Change/Evidence), not thirty-five reports | [0024](decisions/0024-fact-model-architecture.md)                                  |
| Contract Model is a new, versioned JSON projection, published alongside the manifest                                   | [0025](decisions/0025-contract-model-json-projection.md)                           |
| Finding Model unifies four independently-shaped finding families                                                       | [0026](decisions/0026-finding-model-unifies-four-families.md)                      |
| Dependency Model publishes a fact-shaped result, not the scanning engine                                               | [0027](decisions/0027-dependency-model-fact-shape-not-engine-access.md)            |
| Ownership Model shares one effectiveOwner() rule, fixing a pre-existing divergence                                     | [0028](decisions/0028-ownership-model-shared-effective-owner.md)                   |
| Lifecycle Model adds deprecation/rename fields, promotes ExpiringEntry                                                 | [0029](decisions/0029-lifecycle-model-deprecation-rename-fields.md)                |
| Change Model wraps the existing manifest change report                                                                 | [0030](decisions/0030-change-model-wraps-manifest-change-report.md)                |
| A 5th public entry point (`./evidence`) for Evidence Model projections                                                 | [0031](decisions/0031-evidence-entry-point.md)                                     |
| Evidence projection provenance via a non-frozen Proxy tracking membrane, not `Object.freeze()`                         | [0032](decisions/0032-evidence-projection-provenance-mechanism.md)                 |
| The ten first-party reference projections live in examples/, not src/                                                  | [0033](decisions/0033-reference-projections-live-in-examples.md)                   |
| `computeArtifacts()` always builds a real `EvidenceModel`; `ManifestSnapshot` retires; docs/ownership never throw      | [0038](decisions/0038-always-computed-evidence-model-backs-generate-check-docs.md) |
| Usage scanner follows object-destructuring + one-level `const` aliasing; every other shape is an explicit `escape`     | [0039](decisions/0039-scanner-local-dataflow-boundary.md)                          |
| Library surfaces (`./build`) never import `node:fs`; a caller supplies a `BuildFileSystem`                             | [0040](decisions/0040-library-surfaces-do-not-acquire-node-fs.md)                  |
