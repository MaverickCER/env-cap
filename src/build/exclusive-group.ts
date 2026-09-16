import type { CompatibilityIssue } from "./compatibility.js"
import type { DiscoveredContract } from "./link.js"

/**
 * Detects two *active* contracts declaring the same `exclusiveGroup` --
 * e.g. two interchangeable database backends both left enabled at once.
 *
 * @remarks
 * Unlike `detectCompatibilityIssues`, this is never a heuristic warning: an
 * author explicitly declared these contracts mutually exclusive, so any
 * violation is always a hard error, regardless of `onIncompatibility`. See
 * ADR 0009 for why this doesn't follow 0005's warn-by-default policy.
 *
 * Inactive contracts are ignored entirely here (filtered internally, not by
 * the caller) so this stays correct even when called directly via the
 * `/build` export -- an inactive contract can share a group with an active
 * one with no conflict, since it was never wired into anything.
 */
export function detectExclusiveGroupIssues(
  contracts: readonly DiscoveredContract[],
): CompatibilityIssue[] {
  const byGroup = new Map<string, DiscoveredContract[]>()

  for (const contract of contracts) {
    if (!contract.active || !contract.exclusiveGroup) continue
    const members = byGroup.get(contract.exclusiveGroup) ?? []
    members.push(contract)
    byGroup.set(contract.exclusiveGroup, members)
  }

  const issues: CompatibilityIssue[] = []

  for (const [group, members] of [...byGroup.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    // `.entries()`/`.slice()` pairwise iteration, not a manually-indexed
    // `for (let i ...) for (let j = i + 1 ...)` double loop: besides needing
    // no `a === undefined || b === undefined` bounds guard at all (`.entries()`
    // yields real elements, never an out-of-bounds gap `noUncheckedIndexedAccess`
    // would otherwise force a guard for), a hand-indexed loop here is a genuine
    // liveness risk under mutation testing -- a mutant flipping `i++`/`j++` to
    // `i--`/`j--`, or `<` to `>=`, makes the index walk away from the bound
    // instead of toward it, looping until Stryker's own timeout rather than
    // producing an observably wrong result a normal test could catch. Iterator
    // protocol has no exposed counter for that class of mutation to target.
    for (const [i, a] of members.entries()) {
      for (const b of members.slice(i + 1)) {
        issues.push({
          severity: "error",
          variable: `Exclusive group "${group}"`,
          files: [a.file, b.file],
          reason:
            `"${a.contractName}" and "${b.contractName}" are both active and both declare exclusiveGroup ` +
            `"${group}" -- only one active contract per exclusive group is allowed. Set active: false on ` +
            "whichever one isn't in use.",
        })
      }
    }
  }

  return issues
}
