import path from "node:path"
import { humanizeKey, renderMetadataValue } from "./humanize-key.js"
import type { DiscoveredContract, DiscoveredVariable } from "./link.js"
import type { BuildFileSystem } from "./types.js"
import { mustGet } from "./map-utils.js"

/**
 * Controls what happens when a `.env.example` already exists at the target
 * location. `"keep-sibling"` (default): never touch the existing file --
 * write a timestamped sibling instead, for the developer to diff/merge
 * manually. `"overwrite"`: replace the existing file with freshly rendered
 * content directly. `"skip"`: write nothing at all.
 */
export type EnvExampleOnExisting = "keep-sibling" | "overwrite" | "skip"

/** The result of a completed {@link writeEnvExample} call. */
export interface EnvExampleResult {
  /**
   * Where the example file actually got written. `undefined` only when
   * `onExisting: "skip"` left an existing file untouched and nothing was
   * written.
   */
  readonly writtenPath: string | undefined
  /**
   * Set when a file already existed at the requested location and was left
   * untouched: with the default `"keep-sibling"`, `writtenPath` is a fresh
   * timestamped sibling instead; with `"skip"`, this is the only outcome and
   * `writtenPath` is `undefined`. Always `undefined` with `"overwrite"`.
   */
  readonly skippedExistingPath: string | undefined
  /** Variable names (live or already commented-out) in an existing example file that no discovered contract declares anymore. */
  readonly staleVariables: readonly string[]
  /** Variables live in an existing example file whose feature is no longer active, and that no other active feature still needs -- safe to comment out. */
  readonly variablesToComment: readonly string[]
  /** Variables the current (active) configuration requires that aren't yet a live entry in an existing example file. */
  readonly variablesToAdd: readonly string[]
}

/** The result of {@link computeReconciliation}: an existing `.env.example` diffed against the current configuration. */
export interface Reconciliation {
  /** Variable names (live or already commented-out) in an existing example file that no discovered contract declares anymore. */
  readonly staleVariables: readonly string[]
  /** Variables live in an existing example file whose feature is no longer active, and that no other active feature still needs -- safe to comment out. */
  readonly variablesToComment: readonly string[]
  /** Variables the current (active) configuration requires that aren't yet a live entry in an existing example file. */
  readonly variablesToAdd: readonly string[]
}

function isPrimitiveLiteral(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
}

function defaultLiteralFor(variable: DiscoveredVariable): string | undefined {
  return variable.defaultValue?.ok === true && isPrimitiveLiteral(variable.defaultValue.value)
    ? String(variable.defaultValue.value)
    : undefined
}

/**
 * Renders one variable's documentation comments + `KEY=value` line. `commented`
 * comments out the `KEY=value` line itself (documentation lines are always
 * comments regardless); `note` adds a leading comment explaining why --
 * used for both cross-feature duplicates and disabled-feature entries.
 *
 * Data comes from the linked `documentEnv()` call, if any -- never from the
 * schema itself, which only ever carries `processor`/`validator`/`default`.
 * An undocumented variable renders with no comments at all, just `KEY=`.
 */
function renderVariableLines(
  variable: DiscoveredVariable,
  options: { commented?: boolean; note?: string } = {},
): string[] {
  const lines: string[] = []
  if (options.note) lines.push(`# ${options.note}`)

  if (variable.description) lines.push(`# ${variable.description}`)
  if (variable.context) lines.push(`# Validation context: ${variable.context}`)
  if (variable.owner) lines.push(`# Owner: ${variable.owner}`)
  if (variable.setupInstructions) lines.push(`# Setup: ${variable.setupInstructions}`)
  if (variable.expiresAt) lines.push(`# Expires At: ${variable.expiresAt}`)
  if (variable.refreshInstructions)
    lines.push(`# Refresh Instructions: ${variable.refreshInstructions}`)
  if (variable.required) lines.push(`# Required: yes`)
  if (variable.purpose) lines.push(`# Purpose: ${variable.purpose}`)
  if (variable.legalBasis) lines.push(`# Legal Basis: ${variable.legalBasis}`)
  if (variable.retention) lines.push(`# Retention Policy: ${variable.retention}`)
  if (variable.dataResidency)
    lines.push(`# Data Residency: ${renderMetadataValue(variable.dataResidency)}`)
  if (variable.auditRequired) lines.push(`# Audit Required: yes`)
  for (const [metaKey, metaValue] of Object.entries(variable.metadata ?? {})) {
    lines.push(`# ${humanizeKey(metaKey)}: ${renderMetadataValue(metaValue)}`)
  }

  const prefix = options.commented ? "# " : ""
  lines.push(`${prefix}${variable.key}=${defaultLiteralFor(variable) ?? ""}`, "")
  return lines
}

interface KeyedDeclaration {
  readonly contract: DiscoveredContract
  readonly variable: DiscoveredVariable
}

function groupByKey(contracts: readonly DiscoveredContract[]): Map<string, KeyedDeclaration[]> {
  const byKey = new Map<string, KeyedDeclaration[]>()
  for (const contract of contracts) {
    for (const variable of contract.variables) {
      const list = byKey.get(variable.key) ?? []
      list.push({ contract, variable })
      byKey.set(variable.key, list)
    }
  }
  return byKey
}

/**
 * Renders a deterministic `.env.example`-style file scoped to the *current*
 * configuration: every unique variable the active contracts require (one
 * live entry per key, alphabetical; a key declared by more than one active
 * contract renders once live and the rest commented-out with a pointer),
 * followed by variables unique to disabled contracts (commented-out, for
 * visibility -- a key already required by an active contract is not unique
 * and never repeated here). `reconciliationHeader`, when non-empty, is
 * spliced in right after the banner (see `computeReconciliation`).
 */
export function renderEnvExample(
  contracts: readonly DiscoveredContract[],
  reconciliationHeader: readonly string[] = [],
): string {
  const sorted = [...contracts].sort((a, b) => a.file.localeCompare(b.file))
  const active = sorted.filter((c) => c.active)
  // Bypassing this filter (including active contracts in `inactive` too) is
  // behaviorally equivalent, not a real gap: the render loop below's own
  // `if (activeByKey.has(key)) continue` guard already skips any key an
  // active contract declares, whether or not it was ALSO wrongly grouped
  // into `inactiveByKey` here -- a key genuinely unique to an active
  // contract can never gain a spurious `inactiveByKey` entry either, since
  // `groupByKey` only ever pushes declarations that a contract in the
  // (possibly-widened) list actually has. Hand-verified: mutating this and
  // running the real suite passes unchanged.
  // Stryker disable next-line MethodExpression
  const inactive = sorted.filter((c) => !c.active)

  const lines: string[] = [
    "# AUTO-GENERATED EXAMPLE FILE.",
    "# Copy to .env and fill in real values. Do not commit .env.",
  ]
  // Only shown when at least one variable actually declares a context --
  // keeps this file byte-identical for every project not using the
  // feature.
  if (sorted.some((c) => c.variables.some((v) => v.context))) {
    lines.push(
      "# Validation context annotations describe when validation participates.",
      "# They do not restrict access to values, and every variable below is",
      "# still written to this file regardless of its context.",
    )
  }
  // Bypassing this guard is behaviorally equivalent, not a real gap:
  // `lines.push(...[])` (an empty `reconciliationHeader`) is already a
  // no-op, so the length check adds nothing observable. Hand-verified:
  // mutating this and running the real suite passes unchanged.
  // Stryker disable next-line ConditionalExpression,EqualityOperator
  if (reconciliationHeader.length > 0) lines.push(...reconciliationHeader)
  lines.push("")

  const activeByKey = groupByKey(active)
  for (const key of [...activeByKey.keys()].sort()) {
    const [first, ...rest] = mustGet(activeByKey, key)
    // groupByKey() only ever creates a key alongside its first pushed entry,
    // so every group it returns is non-empty by construction --
    // noUncheckedIndexedAccess can't see that invariant through mustGet()'s
    // own return type, only that array destructuring is *generally* unsafe.
    if (first === undefined) continue
    lines.push(...renderVariableLines(first.variable))
    for (const dup of rest) {
      lines.push(
        ...renderVariableLines(dup.variable, {
          commented: true,
          note: `Also declared by "${dup.contract.contractName}" -- see "${first.contract.contractName}" above.`,
        }),
      )
    }
  }

  const inactiveByKey = groupByKey(inactive)
  for (const key of [...inactiveByKey.keys()].sort()) {
    if (activeByKey.has(key)) continue // claimed by an active contract -- not unique to the disabled feature.
    const [first] = mustGet(inactiveByKey, key)
    // Same groupByKey() non-empty-by-construction invariant as above.
    if (first === undefined) continue
    lines.push(
      ...renderVariableLines(first.variable, {
        commented: true,
        note: `Disabled -- feature "${first.contract.contractName}" is not active.`,
      }),
    )
  }

  // `+` vs no `+` here is unreachable-to-differ: `lines` is built so its own
  // trailing element is always exactly ONE "" (every section -- the initial
  // blank, and each `renderVariableLines()` call -- appends exactly one
  // trailing blank, never two in a row), so `.join("\n")` can never actually
  // produce more than one trailing newline for this regex to collapse.
  // Hand-verified: mutating `+` away and running the real suite passes
  // unchanged.
  // Stryker disable next-line Regex
  return lines.join("\n").replace(/\n+$/, "\n")
}

/** Parses `KEY=value` lines out of an existing `.env`-style file, ignoring comments and blank lines. */
export function extractDeclaredVariables(source: string): string[] {
  const names: string[] = []
  for (const line of source.split("\n")) {
    const trimmed = line.trim()
    // Bypassing this early exit is behaviorally equivalent, not a real gap:
    // both a blank line (trimmed === "") and one starting with "#" can never
    // match the identifier-must-start-with-letter/underscore regex below
    // either way, so `continue`ing early here versus falling through to a
    // guaranteed-failing `.exec()` produces the identical result. Kept as a
    // documented fast-path (skips the regex entirely for the common case)
    // rather than removed. Hand-verified: mutating the whole condition to
    // `false` and running the real suite passes unchanged.
    // Stryker disable next-line ConditionalExpression,LogicalOperator,MethodExpression
    if (!trimmed || trimmed.startsWith("#")) continue
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(trimmed)
    if (match?.[1]) names.push(match[1])
  }
  return names
}

/** Parses `# KEY=value` lines out of an existing `.env`-style file -- variables it already knows about but has turned off. */
export function extractCommentedVariables(source: string): string[] {
  const names: string[] = []
  for (const line of source.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed.startsWith("#")) continue
    // Removing the `^` anchor is behaviorally equivalent, not a real gap:
    // the guard just above guarantees `trimmed` always starts with "#", so
    // the leftmost match an unanchored regex would find is already at
    // position 0 -- identical to the anchored version. Hand-verified:
    // mutating this and running the real suite passes unchanged.
    // Stryker disable next-line Regex
    const withoutHash = trimmed.replace(/^#+\s*/, "")
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(withoutHash)
    if (match?.[1]) names.push(match[1])
  }
  return names
}

/**
 * Diffs an existing `.env.example` against the current configuration into
 * three actionable sets. Pure and filesystem-independent -- `writeEnvExample`
 * is the only caller that reads the file itself.
 */
export function computeReconciliation(
  contracts: readonly DiscoveredContract[],
  existingContent: string,
): Reconciliation {
  const activeKeys = new Set(
    contracts.filter((c) => c.active).flatMap((c) => c.variables.map((v) => v.key)),
  )
  const knownKeys = new Set(contracts.flatMap((c) => c.variables.map((v) => v.key)))

  const oldLive = new Set(extractDeclaredVariables(existingContent))
  const oldKnown = new Set([...oldLive, ...extractCommentedVariables(existingContent)])

  const staleVariables = [...oldKnown].filter((key) => !knownKeys.has(key)).sort()
  // Only ever flags a key that no active contract needs -- a key shared with
  // a still-active feature is never suggested for commenting out.
  const variablesToComment = [...oldLive]
    .filter((key) => !activeKeys.has(key) && knownKeys.has(key))
    .sort()
  const variablesToAdd = [...activeKeys].filter((key) => !oldLive.has(key)).sort()

  return { staleVariables, variablesToComment, variablesToAdd }
}

function renderReconciliationHeader(reconciliation: Reconciliation): string[] {
  const lines: string[] = []
  if (reconciliation.staleVariables.length > 0) {
    lines.push("#", "# Remove the following variables (no longer declared by any feature):")
    for (const key of reconciliation.staleVariables) lines.push(`#   - ${key}`)
  }
  if (reconciliation.variablesToComment.length > 0) {
    lines.push("#", "# Comment the following variables (their feature is no longer active):")
    for (const key of reconciliation.variablesToComment) lines.push(`#   - ${key}`)
  }
  if (reconciliation.variablesToAdd.length > 0) {
    lines.push("#", "# Add the following variables (required by the current configuration):")
    for (const key of reconciliation.variablesToAdd) lines.push(`#   - ${key}`)
  }
  return lines
}

/**
 * Writes a rendered `.env.example` to `location`. Behavior when a file
 * already exists there is governed by `options.onExisting` (default
 * `"keep-sibling"`, see `EnvExampleOnExisting`):
 *  - `"keep-sibling"`: the existing file is left alone; freshly generated
 *    content is written to a timestamped sibling instead
 *    (`<location>.<epoch-ms>`), prefixed with a reconciliation header
 *    comparing it against the existing file (omitted when there's nothing
 *    to report).
 *  - `"overwrite"`: the existing file is replaced directly with freshly
 *    rendered content -- no reconciliation header (the changes it would
 *    describe are already applied).
 *  - `"skip"`: nothing is written.
 * When no file exists yet at `location`, all three modes behave the same:
 * write fresh content, nothing to reconcile against. `staleVariables`/
 * `variablesToComment`/`variablesToAdd` are always computed and returned
 * when a prior file existed, even under `"overwrite"`/`"skip"`, as a
 * diagnostic -- independent of whether anything was actually written.
 */
export async function writeEnvExample(
  contracts: readonly DiscoveredContract[],
  location: string,
  fs: BuildFileSystem,
  options: { onExisting?: EnvExampleOnExisting } = {},
): Promise<EnvExampleResult> {
  const onExisting = options.onExisting ?? "keep-sibling"

  // An empty catch (no assignment) is provably equivalent to explicitly
  // setting `existingContent = undefined` -- `let` without an initializer is
  // already `undefined` at runtime -- and an empty block gives Stryker's
  // BlockStatement mutator nothing to swap in for, eliminating the mutant
  // target entirely rather than needing a disable. See helpers/processors.ts's
  // `orUndefined` for the same established pattern.
  let existingContent: string | undefined
  try {
    existingContent = await fs.readFile(location, "utf8")
  } catch {
    // treat any read failure as "no file existed"
  }

  if (existingContent === undefined) {
    const content = renderEnvExample(contracts, [])
    await fs.mkdir(path.dirname(location), { recursive: true })
    // "utf8" vs "" encoding equivalence, same established class as this
    // package's other fs.writeFile calls (evidence-snapshot.ts,
    // resolve-package-schema.ts): both write a string's UTF-8 bytes
    // identically. Hand-verified via a real byte-comparison-equivalent test
    // run.
    // Stryker disable next-line StringLiteral
    await fs.writeFile(location, content, "utf8")
    return {
      writtenPath: location,
      skippedExistingPath: undefined,
      staleVariables: [],
      variablesToComment: [],
      variablesToAdd: [],
    }
  }

  const reconciliation = computeReconciliation(contracts, existingContent)
  const { staleVariables, variablesToComment, variablesToAdd } = reconciliation

  if (onExisting === "skip") {
    return {
      writtenPath: undefined,
      skippedExistingPath: location,
      staleVariables,
      variablesToComment,
      variablesToAdd,
    }
  }

  // Only "keep-sibling" embeds the reconciliation as an in-file header --
  // "overwrite" already applies the changes directly, so "remove/comment/add
  // the following" instructions would just describe work already done.
  const headerLines =
    onExisting === "keep-sibling" ? renderReconciliationHeader(reconciliation) : []
  const content = renderEnvExample(contracts, headerLines)
  const writtenPath = onExisting === "overwrite" ? location : `${location}.${Date.now()}`
  const skippedExistingPath = onExisting === "overwrite" ? undefined : location

  await fs.mkdir(path.dirname(writtenPath), { recursive: true })
  // Same "utf8" vs "" equivalence as the fresh-file write above.
  // Stryker disable next-line StringLiteral
  await fs.writeFile(writtenPath, content, "utf8")

  return { writtenPath, skippedExistingPath, staleVariables, variablesToComment, variablesToAdd }
}
