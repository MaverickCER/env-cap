# 0050: A variable declared in more than one contract is documented once

## Status

Accepted. Implemented in `src/build/merge-documentation.ts`, applied at the end of `linkFiles` in
`src/build/link.ts`, and in `documentationDivergences` in `src/build/compatibility.ts`. Refines
[ADR 0005](0005-warn-not-throw-by-default.md)'s duplicate-documentation warning and builds on
[ADR 0014](0014-cross-package-schema-discovery.md).

## Context

The process has one flat environment, so two contracts can name the same variable: a reusable package that ships
its own contract (ADR 0014), and the application that consumes it. Each declaration is processed independently, so
this is not a conflict in itself. It did make the documentation awkward: the package explains the variable, and the
application, to record something that is only true of the application (the date its own copy of a token expires, who
owns it there), had to repeat the whole explanation. Two copies of an explanation drift, and the duplicate
documentation warning fired on any field that differed, including a field only one declaration set.

## Decision

- Documentation for the same variable is merged between a package's contract and any other contract when the
  contracts are linked. Every field a declaration leaves unset is filled from a declaration of the same variable that
  sets it, where one of the two comes from an allow-listed package. `metadata` is merged key by key under the same
  rule.
- Two of the application's own contracts never fill each other. They are siblings, often alternatives (a service that
  can run on either of two databases), and each documents the variable for itself; borrowing an owner or an expiry
  from the other would describe a credential the contract does not use.
- A field a declaration sets itself is never replaced.
- When several declarations set a field, the one from a package found first wins; the application's own contracts
  fill a package's gaps only when no package sets the field, and only when every one of them that sets it agrees
  (two alternatives that disagree give the package neither value). Metadata follows the same rule key by key.
- A variable counts as documented when it, or a declaration it can be filled from, is.
- `DUPLICATE_VARIABLE_DOCUMENTATION` is reported only for a field both declarations set, to different values. A field
  only one of them sets is not a disagreement.

## Consequences

- An application documents a variable a package already explains by naming it again with only what is its own, for
  example `{ expiresAt: "2027-01-01" }`. The explanation stays in one place and cannot drift from the package's.
- Both declarations then show the merged documentation in every output, so a reader sees the same thing wherever
  they look, except for a field the two set differently, which each keeps as its own; the catalog still lists the
  variable under each contract that declares it.
- Two declarations that set a field differently still differ afterwards and are still reported, so a deliberate
  override is visible rather than silently resolved.
- The processor and validator comparisons are unchanged: declarations that carry different implementations are
  still reported, since a merge cannot make them agree.
- Reversible: removing the merge step restores the previous behaviour, apart from the comparison change.

## Alternatives considered

- **Let the application's declaration win.** It would hide that a package's explanation was overridden, and an
  application would silently shadow a security note.
- **A separate "overlay" API for an application's additions.** A second way to say the same thing, for something the
  existing `documentEnv()` entry already expresses.
- **Keep reporting any difference.** It keeps the copy-everything habit that makes the copies drift.
