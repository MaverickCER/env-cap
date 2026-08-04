import type { EnvValidationError } from "./errors.js"
import type { validateEnvResult } from "./types.js"

export type CacheStatus = "uninitialized" | "validating" | "ready" | "failed"

export interface CacheState {
  status: CacheStatus
  /** ids of every contract validated as part of this initialization, so resetEnvCache() can clean up precisely. */
  contractIds: Set<symbol>
  result?: validateEnvResult
  error?: EnvValidationError
  inFlight?: Promise<validateEnvResult>
}

/**
 * All shared state lives here -- nothing is exported except the accessor
 * functions below, and every write goes through them. Values are frozen
 * before they ever reach `contractValues`, so once set, a contract's
 * resolved record cannot be mutated in place.
 *
 * There is a single global state, not one per "runtime": a process validates
 * its environment once, at startup. Server and client contexts never share a
 * process (server code and a browser bundle are two separate processes), so
 * there's nothing to key a second state by.
 */
let state: CacheState = createState()
const contractValues = new Map<symbol, Readonly<Record<string, unknown>>>()
const contractErrors = new Map<symbol, EnvValidationError>()

function createState(): CacheState {
  return { status: "uninitialized", contractIds: new Set() }
}

export function getState(): CacheState {
  return state
}

export function getContractValues(id: symbol): Readonly<Record<string, unknown>> | undefined {
  return contractValues.get(id)
}

export function setContractValues(id: symbol, values: Readonly<Record<string, unknown>>): void {
  contractValues.set(id, values)
}

export function getContractError(id: symbol): EnvValidationError | undefined {
  return contractErrors.get(id)
}

export function setContractError(id: symbol, error: EnvValidationError): void {
  contractErrors.set(id, error)
}

/** Clears cached state: the global status plus every contract validated as part of it. */
export function resetCache(): void {
  for (const id of state.contractIds) {
    contractValues.delete(id)
    contractErrors.delete(id)
  }
  state = createState()
}
