# 0032: Evidence projection provenance via a non-frozen Proxy tracking membrane, not `Object.freeze()`

## Status

Accepted. Implemented in `src/evidence/define-projection.ts`.

## Context

The original audit's sketch for `defineEvidenceProjection()` proposed
wrapping the (already `deepFreeze()`-d, per ADR 0012's precedent)
`EvidenceModel` in a tracking `Proxy` before handing it to a projector,
recording every field path actually read, and attaching those paths as
automatic provenance -- so a consumer never has to hand-maintain "which
evidence produced this output" bookkeeping themselves.

A design spike (tracked separately, not merged) tested this directly and
found a real incompatibility the original sketch didn't anticipate:
`Object.freeze()` makes every one of an object's own properties
non-configurable (and non-writable, for data properties). Per the ECMAScript
spec, a `Proxy`'s `get` trap on a non-configurable, non-writable data
property is _required_ to return the exact (`===`) value the target holds --
it cannot substitute a wrapping proxy for a nested object. Concretely: once
`EvidenceModel` is frozen (at any level), wrapping it in a wider Proxy and
returning a _different_ proxy for a nested property read throws
`TypeError: 'get' on proxy: property '...' is a read-only and
non-configurable data property on the proxy target but the proxy did not
return its actual value` on the very first nested access. Freezing even
just the top level was enough to break wrapping of that level's own
properties in reproduction.

## Decision

- **The tracking membrane never wraps a frozen object.** Each call into a
  projector's field function first takes a `structuredClone()` of the
  caller's `EvidenceModel` -- a fresh, unfrozen, fully disconnected copy --
  and wraps _that_ in the Proxy membrane. The caller's own (possibly
  `deepFreeze()`-d) `EvidenceModel` is never touched.
- **Immutability is enforced by the membrane's own traps, not by freezing
  the target.** `set`, `deleteProperty`, `defineProperty`, and
  `setPrototypeOf` all throw a `TypeError` unconditionally. This gives the
  same practical guarantee (a projector cannot mutate the evidence it reads)
  without relying on `Object.freeze()`, which is what made deep read-tracking
  impossible in the first place.
- **Every `get` is a two-fold operation: return the real value, and record
  the path.** For each property key that is a string (not a `Symbol`, which
  covers well-known protocol hooks like `Symbol.iterator` and is left to pass
  through unrecorded) other than an array's own `"length"` (recorded paths
  are meant to name _evidence fields_, and `.length` reads are pervasive
  incidental noise from iteration, not a field a consumer meaningfully
  "read"), the dotted path from the model root is added to a `Set`, and the
  result -- if itself an object -- is recursively wrapped (memoized in a
  `WeakMap` keyed by the already-cloned object, so repeated reads of the same
  nested object return the same proxy instance rather than constructing a
  new one each time). This design was verified against plain nested reads,
  `.map()`/array iteration (including `for...of`'s internal `Symbol.iterator`
  call, which correctly re-enters the membrane per element), destructuring,
  and spread -- all correctly attribute reads to their real field paths.
- **`generateEvidenceModel()`'s own output stays genuinely frozen.**
  `deepFreeze()` (ADR from Phase 12's genericization) is still the right
  tool for the `EvidenceModel` a caller receives _outside_ a projection --
  direct property access on that object throws on mutation exactly as every
  other canonical model does. Freezing and the tracking membrane are simply
  never applied to the same object graph at the same time.
- **Recorded sources are flat `EvidenceModel` field-path strings today, not
  `EvidenceReference`s.** Turning a path like
  `"contract.contracts.0.variables.0.key"` into the structured
  `EvidenceReference` shape (`{model: "contract", exportName: "...",
variable: "..."}`, `src/build/evidence-reference.ts`, ADR 0026) requires
  _model-aware_ interpretation -- knowing that index `0` into `.contracts`
  means "keyed by that contract's `exportName`," and index `0` into
  `.variables` means "keyed by `key`" -- which a generic path-string reader
  cannot derive on its own without hardcoding each model's array-shape
  semantics into the tracking membrane itself. That per-model resolution is
  real, additional design work, deliberately deferred rather than rushed
  into this phase; see `VERSIONING.md`'s Experimental-tier note for
  `./evidence`.
- **Purity beyond read-only-ness is documented, not enforced.** Nothing stops
  a projector from calling `fetch()` or `console.log`-ing a secret from
  within its function body -- there is no runtime mechanism in JavaScript
  that can prevent arbitrary side effects inside a plain function. A
  projector is documented (`EvidenceProjector`'s own JSDoc) as required to be
  a pure function of its `evidence` argument; only the read-only half of
  that contract is actually enforced.

## Consequences

- `defineEvidenceProjection()`'s `project()` path clones `EvidenceModel` once
  per output field (a fresh membrane per field, so each output key's
  `sources` list reflects only that field's own reads). For a typical
  projection (a handful of output fields over a config-sized model), this is
  cheap; it would need reconsidering if a projection schema ever grew large
  enough, or `EvidenceModel` itself large enough, for repeated
  `structuredClone()` calls to matter.
- `structuredClone()` is a runtime dependency of `./evidence` -- available as
  a global in Node ≥17, all evergreen browsers, and every edge runtime this
  package already targets; no polyfill or additional dependency required.
- A future phase can add per-model index-path → `EvidenceReference`
  resolvers (one small, targeted function per of the six sub-models, per the
  spike's recommendation) as a purely additive enhancement to
  `EvidenceProjectionResult.sources`, without changing
  `defineEvidenceProjection()`'s call signature.

## Alternatives considered

- **Ship the original sketch as-is (freeze first, then wrap).** Rejected --
  throws a `TypeError` on the first nested property read, as confirmed by
  direct reproduction; not a viable implementation of the original design at
  all, not just a suboptimal one.
- **Explicit, caller-supplied `sources` instead of automatic tracking.** The
  documented fallback if the design spike hadn't panned out. Rejected once
  the spike confirmed the membrane-based approach works cleanly -- automatic
  provenance is strictly more useful than asking every projection author to
  hand-maintain a parallel `sources` array that can silently drift from what
  their projector actually reads.
- **Build the full model-aware `EvidenceReference` resolution now, instead of
  flat path strings.** Rejected for this phase -- real, separate design work
  (six model-specific index-path interpreters) that the spike explicitly
  flagged as non-trivial; shipping flat path strings first lets real
  projection usage inform what the resolved shape should look like, the same
  Experimental-tier reasoning `VERSIONING.md` already applies elsewhere.
