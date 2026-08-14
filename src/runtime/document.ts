import type { EnvSchema } from "./types.js"

/** How sensitive a variable's value is -- feeds classification-aware findings and reports (e.g. flagging a secret with no rotation guidance). */
export type VariableClassification = "secret" | "credential" | "pii" | "config"

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
  /** How sensitive this variable's value is. Overrides the contract's own `classification` for this key. */
  classification?: VariableClassification
  /** ISO date string (e.g. "2026-06-01") -- when this variable's current value stops being valid (a key rotation deadline, a sunset date, etc.). */
  expiresAt?: string
  /** How to get a new value before/when it expires (e.g. "Rotate in the Stripe dashboard, then redeploy."). */
  refreshInstructions?: string
  /** Documentation-level assertion that this variable must be set. Independent of how (or whether) a validator actually enforces it. */
  required?: boolean
  /** Anything else worth recording (setup steps, a link to docs, rotation cadence, ...). */
  [key: string]: string | boolean | undefined
}

/** Contract-level documentation, plus everything {@link documentEnv}'s options used to carry that only the generator ever read. */
export interface ContractDocs {
  /** Overrides the auto-generated label used in generated docs. Purely cosmetic -- unrelated to `createEnv`'s own `name` option. */
  name?: string
  /** Groups this contract under a heading in the generated docs' feature catalog. */
  category?: string
  /** The generator throws if two *active* contracts declare the same `exclusiveGroup` -- use it to mark interchangeable features (e.g. two database backends) as mutually exclusive. */
  exclusiveGroup?: string
  /** When `false`, this contract is excluded from the generated manifest, docs' required section, and exclusiveGroup checks -- it still appears, marked disabled, in the feature catalog. Defaults to `true`. */
  active?: boolean
  /** Default owner for every variable in this contract that doesn't set its own `owner`. */
  owner?: string
  /** Default classification for every variable in this contract that doesn't set its own `classification`. */
  classification?: VariableClassification
  /** Whole-contract/feature sunset date, ISO date string. */
  expiresAt?: string
  /** Arbitrary contract-level documentation (e.g. `runbook`), rendered alongside this feature. */
  metadata?: Record<string, string>
  /** Per-variable documentation, keyed by variable name. Any key not present here is reported as undocumented; any key here with no matching schema variable is reported as stale. */
  variables?: Record<string, VariableDocs>
}

/**
 * Documents a schema for the generator: explains values, assigns ownership,
 * and describes lifecycle, feeding the generated docs artifact and
 * `.env.example`. Pass it the *same* schema object given to {@link createEnv}, so
 * the generator can statically link the two and verify every variable is
 * documented.
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
 */
export function documentEnv(schema: EnvSchema, docs: ContractDocs): void {
  // Intentionally inert -- see the module doc comment above. Do not add
  // logic here; anything this function does happens at runtime, in every
  // process that imports the schema file, which is exactly what this split
  // exists to avoid. The `void`s below only satisfy `noUnusedParameters`.
  void schema
  void docs
}
