import type { ContractInternals } from "./types.js"

/**
 * Private map from a contract object (returned by `createEnv`) to its internal
 * identity/schema. Not exported from the package -- this is the only place
 * that ever associates a contract with its schema, so `validateEnv()`
 * cannot accidentally read across contracts.
 */
const internalsByContract = new WeakMap<object, ContractInternals>()

/** Associates a contract object with its internal identity/schema. Called once, by `createEnv`. */
export function registerContract(contract: object, internals: ContractInternals): void {
  internalsByContract.set(contract, internals)
}

/**
 * Looks up a contract's internal identity/schema.
 *
 * @throws {TypeError} If `contract` wasn't returned by `createEnv` (and so was never registered).
 */
export function getContractInternals(contract: object): ContractInternals {
  const internals = internalsByContract.get(contract)
  if (!internals) {
    throw new TypeError(
      "env-cap: this value was not created by createEnv(). " +
        "validateEnv() and resetEnvCache() only accept contracts returned from createEnv().",
    )
  }
  return internals
}

/** Type guard: `true` when `value` was created by `createEnv` (i.e. is a registered contract). */
export function isEnvContract(value: unknown): value is object {
  if (typeof value !== "object") return false
  // Split onto its own line (rather than one `&&`-chained expression) so
  // this one check's disable directive can't also silence the still-real,
  // still-tested `typeof` check above. Runtime-redundant on its own --
  // hand-verified: `WeakMap.prototype.has(null)` is spec-guaranteed to
  // return `false` (never throws for a non-object key), so `.has(value)`
  // alone already does the right thing for `null`, the one value where
  // `typeof value === "object"` is true but `value` isn't really an object.
  // Kept as a real check anyway because TS needs SOME `null` exclusion here
  // to accept `value` as an `object` below (`typeof value === "object"`
  // alone narrows to `object | null`, TS's one special case for `typeof`) --
  // tried a cast/assertion instead (`value as object` / `value!`) and hit an
  // unresolvable conflict in this repo's eslint config: `src/**` bans `!`
  // (`no-non-null-assertion`) while the sibling `non-nullable-type-
  // assertion-style` rule then demands `!` over `as` for a null-only cast.
  // Stryker disable next-line ConditionalExpression
  if (value === null) return false
  return internalsByContract.has(value)
}
