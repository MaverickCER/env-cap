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

  // `result`/`error` are only ever set together with their matching
  // `status` (`runValidation()` below sets `state.status = "ready"` and
  // `state.result` in the same statement pair, likewise "failed"/`error`),
  // and `resetCache()` always replaces the whole `state` object rather than
  // resetting fields individually -- so checking `status` alone already
  // implies `result`/`error` is set. Load-bearing for TypeScript's own
  // narrowing of `state.result`/`state.error` from `T | undefined` to `T`
  // for the `return`/`throw` below, though -- hand-verified by removing
  // each `&&` clause entirely and running the full `vitest run`: all 1236
  // tests still pass.
  // Stryker disable next-line ConditionalExpression, LogicalOperator
  if (state.status === "ready" && state.result) {
    return state.result
  }
  // Stryker disable next-line ConditionalExpression, LogicalOperator
  if (state.status === "failed" && state.error) {
    throw state.error
  }
  if (state.inFlight) {
    return state.inFlight
  }

  // Genuinely unobservable via any real (all-synchronous, per `Processor`/
  // `Validator`'s own types) caller: `runValidation()` below has no
  // internal `await`, so its entire body -- including overwriting
  // `state.status` to "ready" or "failed" -- runs to completion
  // synchronously as part of evaluating the very next line, before control
  // ever returns to anything that could observe "validating". Kept as an
  // honest, self-documenting state-machine value (and to keep `CacheStatus`
  // meaningful if a future version ever awaits inside `runValidation()`).
  // Hand-verified: replacing the string with "" and running the full
  // `vitest run` leaves all 1236 tests passing.
  // Stryker disable next-line StringLiteral
  state.status = "validating"
  const run = runValidation(options, state)
  state.inFlight = run
  try {
    return await run
  } finally {
    // Not `= undefined`: `inFlight` is genuinely optional (absent between
    // runs), and exactOptionalPropertyTypes distinguishes "key absent" from
    // "key present holding undefined" -- delete is the operation that
    // actually means the former.
    delete state.inFlight
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

  // A poisoned seed element here would be an accumulator only ever `.push()`ed
  // to (never filtered), reaching the two per-entry loops below
  // (`setContractError`/`setContractValues`) destructured as `{id: undefined,
  // values: undefined}` -- `setContractValues(undefined, Object.freeze(undefined))`
  // neither throws nor collides with any real contract's own symbol-keyed
  // entry, so it's unobservable via any real `createEnv()`/`validateEnv()`
  // consumer. Hand-verified: seeding this with a phantom entry and running
  // the full `vitest run` leaves all 1236 tests passing.
  // Stryker disable next-line ArrayDeclaration
  const resolved: { id: symbol; values: Record<string, unknown> }[] = []

  for (const contract of options.manifest) {
    const internals = getContractInternals(contract)
    const values: Record<string, unknown> = {}

    for (const key of Object.keys(internals.schema)) {
      const definition = internals.schema[key]
      // `key` was just enumerated from `Object.keys(internals.schema)`, so
      // this is always a real entry -- noUncheckedIndexedAccess can't
      // express that invariant from an object index signature, only that
      // indexing is *generally* unsafe.
      if (definition === undefined) continue

      // A variable whose context isn't active is skipped entirely -- no
      // default/processor/validator runs, it's never counted as validated,
      // and it stays out of `values`, so `create.ts`'s getter finds it
      // absent and throws EnvNotReadyError exactly as if this run had
      // never happened for it. See ADR 0022.
      if (!matchesContext(definition.context, activeContexts)) continue

      variableCount += 1

      const raw = options.values[key]

      let working: unknown = raw
      // Bypassing the `!== undefined` clause only matters when `working ===
      // undefined` AND `definition.default` genuinely is `undefined` --
      // `typeof undefined === "function"` is false, so `working` is
      // assigned `definition.default` (`undefined`) either way: applying "no
      // default" when there wasn't one is identical to not applying it.
      // Hand-verified: replacing the whole clause with `true` and running
      // the full `vitest run` leaves all 1236 tests passing.
      // Stryker disable next-line ConditionalExpression
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
