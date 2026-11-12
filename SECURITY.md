# Security policy

env-cap's runtime refuses filesystem access, ambient environment reads, network access and values in errors. Each row below names the check that enforces a refusal and where it stops.

The short version of each runtime rule, with its test, is in the [Guide's security model](GUIDE.md#security-model).

## Reporting a vulnerability

Report a suspected vulnerability privately through a [GitHub security advisory](https://github.com/maverickcer/env-cap/security/advisories/new). Private vulnerability reporting is enabled on the repository.

You can also contact the maintainer at the address on the npm package page.

Please do not open a public issue for a suspected vulnerability before it has been triaged.

## Disclosure

This is maintainer policy, not a mechanism.

1. Reports are handled in private until disclosure no longer helps an attacker.
2. A report is acknowledged, assessed, and prioritized by severity, exploitability and impact. Acknowledgement does not mean it is accepted or that a fix is possible.
3. When a fix exists, an advisory on this repository names the affected and patched versions, the severity, the mitigations, and whether exploitation is known.
4. An advisory never includes a working exploit.
5. If a vulnerability is exploited, or a fix cannot ship promptly, users get mitigations before the fix.
6. Resolved advisories stay public.

## Runtime security model

The runtime is the package root (`createEnv`, `validateEnv` and the rest). It processes and validates values you pass in; it is not a secret manager.

| The runtime does not                      | Enforced by                                                                                                                          | Where it blocks    | Limit                                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ------------------------------------------------------------------------------------------ |
| Touch the filesystem                      | ESLint bans `node:fs` and `node:child_process` in `src/` outside `src/cli`; the `AmbientCapabilities` check scans the packed tarball | `lint`, `contract` | The tarball scan is textual and skips bundled dependencies                                 |
| Read `process.env`                        | `AmbientCapabilities` allows `process.env` only in the CLI and the ESLint plugin; the browser-bundle test rejects `process.`         | `contract`         | Textual; `globalThis["process"]` would evade both                                          |
| Import a Node module or use a Node global | `test/runtime/browser-bundle.test.ts` bundles the runtime for the browser and checks the output                                      | `contract`         | A third-party import would be bundled without failing the test                             |
| Open a network connection                 | The `ipc/no-network` lint rule on env-cap's own `src/`                                                                               | `lint`, `contract` | Source lint only. It does not cover the bundled TypeScript compiler                        |
| Show values when a contract is logged     | `test/runtime/create.test.ts`: `console.log`, `String()`, `JSON.stringify` and template interpolation print a redacted marker        | `contract`         | Spreading a contract or calling `Object.entries()` on it reads every value                 |
| Put values in errors                      | `test/runtime/validate.test.ts`: errors carry variable names, contract names and your messages                                       | `contract`         | A message your own validator or processor builds from the value is passed through verbatim |
| Store, fetch or rotate secrets            | No such code exists                                                                                                                  | None               | A statement about the source, not a check                                                  |

Three more runtime properties matter to a reviewer:

- **Values stay in memory.** The record of validated values is frozen and kept for the life of the process. The freeze is shallow: an object, array or `URL` a processor returns stays mutable.
- **Documentation is inert.** `documentEnv()` has no runtime effect (`test/runtime/document.test.ts`). Fields such as `expiresAt` are read only by the build-time analysis.
- **Contracts hold only what validation needs:** `default`, `processor`, `validator`, `context`, and a name for error messages.

## Dual-package hazard

The runtime keeps state in module scope: the registry that links a contract to its schema (`src/runtime/registry.ts`) and the validation cache (`src/runtime/cache.ts`). If one dependency loads the ESM build and another the CommonJS build, Node creates two separate copies of that state.

No package that ships both formats can prevent this. env-cap makes the failure loud instead ([ADR 0041](specs/decisions/0041-dual-package-hazard-checked-documented.md)):

1. A contract from one copy, passed to `validateEnv()` or `resetEnvCache()` from the other, throws a `TypeError`.
2. `isEnvContract()` from the other copy returns `false`.
3. Nothing validates against the wrong schema or reads a stale cache.

`test/runtime/dual-package-hazard.test.ts` pins these results on the built `dist/` files, in one Node process. Keep each `createEnv()` call and the `validateEnv()` call that consumes it on the same import style.

## Build-time security model

The build entry (`./build`, the CLI and the Action) analyzes source. It does not run it.

| The build step                                                                     | Enforced by                                                                                                               | Limit                                                                                                                   |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Never imports, requires or evaluates a schema file                                 | `test/build/parse.test.ts` (a throwing top-level statement never runs); ESLint bans `eval` and `new Function` in `src/`   | Lint does not ban `import()`, `require()`, `vm` or workers in `src/build`; [CODE_REVIEW.md](CODE_REVIEW.md) covers them |
| Resolves only literal values and reports the rest as unresolved                    | `test/build/parse.test.ts`, `test/build/literal-eval.test.ts`                                                             | None found                                                                                                              |
| Rejects an output path that is absolute outside the root or climbs out with `..`   | `test/build/manifest-generate.test.ts`, `test/build/documentation-generate.test.ts`, `test/build/check-artifacts.test.ts` | The check is lexical. A symlinked directory inside the root can still lead outside it                                   |
| Never overwrites an existing `.env.example` by default                             | `test/build/env-example.test.ts` (it writes a timestamped sibling)                                                        | `onExisting: "overwrite"` opts out                                                                                      |
| Never descends into `node_modules` or `.git`, whatever `include` and `exclude` say | `test/build/discover.test.ts`                                                                                             | None found                                                                                                              |
| Reads a listed package's schema without walking its directory                      | `test/build/resolution/resolve-package-schema.test.ts`                                                                    | Only packages you name in `packages`                                                                                    |
| Never resolves a path alias into `node_modules`                                    | `src/_ipc/resolve-tsconfig-paths.ts`, tested in internal-package-contract; `ManagedFiles` keeps the copy identical        | The copy is outside env-cap's own coverage and mutation runs                                                            |
| Never imports `node:fs`                                                            | ESLint, and `AmbientCapabilities`; the caller passes a `BuildFileSystem`                                                  | Textual scan                                                                                                            |

A rejected output path fails before anything is written. A direct call throws that pass's error type. Through `generateEnvArtifacts()` or the CLI, the failure is collected into `EnvProjectGenerationError`.

**Cross-package discovery** reads a schema from an installed dependency only when you name that package in `packages` ([ADR 0014](specs/decisions/0014-cross-package-schema-discovery.md)). For each named package it reads one `package.json`, then one declared file. That file must be a `.ts` or `.tsx` file inside the package, not a symlink out of it, and under a size cap. It never calls `readdir`, and it never follows a package's own dependencies.

**Path-alias resolution** reads `compilerOptions.paths` and `baseUrl` and is on by default ([ADR 0023](specs/decisions/0023-tsconfig-path-alias-resolution.md)). A result inside `node_modules` is discarded, so only `packages` can reach installed code.

## Application responsibilities

These stay with you:

- **Keep secrets out of documentation.** `documentEnv()` values are ordinary source. If a schema file reaches a browser bundle, its descriptions, runbook links and notes ship with it.
- **Write safe validators.** A message such as `` `Invalid value: ${value}` `` exposes the value wherever the error is logged. env-cap passes your message through unchanged.
- **Do not spread contracts.** Spreading one reads every value into a plain object.
- **Store and rotate secrets elsewhere.** env-cap validates values after your infrastructure supplies them.
- **Treat validation contexts as filters.** A context decides whether a run validates a variable. It is not access control and not a bundling boundary ([ADR 0022](specs/decisions/0022-validation-contexts.md)).

## Supply-chain posture

What a reviewer of the build and publish pipeline can rely on:

| Control                                                                                                                       | Mechanism                                                                                                     | Limit                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `main` requires a pull request, resolved review threads, and the `contract` and `lint` checks                                 | Ruleset; `BranchProtection` check                                                                             | Admins can bypass; no approving review is required                                                        |
| Releases publish over npm OIDC trusted publishing with a provenance attestation                                               | `.github/workflows/release.yml` and the shared release workflow it calls; the repository holds no `NPM_TOKEN` | A manual last-resort publish ([RELEASING.md](RELEASING.md)) carries no attestation                        |
| The release checks that npm serves the version with its attestation                                                           | The release workflow's final verification step                                                                | It reports a failure; it cannot unpublish                                                                 |
| A release publishes only a tree whose `contract` job passed, after `npm run verify` and an install-and-import of that tarball | The shared release workflow                                                                                   | It looks at `contract`, not `required`. No env-cap release has run on this workflow version yet           |
| A person merges every release pull request                                                                                    | The Changesets flow; release pull requests are never merged automatically                                     | An admin can merge a `major` changeset; the workflow only posts a notice                                  |
| Version tags `v<x.y.z>` cannot be moved or deleted                                                                            | A tag ruleset on `refs/tags/v*.*.*`                                                                           | Admins can bypass rulesets. The floating `v0` tag moves on each release by design                         |
| Production dependency licences, `npm audit` and Socket alerts are reviewed                                                    | The `Licenses`, `SecurityDeps` and `SecuritySocket` checks in `contract`; each accepted alert needs a record  | Socket alerts on the bundled compiler (network, shell, environment, filesystem) are recorded, not removed |
| No secrets are committed                                                                                                      | The `SecuritySecrets` check                                                                                   | Pattern-based                                                                                             |
| A pull request with an open code-scanning alert on its ref fails                                                              | The `CodeScanning` check                                                                                      | Alerts that exist only on `main`, such as Scorecard's, are not visible to a pull request                  |
| Shipped JavaScript is unminified, and every URL in `dist/` has a reviewed record                                              | The `NoMinify` and `DistNoUrls` checks                                                                        | None found                                                                                                |
| Coverage stays above fixed floors                                                                                             | `vitest.config.ts` thresholds, enforced in `contract`                                                         | A pull request can lower a floor; reviewers treat that as a reviewed change                               |

The runtime, helpers and evidence entries also run under Bun and Deno (`test/cross-runtime/`). That job does not yet block a merge. The build entry and the CLI are Node-only.

[RELEASING.md](RELEASING.md#first-time-setup) describes the one-time trusted-publisher setup.

## Supported versions

This is maintainer policy, not a mechanism.

**Before 1.0:** security fixes go to the latest published `0.x` only. There is no long-term-support branch. Upgrading to the latest `0.x` is the only supported fix.

**From 1.0:** security fixes will be backported to the previous major's latest minor for at least six months after a new major ships. The maintainer may extend that window. Once an end date is stated for a major, it will not be shortened.

This commitment covers a future release line and has not been exercised yet. [ADOPTION.md](ADOPTION.md#versioning-stability-and-long-term-support) explains how to weigh it.
