import { deepEqual } from "./deep-equal.js"
import type { DiscoveredContract, DiscoveredVariable } from "./link.js"

/**
 * Every stable `code` a check in this file (or `exclusive-group.ts`) can
 * emit. Documented as an enumerated union so a consumer filtering/linking on
 * `code` has a closed list to switch over, rather than an arbitrary string --
 * see ADR 0024/0026. `exclusive-group.ts`'s check does not (yet) set one; see
 * that file's own comment for why.
 */
export type CompatibilityIssueCode =
  | "PROCESSOR_RETURN_TYPE_CONFLICT"
  | "PROCESSOR_SOURCE_CONFLICT"
  | "VALIDATOR_SOURCE_CONFLICT"
  | "DUPLICATE_VARIABLE_DOCUMENTATION"
  | "DUPLICATE_VARIABLE_SHAPE_ACROSS_CONTRACTS"

/** One compatibility problem found between two or more declarations of the same variable, or an exclusive-group violation. */
export interface CompatibilityIssue {
  /** `"error"` blocks generation regardless of `onIncompatibility`; `"warning"` blocks only when `onIncompatibility: "throw"`; `"info"` never blocks, under any flag. */
  readonly severity: "error" | "warning" | "info"
  /** The environment variable name, or `"(contract) <name>"` for a contract-level (e.g. exclusive-group) issue. */
  readonly variable: string
  /**
   * Every file declaring a conflicting definition. A pairwise comparison
   * (compatibility.ts, exclusive-group.ts) always produces exactly two; a
   * finding escalated from another family (generate-env-artifacts.ts's
   * `escalatedFindings()`, via `findingFiles()`) can produce zero, one, or
   * two, depending on what location information that finding actually
   * carries -- genuinely variable arity, not a tuple.
   */
  readonly files: readonly string[]
  /** Human-readable explanation of the conflict. */
  readonly reason: string
  /**
   * Stable, machine-readable identifier for CI filtering / doc-linking /
   * GitHub Action annotations / IDE integration. `undefined` only for checks
   * that don't (yet) set one -- see {@link CompatibilityIssueCode} for the
   * full enumerated list of values a check in this file can produce.
   */
  readonly code?: CompatibilityIssueCode
}

const DOCUMENTATION_COMPARISON_FIELDS = [
  "description",
  "owner",
  "sensitivity",
  "expiresAt",
  "refreshInstructions",
  "setupInstructions",
  "required",
] as const

/** Field names (including `metadata.<key>`) where two documented declarations of the same variable disagree -- empty when they match. */
function documentationDivergences(a: DiscoveredVariable, b: DiscoveredVariable): string[] {
  const divergences: string[] = []
  for (const field of DOCUMENTATION_COMPARISON_FIELDS) {
    if (a[field] !== b[field]) divergences.push(field)
  }
  const aMetadata = a.metadata ?? {}
  const bMetadata = b.metadata ?? {}
  for (const key of new Set([...Object.keys(aMetadata), ...Object.keys(bMetadata)])) {
    if (!deepEqual(aMetadata[key], bMetadata[key])) divergences.push(`metadata.${key}`)
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
    a[0].localeCompare(b[0]),
  )) {
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
    for (const [i, a] of declarations.entries()) {
      for (const b of declarations.slice(i + 1)) {
        if (
          a.variable.processorReturnType &&
          b.variable.processorReturnType &&
          a.variable.processorReturnType !== b.variable.processorReturnType
        ) {
          issues.push({
            severity: "error",
            variable: key,
            files: [a.file, b.file],
            code: "PROCESSOR_RETURN_TYPE_CONFLICT",
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
            code: "PROCESSOR_SOURCE_CONFLICT",
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
            code: "VALIDATOR_SOURCE_CONFLICT",
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
              code: "DUPLICATE_VARIABLE_DOCUMENTATION",
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

/**
 * One variable's statically-provable *type shape*, deliberately nothing more:
 * what type its value ends up as, and whether it is processed and/or
 * validated at all. Never its literal content -- two variables holding
 * different secrets are still the same shape, and comparing values would both
 * leak them into a report and answer the wrong question.
 */
interface VariableShape {
  /** The explicit `processorReturnType` when the variable declares one, else `typeof defaultValue.value` when a statically-evaluable default exists, else `"unknown"`. */
  readonly valueType: string
  readonly hasProcessor: boolean
  readonly hasValidator: boolean
}

/**
 * `undefined` is never inferred from `processorSource`/`validatorSource`
 * text -- reading a type out of an unannotated function body is exactly the
 * guessing this codebase refuses to do (ADR 0010). Absent an annotation and
 * absent a resolvable default, the honest answer is `"unknown"`, and an
 * `"unknown"` shape never matches anything, including another `"unknown"`.
 */
function variableShape(variable: DiscoveredVariable): VariableShape {
  let valueType = "unknown"
  if (variable.processorReturnType !== undefined) {
    valueType = variable.processorReturnType
  } else if (variable.hasDefault && variable.defaultValue?.ok === true) {
    valueType = typeof variable.defaultValue.value
  }
  return {
    valueType,
    hasProcessor: variable.hasProcessor,
    hasValidator: variable.hasValidator,
  }
}

function shapesMatch(a: VariableShape, b: VariableShape): boolean {
  // Mutating `||` to `&&`, or either `"unknown"` to a non-matching literal,
  // is behaviorally equivalent here, not a real gap: whenever exactly one
  // side is "unknown" and the other genuinely isn't, the structural
  // `a.valueType === b.valueType` check below already returns false on its
  // own (an "unknown" string can never equal a real type string) -- and
  // whenever BOTH sides are "unknown", every mutant variant here still
  // triggers this same early return (both `||` and `&&` are satisfied when
  // both operands are true). The only case this guard is load-bearing for
  // -- both sides "unknown" with matching hasProcessor/hasValidator, which
  // would otherwise wrongly report a match via the structural check alone
  // -- is real-tested by 'never flags an "unknown" shape...' below, and
  // that test DOES fail without this whole `if`. Hand-verified each mutant
  // variant individually (this `||`, and each `"unknown"` string) against
  // the real suite; all pass unchanged.
  // Stryker disable next-line LogicalOperator,StringLiteral,ConditionalExpression
  if (a.valueType === "unknown" || b.valueType === "unknown") return false
  return (
    a.valueType === b.valueType &&
    a.hasProcessor === b.hasProcessor &&
    a.hasValidator === b.hasValidator
  )
}

/**
 * Flags *differently-named* variables in different contracts that share an
 * identical type shape -- a soft signal that two features may be
 * independently modelling the same underlying configuration value under two
 * names, worth a human glance before they drift apart.
 *
 * @remarks
 * Always `severity: "info"`, and never escalated to blocking by any flag,
 * including `--strict` -- an identical shape is genuinely common and
 * frequently correct (two unrelated features can both take a `number` timeout
 * with a validator, and that is not a defect). This is an observation offered
 * to a reader, not a rule; making it blockable would make it noise a team has
 * to suppress rather than a signal they can scan.
 *
 * Scope, deliberately narrow on every axis:
 *  - **Different keys only.** Same-key collisions across contracts are
 *    `detectCompatibilityIssues()`'s own, entirely separate concern above;
 *    reporting them here too would double-report one problem under two codes.
 *  - **Different contracts only.** Two same-shaped variables inside one
 *    contract are that contract's own deliberate design.
 *  - **Active contracts only.** An inactive contract is wired into nothing,
 *    so an overlap with it is not a live duplication.
 *  - **No exclusive-grouped contracts.** Members of an exclusive group are
 *    interchangeable alternatives by explicit authorial declaration --
 *    matching shapes there are the *point*, not a smell.
 *  - **Pairwise, never transitive.** Three mutually-matching variables emit
 *    three independent findings (A-B, A-C, B-C), never one merged "cluster":
 *    each pair is its own question a reader answers on its own, and a cluster
 *    would imply a transitive relationship this check never established.
 */
export function detectDuplicateVariableShapes(
  contracts: readonly DiscoveredContract[],
): CompatibilityIssue[] {
  const candidates = contracts.filter((c) => c.active && !c.exclusiveGroup)

  const declarations: {
    file: string
    contractName: string
    key: string
    shape: VariableShape
  }[] = []
  for (const contract of candidates) {
    for (const variable of contract.variables) {
      declarations.push({
        file: contract.file,
        contractName: contract.contractName,
        key: variable.key,
        shape: variableShape(variable),
      })
    }
  }
  // Deterministic output regardless of discovery order -- by key, then by the
  // declaring contract, matching every other report in this package.
  declarations.sort(
    (a, b) =>
      a.key.localeCompare(b.key) ||
      a.contractName.localeCompare(b.contractName) ||
      a.file.localeCompare(b.file),
  )

  const issues: CompatibilityIssue[] = []
  // `.entries()`/`.slice()` pairwise iteration -- same rationale (no manual
  // index for a mutant to walk away from the bound with) as
  // `detectCompatibilityIssues()`'s identical pairwise double loop above.
  for (const [i, a] of declarations.entries()) {
    for (const b of declarations.slice(i + 1)) {
      if (a.key === b.key) continue
      if (a.file === b.file && a.contractName === b.contractName) continue
      if (!shapesMatch(a.shape, b.shape)) continue

      issues.push({
        severity: "info",
        variable: `${a.key} / ${b.key}`,
        files: [a.file, b.file],
        code: "DUPLICATE_VARIABLE_SHAPE_ACROSS_CONTRACTS",
        reason:
          `"${a.key}" (${a.contractName}) and "${b.key}" (${b.contractName}) declare an identical shape ` +
          `(type ${a.shape.valueType}, processor: ${a.shape.hasProcessor ? "yes" : "no"}, validator: ` +
          `${a.shape.hasValidator ? "yes" : "no"}). Informational only -- they may be the same underlying ` +
          "value modelled twice, or two unrelated values that happen to look alike. Nothing is required.",
      })
    }
  }

  return issues
}
