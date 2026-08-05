import { getContractError, getContractValues } from "./cache.js"
import { EnvNotReadyError } from "./errors.js"
import { registerContract } from "./registry.js"
import type { ContractInternals, CreateEnvOptions, EnvContract, EnvSchema } from "./types.js"

let anonymousCount = 0

/**
 * Declares a feature's environment contract. Colocate this call with the
 * feature that consumes the variables (e.g. `features/payments/env.schema.ts`).
 *
 * @remarks
 * `createEnv` is runtime-only: `processor`/`validator`/`default` are the
 * whole vocabulary, because they're the only fields {@link validateEnv} actually
 * reads. Documentation -- description, ownership, lifecycle, category, and
 * everything else that only exists to generate docs -- lives in a separate
 * {@link documentEnv} call (see `document.ts`), which is entirely optional and
 * never required for this to work.
 *
 * @returns An {@link EnvContract} exposing one read-only getter per key -- there is no
 * global env object, only per-feature contracts like `paymentsEnv.STRIPE_KEY`. Accessing a
 * key throws until {@link validateEnv} has run successfully for the runtime this contract
 * was passed to.
 */
export function createEnv<S extends EnvSchema>(
  schema: S,
  options: CreateEnvOptions = {},
): EnvContract<S> {
  const name = options.name ?? `anonymous-contract-${++anonymousCount}`
  const internals: ContractInternals<S> = { id: Symbol(name), name, source: options.source, schema }

  const contract: Record<string, unknown> = {}

  for (const key of Object.keys(schema)) {
    Object.defineProperty(contract, key, {
      enumerable: true,
      configurable: false,
      get(): unknown {
        const error = getContractError(internals.id)
        if (error) throw error
        const values = getContractValues(internals.id)
        // Checking key presence, not just `values` presence, matters once
        // validation contexts exist: a variable whose context didn't match
        // this run's activeContexts is never written into `values` (see
        // validate.ts), so it must throw exactly like an unvalidated
        // contract, not silently resolve to `undefined`.
        if (!values || !Object.prototype.hasOwnProperty.call(values, key)) {
          throw new EnvNotReadyError(name, key)
        }
        return values[key]
      },
    })
  }

  // Redact the whole-object view so accidental console.log/JSON.stringify of a
  // contract never prints secret values. Individual keys remain fully readable.
  Object.defineProperty(contract, Symbol.for("nodejs.util.inspect.custom"), {
    enumerable: false,
    value: () => `EnvContract("${name}") { ${Object.keys(schema).length} variable(s) }`,
  })
  Object.defineProperty(contract, "toString", {
    enumerable: false,
    value: () => `EnvContract("${name}")`,
  })
  Object.defineProperty(contract, "toJSON", {
    enumerable: false,
    value: () => `[EnvContract:${name}]`,
  })

  Object.freeze(contract)
  registerContract(contract, internals)
  return contract as EnvContract<S>
}
