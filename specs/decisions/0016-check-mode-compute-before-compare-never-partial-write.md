# 0016: `--check` computes fully before ever touching disk, and never partially writes

## Status

Accepted. Implemented in `src/build/check-artifacts.ts` (`checkEnvArtifacts()`),
wired into the CLI via `--check` in `src/cli/index.ts`.

## Context

`generateEnvArtifacts()` already gives two atomicity guarantees (ADR 0011):
every requested pass's blocking findings are checked, across all passes,
before any pass writes anything, but once writes begin, they are not
transactional. A CI "drift guard" -- verify that a schema change was
actually followed by regenerating the committed manifest/docs/`.env.example`/
ownership report, without writing anything, so a stale artifact fails the
build instead of silently drifting out of sync -- needs a stronger,
simpler guarantee than either of those: **nothing is ever written at all**,
regardless of what's found. A read-then-maybe-write design (compute, then
overwrite the target files, then diff old vs. new via git) was considered
and rejected: it would leave a working tree dirty after a failed CI check
(annoying for a local dry run) and, more importantly, would defeat the
entire point of a drift guard the moment anyone rebinds `--check` to also
regenerate "just to be safe."

`generateEnvArtifacts()`'s existing pipeline already separates "compute the
artifact's content" from "write it to disk" for all three generators
(`renderManifest()`, `renderDocs()`, `renderUsageReport()` are pure
functions of already-computed data). `--check` reuses that same compute
step via a new exported `computeArtifacts()` (extracted from
`generateEnvArtifacts()` in `src/build/generate-env-artifacts.ts`) and a new,
comparison-only module, `src/build/check-artifacts.ts`, rather than
special-casing "don't actually write" flags through the existing write path.

## Decision

- **`checkEnvArtifacts()` never calls any of the four write functions**
  (`writeManifest`, `writeDocumentation`/`writeEnvExample`, `writeUsageReport`).
  It only reads the currently-committed target files (via `fs.readFile`,
  exactly as a normal run already does for docs/env-example reconciliation)
  to compare against freshly rendered content -- render-and-compare, never
  render-and-overwrite.
- **Compute fully before comparing anything.** `computeArtifacts()` runs
  discovery, linking, and every requested pass's pure compute step exactly
  once, and throws `EnvProjectGenerationError` on the same blocking findings
  a real run would throw on (an escaping output path, or a `--strict`-family
  finding) -- `--check` reports drift, it does not paper over a run that
  would otherwise fail outright.
- **Each artifact gets its own `ok`/`stale`/`missing` finding**, not one
  aggregate boolean -- `missing` (target doesn't exist yet) and `stale`
  (exists but differs from what a real run would produce) are distinguished
  because they suggest different next steps for whoever reads the CI output.
- **Docs' one non-deterministic line (`_Generated <timestamp>_`) is
  normalized before comparison.** Byte-for-byte equality would otherwise
  report every check as stale purely because real time moved between the
  last real generation and the check, which is not drift.
- **`.env.example` staleness is judged by `computeReconciliation()`'s
  three-list diff, not string equality.** `writeEnvExample()` never
  overwrites an existing file (a variable-count-only diff, by design), so
  "stale" for this one artifact means "genuine reconciliation drift"
  (missing/extra/stale variables), not "the file's bytes differ from a
  hypothetical fresh render" -- a human-added comment in an otherwise
  reconciled `.env.example` must not be flagged.

## Consequences

- `--check`'s exit code (`0`/`1`) is driven entirely by its own
  `CheckEnvArtifactsResult.ok`, independent of `--json`'s top-level `ok`
  field (which keeps meaning "did generation complete without throwing").
  `--json`'s envelope gains an additive `checkResult: { ok, stale }` field
  (see ADR 0013's additive-field policy) rather than overloading the
  existing `ok`.
- **`--check` requires `renderDocs()` to be a fixed point under self-feeding**:
  regenerating with a file's own current content as `previousContent` must
  reproduce that file byte-for-byte (modulo only the normalized
  `_Generated ...` line), since that's exactly what `checkEnvArtifacts()`
  does -- it always treats whatever is currently on disk as `previousContent`
  for the comparison render. This was violated for a project's very first
  `--check` immediately after its very first real generation: a true first
  write has no `previousContent` at all, and `renderDocs()` used to omit the
  "Changes since last report" section entirely in that case, while a
  same-content second render (real or checked) legitimately includes it --
  so the first-ever `--check` always reported `docs` as stale, for a reason
  unrelated to any real schema drift. Fixed in `computeChangeSummary()`
  (`src/build/docs.ts`): a missing `previousContent` is now treated as "no
  changes" (the section is always rendered, "No changes." on a true first
  run too) rather than "no summary at all" -- see that function's docstring
  for the full reasoning. `--check` itself required no change; the fix
  belongs entirely in `renderDocs()`, since the self-feeding fixed-point
  property it depends on is a general correctness requirement of that
  function, not something specific to `--check`'s own logic.
- `computeArtifacts()` is `Private` tier (VERSIONING.md) -- exported from
  `generate-env-artifacts.ts` so `check-artifacts.ts` can import it, but not
  re-exported from `./index.ts`. Only `checkEnvArtifacts()` and its result
  types are public.

## Alternatives considered

- **A `--dry-run` flag on the existing write functions**, threading a
  boolean through `writeManifest()`/`writeDocumentation()`/`writeUsageReport()`
  to skip the actual `fs.writeFile` call. Rejected -- it would still need a
  parallel comparison step to be useful (skipping the write alone doesn't
  tell you _whether_ the skipped write would have changed anything), so it
  buys nothing over a dedicated compare-only module, while spreading
  "don't actually write" conditionals through code whose entire job today
  is writing.
- **Regenerate into a temp location and `diff` against the real target.**
  Rejected as unnecessary I/O and directory bookkeeping -- every artifact's
  render step already produces an in-memory string; comparing that string
  against the target file's current content directly needs no intermediate
  file at all.
- **One aggregate boolean instead of a per-artifact finding list.** Rejected
  -- "something is stale" is far less actionable in a CI log than "docs is
  stale, manifest is fine, `.env.example` is missing entirely."
