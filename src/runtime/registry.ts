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
  return typeof value === "object" && value !== null && internalsByContract.has(value)
}
