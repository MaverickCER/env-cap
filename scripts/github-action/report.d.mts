// Hand-written type declaration for report.mjs, kept as plain, dependency-free
// JS at runtime (see ADR 0013 decision 7 -- report.mjs has no dependency on
// src/cli/json.ts's types). This file exists purely so the test suite
// (test/scripts/github-action-report.test.ts) gets real type-checking
// instead of treating every import as `any`; it is not shipped (outside
// `files` in package.json) and never affects the published package's types.
//
// Deliberately minimal, structural types -- just the fields each function
// actually reads, not the full GenerateEnvManifestResult/etc. shapes -- since
// that's report.mjs's real (duck-typed) contract and it's what test fixtures
// naturally construct. Per ADR 0013, report.mjs and the JSON contract are
// already coupled by convention, not a shared type; this file is the same
// kind of manually-kept-in-sync duplication, just for local type-checking.

export interface Finding {
  readonly level: "error" | "warning" | "notice"
  readonly file: string | undefined
  readonly message: string
}

interface IssueLike {
  readonly severity?: "error" | "warning"
  readonly variable: string
  readonly files: readonly string[]
  readonly reason: string
}

export interface ManifestSection {
  readonly warnings: readonly IssueLike[]
}

interface UndocumentedContractLike {
  readonly file: string
  readonly exportName: string
}
interface UndocumentedVariableLike {
  readonly file: string
  readonly exportName: string
  readonly key: string
}
interface StaleDocEntryLike {
  readonly file: string
  readonly exportName: string
  readonly key: string
}
interface UnresolvedLinkLike {
  readonly file: string
  readonly reason: string
}
interface ExpiringEntryLike {
  readonly file: string
  readonly exportName: string
  readonly key?: string
  readonly expiresAt: string
  readonly daysRemaining: number
}
interface CatalogVariableLike {
  readonly extra?: Readonly<Record<string, string>>
}
interface CatalogContractLike {
  readonly file: string
  readonly exportName: string
  readonly variables: Readonly<Record<string, CatalogVariableLike>>
}

export interface DocumentationSection {
  // Each field is optional, matching report.mjs's own `doc.field ?? []`
  // defensive handling -- a partial payload is exactly as valid as a full one.
  readonly documentation: {
    readonly undocumentedContracts?: readonly UndocumentedContractLike[]
    readonly undocumentedVariables?: readonly UndocumentedVariableLike[]
    readonly staleDocEntries?: readonly StaleDocEntryLike[]
    readonly unresolvedLinks?: readonly UnresolvedLinkLike[]
    readonly expiringSoon?: readonly ExpiringEntryLike[]
  }
  readonly catalog?: readonly CatalogContractLike[]
}

interface AbandonedContractLike {
  readonly file: string
  readonly contractName: string
  readonly owner?: string
}
interface UnconsumedOwnedVariableLike {
  readonly key: string
  readonly contractName: string
  readonly owner?: string
}
interface UnresolvedConsumerLike {
  readonly file: string
  readonly contractName: string
  readonly reason: string
}
interface IndeterminateLike {
  readonly key: string
  readonly contractName: string
  readonly reason: string
}
interface DependencyOwnershipEntryLike {
  readonly contractName: string
  readonly owner?: string
  readonly consumers: readonly string[]
}

export interface UsageSection {
  // Optional, matching report.mjs's own `usage.field ?? []` defensive handling.
  readonly abandonedContracts?: readonly AbandonedContractLike[]
  readonly unconsumedOwnedVariables?: readonly UnconsumedOwnedVariableLike[]
  readonly unresolvedConsumers?: readonly UnresolvedConsumerLike[]
  readonly indeterminate?: readonly IndeterminateLike[]
  readonly dependencyOwnership?: readonly DependencyOwnershipEntryLike[]
}

export interface ErrorSection {
  readonly name?: string
  readonly message?: string
  readonly issues?: readonly IssueLike[]
}

export interface ReportResult {
  // Optional -- classifyFindings() never reads it, and renderMarkdownSummary()
  // only ever checks `result?.ok === false`, which is safely false when absent.
  readonly ok?: boolean
  readonly manifest?: ManifestSection
  readonly docs?: DocumentationSection
  readonly usage?: UsageSection
  readonly error?: ErrorSection
}

export function collectManifestFindings(manifest: ManifestSection | undefined): Finding[]
export function collectDocumentationFindings(docs: DocumentationSection | undefined): Finding[]
export function collectOwnershipFindings(usage: UsageSection | undefined): Finding[]
export function collectErrorFindings(error: ErrorSection | undefined): Finding[]
export function classifyFindings(result: ReportResult | undefined): Finding[]
export function renderMarkdownSummary(result: ReportResult | undefined): string
export function renderAnnotations(
  findings: readonly Finding[],
  cliRoot: string,
  workspaceRoot: string,
): string[]

export type RotationAlert =
  | { readonly action: "close" }
  | { readonly action: "open"; readonly title: string; readonly body: string }
export function buildRotationAlert(result: ReportResult | undefined): RotationAlert
