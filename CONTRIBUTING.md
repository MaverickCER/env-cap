# Contributing to env-cap

A change needs a branch, tests, a changeset and green `contract` and `lint` checks. The steps below go from clone to merge; [CODE_REVIEW.md](CODE_REVIEW.md) covers the reviewer's side.

## Development setup

```bash
git clone https://github.com/maverickcer/env-cap.git
cd env-cap
npm run setup   # install, build, regenerate the schema, and install the git hooks
```

`npm run setup` installs the optional shared git hooks (`internal-package-contract install-hooks`):

| Hook       | What it runs                                              |
| ---------- | --------------------------------------------------------- |
| pre-commit | The contract checks the staged change can reach           |
| pre-push   | Most of the contract, without Coverage, Crap and Mutation |
| commit-msg | The Conventional Commits format check                     |

The hooks are a convenience and can be bypassed. CI is the gate.

## Local checks

`npm run verify` runs what CI's `verify` and `lint` jobs run, plus the schema and README-example checks:

```bash
npm run verify   # typecheck, lint, format, build, schema, coverage, size, ambient, isolation, API-report and README-example checks
```

The `contract` job runs `npm run contract` on top of it. Run single steps when you need them:

| Command                   | What it does                                                   |
| ------------------------- | -------------------------------------------------------------- |
| `npm run typecheck`       | Type-check the repository                                      |
| `npm run build`           | Build `dist/`                                                  |
| `npm test`                | Run the tests once; `npm run test:watch` keeps them running    |
| `npm run test:coverage`   | Run the tests with the coverage floors from `vitest.config.ts` |
| `npm run lint`            | Run ESLint                                                     |
| `npm run size`            | Check the gzip budgets in `ci/size-budgets.mjs`                |
| `npm run docs:api`        | Generate the TypeDoc site into `docs/api/`                     |
| `npm run docs:api:report` | Regenerate the Markdown API report in `docs/api-report/`       |
| `npm run contract`        | Run the whole contract; add `-- --checks A,B` for named checks |

### Working with `examples/`

Each example under [`examples/`](examples/) is its own npm project; run `npm install` inside it. None of the examples keeps an `expected/` tree of env-cap output. `enterprise-platform/expected/output.json` is that example's own smoke-test fixture. Their committed `docs/`, `.env.example` and `src/generated/env.manifest.ts` are the golden output, and each example's `check` script compares them with a fresh run ([examples/README.md](examples/README.md#golden-regression-testing)).

The integration fixtures under `test/integration/` keep `expected/` directories. When your change alters generated output on purpose, regenerate everything and read the diff:

```bash
npm run examples:update-golden
```

## Making a change

1. Branch from `main`.
2. Make your change. If it touches a surface in [`VERSIONING.md`](VERSIONING.md)'s Stable tier, decide whether it is breaking, additive or a fix.
3. Add or update tests. `npm run test:coverage` fails below the floors in `vitest.config.ts`. Floors are raised in review when coverage improves. Lowering one is a reviewed change, never a silent one.
4. Run `npx changeset` and describe what changes for someone who installs the package. Pick `patch`, `minor` or `major` by [`VERSIONING.md`](VERSIONING.md). If you add none, the release workflow generates one from `feat`, `fix`, `perf` and `revert` commit messages; other types release nothing.
5. Open a pull request. A merge needs the `contract` and `lint` checks; `contract` fails when `verify` or `lint` fails.

CI also runs the Bun and Deno suite, the examples, the integration fixtures, `typescript-5`, `typescript-compat` and the package-manager smoke test. The `required` check waits for all of them. The branch ruleset does not yet require `required`, so those jobs do not yet block a merge. Treat a red one as blocking anyway.

`benchmark-pr` needs the same care. A failure there skips `lint`, `verify` and `contract`, which GitHub then counts as passing; check it by hand.

## Adding an Architecture Decision Record (ADR)

`specs/decisions/` records why the project is shaped the way it is. `specs/architecture.md` summarizes the current state. Add an ADR when a change:

- introduces a constraint or guarantee an application could rely on, such as "warn, not throw, by default";
- closes off an approach a future contributor might reintroduce without knowing it was rejected; or
- moves the boundary of what the runtime, build or helpers entry points are responsible for.

A one-line fix or an internal refactor with no observable change needs no ADR.

**Numbering:** run `npx internal-package-contract new` for the next unused number and the sections. Never reuse a number, even if its file is missing.

**Structure**, from the existing ADRs (see `0002-static-analysis-never-execution.md` or `0009-exclusive-groups-are-always-errors.md`):

```markdown
# NNNN: <short title that states the decision>

## Status

Accepted. Implemented in `path/to/file.ts`.

## Context

What problem existed, what constraints applied, and what would happen without this decision.
Name specific files and functions.

## Decision

What was decided, concretely enough that a reader could check the code still matches it.

## Consequences

What this makes possible, what it rules out, and any trade-off a future contributor should know.

## Alternatives considered

Each rejected alternative, and the concrete reason it was rejected.
```

Add the new ADR to `specs/architecture.md`'s decision table if it records a structural boundary.

## Release process (maintainers)

Releases use Changesets and npm OIDC trusted publishing. They are automated after a person merges the release pull request. [`RELEASING.md`](RELEASING.md) covers the normal flow, first-time setup and recovery. Contributors run none of it. A change ships when its pull request merges and the next release pull request merges after it.

## Versioning and stability

[`VERSIONING.md`](VERSIONING.md) lists what semver covers, tier by tier. If you are unsure whether a change is breaking, ask in the pull request. A wrong bump type is harder to fix after a release than before.
