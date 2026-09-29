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

// Structural, duck-typed mirrors of the relevant slices of `EvidenceModel`
// (`src/build/evidence-model.ts` and the six canonical fact models it
// assembles -- ADR 0024/0038), not the full generated types: only the
// fields report.mjs's own (duck-typed) contract actually reads. `result
// .evidence` is `--json`'s own copy of the exact same persisted evidence
// artifact `--evidence <path>` writes to disk (ADR 0038), present only when
// `--evidence` was passed to the CLI (see action.yml's own `args`
// description) -- `result.docs`/`result.usage` no longer exist at all:
// `--docs`/`--ownership` were removed from the CLI (ADR 0046).
export interface FindingLocationLike {
  readonly model: "contract" | "ownership" | "change"
  readonly file?: string | undefined
  readonly path?: string | undefined
  readonly exportName?: string | undefined
  readonly variable?: string | undefined
  readonly contractName?: string | undefined
}
export interface FindingLike {
  readonly severity: "error" | "warning" | "info"
  readonly code: string
  readonly family: "compatibility" | "drift" | "documentation" | "ownership"
  readonly message: string
  readonly location: FindingLocationLike
}
interface FindingModelLike {
  readonly findings: readonly FindingLike[]
}

interface ExpiringEntryLike {
  readonly file: string
  readonly exportName: string
  readonly key?: string
  readonly expiresAt: string
  readonly daysRemaining: number
}
interface LifecycleModelLike {
  readonly expiring: readonly ExpiringEntryLike[]
}

interface ContractModelVariableLike {
  readonly key: string
  readonly metadata?: Readonly<Record<string, unknown>>
}
interface ContractModelContractLike {
  readonly file: string
  readonly exportName: string
  readonly variables: readonly ContractModelVariableLike[]
}
interface ContractModelLike {
  readonly contracts: readonly ContractModelContractLike[]
}

interface OwnershipModelContractLike {
  readonly file: string
  readonly exportName: string
  readonly owner?: string
}
interface OwnershipModelLike {
  readonly contracts: readonly OwnershipModelContractLike[]
}

interface DependencyModelContractLike {
  readonly file: string
  readonly exportName: string
  readonly contractName: string
  readonly consumingFiles: readonly string[]
}
interface DependencyModelLike {
  readonly contracts: readonly DependencyModelContractLike[]
}

export interface EvidenceSection {
  // Each field is optional, matching report.mjs's own `evidence?.field ?? []`
  // defensive handling -- a partial payload is exactly as valid as a full one.
  readonly finding?: FindingModelLike
  readonly lifecycle?: LifecycleModelLike
  readonly contract?: ContractModelLike
  readonly ownership?: OwnershipModelLike
  readonly dependency?: DependencyModelLike
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
  readonly evidence?: EvidenceSection
  readonly error?: ErrorSection
}

export function collectManifestFindings(manifest: ManifestSection | undefined): Finding[]
export function collectDocumentationFindings(evidence: EvidenceSection | undefined): Finding[]
export function collectOwnershipFindings(evidence: EvidenceSection | undefined): Finding[]
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
