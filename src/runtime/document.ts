import type { EnvSchema } from "./types.js"

/**
 * Developer-supplied evidence assertions for one variable -- categorically
 * different from every field on {@link VariableDocs}: those are
 * declared-and-never-verified, while `dynamicAccess` is re-checked against
 * reality on every run (fresh / stale / missing). Kept structurally separate,
 * in `VariableDocs.evidence` rather than folded in alongside `description`/
 * `owner`/..., specifically so that different epistemic status is visible in
 * the shape itself and not only in a doc comment. See ADR 0037.
 */
export interface VariableEvidenceDocs {
  /**
   * Citation(s) of where this variable is actually read dynamically --
   * somewhere env-cap's own static AST scan can't see (a shell script, a
   * Docker entrypoint, a sibling service). Each entry is a
   * `"<relative-path>:<line>:<column>"` citation.
   *
   * @remarks
   * A developer's re-acknowledgment that access happens, never a claim
   * env-cap itself observed anything -- tracked as its own independent fact
   * and never folded into the AST-derived `VariableAccessStatus`. Re-verified
   * every run: a citation whose file no longer exists, or whose content has
   * visibly changed since it was last acknowledged, is flagged rather than
   * trusted forever.
   */
  dynamicAccess?: readonly string[]
}

/**
 * Per-variable documentation. Every field is optional and unconstrained on
 * purpose -- there is no required shape, so documenting a variable never
 * fights the type checker, and you can add a field the generator doesn't
 * know about yet without it being rejected.
 */
export interface VariableDocs {
  /** Human-readable explanation of what this variable is and what it controls. */
  description?: string
  /** Who owns this variable (a team, a handle, whatever your org uses). Overrides the contract's own `owner` for this key. */
  owner?: string
  /**
   * How sensitive this variable's value is. Overrides the contract's own `sensitivity` for this
   * key.
   *
   * @remarks
   * Deliberately an open `string`, not a closed union: an org's own sensitivity vocabulary is its
   * own, and a level env-cap doesn't recognize is always honored, never dropped. The generator
   * still reports a `NONSTANDARD_SENSITIVITY_LEVEL` finding (severity `info`, never blocking) for
   * anything outside `secret`/`credential`/`pii`/`config`, so vocabulary drift stays visible
   * without being enforced.
   */
  sensitivity?: string
  /** ISO date string (e.g. "2026-06-01") -- when this variable's current value stops being valid (a key rotation deadline, a sunset date, etc.). */
  expiresAt?: string
  /** How to get a new value before/when it expires (e.g. "Rotate in the Stripe dashboard, then redeploy."). */
  refreshInstructions?: string
  /**
   * Explicit, actionable instructions for obtaining this variable's value the *first* time --
   * where `refreshInstructions` is "how to rotate it once you already have one," this is "how to
   * get one at all" (e.g. "Create a restricted API key in the Stripe dashboard under Developers ->
   * API keys, scoped to read/write Charges."). A named field specifically so this can render as
   * its own labeled line in generated docs, rather than requiring a `metadata.setup`-style
   * convention with no dedicated rendering or type checking.
   */
  setupInstructions?: string
  /** Documentation-level assertion that this variable must be set. Independent of how (or whether) a validator actually enforces it. */
  required?: boolean
  /** Marks this variable as being phased out. Independent of `expiresAt` (a rotation/sunset date) and of the contract-level `active` switch (on/off, not a phase-out signal). */
  deprecated?: boolean
  /** Why this variable is deprecated, and/or what to use instead. Only meaningful alongside `deprecated: true`. */
  deprecatedReason?: string
  /** ISO date string -- by when a deprecated variable must be removed. Only meaningful alongside `deprecated: true`. */
  removeBy?: string
  /** The previous environment variable name this one replaces, if this declaration is the result of a rename. Lets the Change Model correlate a remove+add pair into a single rename entry instead of two unrelated changes. */
  renamedFrom?: string
  /** Why this variable's value is collected/used -- a framework-agnostic fact (pairs with `legalBasis`; a specific citation like a GDPR article belongs in `metadata` instead). Overrides the contract's own `purpose` for this key. */
  purpose?: string
  /** The legal basis this variable's collection/use relies on -- framework-agnostic (e.g. "user consent," "contractual necessity"), never a specific statute name. Overrides the contract's own `legalBasis` for this key. */
  legalBasis?: string
  /** Descriptive retention policy (e.g. "delete after 90 days"). A policy statement, not a computed value -- unlike `expiresAt`, nothing parses or evaluates this. Overrides the contract's own `retention` for this key. */
  retention?: string
  /** Where this variable's value is/must be stored (a region, or a permitted set of regions). Overrides the contract's own `dataResidency` for this key. */
  dataResidency?: string | string[]
  /** Documentation-level assertion that this variable's handling must be auditable. Overrides the contract's own `auditRequired` for this key. */
  auditRequired?: boolean
  /**
   * Developer-supplied evidence assertions for this variable -- verified over
   * time, unlike every other field above, which is declared and never
   * verified. Kept structurally separate for exactly that reason; see
   * {@link VariableEvidenceDocs}.
   */
  evidence?: VariableEvidenceDocs
  /**
   * Structured, unsupported-key documentation -- any primitive or object value, for anything that
   * doesn't warrant its own named field. A previously-supported top-level key belongs in a named
   * field above instead of here once one exists for it.
   */
  metadata?: Record<string, unknown>
}

/**
 * Contract-level documentation, plus everything {@link documentEnv}'s options used to carry that
 * only the generator ever read.
 *
 * @remarks
 * Generic over `S`, the exact schema type {@link documentEnv} infers from its `schema` argument --
 * this is what makes `variables` below a closed, checked map (a typo'd or renamed key is a
 * compile error, not a silent no-op) rather than an open `Record<string, VariableDocs>` any string
 * would satisfy. `S` defaults to the widest possible schema so this type is still nameable on its
 * own (e.g. in a helper function's own parameter type) without narrowing to one specific contract.
 */
export interface ContractDocs<S extends EnvSchema = EnvSchema> {
  /** Overrides the auto-generated label used in generated docs. Purely cosmetic. Wins over `createEnv()`'s own `name` option, which in turn wins over the exported binding name. */
  name?: string
  /** Groups this contract under a heading in the generated docs' feature catalog. */
  category?: string
  /** The generator throws if two *active* contracts declare the same `exclusiveGroup` -- use it to mark interchangeable features (e.g. two database backends) as mutually exclusive. */
  exclusiveGroup?: string
  /** When `false`, this contract is excluded from the generated manifest, docs' required section, and exclusiveGroup checks -- it still appears, marked disabled, in the feature catalog. Defaults to `true`. */
  active?: boolean
  /** Default owner for every variable in this contract that doesn't set its own `owner`. */
  owner?: string
  /** Default sensitivity for every variable in this contract that doesn't set its own `sensitivity` -- see {@link VariableDocs.sensitivity} for why this is an open `string`. */
  sensitivity?: string
  /** Whole-contract/feature sunset date, ISO date string. */
  expiresAt?: string
  /** Marks this whole contract/feature as being phased out. Independent of `active` (on/off, not a phase-out signal). */
  deprecated?: boolean
  /** Why this contract is deprecated, and/or what to use instead. Only meaningful alongside `deprecated: true`. */
  deprecatedReason?: string
  /** Default reason this contract's variables' values are collected/used -- see {@link VariableDocs.purpose}. */
  purpose?: string
  /** Default legal basis for this contract's variables -- see {@link VariableDocs.legalBasis}. */
  legalBasis?: string
  /** Default retention policy for this contract's variables -- see {@link VariableDocs.retention}. */
  retention?: string
  /** Default data residency for this contract's variables -- see {@link VariableDocs.dataResidency}. */
  dataResidency?: string | string[]
  /** Default audit-required assertion for this contract's variables -- see {@link VariableDocs.auditRequired}. */
  auditRequired?: boolean
  /** Arbitrary contract-level documentation (e.g. `runbook`), rendered alongside this feature -- see {@link VariableDocs.metadata}. */
  metadata?: Record<string, unknown>
  /**
   * Per-variable documentation, keyed by variable name -- keys are checked against `S`'s own keys
   * at compile time, so documenting a variable that was renamed or removed from `schema` (or a
   * plain typo) is a type error here, not a silently-ignored entry the generator would otherwise
   * have to report as "stale" after the fact. A schema key absent from `variables` entirely is
   * still valid (not every variable needs documentation) and is reported as undocumented by the
   * generator, exactly as before.
   */
  variables?: { readonly [K in keyof S]?: VariableDocs }
}

/**
 * Documents a schema for the generator: explains values, assigns ownership,
 * and describes lifecycle, feeding the generated docs artifact and
 * `.env.example`. Pass it the *same* schema object given to {@link createEnv}, so
 * the generator can statically link the two and verify every variable is
 * documented -- and so TypeScript can check `docs.variables`' keys against
 * `schema`'s own keys, the same object identity doing double duty for both
 * the generator's static link and the type checker's.
 *
 * @remarks
 * A no-op at runtime by design -- nothing passed here is retained anywhere,
 * and this can never throw, no matter how malformed `schema`/`docs` are.
 * Calling it is entirely optional: {@link createEnv} works identically whether or
 * not a matching `documentEnv` call exists. The real "is everything
 * documented?" check, and every artifact this data drives (the docs
 * artifact's ownership matrix, dependency graph, lifecycle report, and
 * security review; `.env.example`'s comments), runs entirely inside
 * {@link build.generateEnvManifest}'s static analysis -- this function's only job at
 * runtime is to exist as a safe, harmless marker the AST parser can find,
 * and to give you type-checked argument shapes while writing it.
 *
 * `S` is inferred from `schema`, never written out by hand -- pass the
 * schema object literal (or a `const`-inferred reference to it) directly for
 * the strongest inference; an explicitly-widened `schema: EnvSchema`
 * annotation loses the per-key literal type and falls back to accepting any
 * string key in `docs.variables`, same as before this generic existed.
 */
// Deliberately a true no-op (see the doc comment above): `documentEnv` has no
// runtime behavior at all, only a compile-time keyed-shape check and a
// static-analysis-visible call site -- its body being empty is observably
// identical to explicitly discarding both arguments, so there is nothing a
// test could assert to distinguish the two. (A `next-line` disable placed
// inside the parameter list, right before the closing paren, does not
// reliably attach as the block's own leading comment -- hence this unscoped
// disable/restore pair instead; see data-cap's `core/document.ts` for the
// same pattern and the Stryker directive-attachment mechanics behind it.)
// Stryker disable BlockStatement
export function documentEnv<S extends EnvSchema>(schema: S, docs: ContractDocs<S>): void {
  // Intentionally inert -- see the module doc comment above. Do not add
  // logic here; anything this function does happens at runtime, in every
  // process that imports the schema file, which is exactly what this split
  // exists to avoid. The `void`s below only satisfy `noUnusedParameters` --
  // a bare `schema`/`docs` expression statement trips `no-unused-expressions`
  // instead, and renaming these public parameters to `_schema`/`_docs` would
  // leak into every consumer's editor hover.
  // eslint-disable-next-line @typescript-eslint/no-meaningless-void-operator
  void schema
  // eslint-disable-next-line @typescript-eslint/no-meaningless-void-operator
  void docs
}
// Stryker restore BlockStatement
