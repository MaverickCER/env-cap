# Adoption guide

Adopting `env-cap` costs a build step and a declaration per variable; it needs Node 22 and npm. The sections below list each cost, need and refusal, with the check behind it.

## What problem this solves

Validation libraries answer one question: is this value well-formed? They do not say which team owns `STRIPE_WEBHOOK_SECRET`, what breaks if it disappears, or whether anything still reads it. `env-cap` lets each capability declare the variables it consumes. A build-time analysis then reports owners, expiry dates and declared variables that nothing reads.

[`specs/migrations/README.md`](specs/migrations/README.md) compares it with each tool you may have, and says when not to switch.

## What it costs

| Cost                       | Detail                                                                                                                     |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| A build step               | The CLI or a script runs in development and CI to write the manifest your startup code imports                             |
| A declaration per variable | `createEnv()` for validation and `documentEnv()` for owners and dates. Reports are only as accurate as these declarations  |
| Committed generated files  | The manifest and the evidence file are committed, so changes show up as reviewable diffs                                   |
| Install weight             | A TypeScript 6 compiler, bundled in the tarball and used only by the build entry ([details](#bundle-size-and-performance)) |
| Runtime weight             | The runtime entry stays under 3 KB gzip, helpers under 4 KB and evidence under 3 KB, enforced by the `Size` check          |
| Pre-1.0 churn              | A minor release may break the Stable tier before 1.0 ([versioning](#versioning-stability-and-long-term-support))           |

## What it needs

- Node.js `>=22`. CI tests 22 and 24 in blocking jobs.
- npm. pnpm, Yarn 1 and Yarn Berry are tested only for installing the tarball and importing every entry. That job does not yet block a merge.
- TypeScript `moduleResolution` set to `node16`, `nodenext` or `bundler` if you type-check against the subpath exports.
- Your own TypeScript is optional. The build entry uses it when it is version 5 or 6, and the bundled TypeScript 6 otherwise.
- Schemas written as static object literals. A schema built by a function, or a spread at the top of a schema object, produces a parse warning. A spread nested inside a variable's definition or its `documentEnv()` entry is skipped without one. Nothing is guessed.

## What it refuses to do

| It will not                                                  | Enforced by                                                           | Limit                                                                           |
| ------------------------------------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Load `.env` files or store, fetch or rotate secrets          | No such code exists; keep `dotenv` and your secret manager            | Not a check                                                                     |
| Run your schema files during analysis                        | `test/build/parse.test.ts`: a throwing top-level statement never runs | Lint does not ban `import()` or `vm` in `src/build`; review covers that         |
| Touch the filesystem from the runtime                        | Lint, and the `AmbientCapabilities` scan of the packed tarball        | The scan is textual and skips bundled dependencies                              |
| Read `process.env` in the runtime                            | The `AmbientCapabilities` scan and the browser-bundle test            | Textual; an indirect reference would evade both                                 |
| Put a value in an error message                              | `test/runtime/validate.test.ts`                                       | Your own validator or processor message is passed through                       |
| Guess a value it cannot resolve statically                   | `test/build/parse.test.ts`, `test/build/literal-eval.test.ts`         | None found                                                                      |
| Walk `node_modules` during discovery                         | `test/build/discover.test.ts`                                         | Packages you list in `packages` are read, one file each                         |
| Fail a run on documentation or ownership findings by default | `test/cli/main.test.ts`, `test/build/generate-env-artifacts.test.ts`  | Exclusive-group violations and conflicting explicit processor types always fail |

## Security & threat model

Full detail is in [`SECURITY.md`](SECURITY.md). The summary a reviewer needs:

- **The runtime imports no Node module.** The browser-bundle test rejects a `node:` import, a Node built-in `require`, `process.` or `Buffer.` in the bundle. It does not fail on a third-party import, which would be bundled silently.
- **The compiler stays out of the runtime.** `internal-package-contract tool compiler-isolation` fails the build if any runtime entry can reach the bundled compiler ([ADR 0049](specs/decisions/0049-typescript-7-scanner-uses-a-bundled-typescript-6.md)). It reads the static import graph of `dist/` only.
- **Contracts redact themselves** under `console.log`, `String()`, `JSON.stringify` and template interpolation (`test/runtime/create.test.ts`, [ADR 0006](specs/decisions/0006-self-redacting-contracts.md)). Spreading a contract reads every value.
- **Cross-package discovery is opt-in.** It reads only packages you name, one `package.json` and one declared file each. It rejects symlink escapes and oversized files ([ADR 0014](specs/decisions/0014-cross-package-schema-discovery.md)).
- **Path-alias resolution never lands in `node_modules`.** It is on by default, and any result inside `node_modules` is discarded ([ADR 0023](specs/decisions/0023-tsconfig-path-alias-resolution.md)).
- **No outbound network in env-cap's own code.** The `ipc/no-network` lint rule covers `src/`. It does not cover the bundled TypeScript compiler, which Socket flags for network access.

What installing the package adds, generated from `package.json` and `docs/surface.json`:

<!-- ipc:begin dependencies -->

Installing `@maverickcer/env-cap` installs 1 package directly, and whatever it depends on. It names 3 optional peers, which you install yourself when you use the part that needs them.

| Package                    | Kind          | Range                              | Why                                                                                                                                                                                                           |
| -------------------------- | ------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@typescript/typescript6`  | dependency    | `^6.0.2`                           | The TypeScript 6 compiler the build entry parses schemas with when the project's own TypeScript is 7 or missing (ADR 0049). Bundled inside the tarball. No runtime entry can reach it (`compiler-isolation`). |
| `@typescript-eslint/utils` | optional peer | `^8.0.0`                           | Only for `@maverickcer/env-cap/eslint-plugin`; projects linting TypeScript already have it through `typescript-eslint`.                                                                                       |
| `eslint`                   | optional peer | `^8.57.0 \|\| ^9.0.0 \|\| ^10.0.0` | Only for `@maverickcer/env-cap/eslint-plugin`, which runs inside the project's own ESLint. CI runs the rules on ESLint 10 only.                                                                               |
| `typescript`               | optional peer | `^5.0.0 \|\| ^6.0.0 \|\| ^7.0.0`   | The project's own compiler, used by the build entry instead of `@typescript/typescript6` when it is version 5 or 6. CI tests the newest 5.x, 6.x and 7.x, not the 5.0 floor.                                  |

<!-- ipc:end dependencies -->

**Supply chain.** A merge to `main` requires a pull request, resolved review threads, and the `contract` and `lint` checks. The ruleset and the `BranchProtection` check enforce that; admins can bypass, and no approving review is required. These gates run in the `contract` job:

- Typecheck, lint, tests with coverage floors, zero surviving mutants, and size budgets.
- Production dependency licences, `npm audit` and Socket alerts, each with a reviewed record when accepted.
- An install-and-import of the packed tarball, for every entry except `./eslint-plugin`.

Releases publish from CI over npm OIDC with a provenance attestation, so you can check that a version was built by this repository's workflow. The Bun and Deno runs, the examples and the package-manager smoke test run in CI but do not yet block a merge.

## Versioning, stability, and long-term support

[`VERSIONING.md`](VERSIONING.md) lists every entry point and its tier. Every entry point is Stable today, and nothing ships as Experimental ([ADR 0045](specs/decisions/0045-promote-experimental-surfaces-to-stable.md)). The `ApiContract` and `SurfaceContract` checks diff the public surface against committed baselines and require a changeset at the matching level. Before 1.0, a breaking change needs only a minor release.

**Long-term support, stated plainly.** env-cap has not reached 1.0. Security fixes target the latest `0.x` only, and there is no backport branch. From 1.0, [`SECURITY.md`](SECURITY.md#supported-versions) commits to backporting security fixes to the previous major's latest minor for at least six months. That is a policy for a future release line; it has not been exercised. An organization with a backport requirement today should treat this as a real limitation.

Releases are automated after a person merges the release pull request ([RELEASING.md](RELEASING.md)). Commit-generated bumps stop below 1.0.0. Crossing it takes a hand-written `major` changeset, and the workflow only posts a notice when its release pull request is opened.

## Bundle size and performance

| Entry point   | Gzip budget | Enforced by                                                              |
| ------------- | ----------- | ------------------------------------------------------------------------ |
| `.` (runtime) | 3 KB        | The `Size` check in `contract`, and the release build's `npm run verify` |
| `./helpers`   | 4 KB        | The same                                                                 |
| `./evidence`  | 3 KB        | The same                                                                 |

Each budget measures the entry's own file, not your bundle. The release publishes with `--ignore-scripts`, so the budget blocks through those two steps, not `prepublishOnly` ([ADR 0008](specs/decisions/0008-gzip-size-budget.md)).

`sideEffects: false` is set, and a test bundles the real `dist/helpers.js` with esbuild to check that unused helpers are dropped (`test/helpers/tree-shaking.test.ts`). Other bundlers are not tested.

The install includes the bundled TypeScript 6 compiler. No check measures its size, so run `npm pack --dry-run` on the version you evaluate. Only the build entry loads it, in development and CI.

## Architectural decisions worth knowing before you adopt

| Decision                                     | What it means for you                                                                                                             | ADR                                                                                                                              |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| No global `env` object                       | Each capability reads only the contract it owns                                                                                   | [0003](specs/decisions/0003-no-global-env-object.md)                                                                             |
| One runtime, no `/client` or `/server` split | The same runtime entry serves server and browser code. Browser use is tested in a Web-globals VM, not a real browser              | [0004](specs/decisions/0004-no-client-server-package-split.md)                                                                   |
| Warn, not throw, by default                  | No documentation or ownership finding fails a run until a team passes a `--strict*` flag                                          | [0005](specs/decisions/0005-warn-not-throw-by-default.md), [0044](specs/decisions/0044-strict-escalates-every-warning-family.md) |
| Exclusive-group violations are always errors | Two active contracts in one exclusive group fail the build, whatever the flags                                                    | [0009](specs/decisions/0009-exclusive-groups-are-always-errors.md)                                                               |
| `--json` output is versioned and additive    | New fields can appear in any release. A removed or changed field is meant to bump `schemaVersion`, but no check enforces that yet | [0013](specs/decisions/0013-json-output-is-a-versioned-mirror.md)                                                                |

The full list is in [`specs/architecture.md`](specs/architecture.md).

## Migration cost from what you likely have today

| Coming from                      | Migration guide                                                           | One-line take                                                                        |
| -------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Raw `process.env`                | [from-process-env.md](specs/migrations/from-process-env.md)               | The lowest-friction start; adds validation and ownership where there was none        |
| `dotenv`                         | [from-dotenv.md](specs/migrations/from-dotenv.md)                         | `dotenv` still loads `.env` files; `env-cap` validates and documents what is in them |
| `zod`-based validation           | [from-zod.md](specs/migrations/from-zod.md)                               | Keep Zod; adopt `env-cap` only if ownership, not validation, is the pain             |
| `envalid`                        | [from-envalid.md](specs/migrations/from-envalid.md)                       | Similar validation; the difference is per-capability ownership                       |
| `t3-env`                         | [from-t3-env.md](specs/migrations/from-t3-env.md)                         | Both are type-safe; `t3-env` centralizes and `env-cap` does not                      |
| A hand-rolled centralized schema | [from-centralized-schema.md](specs/migrations/from-centralized-schema.md) | The closest fit for what this package changes                                        |

Each guide has a section on when to keep what you have.

## Questions this document does not answer

There is no formal SLA, and no support commitment beyond [`SUPPORT.md`](SUPPORT.md) and [`SECURITY.md`](SECURITY.md). The generated documents support a review; they do not establish that any standard is met. Open an issue if you need something this document does not cover.
