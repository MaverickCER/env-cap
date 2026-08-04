# 0015: Post-1.0 security fixes are backported one major version back, for a minimum of six months

## Status

Accepted. Implemented in `SECURITY.md`'s "Supported versions" section.

## Context

`SECURITY.md`'s "Supported versions" section previously said only that
security fixes target the latest published `0.x` version and that "there is
currently no separate long-term-support branch or extended security-support
policy" -- true today, but silent on what happens once the project reaches
`1.0`, when a major-version bump starts meaning something different (a real
breaking-change boundary, not `0.x`'s "any minor may break Stable APIs" per
`VERSIONING.md`). `ADOPTION.md`'s "Versioning, stability, and long-term
support" section named this directly as "the honest gap" for an organization
evaluating adoption at scale, with no forward answer -- only a description of
what's missing today.

## Decision

Starting at the first `1.0` release, security fixes will be backported to
the latest minor release of the previous major version for a minimum of six
months after a new major version ships. That minimum window may be extended
at the maintainer's discretion, but once a minimum end date has been stated
for a given major version's backport window, it will never be shortened
retroactively. Before `1.0`, the existing "latest `0.x` only" policy
continues unchanged -- this decision does not attempt to backdate a
commitment onto pre-1.0 releases.

## Consequences

- An organization evaluating `env-cap` for a hard LTS/backport requirement
  now has a concrete, dated answer for the _post-1.0_ state, distinct from
  today's real, current gap -- `ADOPTION.md` is updated to state both
  halves rather than only the gap.
- This is a forward commitment, not a proven track record. `ADOPTION.md`
  must continue to say so explicitly.
- A future major-version release's changelog/release notes must state the
  backport window's end date explicitly, since the "never shortened once
  stated" guarantee only has teeth if the stated date is written down
  somewhere a consumer can point back to.

## Alternatives considered

- **No forward commitment at all.** Rejected -- `ADOPTION.md` already
  surfaces this as "the honest gap" to every evaluator; leaving it
  permanently unanswered costs real adoptions for a project where the
  actual future behavior is knowable and cheap to commit to now.
- **A shorter (e.g. 90-day) or open-ended/indefinite window.** Rejected.
  Six months balances real migration planning time against not being an
  indefinite burden for a solo-maintained project; open-ended was rejected
  because an unbounded promise from a single maintainer isn't a credible
  commitment.
- **A commitment that can be shortened later if maintenance burden proves
  unsustainable.** Rejected -- a window a consumer can't rely on staying put
  isn't meaningfully different from no commitment; "extendable, never
  shortened once stated" lets the maintainer add slack without ever pulling
  support out from under an application that planned around the original
  date.
