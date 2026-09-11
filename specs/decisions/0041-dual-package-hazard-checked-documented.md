# 0041: Dual-package hazard (duplicate module instantiation across import paths) is a checked, documented risk class

## Status

Accepted. Checked by `test/runtime/dual-package-hazard.test.ts`; documented
in [`SECURITY.md`](../../SECURITY.md#dual-package-hazard).

## Context

The runtime keeps identity-sensitive state in module scope:

- `src/runtime/registry.ts` — a private `WeakMap<object, ContractInternals>`
  that is the only association between a contract object returned by
  `createEnv()` and its schema. `validateEnv()`, `resetEnvCache()`, and
  `isEnvContract()` all consult it.
- `src/runtime/cache.ts` — the module-level validation cache (`state`,
  `contractValues`, `contractErrors`).

Both are correct and necessary within one loaded module instance. They
become a hazard the moment a consumer's dependency tree resolves
`env-cap` through two different specifiers — an ESM importer
and a CJS `require()`r of the same logical package, or a re-exporting
intermediate package. Node loads two entirely separate module instances in
that case, each with its own registry `WeakMap` and its own cache. No npm
package that ships both an ESM and a CJS build can prevent this; it is a
property of how Node's two module systems resolve independently.

## Decision

Since the hazard cannot be prevented, it is made a checked, documented risk
class instead of a silent unknown. `test/runtime/dual-package-hazard.test.ts`
loads the built `dist/index.js` (ESM) and `dist/index.cjs` (CJS) as two
genuinely separate module instances and pins the exact, understood
consequence:

- the same resolution path always yields the same registry/cache (no hazard
  within one module graph);
- different resolution paths load different instances (the hazard itself,
  confirmed rather than assumed);
- and — the important part — the failure mode is **fail-fast, not silent**:
  a contract created by the ESM instance's `createEnv()` and handed to the
  CJS instance's `validateEnv()`/`resetEnvCache()` throws a `TypeError`
  ("this value was not created by createEnv()"), and `isEnvContract()`
  returns `false`. It never validates against the wrong schema or reads a
  stale cache silently.

[`SECURITY.md`](../../SECURITY.md#dual-package-hazard) states this plainly
for evaluators planning a mixed-module-system deployment.

## Consequences

- An application evaluating this package for a mixed ESM/CJS environment
  has an honest, tested answer rather than an unverified claim.
- The `TypeError` thrown by `getContractInternals()` is load-bearing for
  this guarantee — a future change that made it return a default or
  `undefined` instead of throwing would turn the fail-fast behavior into
  silent misvalidation. The test pins the throw.
- The test requires `npm run build` to have produced `dist/index.{js,cjs}`;
  it `skipIf`s gracefully otherwise, matching the cross-runtime tests'
  convention.

## Alternatives considered

- **Preventing the hazard via a `globalThis`-keyed registry stable across
  realms.** Rejected — adds real complexity and a new hazard class (global
  namespace collision, version-mismatch handling) to solve a problem that,
  once understood, already fails loudly and safely.
- **Ignoring it, undocumented.** Rejected — an unstated, unverified risk is
  strictly worse for an evaluator than a stated, tested one, even though
  the underlying limitation is identical either way.
- **Matching `@maverickcer/data-cap`'s framing verbatim.** data-cap's
  hazard (ADR 0041 there) degrades _silently_ (its `defaultCoordinator`
  singleton just stops sharing work). env-cap's degrades _loudly_ (a
  `TypeError`). The risk class is the same; the documented consequence is
  deliberately package-specific.
