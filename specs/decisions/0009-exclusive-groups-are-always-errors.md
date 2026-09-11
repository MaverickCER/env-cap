# 0009: Exclusive-group violations are always hard errors, never subject to `onIncompatibility`

## Status

Accepted. Implemented in `src/build/exclusive-group.ts`
(`detectExclusiveGroupIssues`), called unconditionally from
`src/build/generate-manifest.ts`'s `computeManifest()` alongside
`detectCompatibilityIssues` (0005).

## Context

`documentEnv()` accepts an optional `exclusiveGroup: string` (`src/build/parse.ts`,
`src/runtime/document.ts`) an author uses to mark two or more contracts as
interchangeable alternatives -- e.g. two database backends, only one of which
should ever be wired into a given deployment. It works together with
`active` (also on `documentEnv()`, defaulting to `true`): a contract can ship
in the repository while `active: false` keeps it out of the contract,
`.env.example`, and (per this decision) exclusive-group checking entirely.
`examples/team-service` is built around exactly this pair --
`postgres` and `mongodb` both declare `exclusiveGroup: "database"`, only
`postgres` is active by default, and mongodb ships fully documented but
dormant.

0005 established the general policy for build-time findings that
`generateEnvManifest()` cannot execute code to verify: static analysis can
_prove_ some things (e.g. two contracts give explicit, conflicting return-type
annotations for the same variable) and can only _suspect_ others (e.g. two
contracts have differently-shaped processor source with no annotation to
compare). Proven findings get `severity: "error"` and always block
generation; suspected findings get `severity: "warning"` and only block
generation if a project opts in via `onIncompatibility: "throw"`. Both
severities share the same `CompatibilityIssue` shape and are produced by the
same family of checks (`detectCompatibilityIssues`), so it would be
reasonable to assume `onIncompatibility` governs every finding that shape can
represent.

`detectExclusiveGroupIssues` returns `CompatibilityIssue[]` too, and
`computeManifest()` concatenates its output directly into the same
`compatibilityIssues` array before applying the `onIncompatibility` split
(`src/build/generate-manifest.ts`). But it never assigns `severity: "warning"` --
every issue it produces is `"error"`, unconditionally. Right now, that's
explained only in a comment on the function itself ("this is never a
heuristic warning ... regardless of `onIncompatibility`"), not as a decision
-- so the asymmetry with 0005's general policy has no record of _why_ it's
correct, only a note that it's intentional.

## Decision

An exclusive-group violation is always represented as a `CompatibilityIssue`
with `severity: "error"`, and per 0005, `severity: "error"` findings always
block generation regardless of the `onIncompatibility` value a project
passes. There is no option, and none is planned, that downgrades an
exclusive-group violation to a warning or otherwise lets generation succeed
while one is present.

This is not a special case bolted onto the blocking logic in
`generate-manifest.ts` -- `detectExclusiveGroupIssues` simply never emits anything but
`"error"`. The reason is that 0005's error/warning split tracks _provability_,
and exclusive-group membership is never a matter of degree the way duplicate-
variable compatibility is. Two active contracts either declare the identical
`exclusiveGroup` string or they don't; there is no differently-shaped-source,
can't-prove-it-either-way middle case for a plain string comparison the way
there is for comparing processor implementations. And unlike a duplicate
variable name -- which two capabilities could plausibly share by coincidence and
still be compatible -- `exclusiveGroup` only exists because an author
deliberately opted a contract into it. A violation isn't the tool inferring a
_possible_ problem from incomplete information; it's the tool checking an
explicit, author-authored constraint and finding it broken. 0005's warning
tier exists for the former case. This check never produces the former case,
so it never has a reason to reach for that tier.

Inactive contracts are filtered out before this check ever runs
(`computeManifest()` in `generate-manifest.ts` only passes `activeContracts` to both
`detectCompatibilityIssues` and `detectExclusiveGroupIssues`) -- shipping a
dormant alternative in the same exclusive group as the active one is never a
violation, regardless of this decision. Only two _active_ contracts sharing a
group is.

## Consequences

- **The composable-boilerplates pattern is actually safe, not just
  documented as safe.** The entire pitch of shipping every backend option
  dormant (0001-adjacent: keep build-time metadata out of the runtime, but
  keep it real enough to enforce) depends on "two of them active at once" being
  something the build can't let through silently. If this were a
  `onIncompatibility`-gated warning like duplicate-variable mismatches, a
  project using the (0005) default `"warn"` setting could flip `mongodb` to
  `active: true` without flipping `postgres` to `false`, and generation would
  succeed -- the violation would sit in `result.warnings` and in generated
  docs, which 0005 itself already flags as easy for a team to never review.
  `examples/team-service`'s README demonstrates the actual
  behavior: attempting that flip fails `generate:env` immediately, with both
  contract names and files named in the error.

- **No knob exists to relax this, on purpose.** A team migrating between two
  exclusive-group members must actually set the old one's `active: false`
  before the new one's `active: true` takes effect cleanly -- there is no
  transitional "both active, just warn about it" state. That friction is the
  intended behavior, not a gap: the same tradeoff 0008 makes for the size
  budget (a check with no escape hatch stays meaningful) applies here for the
  same reason.

- **`onIncompatibility`'s scope is narrower than its placement in the type
  system suggests.** Because exclusive-group issues share `CompatibilityIssue`
  and flow through the same array as duplicate-variable issues, reading the
  option's doc comment or `GenerateEnvManifestResult["warnings"]"`'s type in
  isolation could suggest it controls all compatibility-shaped findings. This
  ADR is the place that correction now lives, instead of only the docstring
  on `detectExclusiveGroupIssues`.

## Alternatives considered

- **Gate exclusive-group violations behind `onIncompatibility`, same as
  heuristic duplicate-variable warnings.**
  Rejected. There is no legitimate "maybe" reading of two active contracts
  sharing an author-declared exclusive group -- unlike differently-shaped
  processor source, which might still produce equivalent output, exclusivity
  is the entire and only meaning of the field. Warning by default would also
  make the composable-boilerplates safety story false for any project that
  hasn't opted into `--strict`: exactly the scenario the field exists to
  prevent would pass silently under the framework's own default settings.

- **A dedicated `onExclusiveGroupViolation` option, separate from
  `onIncompatibility`, defaulting to `"throw"` but overridable.**
  Considered, not added. No real use case has asked for a way to temporarily
  tolerate two active members of the same exclusive group, and adding a
  configuration point for a policy nobody has needed to relax risks the same
  problem 0008 warns against for size budgets -- an unused knob is a knob
  nobody remembers the reason for. If a genuine transitional need surfaces
  (e.g. a deliberate, temporary dual-active state during a live migration), a
  distinctly-named option is the right future shape; folding it into
  `onIncompatibility` would blur the proven/heuristic distinction 0005
  established it to express.

- **Represent exclusive-group violations as `severity: "warning"` like the
  heuristic duplicate-variable cases.**
  Rejected. That would misrepresent something fully provable by a plain
  string comparison as something requiring human judgment, undermining the
  distinction 0005 draws between the two severities in the first place.
