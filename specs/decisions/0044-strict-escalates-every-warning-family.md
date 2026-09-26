# 0044: Bare `--strict` escalates every warning family, not just manifest compatibility

## Status

Accepted. Implemented in `src/cli/index.ts` (`artifactOptions`,
`groupEscalates`); covered by `test/cli/index.test.ts`. Breaking change to
`--strict`'s own behavior, not to any exported type shape.

## Context

Before this decision, `--strict` escalated only the manifest pass's
compatibility findings (ADR 0009's provable exclusive-group/compatibility
errors) to a hard error; documentation and ownership warnings needed their
own separate `--strict-docs`/`--strict-ownership` flags to escalate at all
— `--strict` alone left them at `warn`. This was a deliberate, documented
scoping (GUIDE.md/`--help` both said so explicitly), not an oversight.

A cross-package parity audit ahead of both env-cap's and
`@maverickcer/data-cap`'s `1.0` release compared the two siblings'
identically-named `--strict`/`--strict-docs`/`--strict-ownership` flags and
found they mean different things: data-cap's bare `--strict` already
escalates every pass (docs, ownership, and its own flow-family findings)
via an OR across `--strict`/the group-specific flag
(`src/build/generate-data-artifacts.ts`'s `groupEscalates`). Same flag
name, same lineage, materially different scope — a CI script written
against one tool's `--strict` and copied to the other silently gets
different enforcement. Worse, "strict" without qualification naturally
reads as "maximum strictness"; a user who ran bare `--strict` in CI
expecting full escalation and got only the compatibility family was
carrying a false sense of safety about documentation/ownership drift —
exactly the class of problem an audit tool exists to prevent, not
reproduce in its own flag semantics.

## Decision

Bare `--strict` now escalates all three provable-error families at once —
compatibility, documentation, and ownership — equivalent to passing
`--strict --strict-docs --strict-ownership` together. `--strict-docs`/
`--strict-ownership` are unchanged: still independently settable, still
escalate their own family alone when passed without bare `--strict`.

Mechanically: `parseArgs` keeps `strict`/`strictDocs`/`strictOwnership` as
three independent booleans (unchanged — `--strict` still never sets the
other two flags itself). The OR happens once, at read time, in
`artifactOptions`'s new `groupEscalates(strict, specificFlag)` helper —
`onUndocumented`/`onOwnershipIssue` both now read
`groupEscalates(args.strict, args.strictDocs/args.strictOwnership) ?
"throw" : "warn"`, matching data-cap's own `groupEscalates`
(`src/build/generate-data-artifacts.ts`) exactly in name and shape.

## Consequences

- **Breaking.** Any CI pipeline currently running bare `--strict` alone,
  relying on it _not_ escalating documentation/ownership warnings, will
  start failing on pre-existing warnings in those families the next time
  it runs. This is a real, deliberate behavior change, not a bug fix wearing
  a disguise — anyone affected needs to either fix the newly-escalated
  findings or drop back to `--strict-docs`/`--strict-ownership` individually
  (or neither) to keep today's narrower gate.
- `--strict`'s and data-cap's `--strict`'s meaning are now the same shape
  (an all-families shorthand, with independent per-family flags underneath)
  for anyone using both tools.
- `GUIDE.md`, `ADOPTION.md`, and `--help`'s own `--strict` description are
  updated to describe the new scope; the GitHub Action's own pass/fail
  section is updated too, since it previously singled out compatibility as
  "the one provable, manifest-pass error category."

## Alternatives considered

- **Narrow data-cap's `--strict` to match env-cap's old scope instead.**
  Rejected — data-cap's broader "escalate everything" semantics matches
  what "strict" naturally reads as, and narrowing an already-shipped
  strictness flag is the more dangerous direction: an existing data-cap CI
  gate relying on `--strict` catching docs/ownership drift would silently
  lose that coverage. Widening env-cap's `--strict` is the safer kind of
  breaking change for a strictness flag — previously-passing CI newly
  failing on a real, pre-existing problem it should have caught, never the
  reverse.
- **Leave the divergence undocumented as an intentional design
  difference.** Rejected — there was no actual domain reason for env-cap's
  narrower scope; it was just how the flag grew one family at a time before
  `--strict-docs`/`--strict-ownership` existed, never revisited once they
  did.
- **A fourth, explicit `--strict-all` flag, leaving bare `--strict` as
  compatibility-only.** Rejected — adds a flag name to remember for no
  real benefit over just widening `--strict` itself, and still leaves the
  cross-package naming mismatch (data-cap has no `--strict-all`) unresolved
  for the "familiar experience switching tools" goal this change exists for.
