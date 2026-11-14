import { deepEqual } from "./deep-equal.js"
import type { DiscoveredContract, DiscoveredVariable } from "./link.js"
import { VALUE_FIELDS, donatedTo } from "./merge-documentation.js"

/**
 * Every stable `code` a check in this file (or `exclusive-group.ts`) can
 * emit. Documented as an enumerated union so a consumer filtering/linking on
 * `code` has a closed list to switch over, rather than an arbitrary string:
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
   * (compatibility.ts, exclusive-group.ts) always produces exactly two. A
   * finding escalated from another family (generate-env-artifacts.ts's
   * `escalatedFindings()`, via `findingFiles()`) can produce zero, one, or
   * two, depending on the location information that finding carries. So
   * the arity varies, and this is not a tuple.
   */
  readonly files: readonly string[]
  /** Human-readable explanation of the conflict. */
  readonly reason: string
  /**
   * Stable, machine-readable identifier for CI filtering / doc-linking /
   * GitHub Action annotations / IDE integration. `undefined` only for checks
   * that don't set one yet. {@link CompatibilityIssueCode} lists every value
   * a check in this file can produce.
   */
  readonly code?: CompatibilityIssueCode
}

/** Field names (including `metadata.<key>`) that two documented declarations of the same variable both set, to different values. Empty when they agree or one leaves the field to the other. */
function documentationDivergences(a: DiscoveredVariable, b: DiscoveredVariable): string[] {
  const divergences: string[] = []
  // A field only one declaration sets is not a disagreement: the other leaves it to the first (see
  // `mergeSharedDocumentation()`). Only a field both set, to different values, is one.
  // Every field the merge can fill, compared structurally: a list or an object that reads the same is the same.
  // A value one of them was given by the documentation merge is not one it wrote, so it is not compared.
  const given = new Set([...donatedTo(a), ...donatedTo(b)])
  for (const field of VALUE_FIELDS) {
    if (
      !given.has(field) &&
      a[field] !== undefined &&
      b[field] !== undefined &&
      !deepEqual(a[field], b[field])
    ) {
      divergences.push(field)
    }
  }
  const aMetadata = a.metadata ?? {}
  const bMetadata = b.metadata ?? {}
  for (const key of Object.keys(aMetadata)) {
    if (
      !given.has(`metadata.${key}`) &&
      key in bMetadata &&
      !deepEqual(aMetadata[key], bMetadata[key])
    ) {
      divergences.push(`metadata.${key}`)
    }
  }
  return divergences
}

/**
 * Flags cases where two contracts declare the same variable name but appear to
 * disagree about its shape. A human can then confirm they're still meant to be "the same" var.
 *
 * @remarks
 * Duplicate variable names across contracts are not a merge problem. Each
 * contract processes its own copy of the raw value; there is no runtime
 * merge at all. This is purely a build-time lint.
 *
 * Only one thing is treated as *provable* without executing code: two
 * processors with explicit, differing `: T` return type annotations. That is
 * a hard error. Everything else (differing processor/validator source text
 * with no annotation, or none at all) is a warning. Static analysis alone
 * cannot prove semantic non-equivalence. And the library never executes
 * schema code to check further (see literal-eval.ts).
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
    // Pairwise iteration uses `.entries()` and `.slice()`, not an indexed double loop, for two reasons.
    // `.entries()` yields real elements, so `noUncheckedIndexedAccess` forces no `undefined` guard. And a
    // mutant that flips `i++` or `<` in an indexed loop walks away from its bound. It loops until
    // Stryker's timeout, which no test can kill.
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
              "different implementations. Return types could not be statically verified. Add explicit " +
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
              "different implementations. Validator logic cannot be statically compared. Confirm they enforce compatible rules.",
          })
        }

        // Only a field both set, to different values, disagrees. So a declaration that documents nothing has no
        // disagreement to report and needs no test of its own.
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

  return issues
}

/**
 * One variable's statically-provable *type shape*, deliberately nothing more:
 * what type its value ends up as, and whether it is processed and/or
 * validated at all. Never its literal content: two variables holding
 * different secrets are still the same shape. Comparing values would leak
 * them into a report, and would answer the wrong question.
 */
interface VariableShape {
  /** The explicit `processorReturnType` when the variable declares one, else `typeof defaultValue.value` when a statically-evaluable default exists, else `"unknown"`. */
  readonly valueType: string
  readonly hasProcessor: boolean
  readonly hasValidator: boolean
}

/**
 * `undefined` is never inferred from `processorSource`/`validatorSource`
 * text. Reading a type out of an unannotated function body is guessing,
 * which this codebase refuses to do (ADR 0010). Absent an annotation and
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
  // An "unknown" shape never matches anything, including another "unknown".
  return (
    a.valueType !== "unknown" &&
    a.valueType === b.valueType &&
    a.hasProcessor === b.hasProcessor &&
    a.hasValidator === b.hasValidator
  )
}

/**
 * Flags *differently-named* variables in different contracts that share an
 * identical type shape. It is a soft signal that two features may model the
 * same configuration value under two names. That is worth a human glance
 * before they drift apart.
 *
 * @remarks
 * Always `severity: "info"`, and never escalated to blocking by any flag,
 * including `--strict`. An identical shape is common and often correct. Two
 * unrelated features can both take a `number` timeout with a validator, and
 * that is not a defect. This is an observation for a reader, not a rule. A
 * blockable version would be noise a team has to suppress, not a signal
 * they can scan.
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
 *    interchangeable alternatives by explicit authorial declaration:
 *    matching shapes there are the *point*, not a smell.
 *  - **Pairwise, never transitive.** Three mutually-matching variables emit
 *    three independent findings (A-B, A-C, B-C), never one merged "cluster".
 *    Each pair is its own question a reader answers on its own. A cluster
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
  // Deterministic output regardless of discovery order: by key, then by the
  // declaring contract, matching every other report in this package.
  declarations.sort(
    (a, b) =>
      a.key.localeCompare(b.key) ||
      a.contractName.localeCompare(b.contractName) ||
      a.file.localeCompare(b.file),
  )

  const issues: CompatibilityIssue[] = []
  // `.entries()`/`.slice()` pairwise iteration: same rationale (no manual
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
          `${a.shape.hasValidator ? "yes" : "no"}). Informational only: they may be the same underlying ` +
          "value modelled twice, or two unrelated values that happen to look alike. Nothing is required.",
      })
    }
  }

  return issues
}
