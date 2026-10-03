# 0046: The CLI surface is restricted to flags with a verified real consumer

## Status

Accepted. Removes `--docs`, `--ownership`, `--env-example`, and
`--env-example-on-existing` from `src/cli/index.ts` (`ParsedArgs`,
`VALUE_FLAGS`, `helpText()`, the "at least one of ..." guard, and every
CLI-only rendering path that only existed to format their output --
`printDocsSummary()`, `printUsageSummary()`, and the corresponding terms in
`runGenerateMode()`'s warning-count banner). `--expiring-within-days` is
removed too, as a direct structural consequence (see Context). Covered by
`test/cli/index.test.ts` and `test/cli/main.test.ts`.

`computeDocumentation`/`writeDocumentation`/`computeUsage`/`writeUsageReport`
(`src/build/generate-documentation.ts`, `src/build/generate-usage.ts`), and
the higher-level orchestrators `generateDocumentation`/`generateUsageReport`/
`generateEnvArtifacts`/`checkEnvArtifacts` that compose them, are **not**
changed by this decision and remain fully exported from `@maverickcer/env-cap/build`,
Stable per ADR 0045. Nothing about the library surface shrank -- only what
the packaged CLI binary can trigger by itself.

## Context

`env-cap`'s CLI (`src/cli/index.ts`) grew flags for every artifact the
library could produce, on the assumption that "the library can generate it"
and "the CLI should have a flag for it" were the same decision. They aren't.
Auditing the CLI's actual flag set against what each flag's output is
_for_ found two different categories, previously flattened into one:

- **Flags whose output something else in a real project actually reads.**
  `--location` writes the generated manifest `.ts` file that application
  code `import`s and passes to `validateEnv()` (see
  `examples/team-service/src/startup.ts`, `examples/nextjs-app`'s
  `src/env.ts`) -- a real, provable runtime dependency. `--evidence` writes
  the persisted `EvidenceModel` artifact that is itself this package's
  reporting contract (ADR 0038: "always computed, always real" -- Finding
  Model, evidence projections, and CI drift-guards all key off this one
  file). `--json`/`--check` are inherent to the tool's own contract, not
  outputs of a particular pass (ADR 0013, ADR 0016).
- **Flags whose output nothing in a real project reads at runtime, or
  checks programmatically, at all.** `--docs` (the rich Markdown catalog)
  and `--ownership` (the dependency & ownership report) are purely
  human-facing documentation. Auditing every example in this repo
  (`examples/application`, `examples/team-service`, `examples/nextjs-app`,
  `examples/enterprise-platform`) found no `import` of `docs/ENVIRONMENT.md`
  or `docs/OWNERSHIP.md` anywhere, and no test asserting on their content
  except as committed, golden, human-readable output. `--env-example` turned
  out to be structurally _part of_ the docs pass, not independent of it --
  `writeDocumentation()`'s signature requires a `docsPath: string` (not
  optional) to write an `.env.example` at all, and the CLI's own pre-existing
  help text already said as much ("`--env-example <path>` ... only
  meaningful alongside `--docs`"). Once `--docs` is gone, `--env-example`
  has no remaining CLI path to reach `writeDocumentation()` through, so it
  was removed alongside it rather than left as a flag that silently does
  nothing. `--expiring-within-days` has the same structural problem one
  level up: `GenerateEnvArtifactsOptions.docs.expiringWithinDays` is the
  only place that value is threaded through
  (`computeArtifacts()`'s `docsOptions?.expiringWithinDays ?? DEFAULT_EXPIRING_WITHIN_DAYS`),
  so it too had no remaining CLI path once `--docs` no longer exists to
  carry it.

This distinction matters for a stronger reason than tidiness: every CLI flag
is a compatibility surface someone can build a CI pipeline against (ADR
0044's own `--strict` audit made exactly this point about flag semantics
drifting from what a reasonable user expects). A flag whose only job is
"write a file nothing else reads" earns its place by being _useful_, not by
being _possible_ -- and it was already possible without the flag: every
generator function it called was, and remains, a plain exported function
from `@maverickcer/env-cap/build`. Keeping `--docs`/`--ownership` in the CLI while their
only real consumers turned out to be humans reading committed Markdown, not
other code or a CI drift check with independent value, meant the CLI's
surface area didn't reflect what the tool's flags were actually _for_.

A secondary, mechanical reason forced the same conclusion from a different
angle: once `--docs`/`--ownership` are removed from `ParsedArgs`,
`artifactOptions()` can never again set `GenerateEnvArtifactsOptions.docs`/
`.usage` from a real CLI invocation, which makes `result.docs`/`result.usage`
permanently `undefined` on every real `runGenerateMode()` call. Under this
repo's zero-tolerance Mutation gate (`npm run contract`), the CLI's own
`printDocsSummary()`/`printUsageSummary()` functions and their
`if (result.docs)`/`if (result.usage)` call sites would then be
permanently unreachable dead code -- no real CLI-level test could construct
a state where the removed flag's summary-printing branch is taken. Rather
than leave dead branches a mutation-testing gate would rightly flag,
they were removed along with the flags that used to reach them.

## Decision

The `env-cap` CLI's flag set is restricted to flags with a verified real
runtime consumer (`--location`), or that are inherent to the tool's own
evidence/reporting contract (`--evidence`, `--json`, `--check`), plus the
flags that scope/configure those (`--root`, `--include`, `--exclude`,
`--package`, `--tsconfig`/`--no-tsconfig`, `--strict`/`--strict-docs`/
`--strict-ownership`, `--help`). `--strict-docs`/`--strict-ownership`
survive this cut even though they're documentation/ownership-scoped,
because they don't write a docs/ownership _artifact_ at all -- they
escalate Finding Model's always-computed documentation/ownership warnings
(ADR 0038) into a blocking error on the manifest/evidence write path,
independent of whether a docs/ownership file is ever produced (confirmed by
existing behavior: bare `--strict --location` already escalated
documentation/ownership findings before this change, per ADR 0044).

Flags with no verified runtime consumer -- `--docs`, `--ownership`,
`--env-example`, `--env-example-on-existing`, `--expiring-within-days` --
move to application-level code: a project that wants
`docs/ENVIRONMENT.md`/`docs/OWNERSHIP.md`/`.env.example` now calls
`generateDocumentation()`/`generateUsageReport()` (or the lower-level
`computeDocumentation`/`writeDocumentation`/`computeUsage`/
`writeUsageReport`, or `checkEnvArtifacts()` for a `--check`-equivalent
drift guard) directly from `@maverickcer/env-cap/build` in its own build script, exactly
as it would for any other custom reporting need this package doesn't build
in (see ADR 0010's precedent: engine internals stay private until a
primitive earns public status through real external use; these four
orchestrators already have that status, per ADR 0045). Every example this
repo ships that used the removed flags (`examples/application`,
`examples/team-service`, `examples/nextjs-app`) now carries a
`scripts/generate-docs/{run.ts,check.ts}` pair doing exactly this --
`examples/enterprise-platform` already had an equivalent hand-written
script (`scripts/generate-manifest.mjs`) calling `generateEnvArtifacts()`
directly with `docs`/`usage` options, predating this decision, which only
needed its `check` script updated the same way (a new
`scripts/check-artifacts.mjs`, calling the now-CLI-unreachable
`checkEnvArtifacts()` directly).

## Consequences

- **Breaking, but pre-1.0 minor per this repo's convention.** Any script
  invoking `env-cap --docs ...`/`--ownership ...`/`--env-example ...`/
  `--env-example-on-existing ...`/`--expiring-within-days ...` now fails
  with `Unknown argument: --docs` (etc.) instead of generating output. The
  fix is mechanical: call the equivalent `@maverickcer/env-cap/build` function directly
  from a small script, following the pattern in any of this repo's own
  `examples/*/scripts/generate-docs/` directories.
- `generateEnvArtifacts()`'s own `docs`/`usage` options (`GenerateEnvArtifactsOptions`)
  are completely unaffected -- they remain a fully supported part of that
  Stable, exported orchestrator's public contract for any caller that
  supplies them directly (not through the CLI). The CLI itself simply never
  populates them anymore.
- The CLI's `--json` envelope (`JsonRequestedPasses.docs`/`.usage`) keeps
  both fields, unchanged in shape -- `requestedPasses()` now always reports
  them `false` from the CLI, since neither pass can be requested through it
  anymore, but the envelope's schema itself (and `JSON_SCHEMA_VERSION`)
  didn't need to change, since no field was removed or reinterpreted.
- `docs/ENVIRONMENT.md`'s/`docs/OWNERSHIP.md`'s generated byline
  (`_Produced by \`env-cap --docs\`._`/`_Produced by \`env-cap --ownership\`._`,
hardcoded in `src/build/docs.ts`/`src/build/usage-report.ts`'s shared
renderers) is now technically inaccurate for every example generating
these through application code instead of the CLI. Left unchanged
deliberately: both renderers are shared by every consumer of
`@maverickcer/env-cap/build`, not just these examples, so correcting the byline is a
  golden-fixture-wide rendering change (touching every example's and
  integration fixture's committed output) out of proportion to this
  decision's actual scope -- a candidate for a focused follow-up, not
  bundled in here.

## Alternatives considered

- **Keep `--docs`/`--ownership` in the CLI regardless of runtime
  consumption, since "more flags" costs nothing on its own.** Rejected --
  it costs exactly what this ADR's Context section describes: dead,
  mutation-flagged branches in the CLI's own rendering code once nothing
  can reach them, and a CLI surface that no longer reflects a verified
  reason to exist for each flag, which is the actual audit this change
  applies.
- **Keep `--env-example`/`--expiring-within-days` independently reachable
  by restructuring `writeDocumentation()`/`computeArtifacts()` so they no
  longer require the docs pass.** Rejected for this pass -- both are
  genuinely, structurally nested under the docs pass in the current library
  design (`writeDocumentation()`'s `docsPath` parameter is not optional;
  `expiringWithinDays` lives only on `GenerateEnvArtifactsOptions.docs`),
  and restructuring either is a library-shape change with its own blast
  radius across every existing caller -- out of scope for a CLI-surface
  change that was explicitly scoped to keep the library "fully available,
  unchanged."
- **Cite ADR 0001 (runtime/`documentEnv` separation) as this decision's
  direct precedent.** Considered, since both decisions draw a line between
  "runtime-relevant" and "documentation-only" concerns. Not treated as a
  full precedent, since ADR 0001 is about the _authoring_ API
  (`createEnv`/`documentEnv`), not the CLI's own flag surface -- referenced
  here as related reasoning, not superseded or extended.
