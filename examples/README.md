# Examples

Each example is a runnable project that answers one question. Read the first three in order; each assumes the one before it.

| Example                                                                                              | Question it answers                 | Who it is for                           |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------- | --------------------------------------- |
| [application](https://github.com/MaverickCER/env-cap/tree/main/examples/application)                 | How does this make my code better?  | A developer with one central `env.ts`   |
| [team-service](https://github.com/MaverickCER/env-cap/tree/main/examples/team-service)               | How does this help my team?         | A team with several features and owners |
| [enterprise-platform](https://github.com/MaverickCER/env-cap/tree/main/examples/enterprise-platform) | How does this help my organization? | Platform engineers and reviewers        |
| [nextjs-app](https://github.com/MaverickCER/env-cap/tree/main/examples/nextjs-app)                   | Does it work inside a framework?    | Next.js developers                      |

## Before you run one

Each example installs the package from this repository (`file:../..`), so build it first:

```bash
npm ci && npm run build        # in the repository root
cd examples/<name> && npm ci
```

Each example's README names the command, the expected exit code, and the line of output to look for. Each example commits a `.env` with placeholder values, so it runs as checked out.

## What CI checks

CI's `examples` job runs every example against the freshly built package:

| Example               | What the job runs                                                          | Test                                        |
| --------------------- | -------------------------------------------------------------------------- | ------------------------------------------- |
| `application`         | `npm run typecheck`, `npm start`, `npm run check`                          | `test/examples/application.test.ts`         |
| `team-service`        | `npm run typecheck`, `npm start`, `npm run check`, a drift test            | `test/examples/team-service.test.ts`        |
| `enterprise-platform` | `npm run typecheck`, `npm run test:evidence`, `npm start`, `npm run check` | `test/examples/enterprise-platform.test.ts` |
| `nextjs-app`          | `npm run build`                                                            | The job step itself                         |

The job also re-runs the root README's demo against `application` (`npm run verify:readme-example`). It runs on every pull request. The branch ruleset does not yet require it, so a red `examples` job does not block a merge on its own.

## Looking for something specific?

The examples are for people exploring env-cap. Most other behaviours have a fixture under [`test/integration/`](https://github.com/MaverickCER/env-cap/tree/main/test/integration): the packaged CLI, cross-package discovery, path aliases, `liveExpirationDates`, validation contexts and more. Each fixture's `package.json` `description` says what it proves.

## Golden regression testing

None of the examples keeps an `expected/` tree of env-cap output. `enterprise-platform/expected/output.json` is that example's own smoke-test fixture. The committed `docs/`, `.env.example` and `src/generated/env.manifest.ts` are the golden output. Each example's `check` script recomputes them and compares, without writing:

| Command         | Exit code | Line of output                            |
| --------------- | --------- | ----------------------------------------- |
| `npm run check` | `0`       | `All generated artifacts are up to date.` |
| `npm run check` | `1`       | A line containing `stale or missing`      |

The integration fixtures under `test/integration/` keep `expected/` directories, because a side-by-side diff of generator output is their purpose. CI's `integration-fixtures` job regenerates each one and compares byte for byte. It ignores generation timestamps and the "expiring soon" annotations, which change with the date.

When a change alters generated output on purpose, regenerate everything and read the diff:

```bash
npm run examples:update-golden
```

This is a deliberate human step. It is not part of `npm run verify` or CI, so a regression is never re-goldened silently.

## Looking for the benchmarks?

They live in [`/benchmarks`](../benchmarks/), with methodology in [`benchmarks/README.md`](../benchmarks/README.md).
