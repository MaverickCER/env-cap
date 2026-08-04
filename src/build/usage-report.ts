import { markdownBannerLine } from "./generated-banner.js"
import type { ParseWarning } from "./parse.js"

/** One contract's dependency-ownership summary: who owns it, and who depends on it. */
export interface OwnershipDependencyEntry {
  /** Resolved display name (see {@link DiscoveredContract.contractName}). */
  readonly contractName: string
  /** Root-relative path of the file declaring the contract. */
  readonly file: string
  /** Contract-level default owner, if set. */
  readonly owner: string | undefined
  /** Number of variables declared in this contract's schema. */
  readonly variableCount: number
  /** Files coupled to this contract (imported it, referenced it, or read a
   *  member from it) -- contract-level "who depends on this," NOT proof any
   *  specific variable was read. Blast radius if this contract changes is
   *  `consumers.length`, computed by callers/renderers on demand rather than
   *  stored redundantly here. */
  readonly consumers: readonly string[]
}

/** A contract never imported anywhere in the scanned repository. */
export interface AbandonedContractFinding {
  /** Resolved display name (see {@link DiscoveredContract.contractName}). */
  readonly contractName: string
  /** Root-relative path of the file declaring the contract. */
  readonly file: string
  /** Contract-level default owner, if set. */
  readonly owner: string | undefined
}
/** A contract reachable only through an unresolved barrel re-export -- can't be proven abandoned or consumed. */
export interface UnresolvedConsumerFinding {
  /** Resolved display name (see {@link DiscoveredContract.contractName}). */
  readonly contractName: string
  /** Root-relative path of the file declaring the contract. */
  readonly file: string
  /** Human-readable explanation of why usage couldn't be resolved. */
  readonly reason: string
}
/** An owned variable with no consumer found in the scanned repository. */
export interface UnconsumedOwnedVariableFinding {
  /** Resolved display name (see {@link DiscoveredContract.contractName}). */
  readonly contractName: string
  /** The owning contract's default owner, if set. */
  readonly owner: string | undefined
  /** The unconsumed environment variable name. */
  readonly key: string
}
/** A variable accessed only via dynamic (computed) property access -- usage cannot be determined statically. */
export interface IndeterminateOwnershipFinding {
  /** Resolved display name (see {@link DiscoveredContract.contractName}). */
  readonly contractName: string
  /** The environment variable name. */
  readonly key: string
  /** Human-readable explanation of why usage couldn't be determined. */
  readonly reason: string
}

/** Everything {@link renderUsageReport} needs to render the Dependency &
 *  Ownership Report -- deliberately independent of (not derived from)
 *  `GenerateUsageReportResult` in `generate-usage.js`, the same way
 *  `RenderDocsOptions` in `docs.ts` doesn't derive from
 *  `GenerateDocumentationResult`. `generate-usage.ts` composes its own
 *  public result type from these building blocks instead, keeping this
 *  renderer module importable without its orchestrator. */
export interface RenderUsageReportOptions {
  /** Every contract's ownership/dependency summary. */
  readonly dependencyOwnership: readonly OwnershipDependencyEntry[]
  /** Contracts never imported anywhere in the scanned repository. */
  readonly abandonedContracts: readonly AbandonedContractFinding[]
  /** Advisory only, never gates `onOwnershipIssue` -- a contract only
   *  reaches here when an ambiguous barrel re-export makes "abandoned" or
   *  "consumed" both unprovable. */
  readonly unresolvedConsumers: readonly UnresolvedConsumerFinding[]
  /** Owned variables with no consumer found in the scanned repository. */
  readonly unconsumedOwnedVariables: readonly UnconsumedOwnedVariableFinding[]
  /** Variables accessed only via dynamic (computed) property access. */
  readonly indeterminate: readonly IndeterminateOwnershipFinding[]
  /** Schema-discovery parse warnings plus, since ADR 0014, any `packages`
   *  resolution failures -- surfaced here too (not just from
   *  `generateEnvManifest`/`generateDocumentation`) so a team relying only
   *  on `--ownership` output still learns when a cross-package contract
   *  failed to resolve. */
  readonly parseWarnings: readonly ParseWarning[]
}

function sortedByContractName<T extends { contractName: string }>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) =>
    a.contractName < b.contractName ? -1 : a.contractName > b.contractName ? 1 : 0,
  )
}

function renderDependencyOwnershipTable(entries: readonly OwnershipDependencyEntry[]): string[] {
  if (entries.length === 0) return []
  const lines = [
    "## Dependency ownership",
    "",
    "Who owns each contract, who depends on it, and the blast radius if it changes.",
    "",
    "| Contract | Owner | Variables | Consumers | Blast radius |",
    "|---|---|---|---|---|",
  ]
  for (const entry of sortedByContractName(entries)) {
    const consumers = entry.consumers.length > 0 ? entry.consumers.join(", ") : "--"
    lines.push(
      `| ${entry.contractName} (\`${entry.file}\`) | ${entry.owner ?? "--"} | ${entry.variableCount} | ${consumers} | ${entry.consumers.length} |`,
    )
  }
  lines.push("")
  return lines
}

function renderAbandoned(findings: readonly AbandonedContractFinding[]): string[] {
  if (findings.length === 0) return []
  const lines = [
    "## Abandoned ownership",
    "",
    "Contracts never imported anywhere in the scanned repository -- a feature's schema outliving the feature.",
    "",
    "| Contract | Owner | File |",
    "|---|---|---|",
  ]
  for (const f of sortedByContractName(findings))
    lines.push(`| ${f.contractName} | ${f.owner ?? "--"} | \`${f.file}\` |`)
  lines.push("")
  return lines
}

function renderUnresolvedConsumers(findings: readonly UnresolvedConsumerFinding[]): string[] {
  if (findings.length === 0) return []
  const lines = [
    "## Unresolved consumers (barrel re-exports)",
    "",
    "Contracts reachable only through an unresolved `export * from` barrel re-export -- cannot be proven abandoned or consumed. Advisory only; never fails a build.",
    "",
  ]
  for (const f of sortedByContractName(findings))
    lines.push(`- **${f.contractName}** (\`${f.file}\`): ${f.reason}`)
  lines.push("")
  return lines
}

function renderUnconsumedOwned(findings: readonly UnconsumedOwnedVariableFinding[]): string[] {
  if (findings.length === 0) return []
  const lines = [
    "## Unconsumed owned dependencies",
    "",
    "Variables no consumer reads within the scanned repository. Not proof of dead code -- an out-of-repo caller (a separate service, a webhook handler) would still show up here.",
    "",
    "| Variable | Contract | Owner |",
    "|---|---|---|",
  ]
  for (const f of sortedByContractName(findings))
    lines.push(`| \`${f.key}\` | ${f.contractName} | ${f.owner ?? "--"} |`)
  lines.push("")
  return lines
}

function renderIndeterminate(findings: readonly IndeterminateOwnershipFinding[]): string[] {
  if (findings.length === 0) return []
  const lines = [
    "## Indeterminate (dynamic access)",
    "",
    "Dynamic (computed) property access was observed -- usage cannot be determined statically. Never guessed at.",
    "",
    "| Variable | Contract | Reason |",
    "|---|---|---|",
  ]
  for (const f of sortedByContractName(findings))
    lines.push(`| \`${f.key}\` | ${f.contractName} | ${f.reason} |`)
  lines.push("")
  return lines
}

function renderParseWarnings(warnings: readonly ParseWarning[]): string[] {
  if (warnings.length === 0) return []
  const lines = [
    "## Parse warnings",
    "",
    "Includes any `packages` (ADR 0014) resolution failures, alongside ordinary schema-discovery warnings.",
    "",
  ]
  for (const w of warnings) lines.push(`- **${w.file}**: ${w.message}`)
  lines.push("")
  return lines
}

/**
 * Renders the Dependency & Ownership Report: who owns each variable, which
 * features consume each contract, and what the blast radius is if it
 * changes -- structured around exactly those three questions, never generic
 * "dead code"/"unused symbol" language.
 */
export function renderUsageReport(computed: RenderUsageReportOptions): string {
  const lines = [
    markdownBannerLine(),
    "",
    "# Dependency & Ownership Report",
    "",
    "Which feature owns each variable, which features consume that contract, and what the blast radius is if it changes.",
    "",
    ...renderDependencyOwnershipTable(computed.dependencyOwnership),
    ...renderAbandoned(computed.abandonedContracts),
    ...renderUnresolvedConsumers(computed.unresolvedConsumers),
    ...renderUnconsumedOwned(computed.unconsumedOwnedVariables),
    ...renderIndeterminate(computed.indeterminate),
    ...renderParseWarnings(computed.parseWarnings),
  ]
  return lines.join("\n").replace(/\n{3,}/g, "\n\n")
}
