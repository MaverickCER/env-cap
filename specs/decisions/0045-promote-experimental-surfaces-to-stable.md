# 0045: Promote every remaining Experimental surface to Stable

## Status

Accepted. Moves the entire Experimental-tier bullet list in `VERSIONING.md`
into Stable, leaving the Experimental section empty. Removes every
`**Experimental**`/`Experimental, see ADR NNNN` doc-comment and CLI
help-text marker for the promoted surfaces across `src/build/generate-manifest.ts`,
`generate-documentation.ts`, `generate-evidence.ts`, `generate-usage.ts`,
`generate-env-artifacts.ts`, `index.ts`, `resolution/resolve-tsconfig-paths.ts`,
`resolution/resolve-package-schema.ts`, and `src/cli/index.ts`'s help text;
updates the corresponding prose in `README.md`, `GUIDE.md`, `SECURITY.md`,
and `ADOPTION.md`.

## Context

`VERSIONING.md`'s own Experimental-tier definition states the graduation
criterion directly: "Once a feature has been through at least one real
feedback cycle without a need to break it... it becomes Stable." Applying
that criterion to each currently-Experimental surface:

- **`packages`/`tsconfig` options** (ADR 0014/ADR 0023): the first surfaces
  to ship this way, in real use the longest, with no reported need to
  change either option's shape.
- **The lower-level `./build` primitives** (`discoverSchemaFiles`,
  `linkFiles`, `parseSchemaFile`, `renderManifest`, `renderDocs`,
  `detectCompatibilityIssues`, `detectExclusiveGroupIssues`): justified for
  real external use (custom CI scripts, bundler plugins) since their
  introduction, with no reported need to change their signatures.
- **`generateEvidenceModel`/`getEvidenceModel`/`computeSourceFingerprint`/
  `renderUsageReport`**: each has shipped with its current contract since
  introduction; `generateEvidenceModel`'s "every finding becomes a
  `Finding`, never a throw" behavior is explicitly its permanent, intended
  shape (see ADR 0031), not a temporary gap this promotion needed to close.
- **The `init` CLI subcommand** (ADR 0042): its scaffolded file set and
  template contents have not needed to change since introduction.
- **`env-cap/evidence`** (`defineEvidenceProjection`, `EvidenceModel`) and
  **the persisted evidence artifact** format: see the caveat below --
  promoted along with everything else per this decision's scope, but with a
  real, named exception to the "no reported need to change" pattern the
  other promotions share.

This package is laser-focused on one core benefit -- environment-variable
contracts that are documented, owned, and validated by construction -- and
every mechanism that ships as part of it is meant to be depended on with
confidence, not held at arm's length behind a tier that exists for genuine
uncertainty that no longer applies.

## Decision

Promote all of it to Stable in one pass. The Experimental tier itself stays
defined in `VERSIONING.md` -- it remains the right mechanism for a
genuinely new, unproven future surface -- it is just empty right now,
honestly, rather than holding onto a designation that no longer describes
something true for these APIs.

**Named caveat, not silently dropped:** `VERSIONING.md`'s prior text for
`env-cap/evidence` said real projection authorship "is likely to surface a
better shape for `EvidenceProjectionResult.sources` in particular
(currently flat `EvidenceModel` field-path strings, not yet resolved into
structured `EvidenceReference`s -- see ADR 0032's Consequences)." That is a
specific, acknowledged, _unresolved_ design question about the current
shape being probably wrong in one particular spot -- not merely "hasn't had
time to prove itself yet," which is the graduation story every other
surface in this ADR has. Promoting it anyway is a deliberate choice to
apply one consistent policy fleet-wide rather than carve out an exception,
made with that specific risk stated plainly here rather than folded
silently into a blanket "everything's fine now" promotion. A future
`sources` shape change, if `EvidenceReference` resolution is added, is a
real Stable-tier breaking change from this point forward -- not the
minor-may-break allowance an Experimental surface would still have had.

## Consequences

- A breaking change to any promoted surface now requires a major version
  bump (once `env-cap` reaches 1.0 -- see `VERSIONING.md`'s Pre-1.0 status
  section; before that, the existing minor-may-break-Stable allowance still
  applies, same as every other Stable surface).
- No runtime behavior changes anywhere in this ADR -- documentation and
  compatibility-promise change only, verified by the full test suite
  passing unchanged.
- `EvidenceProjectionResult.sources`'s field-path-string shape is now a
  Stable commitment despite the open design question above -- see the
  caveat. If that question resolves toward structured `EvidenceReference`s
  later, it ships as a major (or, pre-1.0, an explicitly-flagged breaking
  minor per existing convention), not a quiet Experimental-tier adjustment.

## Alternatives considered

- **Promote everything except `env-cap/evidence`/the evidence artifact
  format, leaving those two Experimental until the `sources` question
  resolves.** This is the technically more conservative option, and was
  seriously considered given the caveat above is a real, specific,
  unresolved concern rather than a generic "needs more time." Not taken for
  this pass because the fleet-wide decision this ADR implements is to carry
  no Experimental-tier surface at all; the caveat is recorded here precisely
  so this tradeoff is visible and reversible (a future ADR can re-introduce
  an Experimental designation for `sources` specifically if the shape
  question surfaces a real need to break it before 1.0).
- **Promote piecemeal, one ADR-reviewed feedback cycle at a time.**
  Rejected for the surfaces with no open design question -- they already
  independently satisfy the graduation criterion, so gating them on
  separate future ADRs would just delay an already-justified decision.
