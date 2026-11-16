import { deepFreeze } from "./deep-freeze.js"
import { parseIsoDate } from "./docs.js"
import type { DiscoveredContract, DiscoveredVariable } from "./link.js"

/**
 * Supplies expiration metadata from a live source, such as a secrets manager
 * or an inventory API, as a post-discovery override. It is the one sanctioned
 * escape hatch from static-only `expiresAt`.
 *
 * @remarks
 * Invoked exactly once per generation run, from the orchestration layer, after AST discovery/
 * linking completes and before documentation is rendered. Never invoked
 * during AST parsing or runtime validation: see ADR 0012 for why a
 * function embedded in a schema file itself was rejected instead.
 */
export type LiveExpirationDates = (
  variableNames: readonly string[],
) => Promise<Readonly<Record<string, string>>>

/**
 * Every unique variable key across every linked contract's `variables`.
 * Contract-level `expiresAt` is out of scope for override: the callback is
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
  // `Record<string, string>` indexing is unsound without `noUncheckedIndexedAccess`: a key absent from
  // `overrides` is `undefined` at runtime, which reads as the text "undefined" and does not parse.
  const date = parseIsoDate(String(override))
  return {
    ...variable,
    expiresAt: date ? override : variable.expiresAt,
    metadata: variable.metadata ? { ...variable.metadata } : variable.metadata,
  }
}

/**
 * Applies `overrides` onto a fresh copy of `contracts`. Every contract and
 * every variable (and their nested `metadata`/`extra` records) is rebuilt
 * into a new object, never the original reference. The returned structure
 * therefore shares no mutable object identity with `contracts` at any depth.
 *
 * @remarks
 * A key absent from `overrides`, or present but not a `parseIsoDate`-parseable
 * ISO-8601 string, leaves that variable's static `expiresAt` untouched. The
 * rest of the generator treats malformed data the same way: warn or skip,
 * never guess. Contract-level `expiresAt` is never touched; only
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
 * Orchestration entry point: the only place `liveExpirationDates` is ever invoked.
 *
 * @remarks
 * When `liveExpirationDates` is undefined it does nothing: it returns the same
 * array reference and invokes nothing. That keeps behavior unchanged when the
 * option is omitted. Otherwise it collects the unique discovered variable
 * names, invokes the callback exactly once and applies the result. It
 * deep-freezes the returned structure so no mutation of it can reach
 * `contracts` or anything else downstream. `contracts` is used elsewhere too,
 * e.g. by the manifest and usage passes in the same
 * {@link generateEnvArtifacts} run.
 */
export async function resolveLiveExpirationDates(
  contracts: readonly DiscoveredContract[],
  liveExpirationDates: LiveExpirationDates | undefined,
): Promise<readonly DiscoveredContract[]> {
  if (!liveExpirationDates) return contracts
  const overrides = await liveExpirationDates(collectVariableNames(contracts))
  return deepFreeze(applyLiveExpirationOverrides(contracts, overrides))
}
