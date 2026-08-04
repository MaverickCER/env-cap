import type { DiscoveredContract, DiscoveredVariable } from "./link.js"

/** One compatibility problem found between two or more declarations of the same variable, or an exclusive-group violation. */
export interface CompatibilityIssue {
  /** `"error"` blocks generation regardless of `onIncompatibility`; `"warning"` blocks only when `onIncompatibility: "throw"`. */
  readonly severity: "error" | "warning"
  /** The environment variable name, or `"(contract) <name>"` for a contract-level (e.g. exclusive-group) issue. */
  readonly variable: string
  /** Every file declaring a conflicting definition. */
  readonly files: readonly string[]
  /** Human-readable explanation of the conflict. */
  readonly reason: string
  /**
   * Stable, machine-readable identifier for CI filtering / doc-linking /
   * GitHub Action annotations / IDE integration -- `undefined` for every
   * check that predates this field. Currently populated only by the
   * duplicate-documentation check below (`"duplicate-variable-documentation"`);
   * an opt-in field other checks can adopt incrementally, not a retrofit of
   * every existing issue at once.
   */
  readonly code?: string
}

const DOCUMENTATION_COMPARISON_FIELDS = [
  "description",
  "owner",
  "expiresAt",
  "refreshInstructions",
  "required",
] as const

/** Field names (including `extra.<key>`) where two documented declarations of the same variable disagree -- empty when they match. */
function documentationDivergences(a: DiscoveredVariable, b: DiscoveredVariable): string[] {
  const divergences: string[] = []
  for (const field of DOCUMENTATION_COMPARISON_FIELDS) {
    if (a[field] !== b[field]) divergences.push(field)
  }
  for (const key of new Set([...Object.keys(a.extra), ...Object.keys(b.extra)])) {
    if (a.extra[key] !== b.extra[key]) divergences.push(`extra.${key}`)
  }
  return divergences
}

/**
 * Flags cases where two contracts declare the same variable name but appear to
 * disagree about its shape, so a human can confirm they're still meant to be "the same" var.
 *
 * @remarks
 * Duplicate variable names across contracts are not a merge problem -- each
 * contract independently processes its own copy of the raw value, there is no
 * runtime merge at all. This is purely a build-time lint.
 *
 * Only one thing is treated as *provable* without executing code: two
 * processors with explicit, differing `: T` return type annotations. That is
 * a hard error. Everything else (differing processor/validator source text
 * with no annotation, or none at all) is a warning -- we cannot prove
 * semantic non-equivalence via static analysis alone, and the library never
 * executes schema code to check further (see literal-eval.ts).
 */
export function detectCompatibilityIssues(
  contracts: readonly DiscoveredContract[],
): CompatibilityIssue[] {
  const declarationsByKey = new Map<
    string,
    { file: string; contractName: string; variable: DiscoveredVariable }[]
  >()

  for (const contract of contracts) {
    for (const variable of contract.variables) {
      const list = declarationsByKey.get(variable.key) ?? []
      list.push({ file: contract.file, contractName: contract.contractName, variable })
      declarationsByKey.set(variable.key, list)
    }
  }

  const issues: CompatibilityIssue[] = []

  for (const [key, declarations] of [...declarationsByKey.entries()].sort((a, b) =>
    a[0] < b[0] ? -1 : 1,
  )) {
    for (let i = 0; i < declarations.length; i++) {
      for (let j = i + 1; j < declarations.length; j++) {
        const a = declarations[i]
        const b = declarations[j]

        if (
          a.variable.processorReturnType &&
          b.variable.processorReturnType &&
          a.variable.processorReturnType !== b.variable.processorReturnType
        ) {
          issues.push({
            severity: "error",
            variable: key,
            files: [a.file, b.file],
            reason:
              `Processor return types are declared incompatible: "${a.contractName}" produces ` +
              `${a.variable.processorReturnType}, "${b.contractName}" produces ${b.variable.processorReturnType}.`,
          })
          continue
        }

        if (
          a.variable.hasProcessor &&
          b.variable.hasProcessor &&
          a.variable.processorSource !== b.variable.processorSource
        ) {
          issues.push({
            severity: "warning",
            variable: key,
            files: [a.file, b.file],
            reason:
              `"${a.contractName}" and "${b.contractName}" both declare a processor for this variable with ` +
              "different implementations. Return types could not be statically verified -- add explicit " +
              "return type annotations, or confirm they produce equivalent output.",
          })
        }

        if (
          a.variable.hasValidator &&
          b.variable.hasValidator &&
          a.variable.validatorSource !== b.variable.validatorSource
        ) {
          issues.push({
            severity: "warning",
            variable: key,
            files: [a.file, b.file],
            reason:
              `"${a.contractName}" and "${b.contractName}" both declare a validator for this variable with ` +
              "different implementations. Validator logic cannot be statically compared -- confirm they enforce compatible rules.",
          })
        }

        if (a.variable.documented && b.variable.documented) {
          const divergences = documentationDivergences(a.variable, b.variable)
          if (divergences.length > 0) {
            issues.push({
              severity: "warning",
              variable: key,
              files: [a.file, b.file],
              code: "duplicate-variable-documentation",
              reason:
                `"${a.contractName}" and "${b.contractName}" both document this variable, but disagree on: ` +
                `${divergences.join(", ")}. Confirm they're still meant to be the same variable and align the ` +
                "documentation, or document them separately if they're not.",
            })
          }
        }
      }
    }
  }

  return issues
}
