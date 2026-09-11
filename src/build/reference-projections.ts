/**
 * env-cap's own built-in reference projections, declared through the exact
 * same public `defineEvidenceProjection()` a consumer would use (ADR
 * 0031/0032) -- no privileged internal path, no second way of reading the
 * Evidence Model.
 *
 * This is deliberate dogfooding, not a convenience layer: `renderDocs()`'s
 * Catalog/ownership/lifecycle sections and `renderUsageReport()`'s ownership
 * table now source their underlying data through these projections, so the
 * extensibility API is exercised by env-cap's own generated output on every
 * single run. If a projector here can't express something, that's a real gap
 * in the public API -- discovered by env-cap itself rather than by a consumer
 * reporting it.
 *
 * Every projection is pure and derives *only* from `EvidenceModel`. None
 * reads the filesystem, and none reaches back into `DiscoveredContract` --
 * that would defeat the point, since a consumer only ever has the model.
 */

import { defineEvidenceProjection } from "../evidence/define-projection.js"
import { evidenceDisclaimer } from "./generated-banner.js"
import type { ContractModelContract } from "./contract-model.js"
import type { EvidenceModel } from "./evidence-model.js"

/** One variable, flattened across Contract/Ownership/Lifecycle Model into the row a Configuration Reference renders. */
export interface ConfigurationReferenceEntry {
  /** Root-relative, POSIX-separated path of the declaring contract. */
  readonly file: string
  readonly exportName: string
  /** The declaring contract's display name, resolved from Contract Model -- the one model that owns it. */
  readonly contractName: string
  readonly key: string
  readonly description: string | undefined
  /** Effective owner: the variable's own, falling back to its contract's. */
  readonly owner: string | undefined
  /** Effective sensitivity: the variable's own, falling back to its contract's. Any string; see {@link runtime.VariableDocs.sensitivity}. */
  readonly sensitivity: string | undefined
  readonly required: boolean | undefined
  readonly hasDefault: boolean
  readonly hasProcessor: boolean
  readonly hasValidator: boolean
  readonly expiresAt: string | undefined
  /** Whether the declaring contract is active. Inactive contracts are included -- the reference documents everything discovered, same scope the Catalog always had. */
  readonly active: boolean
}

/** The Configuration Reference projection's output shape. */
export interface ConfigurationReference extends Record<string, unknown> {
  /** The standing "declared, not verified" notice -- see `evidenceDisclaimer()`. Carried in the data, not only in a renderer, so a consumer projecting this to their own format can't accidentally drop it. */
  readonly disclaimer: string
  /** Every declared variable across every discovered contract, sorted by contract file, then export name, then key. */
  readonly entries: readonly ConfigurationReferenceEntry[]
}

function byContractThenKey(
  a: { file: string; exportName: string; key: string },
  b: { file: string; exportName: string; key: string },
): number {
  return (
    a.file.localeCompare(b.file) ||
    a.exportName.localeCompare(b.exportName) ||
    a.key.localeCompare(b.key)
  )
}

/** Index of every contract by `${file}#${exportName}` -- the join key every projection below uses to resolve display text and contract-level defaults. */
function contractIndex(
  contracts: readonly ContractModelContract[],
): ReadonlyMap<string, ContractModelContract> {
  return new Map(contracts.map((c) => [`${c.file}#${c.exportName}`, c]))
}

/** The minimal shape {@link groupVariablesByOwner} needs -- structural, not pinned to one model, so the exact same grouping serves `OwnershipModel`'s already-resolved owners and `ContractModel`'s raw ones alike. */
export interface OwnerBearingContract {
  readonly owner: string | undefined
  readonly variables: readonly unknown[]
}

/** The element type of an {@link OwnerBearingContract}'s own `variables`, so callers never have to name it a second time. */
type VariableOf<C> = C extends { readonly variables: readonly (infer V)[] } ? V : never

/**
 * Groups every variable under its effective owner (its own, falling back to
 * its contract's), preserving input order within each owner.
 *
 * @remarks
 * The single implementation of "who owns what, rolled up per owner", shared
 * by the {@link ownershipSummary} projection and `docs.ts`'s own rendered
 * ownership matrix. Kept as one function precisely so env-cap's generated
 * Markdown and the projection a consumer reads can never disagree about the
 * grouping -- the same reason `effectiveOwner()` is the single resolution
 * rule (ADR 0028). Variables with no effective owner are omitted entirely
 * rather than bucketed under a synthetic `"unowned"` key, which would read
 * as a real team name; callers that need them ask for them separately.
 *
 * `ownerOf` is supplied by the caller so a model whose owners are already
 * resolved (`OwnershipModel`) and one whose aren't (`ContractModel`) both
 * work without this function guessing which it was handed.
 */
export function groupVariablesByOwner<C extends OwnerBearingContract>(
  contracts: readonly C[],
  ownerOf: (contract: C, variable: VariableOf<C>) => string | undefined,
): ReadonlyMap<string, readonly { contract: C; variable: VariableOf<C> }[]> {
  const byOwner = new Map<string, { contract: C; variable: VariableOf<C> }[]>()
  for (const contract of contracts) {
    for (const variable of contract.variables as readonly VariableOf<C>[]) {
      const owner = ownerOf(contract, variable)
      if (owner === undefined) continue
      const list = byOwner.get(owner) ?? []
      list.push({ contract, variable })
      byOwner.set(owner, list)
    }
  }
  return byOwner
}

/**
 * Configuration Reference: every declared variable, with its effective owner
 * and sensitivity already resolved, in one flat, sorted list.
 *
 * @remarks
 * Resolution (variable's own value falling back to its contract's) happens
 * here rather than being left to each consumer, so two readers of this
 * projection can never disagree about who owns a variable -- the same reason
 * `effectiveOwner()` exists on the generator side (ADR 0028).
 */
// Every `defineEvidenceProjection({...})` schema object below (this one and
// the two further down) is itself a module-level `const`'s initializer --
// the documented Stryker "static" covered-mutant false-Survivor
// (ignoreStatic + perTest can't attribute a mutant evaluated once at module
// load, even with real, passing test coverage; see [[feedback_stryker_mutation_score_formula]]
// and data-cap's `reference-projections.ts` Batch 7, the identical pattern
// in the sibling package). Every `disclaimer: () => evidenceDisclaimer()`
// arrow below is hand-verified killed (mutating it to `() => undefined` and
// running the real suite fails the matching "carries the standing
// disclaimer" test) despite Stryker reporting it Survived.
// Stryker disable next-line ObjectLiteral
export const configurationReference = defineEvidenceProjection<ConfigurationReference>({
  // Stryker disable next-line ArrowFunction
  disclaimer: () => evidenceDisclaimer(),
  entries: (evidence: EvidenceModel) => {
    const entries: ConfigurationReferenceEntry[] = []
    for (const contract of evidence.contract.contracts) {
      for (const variable of contract.variables) {
        entries.push({
          file: contract.file,
          exportName: contract.exportName,
          contractName: contract.contractName,
          key: variable.key,
          description: variable.description,
          owner: variable.owner ?? contract.owner,
          sensitivity: variable.sensitivity ?? contract.sensitivity,
          required: variable.required,
          hasDefault: variable.hasDefault,
          hasProcessor: variable.hasProcessor,
          hasValidator: variable.hasValidator,
          expiresAt: variable.expiresAt,
          active: contract.active,
        })
      }
    }
    return entries.sort(byContractThenKey)
  },
})

/** One owner and everything attributed to them. */
export interface OwnershipSummaryEntry {
  /** The owner string exactly as declared. */
  readonly owner: string
  /** Every variable this owner is the effective owner of, as `${contractName}.${key}`, sorted. */
  readonly variables: readonly string[]
  /** Every contract declaring this owner as its contract-level default, by display name, sorted. */
  readonly contracts: readonly string[]
}

/** The Ownership summary projection's output shape. */
export interface OwnershipSummary extends Record<string, unknown> {
  /** See {@link ConfigurationReference.disclaimer}. */
  readonly disclaimer: string
  /** One entry per distinct owner, sorted by owner. */
  readonly owners: readonly OwnershipSummaryEntry[]
  /** Every variable with no effective owner at all, as `${contractName}.${key}`, sorted. Named separately rather than bucketed under a synthetic `"unowned"` owner, so "nobody owns this" can never be mistaken for a real team name. */
  readonly unowned: readonly string[]
}

/**
 * Ownership summary: the inverse of Ownership Model's per-contract view --
 * who owns what, rolled up per owner, plus an explicit unowned list.
 */
// Stryker disable next-line ObjectLiteral
export const ownershipSummary = defineEvidenceProjection<OwnershipSummary>({
  // Stryker disable next-line ArrowFunction
  disclaimer: () => evidenceDisclaimer(),
  owners: (evidence: EvidenceModel) => {
    const contracts = contractIndex(evidence.contract.contracts)
    const nameOf = (file: string, exportName: string): string =>
      contracts.get(`${file}#${exportName}`)?.contractName ?? exportName

    // Ownership Model has already resolved each variable's effective owner
    // (ADR 0028), so `ownerOf` reads it straight off rather than re-deriving.
    const variablesByOwner = groupVariablesByOwner(
      evidence.ownership.contracts,
      (_contract, variable) => variable.owner,
    )

    const contractsByOwner = new Map<string, string[]>()
    for (const contract of evidence.ownership.contracts) {
      if (contract.owner === undefined) continue
      const list = contractsByOwner.get(contract.owner) ?? []
      list.push(nameOf(contract.file, contract.exportName))
      contractsByOwner.set(contract.owner, list)
    }

    const owners = new Set([...variablesByOwner.keys(), ...contractsByOwner.keys()])
    return [...owners].sort().map((owner) => ({
      owner,
      variables: (variablesByOwner.get(owner) ?? [])
        .map(
          ({ contract, variable }) =>
            `${nameOf(contract.file, contract.exportName)}.${variable.key}`,
        )
        .sort(),
      contracts: (contractsByOwner.get(owner) ?? []).sort(),
    }))
  },
  unowned: (evidence: EvidenceModel) => {
    const contracts = contractIndex(evidence.contract.contracts)
    return evidence.ownership.unownedVariables
      .map((ref) => {
        const contractName =
          contracts.get(`${ref.file}#${ref.exportName}`)?.contractName ?? ref.exportName
        return `${contractName}.${ref.key}`
      })
      .sort()
  },
})

/** One contract- or variable-level `expiresAt` inside the configured window. */
export interface ExpiringSoonEntry {
  /** Root-relative, POSIX-separated path of the declaring contract. */
  readonly file: string
  readonly exportName: string
  /** The declaring contract's display name, resolved from Contract Model. */
  readonly contractName: string
  /** `undefined` for a contract-level expiry, set for a per-variable one. */
  readonly key: string | undefined
  /** The raw ISO date string, exactly as declared -- never reformatted. */
  readonly expiresAt: string
  /** Days remaining as of the run that produced this evidence; negative when already expired. */
  readonly daysRemaining: number
  /** `true` when `daysRemaining` is negative -- the deadline has already passed. */
  readonly expired: boolean
  /** How to obtain a replacement value, if the declaration says. */
  readonly refreshInstructions: string | undefined
  /** Effective owner, so a reader knows who to chase without a second lookup. */
  readonly owner: string | undefined
}

/** The Expiring-Soon projection's output shape. */
export interface ExpiringSoonReport extends Record<string, unknown> {
  /** See {@link ConfigurationReference.disclaimer}. */
  readonly disclaimer: string
  /** Every entry inside the window, soonest-first (already-expired entries lead, most-overdue first). */
  readonly entries: readonly ExpiringSoonEntry[]
  /** How many of `entries` are already past their `expiresAt`. */
  readonly expiredCount: number
}

/**
 * Expiring-Soon report: Lifecycle Model's `expiring` view, joined with
 * ownership and refresh instructions so a reader can act on a row without
 * cross-referencing three other models by hand.
 *
 * @remarks
 * The window itself was applied upstream, when Lifecycle Model was built --
 * this projection deliberately does not re-filter by a date of its own.
 * Recomputing "soon" here would make the projection's answer depend on when
 * it happened to be *read* rather than when the evidence was *generated*,
 * which is exactly the reproducibility property the Evidence Model exists to
 * preserve.
 */
// Stryker disable next-line ObjectLiteral
export const expiringSoonReport = defineEvidenceProjection<ExpiringSoonReport>({
  // Stryker disable next-line ArrowFunction
  disclaimer: () => evidenceDisclaimer(),
  entries: (evidence: EvidenceModel) => {
    const contracts = contractIndex(evidence.contract.contracts)
    const ownerByVariable = new Map<string, string | undefined>()
    for (const contract of evidence.ownership.contracts)
      for (const variable of contract.variables)
        ownerByVariable.set(
          `${contract.file}#${contract.exportName}#${variable.key}`,
          variable.owner,
        )

    return evidence.lifecycle.expiring.map((entry): ExpiringSoonEntry => {
      const contract = contracts.get(`${entry.file}#${entry.exportName}`)
      // Mutating `entry.key === undefined` to `false` here is behaviorally
      // equivalent, not a real gap: `ContractModelVariable["key"]` is always
      // a non-empty string, so `v.key === entry.key` can never be true when
      // `entry.key` is `undefined` -- `.find()` still returns `undefined`
      // either way. Hand-verified: mutating this and running the real suite
      // (`vitest run test/build/reference-projections.test.ts`) passes
      // unchanged. Restructuring into an `if`/guard would only relocate the
      // same equivalence onto a different mutant, not remove it.
      // Stryker disable ConditionalExpression
      const variable =
        entry.key === undefined ? undefined : contract?.variables.find((v) => v.key === entry.key)
      // Stryker restore ConditionalExpression
      return {
        file: entry.file,
        exportName: entry.exportName,
        contractName: contract?.contractName ?? entry.exportName,
        key: entry.key,
        expiresAt: entry.expiresAt,
        daysRemaining: entry.daysRemaining,
        expired: entry.daysRemaining < 0,
        refreshInstructions: variable?.refreshInstructions,
        owner:
          entry.key === undefined
            ? contract?.owner
            : (ownerByVariable.get(`${entry.file}#${entry.exportName}#${entry.key}`) ??
              contract?.owner),
      }
    })
  },
  // Same static covered-mutant false-Survivor as the `disclaimer` arrows
  // above -- hand-verified killed (mutating this whole arrow to `() =>
  // undefined` fails the "expiredCount" assertions in every test above).
  // Stryker disable next-line ArrowFunction
  expiredCount: (evidence: EvidenceModel) =>
    evidence.lifecycle.expiring.filter((e) => e.daysRemaining < 0).length,
})
