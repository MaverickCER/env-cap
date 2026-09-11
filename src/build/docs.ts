import type { ContractModelContract, ContractModelVariable } from "./contract-model.js"
import { governanceFieldsOf, type EnvGovernanceFields } from "./governance-fields.js"
import type { DiscoveredVariableEvidence } from "./parse.js"
import { evidenceDisclaimer, evidenceProjectionNote, generatedBanner } from "./generated-banner.js"
import { humanizeKey, renderMetadataValue } from "./humanize-key.js"
import {
  effectiveAuditRequired,
  effectiveDataResidency,
  effectiveLegalBasis,
  effectiveOwner,
  effectivePurpose,
  effectiveRetention,
  effectiveSensitivity,
} from "./link.js"
import { mustGet } from "./map-utils.js"
import { groupVariablesByOwner } from "./reference-projections.js"

/** Identifies a contract with no linked `documentEnv()` call at all. `file`'s absolute-vs-relative convention depends on where a given instance comes from -- see the specific field using this type (`DocumentationFindings.undocumentedContracts` is absolute; `RenderDocsOptions.undocumentedContracts` must be root-relative, matching the `ContractModel`-shaped `contracts` it's compared against). */
export interface UndocumentedContractRef {
  readonly file: string
  /** The contract's exported binding name. */
  readonly exportName: string
}
/** Identifies a schema variable with no matching entry in its contract's linked documentation. See {@link UndocumentedContractRef}'s own note on `file`. */
export interface UndocumentedVariableRef {
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
  /** Contracts with no linked `documentEnv()` call at all. `file` must be root-relative, POSIX-separated -- matching `contracts`' own `ContractModel` convention, since this is matched against it by identity. */
  readonly undocumentedContracts: readonly UndocumentedContractRef[]
  /** Schema variables with no matching entry in their contract's linked documentation. `file` must be root-relative, POSIX-separated -- see `undocumentedContracts`. */
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

const MS_PER_DAY = 86_400_000

/** Days from `now` until `date`; negative when `date` is already in the past. The one place this arithmetic lives -- every wall-clock-relative computation in this file goes through it. */
function daysRemainingFrom(date: Date, now: Date): number {
  return Math.ceil((date.getTime() - now.getTime()) / MS_PER_DAY)
}

/** The minimal shape {@link computeExpiringEntries} needs -- structural, not pinned to `DiscoveredContract`, so the exact same rule serves both `LinkResult`'s absolute-path contracts (`generate-documentation.ts`'s `documentation.expiringSoon`, Stable tier) and `ContractModel`'s root-relative ones, whichever a caller already has on hand. */
interface ExpiryBearingContract {
  readonly file: string
  readonly exportName: string
  readonly expiresAt: string | undefined
  readonly variables: readonly { readonly key: string; readonly expiresAt: string | undefined }[]
}

/**
 * Computes every contract- or variable-level `expiresAt` within `expiringWithinDays` of `now`, sorted soonest-first.
 */
export function computeExpiringEntries(
  contracts: readonly ExpiryBearingContract[],
  expiringWithinDays: number,
  now: Date,
): ExpiringEntry[] {
  const entries: ExpiringEntry[] = []

  for (const contract of contracts) {
    // `parseIsoDate()` treats every falsy string input (`undefined` or `""`,
    // the only two falsy values `expiresAt: string | undefined` can hold)
    // identically -- `new Date(x).getTime()` is `NaN` either way, so `date`
    // ends up `undefined` regardless, and the `if (date)` guard just below
    // already skips pushing an entry. Bypassing this outer guard is
    // therefore runtime-equivalent, but still load-bearing for TypeScript's
    // own narrowing of `contract.expiresAt` to `string` for the
    // `parseIsoDate()` call inside (see the identical `tsc`-narrowing
    // dependency already documented for `parse.ts`/`generate-env-artifacts.ts`
    // this same drive). Hand-verified: bypassing it and running the real
    // whole-package suite (`vitest run`) only breaks the two `tsc`-backed
    // json-schema freshness tests, no runtime-behavior assertion.
    // Stryker disable next-line ConditionalExpression
    if (contract.expiresAt) {
      const date = parseIsoDate(contract.expiresAt)
      if (date) {
        const daysRemaining = daysRemainingFrom(date, now)
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
      // Same equivalence as the contract-level guard above: `parseIsoDate()`
      // treats every falsy string identically, and the very next `if
      // (!date) continue` already catches the result -- but this bypass
      // still relies on TypeScript's own narrowing of `variable.expiresAt`
      // to `string` for the `parseIsoDate()` call on the next line.
      // Hand-verified: bypassing it and running the real whole-package suite
      // (`vitest run`) only breaks the two `tsc`-backed json-schema
      // freshness tests, no runtime-behavior assertion.
      // Stryker disable next-line ConditionalExpression
      if (!variable.expiresAt) continue
      const date = parseIsoDate(variable.expiresAt)
      if (!date) continue
      const daysRemaining = daysRemainingFrom(date, now)
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

/**
 * Same data `renderCatalog()` renders to Markdown for one variable, reshaped for JSON/
 * programmatic consumers instead of prose.
 *
 * @see `ContractModelVariable` (`contract-model.ts`) -- this same declared variable's canonical
 * starting point. Plain reference, not `{@link}`: this type is intentionally not part of the
 * public surface (see `typedoc.json`'s `intentionallyNotExported`).
 */
interface CatalogVariable extends EnvGovernanceFields {
  readonly description: string | undefined
  readonly refreshInstructions: string | undefined
  readonly setupInstructions: string | undefined
  readonly required: boolean | undefined
  readonly hasDefault: boolean
  readonly hasProcessor: boolean
  readonly processorReturnType: string | undefined
  readonly hasValidator: boolean
  readonly documented: boolean
  /** The variable's declared validation context, if any -- see ADR 0022. Participation data, not documentation: describes when `validateEnv()` processes this variable, not who may access it or what a bundler includes. */
  readonly context: string | undefined
  /** The `evidence` sub-object from this variable's linked documentation -- re-verified every run, unlike every declared-only field above. See ADR 0037. */
  readonly evidence: DiscoveredVariableEvidence | undefined
}

export interface CatalogContract extends EnvGovernanceFields {
  readonly file: string
  readonly exportName: string
  readonly contractName: string
  readonly active: boolean
  readonly documented: boolean
  readonly category: string | undefined
  readonly exclusiveGroup: string | undefined
  /** Keyed by variable name -- unique within one contract (a schema
   *  object-literal property name), unlike `contractName` at the top level. */
  readonly variables: Readonly<Record<string, CatalogVariable>>
}

/**
 * Same data `renderCatalog()` renders to Markdown, reshaped for JSON/
 * programmatic consumers instead of prose. See `GenerateDocumentationResult.catalog`.
 */
export function buildCatalog(contracts: readonly ContractModelContract[]): CatalogContract[] {
  return sortedContracts(contracts).map((contract) => {
    const variables: Record<string, CatalogVariable> = {}
    for (const variable of contract.variables) {
      variables[variable.key] = {
        description: variable.description,
        owner: effectiveOwner(contract, variable),
        sensitivity: effectiveSensitivity(contract, variable),
        expiresAt: variable.expiresAt,
        refreshInstructions: variable.refreshInstructions,
        setupInstructions: variable.setupInstructions,
        required: variable.required,
        hasDefault: variable.hasDefault,
        hasProcessor: variable.hasProcessor,
        processorReturnType: variable.processorReturnType,
        hasValidator: variable.hasValidator,
        documented: variable.documented,
        context: variable.context,
        purpose: effectivePurpose(contract, variable),
        legalBasis: effectiveLegalBasis(contract, variable),
        retention: effectiveRetention(contract, variable),
        dataResidency: effectiveDataResidency(contract, variable),
        auditRequired: effectiveAuditRequired(contract, variable),
        metadata: variable.metadata,
        evidence: variable.evidence,
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
      ...governanceFieldsOf(contract),
      variables,
    }
  })
}

// Every module-level regex pattern in this file is inlined at its one call
// site, not a shared `const` -- Stryker marks a module-level regex literal
// `static: true` (evaluated once at import time), which produces a false
// "Survived" on a mutant that's genuinely, heavily test-covered (the same
// limitation already fixed for `cli/index.ts`'s dispatch tables/`HELP_TEXT`
// and `parse.ts`'s `ENV_KEY_PATTERN` this same drive).

/** Every variable key that appeared as a catalog heading in a previously-generated docs file. Exported for testing. */
export function extractPreviouslyDocumentedKeys(previousContent: string): Set<string> {
  const keys = new Set<string>()
  for (const match of previousContent.matchAll(/^### `([A-Za-z_][A-Za-z0-9_]*)`$/gm)) {
    // The pattern's own capture group (`[A-Za-z_][A-Za-z0-9_]*`) requires at
    // least one character, so `match[1]` can never be empty/falsy on a real
    // match -- this is a pure `string | undefined` -> `string` type guard,
    // not a real runtime branch. Hand-verified: bypassing it (`match[1]!`)
    // and running the real whole-package suite (`vitest run`) passes
    // unchanged.
    // Stryker disable next-line ConditionalExpression
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
    const activeMatch = /^- Active: (yes|no)$/.exec(line)
    if (activeMatch) {
      currentContractActive = activeMatch[1] === "yes"
      continue
    }
    const headingMatch = /^### `([A-Za-z_][A-Za-z0-9_]*)`$/.exec(line)
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
  contracts: readonly ContractModelContract[],
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
  // The `+` quantifiers on the SECOND `.replace()` below are unobservable:
  // the FIRST replace's own `+` already collapses every run of
  // non-identifier characters (dashes included, since a literal `-` isn't in
  // `[a-z0-9_]` either) into a single `-`, so the second regex can never
  // actually see 2+ consecutive dashes at either end to strip -- there is
  // always at most one. Hand-verified: dropping both `+`s and running the
  // real whole-package suite (`vitest run`) passes unchanged. Unscoped
  // disable/restore (not `next-line`) because this is one multi-line
  // statement -- `next-line` didn't reliably attach here.
  // Stryker disable Regex
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "-")
      .replace(/^-+|-+$/g, "") || "section"
  )
  // Stryker restore Regex
}

/** Assigns each heading a stable, collision-free anchor -- duplicate variable names across contracts (a supported feature) would otherwise collide on a heading-derived anchor. */
class AnchorRegistry {
  private readonly used = new Map<string, number>()
  private readonly assigned = new Map<object, string>()

  anchorFor(target: object, baseText: string): string {
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

function sortedContracts(contracts: readonly ContractModelContract[]): ContractModelContract[] {
  return [...contracts].sort((a, b) => a.contractName.localeCompare(b.contractName))
}

// ---------------------------------------------------------------------------
// Section 0 -- header, change summary, table of contents
// ---------------------------------------------------------------------------

function renderHeader(
  contracts: readonly ContractModelContract[],
  options: RenderDocsOptions,
  anchors: AnchorRegistry,
  hasOwnership: boolean,
  hasDuplicates: boolean,
  hasLifecycle: boolean,
): string[] {
  const lines = [
    generatedBanner("markdown"),
    "",
    `> ${evidenceDisclaimer()}`,
    "",
    `> ${evidenceProjectionNote()}`,
    "",
    "# Environment Variables",
    "",
    "_Produced by `env-cap --docs`._",
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
      `  - ${mdLink(contract.contractName, anchors.anchorFor(contract, `contract-${contract.contractName}`))}`,
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
  contracts: readonly ContractModelContract[],
  anchors: AnchorRegistry,
  undocumented: RenderDocsOptions["undocumentedContracts"],
): string[] {
  const lines: string[] = ["## Catalog", "", '<a id="catalog"></a>', ""]
  const undocumentedByIdentity = new Set(undocumented.map((u) => `${u.file}#${u.exportName}`))

  // Only shown when at least one variable actually declares a context --
  // keeps generated docs byte-identical for every project not using this
  // feature, and avoids explaining a concept that doesn't appear below.
  const usesValidationContexts = contracts.some((c) => c.variables.some((v) => v.context))
  if (usesValidationContexts) {
    lines.push(
      "> Validation contexts describe when validation participates. They do not restrict " +
        "access to values, and they do not remove a variable's schema (or its `default` " +
        "value) from wherever this manifest is imported.",
      "",
    )
  }

  for (const contract of sortedContracts(contracts)) {
    // `anchorFor()` caches by TARGET OBJECT (`this.assigned.get(target)`),
    // and `renderHeader()`'s own TOC loop already calls
    // `anchorFor(contract, ...)` with this exact same baseText for every
    // contract, always BEFORE renderCatalog() runs (see renderDocs()'s call
    // order) -- so this call's own `baseText` argument can never actually
    // matter; the cached anchor from the TOC call always wins. Hand-verified:
    // replacing the baseText argument here with `` `` `` (empty) and running
    // the real whole-package suite (`vitest run`) passes unchanged.
    // Stryker disable next-line StringLiteral
    lines.push(`<a id="${anchors.anchorFor(contract, `contract-${contract.contractName}`)}"></a>`)
    lines.push(`## ${contract.contractName}`, "", `Source: \`${contract.file}\``)
    if (undocumentedByIdentity.has(`${contract.file}#${contract.exportName}`)) {
      lines.push("", "> ⚠️ **Undocumented.** No `documentEnv()` call is linked to this contract.")
    }
    lines.push(`- Active: ${contract.active ? "yes" : "no"}`)
    if (contract.category !== undefined) lines.push(`- Category: ${contract.category}`)
    if (contract.exclusiveGroup !== undefined)
      lines.push(`- Exclusive group: ${contract.exclusiveGroup}`)
    if (contract.owner !== undefined) lines.push(`- Owner: ${contract.owner}`)
    if (contract.sensitivity !== undefined) lines.push(`- Sensitivity: ${contract.sensitivity}`)
    if (contract.expiresAt !== undefined) lines.push(`- Expires: ${contract.expiresAt}`)
    if (contract.purpose !== undefined) lines.push(`- Purpose: ${contract.purpose}`)
    if (contract.legalBasis !== undefined) lines.push(`- Legal basis: ${contract.legalBasis}`)
    if (contract.retention !== undefined) lines.push(`- Retention: ${contract.retention}`)
    if (contract.dataResidency !== undefined)
      lines.push(`- Data residency: ${renderMetadataValue(contract.dataResidency)}`)
    if (contract.auditRequired !== undefined)
      lines.push(`- Audit required: ${contract.auditRequired ? "yes" : "no"}`)
    if (contract.metadata) {
      for (const [metaKey, metaValue] of Object.entries(contract.metadata)) {
        lines.push(`- ${humanizeKey(metaKey)}: ${renderMetadataValue(metaValue)}`)
      }
    }
    lines.push("")

    // Two-way compare: `variable.key` is a schema object-literal property
    // name, always unique within one contract, so `a.key === b.key` can
    // never happen here -- `<` vs `<=` is therefore unobservable (the tie
    // branch this would otherwise distinguish is unreachable). Hand-verified:
    // switching to `<=` and running the real whole-package suite
    // (`vitest run`) passes unchanged.
    // Stryker disable next-line EqualityOperator
    for (const variable of [...contract.variables].sort((a, b) => (a.key < b.key ? -1 : 1))) {
      // Same equivalence as the contract anchor above: `renderDependencyGraph()`
      // (called before `renderCatalog()` in `renderDocs()`) already calls
      // `anchorFor(variable, ...)` with this exact same baseText for EVERY
      // variable (it lists all of them, not just owned ones), so this call's
      // own baseText can never matter -- the cache always wins. Hand-verified:
      // replacing it with `` `` `` and running the real whole-package suite
      // (`vitest run`) passes unchanged.
      // Stryker disable StringLiteral
      lines.push(
        `<a id="${anchors.anchorFor(variable, `${contract.contractName}-${variable.key}`)}"></a>`,
      )
      // Stryker restore StringLiteral
      lines.push(`### \`${variable.key}\``, "")

      // Bypassing this guard when `variable.description` is undefined would
      // push `undefined` (joined as "" by `.join("\n")`, same as the real
      // `""` beside it) -- the resulting extra blank-ish line only ever
      // shows up as 3+ consecutive newlines in the final joined document,
      // which `renderDocs()`'s own trailing `.replace(/\n{3,}/g, "\n\n")`
      // always collapses back down regardless (same reasoning already
      // established for `usage-report.ts`'s identical cleanup regex this
      // drive). Still load-bearing for TypeScript's own narrowing of
      // `variable.description` to `string` for the `lines.push()` call.
      // Hand-verified: bypassing it and running the real whole-package suite
      // (`vitest run`) only breaks the two `tsc`-backed json-schema
      // freshness tests, no runtime-behavior assertion.
      // Stryker disable next-line ConditionalExpression
      if (variable.description) lines.push(variable.description, "")
      if (!variable.documented) lines.push("> ⚠️ **Undocumented.**", "")

      lines.push(
        `- Default: ${variable.hasDefault ? "yes" : "no"}`,
        `- Processor: ${variable.hasProcessor ? "yes" : "no"}`,
        `- Validator: ${variable.hasValidator ? "yes" : "no"}`,
      )
      if (variable.context !== undefined) lines.push(`- Validation context: ${variable.context}`)
      const owner = effectiveOwner(contract, variable)
      if (owner !== undefined) lines.push(`- Owner: ${owner}`)
      const sensitivity = effectiveSensitivity(contract, variable)
      if (sensitivity !== undefined) lines.push(`- Sensitivity: ${sensitivity}`)
      if (variable.expiresAt !== undefined) lines.push(`- Expires: ${variable.expiresAt}`)
      if (variable.setupInstructions !== undefined)
        lines.push(`- Setup instructions: ${variable.setupInstructions}`)
      if (variable.refreshInstructions !== undefined)
        lines.push(`- Refresh instructions: ${variable.refreshInstructions}`)
      if (variable.required !== undefined)
        lines.push(`- Required: ${variable.required ? "yes" : "no"}`)
      const purpose = effectivePurpose(contract, variable)
      if (purpose !== undefined) lines.push(`- Purpose: ${purpose}`)
      const legalBasis = effectiveLegalBasis(contract, variable)
      if (legalBasis !== undefined) lines.push(`- Legal basis: ${legalBasis}`)
      const retention = effectiveRetention(contract, variable)
      if (retention !== undefined) lines.push(`- Retention: ${retention}`)
      const dataResidency = effectiveDataResidency(contract, variable)
      if (dataResidency !== undefined)
        lines.push(`- Data residency: ${renderMetadataValue(dataResidency)}`)
      const auditRequired = effectiveAuditRequired(contract, variable)
      if (auditRequired !== undefined)
        lines.push(`- Audit required: ${auditRequired ? "yes" : "no"}`)
      const dynamicAccess = variable.evidence?.dynamicAccess
      if (dynamicAccess && dynamicAccess.length > 0)
        lines.push(`- Dynamic access: ${dynamicAccess.join(", ")}`)
      for (const [metaKey, metaValue] of Object.entries(variable.metadata ?? {})) {
        lines.push(`- ${humanizeKey(metaKey)}: ${renderMetadataValue(metaValue)}`)
      }
      lines.push("")
    }
  }

  return lines
}

// ---------------------------------------------------------------------------
// Section 2 -- ownership matrix (omitted if nothing sets `owner`)
// ---------------------------------------------------------------------------

/**
 * Groups via the same `groupVariablesByOwner()` the public
 * `ownershipSummary` reference projection uses (`reference-projections.ts`),
 * so env-cap's own rendered matrix and the projection a consumer reads are
 * the same grouping by construction, not two implementations kept in sync by
 * hand. Only the link/label formatting below is this renderer's own.
 */
function renderOwnershipMatrix(
  contracts: readonly ContractModelContract[],
  anchors: AnchorRegistry,
): string[] {
  const grouped = groupVariablesByOwner(sortedContracts(contracts), effectiveOwner)
  const byOwner = new Map<string, string[]>()
  for (const [owner, entries] of grouped) {
    byOwner.set(
      owner,
      entries.map(({ contract, variable }) =>
        mdLink(
          `\`${variable.key}\` (${contract.contractName})`,
          anchors.anchorFor(variable, `${contract.contractName}-${variable.key}`),
        ),
      ),
    )
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
  contracts: readonly ContractModelContract[],
  anchors: AnchorRegistry,
): { lines: string[]; hasDuplicates: boolean } {
  const byKey = new Map<
    string,
    { contract: ContractModelContract; variable: ContractModelVariable }[]
  >()
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
          `${contract.contractName} (\`${contract.file}\`)`,
          anchors.anchorFor(variable, `${contract.contractName}-${variable.key}`),
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
  contracts: readonly ContractModelContract[],
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
        const daysRemaining = daysRemainingFrom(expiry, now)
        if (daysRemaining < 0)
          expiresCell = `${expiresAt} (**expired ${Math.abs(daysRemaining)}d ago**)`
        else if (daysRemaining <= expiringWithinDays)
          expiresCell = `${expiresAt} (**${daysRemaining}d remaining**)`
      }

      // Same anchor-cache equivalence as renderCatalog's own two anchor
      // calls above: `renderDependencyGraph()` (called before
      // `renderLifecycleReport()` in `renderDocs()`) already calls
      // `anchorFor(variable, ...)` with this exact same baseText for every
      // variable, so this call's own baseText can never matter. Hand-verified:
      // replacing it with `` `` `` and running the real whole-package suite
      // (`vitest run`) passes unchanged.
      // Stryker disable StringLiteral
      rows.push(
        `| ${mdLink(`\`${variable.key}\``, anchors.anchorFor(variable, `${contract.contractName}-${variable.key}`))} | ${owner ?? "--"} | ${expiresCell} | ${variable.refreshInstructions ?? "--"} |`,
      )
      // Stryker restore StringLiteral
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

/** Every number the security review reports, as structured data instead of only rendered Markdown text. */
export interface SecurityReviewCounters {
  readonly totalContracts: number
  readonly totalVariableDeclarations: number
  readonly activeVariableDeclarations: number
  readonly uniqueVariableNames: number
  readonly expiresAtSetCount: number
  readonly expiredCount: number
  readonly expiringSoonCount: number
  readonly requiredCount: number
  readonly refreshInstructionsCount: number
  readonly noOwnerCount: number
  readonly duplicateVariableNameCount: number
  readonly undocumentedContractCount: number
  readonly undocumentedVariableCount: number
}

/**
 * Computes every number `renderSecurityReview()` reports, as real data.
 *
 * @remarks
 * Previously this arithmetic lived entirely inside the renderer as closure
 * locals that only ever became interpolated Markdown text -- no exported
 * type backed any of it, so nothing downstream (the `--json` envelope, a CI
 * gate, a future Finding Model adapter) could consume it as data. Extracted
 * so it can be reused wherever these facts are needed, not just prose.
 */
export function computeSecurityReviewCounters(
  contracts: readonly ContractModelContract[],
  expiringWithinDays: number,
  now: Date,
  undocumentedContractCount: number,
  undocumentedVariableCount: number,
): SecurityReviewCounters {
  let totalVariableDeclarations = 0
  let activeVariableDeclarations = 0
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
      totalVariableDeclarations += 1
      if (contract.active) activeVariableDeclarations += 1
      uniqueKeys.add(variable.key)
      keyContractCount.set(variable.key, (keyContractCount.get(variable.key) ?? 0) + 1)
      if (variable.required) requiredCount += 1
      if (variable.refreshInstructions) refreshInstructionsCount += 1
      if (effectiveOwner(contract, variable) === undefined) noOwnerCount += 1
      if (variable.expiresAt) {
        expiresAtSetCount += 1
        const date = parseIsoDate(variable.expiresAt)
        if (date) {
          const daysRemaining = daysRemainingFrom(date, now)
          if (daysRemaining < 0) expiredCount += 1
          else if (daysRemaining <= expiringWithinDays) expiringSoonCount += 1
        }
      }
    }
  }

  const duplicateVariableNameCount = [...keyContractCount.values()].filter(
    (count) => count > 1,
  ).length

  return {
    totalContracts: contracts.length,
    totalVariableDeclarations,
    activeVariableDeclarations,
    uniqueVariableNames: uniqueKeys.size,
    expiresAtSetCount,
    expiredCount,
    expiringSoonCount,
    requiredCount,
    refreshInstructionsCount,
    noOwnerCount,
    duplicateVariableNameCount,
    undocumentedContractCount,
    undocumentedVariableCount,
  }
}

function renderSecurityReview(
  contracts: readonly ContractModelContract[],
  options: RenderDocsOptions,
  now: Date,
): string[] {
  const counters = computeSecurityReviewCounters(
    contracts,
    options.expiringWithinDays,
    now,
    options.undocumentedContracts.length,
    options.undocumentedVariables.length,
  )

  return [
    "## Security review",
    "",
    '<a id="security-review"></a>',
    "",
    `- Total contracts: ${counters.totalContracts}`,
    `- Total variable declarations: ${counters.totalVariableDeclarations} (${counters.activeVariableDeclarations} from active contracts)`,
    `- Unique variable names: ${counters.uniqueVariableNames}`,
    `- Variables with \`expiresAt\` set: ${counters.expiresAtSetCount}`,
    `  - Already expired: ${counters.expiredCount}`,
    `  - Expiring within ${options.expiringWithinDays} days: ${counters.expiringSoonCount}`,
    `- Variables marked \`required: true\`: ${counters.requiredCount}`,
    `- Variables with refresh instructions: ${counters.refreshInstructionsCount}`,
    `- Variables with no assigned owner: ${counters.noOwnerCount}`,
    `- Variable names declared by more than one contract: ${counters.duplicateVariableNameCount}`,
    `- Undocumented contracts: ${counters.undocumentedContractCount}`,
    `- Undocumented variables: ${counters.undocumentedVariableCount}`,
    "",
  ]
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
 *
 * `contracts` is `ContractModel`'s own shape (`file` root-relative and
 * POSIX-separated already, per that model's convention) -- there is no
 * separate `root` parameter to resolve against, unlike this function's
 * pre-ADR-0038 signature.
 */
export function renderDocs(
  contracts: readonly ContractModelContract[],
  options: RenderDocsOptions,
): string {
  const anchors = new AnchorRegistry()
  const sorted = sortedContracts(contracts)

  const ownership = renderOwnershipMatrix(sorted, anchors)
  const { lines: dependencyLines, hasDuplicates } = renderDependencyGraph(sorted, anchors)
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
  const catalog = renderCatalog(sorted, anchors, options.undocumentedContracts)
  const security = renderSecurityReview(sorted, options, options.generatedAt)

  return [...header, ...catalog, ...ownership, ...dependencyLines, ...lifecycleLines, ...security]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
}

/**
 * Normalizes every wall-clock-relative substring `renderDocs()` can produce
 * -- not just the single `_Generated ..._` timestamp line, but also the
 * lifecycle report's `(**Xd remaining**)`/`(**expired Xd ago**)` annotations
 * and the security review's "Already expired"/"Expiring within N days"
 * counts -- so two renders of the *same* input, taken on different days,
 * compare equal. `check-artifacts.ts`'s drift comparison and the examples
 * golden-file test harness (`test/support/example-runner.ts`) both need
 * exactly this, not just the timestamp line alone: any contract with a near-term
 * `expiresAt` renders day-relative text that would otherwise make `--check`
 * (or a golden-file comparison) report false drift purely because real time
 * passed between generation and comparison.
 */
export function normalizeDocsForComparison(content: string): string {
  return content
    .replace(/^_Generated .+_$/m, "_Generated <normalized-for-comparison>_")
    .replace(/\(\*\*\d+d remaining\*\*\)/g, "(**Nd remaining**)")
    .replace(/\(\*\*expired \d+d ago\*\*\)/g, "(**expired Nd ago**)")
    .replace(/^(- Already expired:) \d+$/gm, "$1 N")
    .replace(/^(- Expiring within \d+ days:) \d+$/gm, "$1 N")
}
