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
    // Equivalent to `i <= members.length`: whenever `i >= members.length`,
    // the inner loop's own `j = i + 1` starts already past `members.length`
    // too, so its body never runs -- an extra outer iteration at the bound
    // is a genuine no-op for any `members.length`, not just this test's.
    // Stryker disable next-line EqualityOperator
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const a = members[i]
        const b = members[j]
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
