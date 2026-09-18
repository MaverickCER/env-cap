import { deepFreeze } from "./deep-freeze.js"
import { parseIsoDate } from "./docs.js"
import type { DiscoveredContract, DiscoveredVariable } from "./link.js"

/**
 * Supplies expiration metadata from a live source (a secrets manager, an
 * internal inventory API, ...) as a post-discovery override -- the one
 * sanctioned escape hatch from static-only `expiresAt`.
 *
 * @remarks
 * Invoked exactly once per generation run, from the orchestration layer, after AST discovery/
 * linking completes and before documentation is rendered. Never invoked
 * during AST parsing or runtime validation -- see ADR 0012 for why a
 * function embedded in a schema file itself was rejected instead.
 */
export type LiveExpirationDates = (
  variableNames: readonly string[],
) => Promise<Readonly<Record<string, string>>>

/**
 * Every unique variable key across every linked contract's `variables`.
 * Contract-level `expiresAt` is out of scope for override -- the callback is
 * keyed by variable name, not contract name.
 */
export function collectVariableNames(contracts: readonly DiscoveredContract[]): string[] {
  const names = new Set<string>()
  for (const contract of contracts) {
    for (const variable of contract.variables) names.add(variable.key)
  }
  return [...names]
}

function overrideVariable(
  variable: DiscoveredVariable,
  overrides: Readonly<Record<string, string>>,
): DiscoveredVariable {
  const override = overrides[variable.key]
  // `Record<string, string>` indexing is unsound without `noUncheckedIndexedAccess`
  // (not enabled repo-wide): TS believes `override` is always `string`, but a
  // key genuinely absent from the record is `undefined` at runtime -- the
  // entire reason this function needs to handle a missing override at all.
  // Equivalent either way this ternary's condition is mutated:
  // `parseIsoDate(undefined as unknown as string)` -> `new Date(undefined)`
  // -> Invalid Date -> `undefined`, the exact same result the `undefined`
  // branch returns explicitly. Same class as data-cap's documented
  // `expiresAt === undefined` guard immediately before a `new Date(...)`
  // parse-or-skip.
  // Stryker disable next-line ConditionalExpression
  const date = override === undefined ? undefined : parseIsoDate(override)
  return {
    ...variable,
    expiresAt: date ? override : variable.expiresAt,
    metadata: variable.metadata ? { ...variable.metadata } : variable.metadata,
  }
}

/**
 * Applies `overrides` onto a fresh copy of `contracts` -- every contract and
 * every variable (and their nested `metadata`/`extra` records) is rebuilt
 * into a new object, never the original reference, so the returned structure
 * shares no mutable object identity with `contracts` at any depth.
 *
 * @remarks
 * A key absent from `overrides`, or present but not a `parseIsoDate`-parseable
 * ISO-8601 string, leaves that variable's static `expiresAt` untouched --
 * same "warn/skip, never guess" policy the rest of the generator uses for
 * malformed data. Contract-level `expiresAt` is never touched; only
 * variable-level `expiresAt` is in scope for override.
 */
export function applyLiveExpirationOverrides(
  contracts: readonly DiscoveredContract[],
  overrides: Readonly<Record<string, string>>,
): readonly DiscoveredContract[] {
  return contracts.map((contract) => ({
    ...contract,
    metadata: contract.metadata ? { ...contract.metadata } : contract.metadata,
    variables: contract.variables.map((variable) => overrideVariable(variable, overrides)),
  }))
}

/**
 * Orchestration entry point -- the only place `liveExpirationDates` is ever invoked.
 *
 * @remarks
 * No-ops (returns the exact same array reference, zero invocations)
 * when `liveExpirationDates` is undefined, which is what guarantees "omitted ->
 * behavior unchanged." Otherwise collects the unique discovered variable
 * names, invokes the callback exactly once, applies the result, and
 * deep-freezes the returned structure so it can never be mutated into
 * affecting `contracts` (used elsewhere, e.g. by the manifest/usage passes in
 * the same {@link generateEnvArtifacts} run) or anything else downstream.
 */
export async function resolveLiveExpirationDates(
  contracts: readonly DiscoveredContract[],
  liveExpirationDates: LiveExpirationDates | undefined,
): Promise<readonly DiscoveredContract[]> {
  if (!liveExpirationDates) return contracts
  const overrides = await liveExpirationDates(collectVariableNames(contracts))
  return deepFreeze(applyLiveExpirationOverrides(contracts, overrides))
}
