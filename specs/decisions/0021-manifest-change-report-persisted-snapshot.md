# 0021: The manifest change report is a persisted, committed JSON sidecar snapshot

## Status

Accepted. Implemented in `src/build/manifest-snapshot.ts`, wired into
`src/build/generate-manifest.ts` (`generateEnvManifest()`) and
`src/build/generate-env-artifacts.ts` (`generateEnvArtifacts()`). The
duplicate-documentation warning it depends on is implemented in
`src/build/compatibility.ts` (`detectCompatibilityIssues()`).

## Context

`generateEnvManifest()` has never had any memory of a previous run. `docs.ts`
already solves an adjacent problem for the Markdown docs artifact -- it
re-reads its own previously-written file before overwriting it, and diffs the
`### \`KEY\`` headings it finds against the current run to report an
added/removed/commented key summary (`computeChangeSummary()`,
`renderHeader()`). The manifest has nothing equivalent to read back: its `.ts`output is deliberately metadata-free by design -- sorted imports plus a`contracts`array, "no timestamps, no randomness" per`manifest.ts`'s own
docstring. There is no `description`/`owner`/`expiresAt`/etc. in it at all,
so there is nothing in a previously-generated `manifest.ts` for a later run
to parse back out.

The ask was to teach `generateEnvManifest()` to report `documentEnv()`
metadata that was added, removed, or changed since the last run, and to
specifically call out two related but distinct situations: (a) two _active_
contracts declaring the same variable with divergent documented metadata
right now, in the same run, and (b) a single variable's documented metadata
having drifted since the last time this ran. These need different mechanisms.
(a) is a same-run comparison with no history involved -- it's the same shape
of problem `detectCompatibilityIssues()` already solves for processor/
validator source (0005), just applied to documentation fields instead of
code. (b) genuinely needs persisted state across runs, which nothing in this
codebase had before this change.

## Decision

**A new sidecar file, not a change to `manifest.ts` itself.** Every
`generateEnvManifest()` (and, via `generate-env-artifacts.ts`, every
`generateEnvArtifacts()` call with a `manifest` pass) writes
`<manifest-location>.snapshot.json` alongside the manifest -- e.g.
`src/generated/env.manifest.ts` gets a sibling
`src/generated/env.manifest.snapshot.json`. It's a deterministic JSON
projection of exactly the documented-metadata fields already on
`DiscoveredContract`/`DiscoveredVariable` (contract-level `contractName`/
`active`/`category`/`exclusiveGroup`/`owner`/`expiresAt`/`metadata`,
variable-level `description`/`owner`/`expiresAt`/`refreshInstructions`/
`required`/`extra`/`documented`), sorted by file/exportName/key so
`JSON.stringify` output is stable and diffs cleanly. Nothing schema- or
processor-shaped is in it -- that distinction is exactly why `manifest.ts`
itself couldn't be reused for this.

**Committed, not ephemeral.** The snapshot is meant to be committed to git
right next to the manifest it describes, the same way the manifest itself
already is. "Since last execution" means "since the last commit on this
branch" -- reviewable in a PR diff, and consistent in CI (a fresh checkout
sees exactly what the last commit left behind) in a way a gitignored,
per-machine cache directory could never be. A local-cache design was
considered and rejected specifically because CI's "since last execution"
would otherwise mean nothing at all on a fresh checkout.

**Scoped to active contracts only**, matching `renderManifest()`'s own scope.
A contract flipping from `active: true` to `active: false` disappears from
`manifest.ts` itself; it disappears from this snapshot for the same reason,
and shows up as `removedContracts`/`removedVariables` in the next diff.

**`schemaVersion`, with the same bump discipline `src/cli/json.ts`'s
`JSON_SCHEMA_VERSION` already documents** (ADR 0019's sibling policy, not a
new one): bump only when a reader could misinterpret the new shape, never for
an ordinary additive field. Reading a snapshot distinguishes four cases, not
two -- `"missing"` (no snapshot yet: the normal, silent first-run state),
`"invalid-json"` (unparseable), `"unsupported-version"` (parses fine, but a
`schemaVersion` this build doesn't recognize), and `"ok"`. The first is
silent; the middle two are **surfaced as a `ParseWarning`**, reusing the
existing warning channel every generator result already carries (rather than
inventing a new field), specifically so a corrupted or foreign-version
snapshot never masquerades as "nothing has ever been documented before" --
that would otherwise render as a confusing wall of "everything just got
added" with no visible explanation for why history was lost.

**Field-level diffs, not just field-name lists.** `ManifestChangeReport`'s
`updatedContracts`/`updatedVariables` entries carry
`{ field, previous, current }` per differing field (including
`metadata.<key>`/`extra.<key>` for record fields), not merely the names of
what changed. The values are already known at diff time; making a CLI
formatter, a JSON consumer, or a future GitHub Action annotation re-derive
them from somewhere else would be pure friction for no benefit.

**Duplicate-key documentation divergence is a `CompatibilityIssue`
extension, not a new mechanism.** Two _active_ contracts documenting the same
variable key with different `description`/`owner`/`expiresAt`/
`refreshInstructions`/`required`/`extra` is a same-run, no-history comparison
-- `detectCompatibilityIssues()` already runs this exact kind of pairwise
per-key comparison for processor/validator source (0005), so this is a third
comparison added to that same loop, not a parallel system. It is always
`severity: "warning"`, never `"error"` (see "Alternatives considered" for why
this isn't treated like ADR 0009's exclusive-group violations), and
participates in the existing `onIncompatibility` warn/throw gate unchanged.
It's also the first check to set the new, optional `CompatibilityIssue.code`
field (`"duplicate-variable-documentation"`) -- a stable, machine-readable
identifier deliberately added to the type as opt-in rather than backfilled
onto the three checks that predate it, so CI filtering, doc-linking, or an
IDE integration has something to key on without this change also being a
silent behavior change for every existing warning.

**`--check` is untouched.** `computeArtifacts()` (shared by the write path
and by `checkEnvArtifacts()`, ADR 0011) computes the snapshot diff as a
read-only step -- it was already doing read-only discovery/linking work
`checkEnvArtifacts()` needed anyway, so the diff comes along for free. But
`checkEnvArtifacts()` itself never surfaces it and never writes the new
snapshot file: ADR 0016's "nothing is ever written at all" guarantee for
`--check` stays exactly as absolute as it already was, and
`CheckEnvArtifactsResult`'s shape gains no new field from this change.

**Only `ManifestChangeReport` (and the small ref/update/field-change types
its entries are built from) are exported from `src/build/index.ts`.** The
snapshot build/read/write/diff functions in `manifest-snapshot.ts`, and the
on-disk `ManifestSnapshot`/`ManifestSnapshotContract`/`ManifestSnapshotVariable`
shapes, all stay internal. This mirrors ADR 0010's precedent for the
dependency-ownership engine: a primitive earns Experimental-public status
through a real external caller pushing on it, not by default just because it
was convenient to write as an exported function.

## Consequences

- A PR that changes `documentEnv()` metadata now shows that change twice: once
  as prose in the regenerated docs artifact (if a docs pass is requested),
  and once as a structured, field-level diff in the committed snapshot JSON
  -- a reviewer can see exactly which fields moved without reading the whole
  generated Markdown file.
- The very first `generateEnvManifest()` run against any given `location`
  (or the first run after cloning a repo that hasn't committed a snapshot
  yet) reports every discovered variable as `added*`. This is expected, not
  a bug -- the same "first run has no `previousContent`" shape `docs.ts`'s
  own change summary has always had.
- One more generated-and-committed file to review per manifest, alongside
  `manifest.ts` itself. This is mitigated by it being fully automatic (every
  `generate:env`/CI run regenerates it, there is no separate manual step --
  see the snapshot's own explanatory section in the package README) and by
  the field-level diff making the review itself fast rather than requiring a
  reader to reconstruct what changed from two full JSON blobs.
- A hand-edited or foreign-tool-written snapshot degrades gracefully to a
  visible warning plus a fresh-start diff, never a crash and never a silent,
  unexplained loss of history.

## Alternatives considered

- **Embed the metadata directly into `manifest.ts`.** Rejected. That file's
  entire contract, documented in its own file header, is "no timestamps, no
  randomness -- same input files always produce byte-identical output" and
  nothing beyond imports plus a `contracts` array. Adding diffable metadata
  there would mean either breaking that contract or parsing TypeScript
  (rather than JSON) back out on the next run to recover prior state, for no
  benefit over a dedicated, purpose-built sidecar.
- **An ephemeral, gitignored cache instead of a committed file.** Rejected --
  "since last execution" would mean "since last time this exact machine ran
  it," which is meaningless in CI (a fresh checkout every run has no local
  history) and gives a PR reviewer nothing to look at. The whole value of the
  feature is the structured diff being visible in review, the same way the
  manifest and docs artifacts already are.
- **Reuse `docs.ts`'s existing `previousContent` mechanism (read back the
  Markdown docs file) instead of a dedicated snapshot.** Rejected --
  `generateEnvManifest()` is fully usable standalone, with no docs pass ever
  requested. Making the manifest's own change-tracking depend on whether a
  docs artifact happens to exist elsewhere would make the feature's
  availability accidental rather than a property of `generateEnvManifest()`
  itself.
- **Escalate duplicate-variable-documentation divergence to `severity:
"error"`, unconditionally, the way ADR 0009 treats exclusive-group
  violations.** Rejected. ADR 0009's reasoning is that `exclusiveGroup` is an
  explicit, author-declared constraint with no legitimate "maybe" reading --
  two contracts either share the string or they don't. Two contracts
  documenting the same variable name differently has no such property: it is
  never provably wrong via static analysis, exactly like the pre-existing
  differently-shaped-processor-source and differently-shaped-validator-source
  checks it sits alongside. Warning-tier, gated by the existing
  `onIncompatibility` option, is the correct precedent to follow here, not
  the exclusive-group one.
