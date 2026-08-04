import { markdownBannerLine } from "./generated-banner.js"
import { humanizeKey } from "./humanize-key.js"
import type { DiscoveredContract, DiscoveredVariable } from "./link.js"
import { mustGet } from "./map-utils.js"

/** Identifies a contract with no linked `documentEnv()` call at all. */
export interface UndocumentedContractRef {
  /** Absolute path of the file declaring the contract. */
  readonly file: string
  /** The contract's exported binding name. */
  readonly exportName: string
}
/** Identifies a schema variable with no matching entry in its contract's linked documentation. */
export interface UndocumentedVariableRef {
  /** Absolute path of the file declaring the contract. */
  readonly file: string
  /** The contract's exported binding name. */
  readonly exportName: string
  /** The undocumented environment variable name. */
  readonly key: string
}
/** One contract- or variable-level `expiresAt` falling within the configured "expiring soon" window. */
export interface ExpiringEntry {
  /** Absolute path of the file declaring the contract. */
  readonly file: string
  /** The contract's exported binding name. */
  readonly exportName: string
  /** `undefined` for a contract-level `expiresAt`, set for a per-variable one. */
  readonly key: string | undefined
  /** The raw ISO date string, unparsed. */
  readonly expiresAt: string
  /** Days from `now` until expiry; negative when already expired. */
  readonly daysRemaining: number
}

/** Options for {@link renderDocs}. */
export interface RenderDocsOptions {
  /** How many days out counts as "expiring soon" in the lifecycle report and security review. */
  readonly expiringWithinDays: number
  /** Contracts with no linked `documentEnv()` call at all. */
  readonly undocumentedContracts: readonly UndocumentedContractRef[]
  /** Schema variables with no matching entry in their contract's linked documentation. */
  readonly undocumentedVariables: readonly UndocumentedVariableRef[]
  /** Timestamp rendered into the header and used for expiry/days-remaining math. */
  readonly generatedAt: Date
  /** Content already at `docs.location`, if any -- used only for the "changes since last report" summary. */
  readonly previousContent: string | undefined
}

/**
 * Parses `expiresAt` as a real date.
 *
 * @remarks
 * Malformed strings are silently ignored (return `undefined`) rather than throwing -- same
 * "warn/skip, never guess" policy as the rest of the generator. Exported so `live-expirations.ts`
 * can validate live override values against the exact same rule used for static `expiresAt`.
 */
export function parseIsoDate(value: string): Date | undefined {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

/**
 * Computes every contract- or variable-level `expiresAt` within `expiringWithinDays` of `now`, sorted soonest-first.
 *
 * @remarks
 * Shared by `renderDocs` (Section 4/5) and `generate-documentation.ts` (the `documentation.expiringSoon` result field), so both agree on exactly the same set.
 */
export function computeExpiringEntries(
  contracts: readonly DiscoveredContract[],
  expiringWithinDays: number,
  now: Date,
): ExpiringEntry[] {
  const entries: ExpiringEntry[] = []
  const msPerDay = 86_400_000

  for (const contract of contracts) {
    if (contract.expiresAt) {
      const date = parseIsoDate(contract.expiresAt)
      if (date) {
        const daysRemaining = Math.ceil((date.getTime() - now.getTime()) / msPerDay)
        if (daysRemaining <= expiringWithinDays) {
          entries.push({
            file: contract.file,
            exportName: contract.exportName,
            key: undefined,
            expiresAt: contract.expiresAt,
            daysRemaining,
          })
        }
      }
    }
    for (const variable of contract.variables) {
      if (!variable.expiresAt) continue
      const date = parseIsoDate(variable.expiresAt)
      if (!date) continue
      const daysRemaining = Math.ceil((date.getTime() - now.getTime()) / msPerDay)
      if (daysRemaining <= expiringWithinDays) {
        entries.push({
          file: contract.file,
          exportName: contract.exportName,
          key: variable.key,
          expiresAt: variable.expiresAt,
          daysRemaining,
        })
      }
    }
  }

  return entries.sort((a, b) => a.daysRemaining - b.daysRemaining)
}

export interface CatalogVariable {
  readonly description: string | undefined
  readonly owner: string | undefined
  readonly expiresAt: string | undefined
  readonly refreshInstructions: string | undefined
  readonly required: boolean | undefined
  readonly hasDefault: boolean
  readonly hasProcessor: boolean
  readonly processorReturnType: string | undefined
  readonly hasValidator: boolean
  readonly documented: boolean
  /** Arbitrary documentEnv() fields beyond the ones above (compliance,
   *  rotationCadence, storageProvider, ...) -- always its own nested
   *  property, never spread onto this object, so an author-chosen key can
   *  never silently override a reserved field above. */
  readonly extra: Readonly<Record<string, string>>
}

export interface CatalogContract {
  readonly file: string
  readonly exportName: string
  readonly contractName: string
  readonly active: boolean
  readonly documented: boolean
  readonly category: string | undefined
  readonly exclusiveGroup: string | undefined
  readonly owner: string | undefined
  readonly expiresAt: string | undefined
  readonly metadata: Readonly<Record<string, string>> | undefined
  /** Keyed by variable name -- unique within one contract (a schema
   *  object-literal property name), unlike `contractName` at the top level. */
  readonly variables: Readonly<Record<string, CatalogVariable>>
}

/**
 * Same data `renderCatalog()` renders to Markdown, reshaped for JSON/
 * programmatic consumers instead of prose. See `GenerateDocumentationResult.catalog`.
 */
export function buildCatalog(contracts: readonly DiscoveredContract[]): CatalogContract[] {
  return sortedContracts(contracts).map((contract) => {
    const variables: Record<string, CatalogVariable> = {}
    for (const variable of contract.variables) {
      variables[variable.key] = {
        description: variable.description,
        owner: effectiveOwner(contract, variable),
        expiresAt: variable.expiresAt,
        refreshInstructions: variable.refreshInstructions,
        required: variable.required,
        hasDefault: variable.hasDefault,
        hasProcessor: variable.hasProcessor,
        processorReturnType: variable.processorReturnType,
        hasValidator: variable.hasValidator,
        documented: variable.documented,
        extra: variable.extra,
      }
    }

    return {
      file: contract.file,
      exportName: contract.exportName,
      contractName: contract.contractName,
      active: contract.active,
      documented: contract.documented,
      category: contract.category,
      exclusiveGroup: contract.exclusiveGroup,
      owner: contract.owner,
      expiresAt: contract.expiresAt,
      metadata: contract.metadata,
      variables,
    }
  })
}

const PREVIOUS_HEADING_PATTERN = /^### `([A-Za-z_][A-Za-z0-9_]*)`$/gm
const PREVIOUS_ACTIVE_MARKER_PATTERN = /^- Active: (yes|no)$/
const PREVIOUS_VARIABLE_HEADING_PATTERN = /^### `([A-Za-z_][A-Za-z0-9_]*)`$/

/** Every variable key that appeared as a catalog heading in a previously-generated docs file. Exported for testing. */
export function extractPreviouslyDocumentedKeys(previousContent: string): Set<string> {
  const keys = new Set<string>()
  for (const match of previousContent.matchAll(PREVIOUS_HEADING_PATTERN)) {
    if (match[1]) keys.add(match[1])
  }
  return keys
}

/**
 * Every variable key that was documented under an *active* contract in a
 * previously-generated docs file -- walks the same `- Active: yes/no`
 * marker `renderCatalog` always emits immediately after each `## <contract>`
 * heading, so a key already inactive last time (a permanently-dormant
 * contract, e.g. behind an unused feature flag) is excluded even though it
 * still appears as a `### \`KEY\`` heading. Exported for testing.
 */
export function extractPreviouslyActiveKeys(previousContent: string): Set<string> {
  const keys = new Set<string>()
  let currentContractActive = false
  for (const line of previousContent.split("\n")) {
    const activeMatch = PREVIOUS_ACTIVE_MARKER_PATTERN.exec(line)
    if (activeMatch) {
      currentContractActive = activeMatch[1] === "yes"
      continue
    }
    const headingMatch = PREVIOUS_VARIABLE_HEADING_PATTERN.exec(line)
    if (headingMatch && currentContractActive) {
      keys.add(headingMatch[1])
    }
  }
  return keys
}

interface ChangeSummary {
  readonly added: readonly string[]
  readonly removed: readonly string[]
  readonly commented: readonly string[]
}

/**
 * Added = newly discovered since last report. Removed = previously
 * documented, no longer discovered at all. Commented = backed by an *active*
 * contract last report, still discovered, but no longer backed by any active
 * contract -- i.e. a fresh active-to-inactive transition, not merely "still
 * inactive." A key already inactive/commented last time is excluded so a
 * permanently-dormant contract's variable isn't reported as a change on
 * every single regeneration.
 *
 * `previousContent === undefined` (no prior report exists at all -- a true
 * first-ever generation) is treated the same as "nothing changed" (every
 * field empty), not as "no summary at all" the way an earlier version of
 * this function did. That earlier behavior omitted the whole "Changes since
 * last report" section on a first run -- but `checkEnvArtifacts()` (ADR
 * 0016) always re-renders using whatever is *currently on disk* as
 * `previousContent`, including a file this very function just wrote. For
 * `--check` to ever agree with a real write, `renderDocs()` must be a fixed
 * point under that self-feeding: regenerating with a file's own content as
 * `previousContent` must reproduce that same file byte-for-byte. Omitting
 * the section on first write broke exactly that -- the first real write
 * had no section, but feeding that same file back in as `previousContent`
 * produces a real (all-empty, "No changes.") summary, since this function
 * only ever re-parses the Catalog's own `### \`KEY\`` headings, never the
 * Changes section's own prior text. Rendering "No changes." immediately,
 * even on a first-ever report, is the only phrasing that round-trips.
 */
function computeChangeSummary(
  contracts: readonly DiscoveredContract[],
  previousContent: string | undefined,
): ChangeSummary {
  if (previousContent === undefined) return { added: [], removed: [], commented: [] }
  const previousKeys = extractPreviouslyDocumentedKeys(previousContent)
  const previousActiveKeys = extractPreviouslyActiveKeys(previousContent)

  const currentKeys = new Set<string>()
  const currentActiveKeys = new Set<string>()
  for (const contract of contracts) {
    for (const variable of contract.variables) {
      currentKeys.add(variable.key)
      if (contract.active) currentActiveKeys.add(variable.key)
    }
  }

  return {
    added: [...currentKeys].filter((k) => !previousKeys.has(k)).sort(),
    removed: [...previousKeys].filter((k) => !currentKeys.has(k)).sort(),
    commented: [...previousActiveKeys]
      .filter((k) => currentKeys.has(k) && !currentActiveKeys.has(k))
      .sort(),
  }
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "-")
      .replace(/^-+|-+$/g, "") || "section"
  )
}

/** Assigns each heading a stable, collision-free anchor -- duplicate variable names across contracts (a supported feature) would otherwise collide on a heading-derived anchor. */
class AnchorRegistry {
  private readonly used = new Map<string, number>()
  private readonly assigned = new Map<object, string>()

  for(target: object, baseText: string): string {
    const existing = this.assigned.get(target)
    if (existing) return existing
    const base = slugify(baseText)
    const count = this.used.get(base) ?? 0
    this.used.set(base, count + 1)
    const anchor = count === 0 ? base : `${base}-${count}`
    this.assigned.set(target, anchor)
    return anchor
  }
}

function mdLink(text: string, anchor: string): string {
  return `[${text}](#${anchor})`
}

function sortedContracts(contracts: readonly DiscoveredContract[]): DiscoveredContract[] {
  return [...contracts].sort((a, b) =>
    a.contractName < b.contractName ? -1 : a.contractName > b.contractName ? 1 : 0,
  )
}

function effectiveOwner(
  contract: DiscoveredContract,
  variable: DiscoveredVariable,
): string | undefined {
  return variable.owner ?? contract.owner
}

// ---------------------------------------------------------------------------
// Section 0 -- header, change summary, table of contents
// ---------------------------------------------------------------------------

function renderHeader(
  contracts: readonly DiscoveredContract[],
  options: RenderDocsOptions,
  anchors: AnchorRegistry,
  hasOwnership: boolean,
  hasDuplicates: boolean,
  hasLifecycle: boolean,
): string[] {
  const lines = [
    markdownBannerLine(),
    "",
    "# Environment Variables",
    "",
    `_Generated ${options.generatedAt.toISOString()}_`,
    "",
  ]

  const summary = computeChangeSummary(contracts, options.previousContent)
  lines.push("## Changes since last report", "")
  if (
    summary.added.length === 0 &&
    summary.removed.length === 0 &&
    summary.commented.length === 0
  ) {
    lines.push("No changes.", "")
  } else {
    if (summary.added.length > 0)
      lines.push(`- **Added:** ${summary.added.map((k) => `\`${k}\``).join(", ")}`)
    if (summary.removed.length > 0)
      lines.push(`- **Removed:** ${summary.removed.map((k) => `\`${k}\``).join(", ")}`)
    if (summary.commented.length > 0)
      lines.push(
        `- **No longer required (inactive):** ${summary.commented.map((k) => `\`${k}\``).join(", ")}`,
      )
    lines.push("")
  }

  lines.push("## Table of contents", "", `- ${mdLink("Catalog", "catalog")}`)
  for (const contract of sortedContracts(contracts)) {
    lines.push(
      `  - ${mdLink(contract.contractName, anchors.for(contract, `contract-${contract.contractName}`))}`,
    )
  }
  if (hasOwnership) lines.push(`- ${mdLink("Ownership matrix", "ownership-matrix")}`)
  if (hasDuplicates) lines.push(`- ${mdLink("Dependency graph", "dependency-graph")}`)
  if (hasLifecycle) lines.push(`- ${mdLink("Lifecycle report", "lifecycle-report")}`)
  lines.push(`- ${mdLink("Security review", "security-review")}`, "")

  return lines
}

// ---------------------------------------------------------------------------
// Section 1 -- comprehensive catalog
// ---------------------------------------------------------------------------

function renderCatalog(
  contracts: readonly DiscoveredContract[],
  root: string,
  anchors: AnchorRegistry,
  undocumented: RenderDocsOptions["undocumentedContracts"],
): string[] {
  const lines: string[] = ["## Catalog", "", '<a id="catalog"></a>', ""]
  const undocumentedByIdentity = new Set(undocumented.map((u) => `${u.file}#${u.exportName}`))

  for (const contract of sortedContracts(contracts)) {
    const relativeFile = relativeTo(root, contract.file)
    lines.push(`<a id="${anchors.for(contract, `contract-${contract.contractName}`)}"></a>`)
    lines.push(`## ${contract.contractName}`, "", `Source: \`${relativeFile}\``)
    if (undocumentedByIdentity.has(`${contract.file}#${contract.exportName}`)) {
      lines.push("", "> ⚠️ **Undocumented.** No `documentEnv()` call is linked to this contract.")
    }
    lines.push(`- Active: ${contract.active ? "yes" : "no"}`)
    if (contract.category !== undefined) lines.push(`- Category: ${contract.category}`)
    if (contract.exclusiveGroup !== undefined)
      lines.push(`- Exclusive group: ${contract.exclusiveGroup}`)
    if (contract.owner !== undefined) lines.push(`- Owner: ${contract.owner}`)
    if (contract.expiresAt !== undefined) lines.push(`- Expires: ${contract.expiresAt}`)
    if (contract.metadata) {
      for (const [metaKey, metaValue] of Object.entries(contract.metadata)) {
        lines.push(`- ${humanizeKey(metaKey)}: ${metaValue}`)
      }
    }
    lines.push("")

    // Two-way compare: `variable.key` is a schema object-literal property
    // name, always unique within one contract, so `a.key === b.key` can
    // never happen here.
    for (const variable of [...contract.variables].sort((a, b) => (a.key < b.key ? -1 : 1))) {
      lines.push(
        `<a id="${anchors.for(variable, `${contract.contractName}-${variable.key}`)}"></a>`,
      )
      lines.push(`### \`${variable.key}\``, "")

      if (variable.description) lines.push(variable.description, "")
      if (!variable.documented) lines.push("> ⚠️ **Undocumented.**", "")

      lines.push(
        `- Default: ${variable.hasDefault ? "yes" : "no"}`,
        `- Processor: ${variable.hasProcessor ? "yes" : "no"}`,
        `- Validator: ${variable.hasValidator ? "yes" : "no"}`,
      )
      const owner = effectiveOwner(contract, variable)
      if (owner !== undefined) lines.push(`- Owner: ${owner}`)
      if (variable.expiresAt !== undefined) lines.push(`- Expires: ${variable.expiresAt}`)
      if (variable.refreshInstructions !== undefined)
        lines.push(`- Refresh instructions: ${variable.refreshInstructions}`)
      if (variable.required !== undefined)
        lines.push(`- Required: ${variable.required ? "yes" : "no"}`)
      for (const [extraKey, extraValue] of Object.entries(variable.extra)) {
        lines.push(`- ${humanizeKey(extraKey)}: ${extraValue}`)
      }
      lines.push("")
    }
  }

  return lines
}

function relativeTo(root: string, absolutePath: string): string {
  // Avoids a hard `node:path` dependency in this otherwise-pure-string module;
  // callers already pass POSIX-normalized-enough paths for this to be safe.
  return absolutePath.startsWith(root)
    ? absolutePath
        .slice(root.length)
        .replace(/^[/\\]/, "")
        .split("\\")
        .join("/")
    : absolutePath
}

// ---------------------------------------------------------------------------
// Section 2 -- ownership matrix (omitted if nothing sets `owner`)
// ---------------------------------------------------------------------------

function renderOwnershipMatrix(
  contracts: readonly DiscoveredContract[],
  anchors: AnchorRegistry,
): string[] {
  const byOwner = new Map<string, string[]>()
  for (const contract of sortedContracts(contracts)) {
    for (const variable of contract.variables) {
      const owner = effectiveOwner(contract, variable)
      if (owner === undefined) continue
      const entry = mdLink(
        `\`${variable.key}\` (${contract.contractName})`,
        anchors.for(variable, `${contract.contractName}-${variable.key}`),
      )
      const list = byOwner.get(owner) ?? []
      list.push(entry)
      byOwner.set(owner, list)
    }
  }
  if (byOwner.size === 0) return []

  const lines = [
    "## Ownership matrix",
    "",
    '<a id="ownership-matrix"></a>',
    "",
    "| Owner | Variables |",
    "|---|---|",
  ]
  for (const owner of [...byOwner.keys()].sort()) {
    lines.push(`| ${owner} | ${mustGet(byOwner, owner).join(", ")} |`)
  }
  lines.push("")
  return lines
}

// ---------------------------------------------------------------------------
// Section 3 -- dependency graph (one row per unique variable name)
// ---------------------------------------------------------------------------

function renderDependencyGraph(
  contracts: readonly DiscoveredContract[],
  root: string,
  anchors: AnchorRegistry,
): { lines: string[]; hasDuplicates: boolean } {
  const byKey = new Map<string, { contract: DiscoveredContract; variable: DiscoveredVariable }[]>()
  for (const contract of contracts) {
    for (const variable of contract.variables) {
      const list = byKey.get(variable.key) ?? []
      list.push({ contract, variable })
      byKey.set(variable.key, list)
    }
  }

  const hasDuplicates = [...byKey.values()].some((declarations) => declarations.length > 1)
  const lines = [
    "## Dependency graph",
    "",
    '<a id="dependency-graph"></a>',
    "",
    "One row per unique variable name; more than one location means more than one feature declares it (see the package README's \"Duplicate variables\" section for how that's handled at runtime).",
    "",
    "| Variable | Declared in |",
    "|---|---|",
  ]

  for (const key of [...byKey.keys()].sort()) {
    const declarations = mustGet(byKey, key)
    const locations = declarations
      .map(({ contract, variable }) =>
        mdLink(
          `${contract.contractName} (\`${relativeTo(root, contract.file)}\`)`,
          anchors.for(variable, `${contract.contractName}-${variable.key}`),
        ),
      )
      .join(", ")
    lines.push(`| \`${key}\` | ${locations} |`)
  }
  lines.push("")

  return { lines, hasDuplicates }
}

// ---------------------------------------------------------------------------
// Section 4 -- lifecycle report
// ---------------------------------------------------------------------------

function renderLifecycleReport(
  contracts: readonly DiscoveredContract[],
  anchors: AnchorRegistry,
  expiringWithinDays: number,
  now: Date,
): { lines: string[]; hasLifecycle: boolean } {
  const rows: string[] = []
  for (const contract of sortedContracts(contracts)) {
    for (const variable of contract.variables) {
      const owner = effectiveOwner(contract, variable)
      if (
        variable.expiresAt === undefined &&
        owner === undefined &&
        variable.refreshInstructions === undefined
      )
        continue
      const expiresAt = variable.expiresAt
      const expiry = expiresAt ? parseIsoDate(expiresAt) : undefined
      let expiresCell = expiresAt ?? "--"
      if (expiry && expiresAt) {
        const daysRemaining = Math.ceil((expiry.getTime() - now.getTime()) / 86_400_000)
        if (daysRemaining < 0)
          expiresCell = `${expiresAt} (**expired ${Math.abs(daysRemaining)}d ago**)`
        else if (daysRemaining <= expiringWithinDays)
          expiresCell = `${expiresAt} (**${daysRemaining}d remaining**)`
      }

      rows.push(
        `| ${mdLink(`\`${variable.key}\``, anchors.for(variable, `${contract.contractName}-${variable.key}`))} | ${owner ?? "--"} | ${expiresCell} | ${variable.refreshInstructions ?? "--"} |`,
      )
    }
  }
  if (rows.length === 0) return { lines: [], hasLifecycle: false }

  const lines = [
    "## Lifecycle report",
    "",
    '<a id="lifecycle-report"></a>',
    "",
    "| Variable | Owner | Expires | Refresh instructions |",
    "|---|---|---|---|",
    ...rows,
    "",
  ]
  return { lines, hasLifecycle: true }
}

// ---------------------------------------------------------------------------
// Section 5 -- security review
// ---------------------------------------------------------------------------

function renderSecurityReview(
  contracts: readonly DiscoveredContract[],
  options: RenderDocsOptions,
  now: Date,
): string[] {
  let totalVariables = 0
  let activeVariables = 0
  const uniqueKeys = new Set<string>()
  const keyContractCount = new Map<string, number>()
  let expiresAtSetCount = 0
  let expiredCount = 0
  let expiringSoonCount = 0
  let requiredCount = 0
  let refreshInstructionsCount = 0
  let noOwnerCount = 0

  for (const contract of contracts) {
    for (const variable of contract.variables) {
      totalVariables += 1
      if (contract.active) activeVariables += 1
      uniqueKeys.add(variable.key)
      keyContractCount.set(variable.key, (keyContractCount.get(variable.key) ?? 0) + 1)
      if (variable.required) requiredCount += 1
      if (variable.refreshInstructions) refreshInstructionsCount += 1
      if (effectiveOwner(contract, variable) === undefined) noOwnerCount += 1
      if (variable.expiresAt) {
        expiresAtSetCount += 1
        const date = parseIsoDate(variable.expiresAt)
        if (date) {
          const daysRemaining = Math.ceil((date.getTime() - now.getTime()) / 86_400_000)
          if (daysRemaining < 0) expiredCount += 1
          else if (daysRemaining <= options.expiringWithinDays) expiringSoonCount += 1
        }
      }
    }
  }

  const duplicateKeyCount = [...keyContractCount.values()].filter((count) => count > 1).length

  const lines = [
    "## Security review",
    "",
    '<a id="security-review"></a>',
    "",
    `- Total contracts: ${contracts.length}`,
    `- Total variable declarations: ${totalVariables} (${activeVariables} from active contracts)`,
    `- Unique variable names: ${uniqueKeys.size}`,
    `- Variables with \`expiresAt\` set: ${expiresAtSetCount}`,
    `  - Already expired: ${expiredCount}`,
    `  - Expiring within ${options.expiringWithinDays} days: ${expiringSoonCount}`,
    `- Variables marked \`required: true\`: ${requiredCount}`,
    `- Variables with refresh instructions: ${refreshInstructionsCount}`,
    `- Variables with no assigned owner: ${noOwnerCount}`,
    `- Variable names declared by more than one contract: ${duplicateKeyCount}`,
    `- Undocumented contracts: ${options.undocumentedContracts.length}`,
    `- Undocumented variables: ${options.undocumentedVariables.length}`,
    "",
  ]
  return lines
}

// ---------------------------------------------------------------------------

/**
 * Renders the full docs artifact: header + change summary + table of
 * contents, then the comprehensive catalog, ownership matrix (if used),
 * dependency graph, lifecycle report, and a security review.
 *
 * @remarks
 * Documents everything discovered, active or not, same scope as the catalog always
 * had. Fully regenerated every run -- unlike `.env.example`, nothing here is
 * meant to be hand-edited, so there's no "never overwrite" behavior.
 */
export function renderDocs(
  contracts: readonly DiscoveredContract[],
  root: string,
  options: RenderDocsOptions,
): string {
  const anchors = new AnchorRegistry()
  const sorted = sortedContracts(contracts)

  const ownership = renderOwnershipMatrix(sorted, anchors)
  const { lines: dependencyLines, hasDuplicates } = renderDependencyGraph(sorted, root, anchors)
  const { lines: lifecycleLines, hasLifecycle } = renderLifecycleReport(
    sorted,
    anchors,
    options.expiringWithinDays,
    options.generatedAt,
  )

  const header = renderHeader(
    sorted,
    options,
    anchors,
    ownership.length > 0,
    hasDuplicates,
    hasLifecycle,
  )
  const catalog = renderCatalog(sorted, root, anchors, options.undocumentedContracts)
  const security = renderSecurityReview(sorted, options, options.generatedAt)

  return [...header, ...catalog, ...ownership, ...dependencyLines, ...lifecycleLines, ...security]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
}

const GENERATED_LINE_PATTERN = /^_Generated .+_$/m
const DAYS_REMAINING_PATTERN = /\(\*\*\d+d remaining\*\*\)/g
const EXPIRED_AGO_PATTERN = /\(\*\*expired \d+d ago\*\*\)/g
const ALREADY_EXPIRED_COUNT_PATTERN = /^(- Already expired:) \d+$/gm
const EXPIRING_WITHIN_COUNT_PATTERN = /^(- Expiring within \d+ days:) \d+$/gm

/**
 * Normalizes every wall-clock-relative substring `renderDocs()` can produce
 * -- not just the single `_Generated ..._` timestamp line, but also the
 * lifecycle report's `(**Xd remaining**)`/`(**expired Xd ago**)` annotations
 * and the security review's "Already expired"/"Expiring within N days"
 * counts -- so two renders of the *same* input, taken on different days,
 * compare equal. `check-artifacts.ts`'s drift comparison and the examples
 * golden-file test harness (`test/examples/support.ts`) both need exactly
 * this, not just the timestamp line alone: any contract with a near-term
 * `expiresAt` renders day-relative text that would otherwise make `--check`
 * (or a golden-file comparison) report false drift purely because real time
 * passed between generation and comparison.
 */
export function normalizeDocsForComparison(content: string): string {
  return content
    .replace(GENERATED_LINE_PATTERN, "_Generated <normalized-for-comparison>_")
    .replace(DAYS_REMAINING_PATTERN, "(**Nd remaining**)")
    .replace(EXPIRED_AGO_PATTERN, "(**expired Nd ago**)")
    .replace(ALREADY_EXPIRED_COUNT_PATTERN, "$1 N")
    .replace(EXPIRING_WITHIN_COUNT_PATTERN, "$1 N")
}
