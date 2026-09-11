# 0042: `env-cap init` is a filesystem-only scaffolder, never a project configurator

## Status

Accepted. Implemented: `src/cli/init.ts` (`runInitCommand`), dispatched from
`src/cli/index.ts`'s `main()` on `init` as the first positional token;
covered by `test/cli/init.test.ts` and `test/cli/main.test.ts`.

## Context

The CLI (`src/cli/index.ts`) was a single flat flag-parser — `--location`,
`--docs`, `--check`, `--json`, etc. — with no subcommand concept. A new
adopter's first step ("write an `env.schema.ts`, then generate the
manifest") was entirely manual, described only in the README.

`repo-contract` added an `init` subcommand for the same reason (its ADR
0004, 2026-09-09 amendment). env-cap should offer the same low-friction
entry point, but env-cap's own invariants constrain what `init` may do:
static analysis only, never execution (ADR 0002); library surfaces do not
acquire ambient capabilities the caller didn't grant (ADR 0040).

## Decision

### Grammar

`init` as the **first positional token** routes to the scaffolder; every
existing flag-based invocation is untouched (no flag is reinterpreted as a
subcommand, `--help` alone still prints the generator help). `env-cap init`
takes no arguments except `--help`.

### `init` scaffolds, it does not configure

`init` writes exactly two new files:

- `<src>/env.schema.ts` — a starter capability contract (`createEnv` +
  `documentEnv`, one placeholder variable). `src/` if that directory
  already exists, project root otherwise.
- `scripts/generate-env.mjs` — a runnable artifact generator calling
  `generateEnvArtifacts()` with the `env-cap/node`
  filesystem adapter.

It is **filesystem-only and non-executing**: no subprocess, no
package-manager call, no `package.json` mutation, no artifact
regeneration, no ambient-environment read, no network. It reads the
consumer's `package.json` only to confirm it's a project and to choose
`src/` vs. root. Writes use exclusive-create (`{ flag: "wx" }`) — an
existing file is reported as skipped, never overwritten — with parent
directories created first. Any preflight failure (no `package.json`,
malformed `package.json`, a scaffold target blocked by a wrong-typed
entry) means zero writes.

Unlike `repo-contract`'s `init`, env-cap's does **not** patch a
`package.json` script. `repo-contract`'s `npm run contract` has to exist
because its git hooks call it; env-cap's CLI already works standalone via
`npx env-cap`, so there is nothing to wire. Anything the documented
workflow still needs — running the generator, wiring `validateEnv()` into
startup — is printed as a `Next:` step, never performed.

### Tier

Experimental (VERSIONING.md). The scaffold's exact file set and template
contents may change in a minor/patch release; what it has already written
into a consumer's repo is theirs and unaffected.

## Consequences

- A new adopter runs `npx env-cap init`, gets a discoverable contract and a
  generator, and expands from there — the README's manual walkthrough
  becomes the "understand what init did" reference, not the required first
  path.
- `src/cli/init.ts` uses `node:fs` directly. That's consistent with ADR
  0040's carve-out (`src/cli/**` is executable-context source) and the
  file is bundled into the `bin` target, so `verify-no-ambient-fs`'s
  tarball scan exempts it exactly as it does `src/cli/index.ts`.
- The scaffolded templates are plain string constants in `init.ts`. If the
  public `createEnv`/`documentEnv`/`generateEnvArtifacts` API changes
  shape, the templates need updating too — a test that actually type-checks
  or runs the scaffolded output would catch drift, and is a reasonable
  future addition.

## Alternatives considered

- **Patch `package.json` to add a `generate:env` script**, like
  repo-contract. Rejected — env-cap's CLI is directly runnable via `npx`,
  so the script is a convenience the adopter can add in five seconds, and
  mutating `package.json` widens `init`'s blast radius for no real gain.
- **Scaffold only the schema file, no generator script.** Considered — the
  CLI alone (`npx env-cap --location ...`) covers generation. Kept the
  generator script anyway: it documents the full option set (docs,
  ownership, `.env.example`) in a form the adopter edits, which a bare CLI
  invocation in `Next:` output doesn't.
- **An interactive prompt flow** (pick a directory, name the capability).
  Rejected — `init` must be safely runnable inside a CI step or a
  higher-level generator; non-interactive and deterministic is the
  constraint.
