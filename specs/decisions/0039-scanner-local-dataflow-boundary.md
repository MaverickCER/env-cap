# 0039: The Usage Scanner Follows Object-Destructuring and One-Level `const` Aliasing, and Nothing Else

## Status

Accepted. Implemented in `src/build/scan-dependencies.ts` and
`src/build/dependency-graph.ts`, orchestrated by `generateUsageReport()`
(`src/build/generate-usage.ts`). Extends ADR 0010 (the engine's fixed scope)
and ADR 0036 (position-cited findings); does not change ADR 0037
(developer-declared `dynamicAccess` citations stay a wholly separate fact).

## Context

Before this decision, `scanFileForDependencies()` recognized exactly three
consumption shapes on a tracked contract binding `paymentsEnv`:

- `paymentsEnv.STRIPE_KEY` / `paymentsEnv["STRIPE_KEY"]` -> a `member` access
  ("STRIPE_KEY is read").
- `paymentsEnv[expr]` (non-literal key) -> a `dynamic` access (the contract
  has a computed access; every not-otherwise-read key on it becomes
  `indeterminate`).
- Any other mention of the bare identifier -> a `reference` (contract-level
  coupling only -- it counted toward "this file is a consumer" but was
  discarded for per-variable status).

The `reference` bucket silently swallowed two very different situations:

1. **Genuinely ambiguous reads this pass can't attribute to a key**:
   `initialize(paymentsEnv)`, `{ ...paymentsEnv }`, `return paymentsEnv`.
2. **Reads that a slightly smarter single-file pass CAN attribute**:
   `const { STRIPE_KEY } = paymentsEnv` binds STRIPE_KEY by name; `const e =
paymentsEnv; e.STRIPE_KEY` reads it through a trivial local alias.

For (2), every declared key of a destructured or aliased contract reported as
`UNCONSUMED_OWNED_VARIABLE` -- a **false claim of certainty**: env-cap said
"no consumer found in this repository" when a consumer was right there in the
same file, just not written as `contract.KEY`. Teams that destructure their
contracts (a common style) got a uniformly wrong usage report.

The naive fix -- "trace data flow properly" -- means a `ts.Program` + type
checker, which ADR 0002 and ADR 0010 deliberately avoid: the scanner is a
fast, per-file `ts.createSourceFile()` parse with no semantic binding, and
keeping it that way is what makes it viable on a large monorepo and what
keeps its findings _provable_ rather than heuristic.

## Decision

The scanner follows exactly two additional, purely-syntactic, single-file
shapes, and treats everything it cannot follow as an explicit `escape`
(never as silence, and never as a guess):

### 1. Object-destructuring from a bare tracked import

`const { X, Y: y, ["Z"]: z } = paymentsEnv` records a `member` access for
each statically-knowable key (`X`, `Y`, `Z`), keyed by the **property name**,
never the local binding name. Per binding element:

- A computed key that is **not** a string literal (`{ [k]: v }`, `{ [f()]: v
}`, `{ 5: v }`) -> `escape` (`via: "computed-key"`). The key expression is
  still walked for nested tracked references.
- A **nested** binding pattern (`{ Y: { Z } }`) -> `escape` (`via:
"nested-pattern"`) for that element only. Sibling plain keys still record
  their `member` access.
- A **rest** element (`{ ...rest }`) -> `escape` (`via: "rest"`).

The fast path only fires when the destructuring source is a **bare
identifier** that is a tracked import. `const { x } = paymentsEnv.getThing()`
falls through to the ordinary walk (which records the `.getThing` member
access), unchanged.

### 2. One level of file-unique `const` aliasing

`const e = paymentsEnv` registers `e` as **another local name for the same
import binding**, so the ordinary walk then treats `e.X`, `e["X"]`, `e[expr]`
and a bare `e` exactly as it treats `paymentsEnv.X` etc. -- zero further
special-casing, and `dependency-graph.ts`'s existing import-resolution pass
merges `e`'s accesses into the same contract automatically.

An alias is tracked **only if** its name is:

- declared with `const`, initialized to a bare identifier that is itself a
  **tracked import** (never another alias -- one level, no chains); and
- **file-unique**: introduced exactly once anywhere in the file, as counted
  by every binding-introducing position (a `var`/`let`/`const` declarator, a
  destructuring binding element, a function/arrow parameter, a `catch`
  binding, a named function/class); and
- **never assigned to** afterward: not the left side of `=` or any compound
  assignment (`^=` is the top of `SyntaxKind`'s assignment-token range), not
  the operand of `++`/`--`, not a keyword-less `for (e of …)` / `for (e in …)`
  loop variable.

A candidate whose base **is** a real tracked import but that fails the
uniqueness/never-assigned check is reported as an `escape` (`via:
"reassignment"`) against that import at the declaration site -- `const e =
paymentsEnv` is a real read of the contract even when this pass declines to
follow `e`. A `const b = a` chained onto a resolved alias `a` is deliberately
**not** followed: `a` is recorded as a bare reference for that read, since
`b` is never tracked.

This pass is **not scope-aware** -- matching every other check in
`scan-dependencies.ts`. A name shadowed in a nested function still counts as
a second declaration and disqualifies the alias. This is conservative in the
safe direction: the worst outcome is a real alias going untracked and its
keys degrading to `indeterminate`, never a false `used`.

### 3. `deriveOwnershipFindings` widens on any escape, and a proven access always wins

`dependency-graph.ts` records every `escape` site (and every remaining bare
`reference`) at the **contract** level (`escapeSites`), alongside the
existing `dynamicAccessSites`. A variable's status is then:

- `used` -- at least one `member` access anywhere. **Unconditional**: a
  proven member access wins even when the same contract also has escapes.
- `indeterminate` -- no member access, but the contract has a dynamic access
  **or** an escape somewhere. `evidence` is `"dynamic-access"` or
  `"escape"`; the finding's `reason` cites every site (with its `via`),
  named per ADR 0036.
- `unconsumed` -- imported, and no member access, no dynamic access, **no
  escape** anywhere. This now provably means "we resolved the import, saw
  every use of it, and none named this key."

`VariableAccessStatus` stays exactly three-valued (`used | unconsumed |
indeterminate`) -- `escape` is a sub-reason within `indeterminate`, not a new
status, so ADR 0010's "no fourth state borrowed from a model env-cap doesn't
have" rule is untouched.

## Consequences

- A bare `initialize(paymentsEnv)` / `{ ...paymentsEnv }` / `return
paymentsEnv` now yields `indeterminate` for every not-otherwise-read key,
  where it previously (wrongly) yielded `unconsumed`. Three env-cap test
  fixtures that relied on the old behavior to construct an "unconsumed" case
  were changed to import-without-referencing instead (the genuine
  never-consumed shape).
- `documentEnv`'s `dynamicAccess` citation (ADR 0037) remains the escape
  hatch for a read env-cap's own AST walk genuinely cannot see -- a shell
  script, a Docker entrypoint, a sibling service. In-repo destructuring and
  aliasing no longer need one.

## Alternatives considered

- **A `ts.Program` + type checker to follow aliases/destructuring/cross-file
  properly.** Rejected -- contradicts ADR 0002/0010's fast, per-file,
  semantics-free design; seconds-to-minutes on a large monorepo; and the
  checker can still be defeated (`any`, dynamic access), so it trades a large
  cost for a still-incomplete result. The bounded syntactic rule here catches
  the overwhelmingly common real shapes and is honest (`indeterminate`) about
  the rest.
- **Downgrade `unconsumed` -> `indeterminate` for any bare reference, and add
  no dataflow at all.** Rejected -- removes the false positives but adds no
  real signal; a destructured contract would report every key as "we're not
  sure" forever.
- **Track alias chains (`const b = a; b.X`).** Rejected -- no natural
  stopping point (`c = b; d = c; …`), the same unbounded-resolution concern
  ADR 0010 rejects for barrel chains. One level covers the real cases; deeper
  chains degrade safely to `indeterminate`.
- **Full lexical-scope analysis for alias validity** (so a shadowed name in a
  nested function doesn't disqualify the outer alias). Rejected as
  disproportionate -- the file-unique-`const` rule needs no scope engine and
  cannot produce a false `used`; an un-followed real alias just becomes
  `indeterminate`, the safe direction.
