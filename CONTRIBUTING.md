# Contributing to env-cap

## Development setup

```bash
git clone https://github.com/maverickcer/env-cap.git
cd env-cap
npm install
```

There is one local pre-flight gate that mirrors CI exactly:

```bash
npm run verify   # typecheck && build && test && size
```

Run it before opening a pull request. Individual steps are also available on
their own: `npm run typecheck`, `npm run build`, `npm test` / `npm run
test:watch`, `npm run test:coverage`, `npm run lint`, `npm run size`,
`npm run docs:api` (generates the TypeDoc API reference into `api-docs/`).

### Working with `examples/`

Each example under [`examples/`](examples/) is its own npm project (`npm install` inside it
separately) and carries a committed `expected/` directory of golden regression fixtures --
see [`examples/README.md`](examples/README.md#expected--golden-regression-fixtures). If your
change intentionally alters generated output (manifest/docs/`.env.example`/ownership-report
formatting, ordering, or serialization), regenerate every example's goldens and review the
diff before committing:

```bash
npm run examples:update-golden
```

## Making a change

1. Branch from `main`.
2. Make your change. If it touches a documented, user-facing behavior
   (anything covered by [`VERSIONING.md`](VERSIONING.md)'s "stable" tier),
   check whether it's breaking, additive, or a fix — this determines the
   changeset bump type in step 4.
3. Add or update tests. `npm run test:coverage` must not drop coverage below
   the thresholds in `vitest.config.ts` — the policy is ratchet-up-only:
   thresholds are raised when coverage improves, never lowered to
   accommodate a drop.
4. Run `npx changeset` and describe your change from the consumer's
   perspective (not "what I changed in the code", but "what changes for
   someone who installs this package"). Pick `patch`/`minor`/`major`
   according to [`VERSIONING.md`](VERSIONING.md)'s stable/experimental/private
   split — a change to something documented as Experimental is never
   `major`, even if it's breaking, since Experimental surfaces are explicitly
   exempted from the stability guarantee until they're promoted to stable.
5. Open a pull request. CI runs `npm run verify`, `npm run lint`, coverage
   thresholds, and the Bun/Deno cross-runtime conformance suite.

## Adding an Architecture Decision Record (ADR)

`specs/decisions/` records _why_ the project is shaped the way it is, not
just what it does today — `specs/architecture.md` is the current-state
summary; ADRs are the reasoning trail. Add one when a change:

- introduces a new constraint or guarantee an application could come to rely
  on (e.g. "warn, not throw, by default"),
- closes off an alternative approach a future contributor might otherwise
  reintroduce without knowing it was already considered and rejected, or
- changes the boundary of what the runtime/build/helpers packages are
  responsible for.

A one-line bug fix or an internal refactor with no observable behavior change
does not need one.

**Numbering**: take the next unused integer (check `specs/decisions/` for the
current highest number — gaps are possible if a numbered decision was
retroactively backfilled out of order; don't reuse a number even if a file
for it doesn't exist yet).

**Structure**, drawn from the existing ADRs (see `0002-static-analysis-never-execution.md`
or `0009-exclusive-groups-are-always-errors.md` for full examples):

```markdown
# NNNN: <short, decision-stated-as-a-sentence title>

## Status

Accepted. Implemented in `path/to/file.ts`.
<!-- or: Proposed / Experimental, if the decision ships behind an explicit
     Experimental label per VERSIONING.md -->

## Context

What problem existed, what constraints applied, and what would happen absent
this decision. Reference specific files/functions, not just the abstract
problem.

## Decision

What was actually decided, stated concretely enough that a future reader
could verify the codebase still matches it.

## Consequences

What this makes possible, what it forecloses, and any non-obvious tradeoff a
future contributor should know about before "fixing" what looks like a
limitation.

## Alternatives considered

Each rejected alternative, and the specific reason it was rejected — not just
"more complex," but what concrete problem the complexity would or wouldn't
have solved.
```

Cross-reference the new ADR from `specs/architecture.md`'s decision table if
it documents a structural boundary, not just a narrower implementation
choice.

## Release process (maintainers)

Releases are automated via [Changesets](https://github.com/changesets/changesets)
and npm's OIDC trusted publishing (`.github/workflows/release.yml`) — no
`NPM_TOKEN` secret exists in this repository. Every merged PR with a pending
changeset causes the workflow to open/update a "Version Packages" PR;
merging that PR runs `npm run verify` and publishes.

**One-time setup required before the first automated release** (cannot be
done from a PR — it requires npm account access):

1. On [npmjs.com](https://www.npmjs.com), open `@maverickcer/env-cap`'s
   package settings and add a trusted publisher for GitHub Actions:
   - Organization/user: `maverickcer`
   - Repository: `env-cap`
   - Workflow filename: `release.yml` (exactly — not a path, just the
     filename; a mismatch here is the most common cause of the OIDC flow
     failing with a misleading `E404`)
   - Environment: leave blank unless the workflow is later scoped to a
     GitHub Environment
2. That's it — no token to copy anywhere. The workflow's `id-token: write`
   permission plus this registration is the entire trust relationship.

## Versioning and stability

See [`VERSIONING.md`](VERSIONING.md) for what's covered by semantic
versioning, what's Experimental, and what's a private implementation detail
that can change without notice. When in doubt about whether your change is
breaking, ask in the pull request rather than guessing at the changeset bump
type — an incorrect bump type is harder to fix after release than before.
