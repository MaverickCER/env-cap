import type { EnvSchema } from "./types.js"

/**
 * Developer-supplied evidence assertions for one variable. They differ in kind from every field on
 * {@link VariableDocs}, which are declared and never verified. `dynamicAccess` is re-checked against
 * reality on every run (fresh / stale / missing). It lives apart, in `VariableDocs.evidence`, not
 * beside `description`, `owner` and the rest. So the shape itself shows the different status, not
 * only a doc comment. See ADR 0037.
 */
export interface VariableEvidenceDocs {
  /**
   * Citation(s) of where this variable is read dynamically, somewhere env-cap's static AST scan
   * can't see (a shell script, a Docker entrypoint, a sibling service). Each entry is a
   * `"<relative-path>:<line>:<column>"` citation.
   *
   * @remarks
   * A developer's re-acknowledgment that access happens, never a claim that env-cap observed
   * anything. It is tracked as its own fact and never folded into the AST-derived
   * `VariableAccessStatus`. It is re-verified every run. A citation whose file is gone, or whose
   * content has visibly changed since it was acknowledged, is flagged rather than trusted forever.
   */
  dynamicAccess?: readonly string[]
}

/**
 * Per-variable documentation. Every field is optional and unconstrained on purpose. With no
 * required shape, documenting a variable never fights the type checker. A field the generator
 * doesn't know yet is accepted, not rejected.
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
   * Deliberately an open `string`, not a closed union. An org's sensitivity vocabulary is its own,
   * and a level env-cap doesn't recognize is always honored, never dropped. The generator
   * still reports a `NONSTANDARD_SENSITIVITY_LEVEL` finding (severity `info`, never blocking) for
   * anything outside `secret`/`credential`/`pii`/`config`, so vocabulary drift stays visible
   * without being enforced.
   */
  sensitivity?: string
  /** ISO date string (e.g. "2026-06-01"): when this variable's current value stops being valid (a key rotation deadline, a sunset date, etc.). */
  expiresAt?: string
  /** How to get a new value before/when it expires (e.g. "Rotate in the Stripe dashboard, then redeploy."). */
  refreshInstructions?: string
  /**
   * The kind of authenticator/secret this variable holds (e.g. "api-key", "oauth-client-secret",
   * "database-password", "tls-certificate"). It feeds the "authenticator type" column of the NIST
   * SP 800-53 IA-5 rotation-status report. IA-5 requires an organization-defined rotation period
   * "by authenticator type," so a generator groups and labels by this field.
   *
   * @remarks
   * Deliberately an open `string`, not a closed union, like {@link sensitivity}. An org's
   * authenticator taxonomy is its own, and IA-5 itself names no fixed set of types.
   */
  authenticatorType?: string
  /**
   * How often this variable's value must be rotated, in organization-defined terms (e.g. "90
   * days", "P90D", "6 months"). This is IA-5's "organization-defined time period" per authenticator
   * type (the time-based half of IA-5's two-trigger rotation model). Paired with
   * {@link lastRotatedAt}, it lets a generator compute whether rotation is current. Without it, a
   * generator could only record that a period was declared. `lifecycle-model.ts`'s
   * `computeRotationStatus()` shows how the two combine with {@link expiresAt}. The result is a
   * policy-window judgement over declared metadata ("within the declared period"). It never states
   * that a rotation happened or that a control is met. env-cap reads declarations; it does not
   * check them against the secret store.
   */
  rotationPeriod?: string
  /**
   * ISO date string: the last time this variable's value was actually rotated. Paired with
   * {@link rotationPeriod} to compute whether rotation is within the declared period. Independent of {@link expiresAt}, which
   * states when the *current* value stops being valid, not when it was last changed. A value can
   * be freshly rotated and still have a near-term `expiresAt` (a short-lived token). It can also be
   * long overdue for rotation while its `expiresAt` (if any) is still comfortably in the future.
   */
  lastRotatedAt?: string
  /**
   * IA-5's event-based rotation triggers that apply to this variable (e.g. "suspected compromise",
   * "personnel change", "system update"): the event-based half of IA-5's two-trigger rotation
   * model. It sits beside the free-text {@link refreshInstructions} and does not replace it. This
   * is a list a generator can render as its own column; `refreshInstructions` stays prose ("how to
   * actually rotate it"). It is presence-only: env-cap cannot observe whether a listed event
   * occurred. So declaring it never changes a computed rotation status by itself (see
   * `lifecycle-model.ts`). It only makes the event-based trigger visible in generated output.
   */
  rotationTriggerEvents?: readonly string[]
  /**
   * Explicit, actionable instructions for obtaining this variable's value the *first* time.
   * `refreshInstructions` is "how to rotate it once you already have one"; this is "how to get
   * one at all" (e.g. "Create a restricted API key in the Stripe dashboard under Developers ->
   * API keys, scoped to read/write Charges."). It is a named field so it renders as its own
   * labeled line in generated docs. A `metadata.setup`-style convention would get no dedicated
   * rendering or type checking.
   */
  setupInstructions?: string
  /** Documentation-level assertion that this variable must be set. Independent of how (or whether) a validator actually enforces it. */
  required?: boolean
  /** Marks this variable as being phased out. Independent of `expiresAt` (a rotation/sunset date) and of the contract-level `active` switch (on/off, not a phase-out signal). */
  deprecated?: boolean
  /** Why this variable is deprecated, and/or what to use instead. Only meaningful alongside `deprecated: true`. */
  deprecatedReason?: string
  /** ISO date string: by when a deprecated variable must be removed. Only meaningful alongside `deprecated: true`. */
  removeBy?: string
  /** The previous environment variable name this one replaces, if this declaration is the result of a rename. Lets the Change Model correlate a remove+add pair into a single rename entry instead of two unrelated changes. */
  renamedFrom?: string
  /** Why this variable's value is collected/used: a framework-agnostic fact (pairs with `legalBasis`; a specific citation like a GDPR article belongs in `metadata` instead). Overrides the contract's own `purpose` for this key. */
  purpose?: string
  /** The legal basis this variable's collection/use relies on: framework-agnostic (e.g. "user consent," "contractual necessity"), never a specific statute name. Overrides the contract's own `legalBasis` for this key. */
  legalBasis?: string
  /** Descriptive retention policy (e.g. "delete after 90 days"). A policy statement, not a computed value: unlike `expiresAt`, nothing parses or evaluates this. Overrides the contract's own `retention` for this key. */
  retention?: string
  /** Where this variable's value is/must be stored (a region, or a permitted set of regions). Overrides the contract's own `dataResidency` for this key. */
  dataResidency?: string | string[]
  /** Documentation-level assertion that this variable's handling must be auditable. Overrides the contract's own `auditRequired` for this key. */
  auditRequired?: boolean
  /**
   * Developer-supplied evidence assertions for this variable: verified over
   * time, unlike every other field above, which is declared and never
   * verified. Kept structurally separate for exactly that reason; see
   * {@link VariableEvidenceDocs}.
   */
  evidence?: VariableEvidenceDocs
  /**
   * Structured, unsupported-key documentation: any primitive or object value, for anything that
   * doesn't warrant its own named field. A key that has a named field above belongs in that field,
   * not here.
   */
  metadata?: Record<string, unknown>
}

/**
 * Contract-level documentation. Only the generator reads these fields; validation never does.
 *
 * @remarks
 * Generic over `S`, the exact schema type {@link documentEnv} infers from its `schema` argument.
 * That makes `variables` below a closed, checked map, not an open `Record<string, VariableDocs>`
 * any string would satisfy. A typo'd or renamed key is a compile error, not a silent no-op. `S`
 * defaults to the widest possible schema. So this type is still nameable on its own (e.g. in a
 * helper function's parameter type) without narrowing to one specific contract.
 */
export interface ContractDocs<S extends EnvSchema = EnvSchema> {
  /** Overrides the auto-generated label used in generated docs. Purely cosmetic. Wins over `createEnv()`'s own `name` option, which in turn wins over the exported binding name. */
  name?: string
  /** Groups this contract under a heading in the generated docs' feature catalog. */
  category?: string
  /** The generator throws if two *active* contracts declare the same `exclusiveGroup`: use it to mark interchangeable features (e.g. two database backends) as mutually exclusive. */
  exclusiveGroup?: string
  /** When `false`, this contract is excluded from the generated manifest, docs' required section, and exclusiveGroup checks: it still appears, marked disabled, in the feature catalog. Defaults to `true`. */
  active?: boolean
  /** Default owner for every variable in this contract that doesn't set its own `owner`. */
  owner?: string
  /** Default sensitivity for every variable in this contract that doesn't set its own `sensitivity`: see {@link VariableDocs.sensitivity} for why this is an open `string`. */
  sensitivity?: string
  /** Whole-contract/feature sunset date, ISO date string. */
  expiresAt?: string
  /** Marks this whole contract/feature as being phased out. Independent of `active` (on/off, not a phase-out signal). */
  deprecated?: boolean
  /** Why this contract is deprecated, and/or what to use instead. Only meaningful alongside `deprecated: true`. */
  deprecatedReason?: string
  /** Default reason this contract's variables' values are collected/used: see {@link VariableDocs.purpose}. */
  purpose?: string
  /** Default legal basis for this contract's variables: see {@link VariableDocs.legalBasis}. */
  legalBasis?: string
  /** Default retention policy for this contract's variables: see {@link VariableDocs.retention}. */
  retention?: string
  /** Default data residency for this contract's variables: see {@link VariableDocs.dataResidency}. */
  dataResidency?: string | string[]
  /** Default audit-required assertion for this contract's variables: see {@link VariableDocs.auditRequired}. */
  auditRequired?: boolean
  /** Arbitrary contract-level documentation (e.g. `runbook`), rendered alongside this feature: see {@link VariableDocs.metadata}. */
  metadata?: Record<string, unknown>
  /**
   * Per-variable documentation, keyed by variable name. Keys are checked against `S`'s own keys
   * at compile time. Documenting a variable that was renamed or removed from `schema` (or a plain
   * typo) is therefore a type error here. The generator never has to report it as "stale" after
   * the fact. A schema key absent from `variables` entirely is
   * still valid (not every variable needs documentation). The generator reports it as
   * undocumented.
   */
  variables?: { readonly [K in keyof S]?: VariableDocs }
}

/**
 * Documents a schema for the generator: explains values, assigns ownership,
 * and describes lifecycle, feeding the generated docs artifact and
 * `.env.example`. Pass it the *same* schema object given to {@link createEnv}.
 * The generator then statically links the two and verifies every variable is
 * documented. TypeScript also checks `docs.variables`' keys against
 * `schema`'s own keys, so the same object identity serves both the
 * generator's static link and the type checker.
 *
 * @remarks
 * A no-op at runtime by design: nothing passed here is retained anywhere,
 * and this can never throw, no matter how malformed `schema`/`docs` are.
 * Calling it is entirely optional: {@link createEnv} works identically whether or
 * not a matching `documentEnv` call exists. The real "is everything
 * documented?" check runs entirely inside {@link build.generateEnvManifest}'s
 * static analysis. So does every artifact this data drives: the docs
 * artifact's ownership matrix, dependency graph, lifecycle report and
 * security review, and `.env.example`'s comments. At runtime this function
 * only exists as a safe marker the AST parser can find, and gives you
 * type-checked argument shapes while writing it.
 *
 * `S` is inferred from `schema`, never written out by hand. Pass the
 * schema object literal (or a `const`-inferred reference to it) directly for
 * the strongest inference. An explicitly-widened `schema: EnvSchema`
 * annotation loses the per-key literal type, so `docs.variables` then
 * accepts any string key.
 */
export function documentEnv<S extends EnvSchema>(schema: S, docs: ContractDocs<S>): void
// Deliberately a true no-op (see the doc comment above). `documentEnv` has no runtime behavior. It
// offers a compile-time keyed-shape check and a call site static analysis can see. The overload above
// carries the public parameters; this implementation takes none, so nothing is left unused.
export function documentEnv(): void {
  // Intentionally inert: anything done here would run in every process that imports a schema file,
  // which is exactly what the build/runtime split exists to avoid.
}
