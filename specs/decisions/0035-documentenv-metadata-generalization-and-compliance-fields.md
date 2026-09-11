# 0035: `documentEnv()` metadata generalized to any value, plus five new named compliance-adjacent fields

## Status

Accepted. Implemented.

## Context

`ContractDocs.metadata` (`src/runtime/document.ts`) was already a named, typed field —
`Record<string, string>` — but only at contract level. `VariableDocs` had no `metadata` field at
all; instead it carried an open index signature, `[key: string]: string | boolean | undefined`,
so any unrecognized top-level key on a variable's docs got silently swept into an internal `extra`
bag by `src/build/parse.ts`'s `extractVariableDocsMap()` — and only if its value happened to be a
string. A non-string, non-boolean value on an unrecognized key (an object, a number, an array) was
silently dropped at parse time with no warning at all.

Separately, building a genuine "prove sensitive data was handled responsibly" report (the
motivating use case for `enterprise-platform`, the third flagship — ADR 0034) needs facts a free-form
string bag can't reliably provide: a projection can't safely assert "this variable has no stated
purpose" if `purpose` might be spelled `purpose`, `reason`, or `why` inconsistently across a
codebase's `metadata` bags.

## Decision

- **`VariableDocs.metadata?: Record<string, unknown>` replaces the open index signature.**
  `ContractDocs.metadata` widens in place from `Record<string, string>` to
  `Record<string, unknown>`. Both accept any primitive or object value per key, recursively —
  `evaluateLiteral()` (`src/build/literal-eval.ts`) already evaluates arbitrary nested
  object/array/primitive literals with no code execution, so this needed no new AST capability,
  only a validation-loosening change: `parse.ts`'s `isStringRecord()` becomes `isRecord()`,
  accepting any value shape, reused at both levels.
- **The old variable-level catch-all is gone, not renamed.** A previous draft of this change
  considered renaming the internal `extra` bag to `metadata` and keeping its "sweep any
  unrecognized string-valued key" behavior. Rejected: that would make `metadata` behave
  differently at the two levels (contract-level `metadata` has always been an explicit,
  deliberately-set field; a renamed `extra` would still be an implicit catch-all). `metadata` is
  now explicit and symmetric at both levels — a value must be nested under a literal `metadata:
{...}` key to be captured; an arbitrary sibling key on a `VariableDocs` object literal is no
  longer collected by anything.
- **Five new named fields, on both `VariableDocs` and `ContractDocs`**, following the exact
  `owner`/`classification`/`expiresAt` variable-overrides-contract pattern:
  `purpose?: string`, `legalBasis?: string`, `retentionPolicy?: string`,
  `dataResidency?: string | string[]`, `auditRequired?: boolean`. Deliberately
  **framework-agnostic** — no GDPR/HIPAA/SOC2 vocabulary in the field names themselves (a specific
  citation like `metadata: { gdprArticle: "Art. 32" }` belongs in the now-widened `metadata` bag
  instead), matching ADR 0024's "env-cap doesn't decide what compliance means" stance.
- **`retentionPolicy` is deliberately not given `expiresAt`'s computed semantics.** `expiresAt` is
  an actual temporal constraint env-cap already parses and computes "days remaining" against;
  `retentionPolicy` is a policy description ("delete after 90 days") env-cap never parses or
  evaluates. Both are exposed side by side in the Lifecycle Model as independent facts.
- **No new core `FindingCode`s.** A rule like "`classification: pii` without a `purpose` is a
  finding" encodes a policy decision env-cap has no basis to assert on its own — only the
  organization using it does. That responsibility belongs in the _consumer's_ evidence projection
  (see `enterprise-platform`'s `configuration-governance.ts`), reading these five facts, not in
  `src/build/finding-model.ts`.

## Consequences

- Any `VariableDocs` object literal relying on the old open index signature for an arbitrary
  top-level field (e.g. `{ FOO_VAR: { runbook: "https://..." } }`) must move it under
  `metadata: {...}` (e.g. `{ FOO_VAR: { metadata: { runbook: "https://..." } } }`) — a real,
  intentional breaking change, acceptable pre-1.0.
- `DiscoveredVariableDocs.extra: Readonly<Record<string, string>>` (always present, possibly
  empty) becomes `metadata: Readonly<Record<string, unknown>> | undefined` (present only when
  actually set) — every downstream consumer (`link.ts`, `manifest-snapshot.ts`,
  `contract-model.ts`, `compatibility.ts`, `docs.ts`, `env-example.ts`) threads the rename and the
  now-optional shape.
- `compatibility.ts`'s `"extra.<key>"` divergence label becomes `"metadata.<key>"`, and its
  divergence check needs a real deep-equal instead of `!==`, since two structurally-identical
  `metadata` objects are never referentially equal.
- Non-string `metadata` values need `JSON.stringify()` wherever `docs.ts`/`env-example.ts` render
  them as `` `- ${key}: ${value}` `` — a bare template-literal interpolation of an object value
  would print `[object Object]`.

## Alternatives considered

- **Minimal: widen `metadata` only, no new named fields.** Rejected as the sole change —
  `purpose`/`legalBasis` would have no dedicated, reliably-spelled key any projection could read
  with a type guarantee, meaningfully weaker for the legal-defense use case `enterprise-platform`
  exists to demonstrate.
- **Maximal: the five fields above plus `dataSubjectRights`, `thirdPartyRecipients`,
  `crossBorderTransfer`, `consentRequired`.** Rejected for this round — goes further than
  `enterprise-platform` strictly needs to prove the pattern, with no concrete driving use case the
  way `purpose`/`legalBasis` have one. A specific field from this list can be added later if
  actually needed.
