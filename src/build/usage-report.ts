import type { ScannedSurface } from "./dependency-graph.js"
import type { DynamicAccessCitationProblem } from "./citation-verification.js"
import { evidenceDisclaimer, evidenceProjectionNote, generatedBanner } from "./generated-banner.js"
import type { ParseWarning } from "./parse.js"
import type { DynamicAccessAssertion, SourcePosition } from "./source-position.js"

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
  /**
   * Every `dynamicAccess` citation for this variable that's currently
   * `"stale"` or `"missing"` (empty when none exist -- see ADR 0037).
   * Empty is the *strongest* "looks genuinely unused" signal: no developer
   * has ever claimed otherwise. A non-empty list means someone specifically
   * claimed dynamic access here once and that claim can no longer be
   * verified -- worth a human check before deleting, not a stronger reason
   * to trust "unconsumed." Exposed as the raw citations, not a collapsed
   * `high`/`low` label, matching this codebase's "show the receipt" pattern
   * (ADR 0036/0037) -- a reader can judge confidence from the actual
   * evidence rather than trusting a derived summary. See ADR 0038.
   */
  readonly staleOrMissingCitations: readonly DynamicAccessCitationProblem[]
}
/** A variable accessed only via dynamic (computed) property access -- usage cannot be determined statically. */
export interface IndeterminateOwnershipFinding {
  /** Resolved display name (see {@link DiscoveredContract.contractName}). */
  readonly contractName: string
  /** The environment variable name. */
  readonly key: string
  /** Human-readable explanation of why usage couldn't be determined. */
  readonly reason: string
  /** Every AST-observed dynamic-access site backing `reason`, structured -- see ADR 0036. */
  readonly dynamicAccessSites: readonly SourcePosition[]
  /** See {@link UnconsumedOwnedVariableFinding.staleOrMissingCitations}. */
  readonly staleOrMissingCitations: readonly DynamicAccessCitationProblem[]
}
/** A variable that would otherwise be reported `unconsumedOwnedVariables`/`indeterminate`, but has at least one `"fresh"` developer-declared `dynamicAccess` citation -- the raw static status is always shown alongside the assertion, never replaced by it. See ADR 0037. */
export interface AssertedDynamicAccessFinding {
  /** Resolved display name (see {@link DiscoveredContract.contractName}). */
  readonly contractName: string
  /** The environment variable name. */
  readonly key: string
  /** What this variable's status would be without the fresh assertion. */
  readonly wouldBeStatus: "unconsumed" | "indeterminate"
  /** Every citation covering this variable, each with its own current freshness. */
  readonly dynamicAccessAssertions: readonly DynamicAccessAssertion[]
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
  /** Variables a developer has re-acknowledged via `dynamicAccess`, freshly -- see ADR 0037. */
  readonly asserted: readonly AssertedDynamicAccessFinding[]
  /** Schema-discovery parse warnings plus, since ADR 0014, any `packages`
   *  resolution failures -- surfaced here too (not just from
   *  `generateEnvManifest`/`generateDocumentation`) so a team relying only
   *  on `--ownership` output still learns when a cross-package contract
   *  failed to resolve. */
  readonly parseWarnings: readonly ParseWarning[]
  /** Every surface actually scanned for usage -- see ADR 0036. Named explicitly next to `unconsumedOwnedVariables` so "no consumer found" is never read as a stronger claim than what was actually searched. */
  readonly scannedSurfaces: readonly ScannedSurface[]
}

function sortedByContractName<T extends { contractName: string }>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => a.contractName.localeCompare(b.contractName))
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

/** `"none"` if `citations` is empty (rendered `--`), else the citations themselves -- so a reader sees the actual stale/missing claim, not a collapsed confidence label. */
function formatStaleOrMissingCitations(citations: readonly DynamicAccessCitationProblem[]): string {
  if (citations.length === 0) return "--"
  return citations
    .map((c) => `${c.position.file}:${c.position.line}:${c.position.column} (${c.acknowledgment})`)
    .join(", ")
}

function renderUnconsumedOwned(
  findings: readonly UnconsumedOwnedVariableFinding[],
  scannedSurfaces: readonly ScannedSurface[],
): string[] {
  if (findings.length === 0) return []
  const surfaces = scannedSurfaces.map((s) => s.label).join(", ")
  const lines = [
    "## Unconsumed owned dependencies",
    "",
    "Variables no consumer reads within the scanned surfaces below. Not proof of dead code. " +
      "Common reasons a real consumer wouldn't show up here: it's read by a separate, " +
      "out-of-repo service or webhook handler; it's consumed by non-TypeScript code (a shell " +
      "script, a Dockerfile, a Terraform/Kubernetes manifest); or it's read from an allow-listed " +
      "package whose directory wasn't included in this project's own `packages` configuration " +
      "(ADR 0014).",
    "",
    `Searched: ${surfaces}.`,
    "",
    'A blank Stale/missing citations cell is the strongest "looks genuinely unused" signal -- no developer has ever claimed otherwise. A non-blank cell means someone specifically claimed dynamic access here via `dynamicAccess`, and that claim can no longer be verified (ADR 0037) -- check with them before deleting.',
    "",
    "| Variable | Contract | Owner | Stale/missing citations |",
    "|---|---|---|---|",
  ]
  for (const f of sortedByContractName(findings))
    lines.push(
      `| \`${f.key}\` | ${f.contractName} | ${f.owner ?? "--"} | ${formatStaleOrMissingCitations(f.staleOrMissingCitations)} |`,
    )
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
    "| Variable | Contract | Reason | Stale/missing citations |",
    "|---|---|---|---|",
  ]
  for (const f of sortedByContractName(findings))
    lines.push(
      `| \`${f.key}\` | ${f.contractName} | ${f.reason} | ${formatStaleOrMissingCitations(f.staleOrMissingCitations)} |`,
    )
  lines.push("")
  return lines
}

/** `"Per developers, this data point is dynamically accessed at <citations>."`, one clause per assertion -- never a bare "acknowledged", so the exact cited positions are always legible directly in the rendered report. */
function formatAssertions(assertions: readonly DynamicAccessAssertion[]): string {
  const sites = assertions.map((a) => `${a.file}:${a.line}:${a.column}`).join(", ")
  return `Per developers, this data point is dynamically accessed at ${sites}.`
}

function renderAsserted(findings: readonly AssertedDynamicAccessFinding[]): string[] {
  if (findings.length === 0) return []
  const lines = [
    "## Asserted (developer-acknowledged dynamic access)",
    "",
    "Variables env-cap's own scan would otherwise flag as unconsumed or indeterminate, but a developer has cited exactly where the dynamic access happens via `dynamicAccess`. The raw static status is shown alongside the citation, never hidden behind it -- a citation is a re-acknowledgment, not proof.",
    "",
    "| Variable | Contract | Static status | Developer assertion |",
    "|---|---|---|---|",
  ]
  for (const f of sortedByContractName(findings))
    lines.push(
      `| \`${f.key}\` | ${f.contractName} | ${f.wouldBeStatus} | ${formatAssertions(f.dynamicAccessAssertions)} |`,
    )
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
    generatedBanner("markdown"),
    "",
    `> ${evidenceDisclaimer()}`,
    "",
    `> ${evidenceProjectionNote()}`,
    "",
    "# Dependency & Ownership Report",
    "",
    "_Produced by `env-cap --ownership`._",
    "",
    "Which feature owns each variable, which features consume that contract, and what the blast radius is if it changes.",
    "",
    ...renderDependencyOwnershipTable(computed.dependencyOwnership),
    ...renderAbandoned(computed.abandonedContracts),
    ...renderUnresolvedConsumers(computed.unresolvedConsumers),
    ...renderUnconsumedOwned(computed.unconsumedOwnedVariables, computed.scannedSurfaces),
    ...renderIndeterminate(computed.indeterminate),
    ...renderAsserted(computed.asserted),
    ...renderParseWarnings(computed.parseWarnings),
  ]
  // The `"\n\n"` replacement (or the `/\n{3,}/g` match itself) is
  // unreachable through the current composition, not a real gap: every
  // `render*()` helper above contributes AT MOST one trailing blank line
  // when non-empty, and exactly zero lines when empty (`[]`, never a lone
  // blank placeholder) -- so no composition of them can ever produce 3+
  // consecutive newlines for this regex to collapse. Kept as a defensive
  // safety net for a FUTURE section helper that might not follow that
  // convention. Hand-verified: replacing the whole match with `""` instead
  // and running the real suite (a maximal fixture exercising every section)
  // passes unchanged either way.
  // Stryker disable next-line StringLiteral
  return lines.join("\n").replace(/\n{3,}/g, "\n\n")
}
