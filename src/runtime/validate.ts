import { getState, setContractError, setContractValues } from "./cache.js"
import type { CacheState } from "./cache.js"
import { EnvValidationError } from "./errors.js"
import type { VariableFailure } from "./errors.js"
import { getContractInternals } from "./registry.js"
import type { validateEnvOptions, validateEnvResult } from "./types.js"

/**
 * Validates every variable in every contract in `options.manifest` against
 * `options.values`, then caches the results.
 *
 * @remarks
 * Idempotent: the first successful (or failed) call is authoritative for the life of the
 * process -- later calls return (or re-throw) that same outcome without re-running any
 * processor or validator. Concurrent in-flight calls share one underlying run.
 *
 * @throws {EnvValidationError} If any variable fails processing or validation.
 */
export async function validateEnv(options: validateEnvOptions): Promise<validateEnvResult> {
  const state = getState()

  if (state.status === "ready" && state.result) {
    return state.result
  }
  if (state.status === "failed" && state.error) {
    throw state.error
  }
  if (state.inFlight) {
    return state.inFlight
  }

  state.status = "validating"
  const run = runValidation(options, state)
  state.inFlight = run
  try {
    return await run
  } finally {
    state.inFlight = undefined
  }
}

/**
 * Whether a variable participates in a validation run: unset `context`
 * always participates; otherwise it participates only when `activeContexts`
 * contains that exact string (no prefix matching, no wildcards, no
 * hierarchy -- see ADR 0022's Formal Invariants).
 */
function matchesContext(
  variableContext: string | undefined,
  activeContexts: ReadonlySet<string> | undefined,
): boolean {
  return variableContext === undefined || (activeContexts?.has(variableContext) ?? false)
}

// `async` is load-bearing here despite no internal `await`: `validateEnv()`
// assigns this call's return value directly to `state.inFlight` so
// concurrent callers can share one in-flight run (see its own doc comment).
// That only works if this genuinely returns a Promise -- a synchronous
// function returning/throwing a plain value would change both the
// concurrent-sharing behavior and the timing of a thrown validation error.
// eslint-disable-next-line @typescript-eslint/require-await
async function runValidation(
  options: validateEnvOptions,
  state: CacheState,
): Promise<validateEnvResult> {
  const failures: VariableFailure[] = []
  let variableCount = 0

  // Allocated only when contexts are actually in play, so the (overwhelmingly
  // common, and every pre-existing) zero-context path does no extra work.
  const activeContexts = options.activeContexts?.length
    ? new Set(options.activeContexts)
    : undefined

  const resolved: { id: symbol; values: Record<string, unknown> }[] = []

  for (const contract of options.manifest) {
    const internals = getContractInternals(contract)
    const values: Record<string, unknown> = {}

    for (const key of Object.keys(internals.schema)) {
      const definition = internals.schema[key]

      // A variable whose context isn't active is skipped entirely -- no
      // default/processor/validator runs, it's never counted as validated,
      // and it stays out of `values`, so `create.ts`'s getter finds it
      // absent and throws EnvNotReadyError exactly as if this run had
      // never happened for it. See ADR 0022.
      if (!matchesContext(definition.context, activeContexts)) continue

      variableCount += 1

      const raw = options.values[key]

      let working: unknown = raw
      if (working === undefined && definition.default !== undefined) {
        working =
          typeof definition.default === "function"
            ? (definition.default as () => unknown)()
            : definition.default
      }

      let processed: unknown = working
      if (definition.processor) {
        try {
          processed = definition.processor(working)
        } catch (cause) {
          failures.push({
            variable: key,
            contractName: internals.name,
            source: internals.source,
            kind: "processor",
            message: toMessage(cause),
          })
          continue
        }
      }

      if (definition.validator) {
        let outcome: true | string
        try {
          outcome = definition.validator(processed, options.values)
        } catch (cause) {
          outcome = toMessage(cause)
        }
        if (outcome !== true) {
          failures.push({
            variable: key,
            contractName: internals.name,
            source: internals.source,
            kind: "validator",
            message: outcome,
          })
          continue
        }
      }

      values[key] = processed
    }

    resolved.push({ id: internals.id, values })
    state.contractIds.add(internals.id)
  }

  if (failures.length > 0) {
    const error = new EnvValidationError(failures)
    for (const { id } of resolved) {
      setContractError(id, error)
    }
    state.status = "failed"
    state.error = error
    throw error
  }

  for (const { id, values } of resolved) {
    setContractValues(id, Object.freeze(values))
  }

  const result: validateEnvResult = {
    contractCount: options.manifest.length,
    variableCount,
  }
  state.status = "ready"
  state.result = result
  return result
}

function toMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}
