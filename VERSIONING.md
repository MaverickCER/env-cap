# Versioning and API stability

Every entry point is Stable, and two baseline checks enforce the release level a change needs. Before 1.0, a breaking change needs only a minor release. `env-cap` follows [Semantic Versioning](https://semver.org/).

## Tiers

| Tier         | What a release may do                                                 | Enforced by                                                                                           |
| ------------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Stable       | A breaking change needs a major release from 1.0 (a minor before 1.0) | `ApiContract` and `SurfaceContract` diff against committed baselines and require a matching changeset |
| Experimental | May change shape in any release, including a patch                    | Labelled in this document, the option's TSDoc and its ADR. Nothing ships Experimental today           |
| Private      | May change at any time without notice                                 | Not exported from `package.json#exports`; no check needed                                             |

## Every entry point and its tier

Generated from `package.json#exports` and `docs/surface.json` by `internal-package-contract generate`; the `GeneratedRegions` check fails if it is stale.

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

## What the Stable tier covers

| Surface                                                                                                                                                                                    | Checked by                                                                                                   | Limit                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime APIs: `createEnv`, `validateEnv`, `documentEnv`, `resetEnvCache`, `isEnvContract`, the error classes                                                                               | `ApiContract` (runtime baseline)                                                                             | Signatures, not behaviour; tests cover behaviour                                                                                         |
| The four `generate*()` functions, their options, and the lower-level `./build` primitives such as `discoverSchemaFiles`, `parseSchemaFile`, `generateEvidenceModel` and `getEvidenceModel` | `ApiContract` (build baseline)                                                                               | The dependency-ownership engine's internals are Private ([ADR 0010](specs/decisions/0010-dependency-ownership-engine-scope-boundary.md)) |
| `@maverickcer/env-cap/helpers`, `/evidence`, `/node` and `/eslint-plugin` exports, including rule names, options and the default allow list                                                | `ApiContract` (one baseline per entry)                                                                       | None found                                                                                                                               |
| CLI flags in `env-cap --help`, and the exit codes                                                                                                                                          | `SurfaceContract`                                                                                            | None found                                                                                                                               |
| The `--json` report and the published JSON Schema (`@maverickcer/env-cap/schema`)                                                                                                          | `SurfaceContract` diffs the schema; the `Schema` check fails if it is not regenerated from `src/cli/json.ts` | A changed or removed field is meant to bump `schemaVersion`. No check ties a shape change to that bump yet                               |
| The persisted evidence file, a serialization of `EvidenceModel`                                                                                                                            | `ApiContract` (evidence baseline) for the type                                                               | The committed evidence of two examples validates against the schema; a freshly written file is not checked                               |
| The generated manifest's shape                                                                                                                                                             | Tests in `test/build/manifest.test.ts`                                                                       | No baseline diff                                                                                                                         |
| The `envCap.schema` field in a package's `package.json`, and the `packages` and `tsconfig` options                                                                                         | Tests in `test/build/resolution/`                                                                            | No baseline diff for the field                                                                                                           |
| The files and templates `env-cap init` writes                                                                                                                                              | `test/cli/init.test.ts` pins the exact templates                                                             | None found                                                                                                                               |
| The GitHub Action's input names and defaults                                                                                                                                               | `SurfaceContract`                                                                                            | Input descriptions and the summary comment's sections are not baselined                                                                  |
| The supported toolchain: Node.js `>=22` and `moduleResolution` `node16`, `nodenext` or `bundler`                                                                                           | `EngineMatrix` (Node 22 and 24) and `TypeResolution`                                                         | Node 26 runs as an informational job                                                                                                     |
| TypeScript 5, 6 and 7 for type-checking every entry point except `./eslint-plugin`, under `strict` and full library checking                                                               | `scripts/typescript-compat.mjs` in CI                                                                        | CI installs the newest 5.x, 6.x and 7.x only, and that job does not yet block a merge                                                    |

The Action is used through a major tag: `uses: maverickcer/env-cap@v0` while the package is `0.x`, `@v1` from 1.0.0. That tag moves only within a major version.

The scanner needs TypeScript's classic compiler API, which TypeScript 7 does not ship. It uses your `typescript` when that has the API, and the bundled TypeScript 6 otherwise. Your `tsc` stays TypeScript 7 ([ADR 0049](specs/decisions/0049-typescript-7-scanner-uses-a-bundled-typescript-6.md)).

Everything above was promoted from Experimental in [ADR 0045](specs/decisions/0045-promote-experimental-surfaces-to-stable.md).

## Experimental

A surface ships Experimental when it is new enough that real use may show a better shape. It is labelled here, in the option's TSDoc, and in the ADR that introduces it. After one feedback cycle without a break, its ADR moves to Accepted and it becomes Stable.

Nothing ships Experimental today.

## Private

Never covered by semver:

- Modules and functions not re-exported from an entry point in `package.json#exports`.
- How `src/build/parse.ts` walks a source file.
- The dependency-ownership engine (`scan-dependencies.ts`, `dependency-graph.ts`).
- Behaviour not documented in the README, the Guide, a TSDoc comment on a public export, or an ADR.

## Pre-1.0 status

`env-cap` has not reached 1.0. Before 1.0, **a minor release may include a breaking change to the Stable tier.** This document defines the scope the 1.0 promise will cover.

How a `0.x` release level is chosen:

1. For changesets it generates from commit messages, the release tooling lowers each level by one below 1.0: a breaking commit releases a minor, a `feat` commit a patch. A hand-written changeset is released at the level it names.
2. The `ApiContract` check requires only a minor for a breaking API diff.
3. Commit-generated bumps stop below 1.0.0. Crossing it takes a hand-written `major` changeset, and the workflow only posts a notice when its release pull request is opened. A person merges every release pull request.

Experimental and Private tiers behave the same before and after 1.0.

[`SECURITY.md`](SECURITY.md#supported-versions) covers the separate question of which versions get security fixes.
