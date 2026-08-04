# 0011: `generateEnvArtifacts()` Shares One Discovery Pass and Guarantees Compute-Phase Atomicity, Not Write-Phase Atomicity

## Status

Accepted. Implemented in `src/build/generate-env-artifacts.ts`. Referenced,
but not previously written down as its own decision, by comments in
`generate-manifest.ts`, `generate-documentation.ts`, `scan-dependencies.ts`,
and `src/build/index.ts`. Backfilled by this ADR.

## Context

`generateEnvManifest()`, `generateDocumentation()`, and
`generateUsageReport()` are each fully self-sufficient -- every one of them
runs its own discovery and linking pass when called standalone. A project
that wants all three (the common case, and the CLI's default mode with
`--location`/`--docs`/`--ownership` all supplied) calling them separately
would parse and link the same schema files three times over, once per
function.

`generateEnvArtifacts()` exists to avoid that, but composing three
independent generators into one orchestrator raises two distinct questions
that are easy to conflate into a single "is it atomic?" question, when they
actually have different answers:

1. Should a blocking finding in one pass (e.g. an undocumented contract with
   `onUndocumented: "throw"`) prevent a different pass (e.g. the manifest)
   from writing anything, even though the manifest pass itself found nothing
   wrong?
2. If every pass's blocking checks succeed, and this function then writes
   three separate files, and the second `fs.writeFile` fails (disk full,
   permissions changed mid-run) -- is the first file's write rolled back?

## Decision

**Discovery and linking run exactly once**, shared across every requested
pass via one `discoverSchemaFiles()` + `linkFiles()` call (plus one more
`discoverSchemaFiles()` call with `SCAN_INCLUDE` when a usage pass is
requested, since it scans a superset of files). A shared `fileCache` Map
ensures a file matched by more than one pass's glob (a schema file is also
matched by the usage pass's broader `SCAN_INCLUDE`) is read from disk only
once.

**Compute-phase atomicity is guaranteed.** Every requested pass's blocking
findings (manifest compatibility/exclusive-group issues, undocumented
contracts when `onUndocumented: "throw"`, abandoned/unconsumed ownership
issues when `onOwnershipIssue: "throw"`) are collected into one array before
any pass writes anything. If any of them is blocking, `EnvProjectGenerationError`
is thrown with the full aggregated list, and **nothing from any pass is
written** -- not even the passes that individually found nothing wrong. Output
path validation (`resolveWithinRoot()` for each requested `location`) is
checked in this same fail-fast phase, before discovery even runs.

**Write-phase atomicity is explicitly not attempted.** Once every pass's
compute phase has succeeded and writes begin, each `fs.writeFile` call is
independent. A real I/O failure partway through (disk full, permissions
revoked between the manifest write and the docs write) can leave some
artifacts on disk and not others. This failure mode is not wrapped in
`EnvProjectGenerationError` -- it propagates as whatever `fs.writeFile` (or
`fs.mkdir`) itself throws, since by that point the caller needs to know a
real I/O error occurred, not a compatibility finding.

## Consequences

- A project that requests all three artifacts gets exactly the same
  contract graph, computed once, feeding all three outputs -- there is no
  possibility of the manifest and docs disagreeing about what was discovered
  because they ran against subtly different filesystem states (e.g. a file
  changing between two separate CLI invocations).
- A blocking finding anywhere genuinely blocks everything, which is the
  behavior the CLI's `--strict`/`--strict-docs`/`--strict-ownership` flags
  and the GitHub Action's PR-annotation flow depend on: a CI run either
  produces a fully consistent set of artifacts or produces none, never a
  partially-updated set that could silently drift from what the code
  actually declares.
- The lack of write-phase atomicity is a real, accepted gap for the rare
  case of an I/O failure mid-write, not an oversight. A team relying on
  generated artifacts always being fully in sync with disk should treat a
  thrown error from `generateEnvArtifacts()`/the CLI as "verify what's on
  disk before trusting it," the same posture already required for any
  interrupted multi-file write.

## Alternatives considered

- **Transactional (temp-file + atomic rename) writes across all three
  artifacts.** Considered, rejected as disproportionate machinery for a
  rare failure mode. It would require every write to go through a
  write-to-temp-then-rename dance (and reasoning about rename semantics
  across filesystems/OSes), for a scenario -- an I/O error occurring between
  two writes that already passed every compute-phase check -- that is both
  rare and, when it does happen, immediately visible as a thrown error
  rather than a silent inconsistency.
- **Run each pass's discovery independently, accepting the duplicate
  parsing cost.** Rejected as the reason `generateEnvArtifacts()` exists in
  the first place -- it would reintroduce exactly the "parse the same files
  three times" cost this orchestrator is meant to eliminate, and would risk
  the three passes seeing different filesystem states if anything changed
  between their independent discovery calls.
- **Make write-phase atomicity a caller-opt-in flag.** Considered, not
  added. No real use case has asked for it, and adding a configuration
  point for a guarantee nobody has needed risks the same "unused knob"
  problem 0008 and 0009 both warn against. If a genuine need surfaces, a
  distinctly-scoped mechanism (e.g. writing to a temp directory and letting
  the caller move it into place) is the right shape, not a boolean bolted
  onto this function.
