// Hand-written types for report.mjs, which stays plain, dependency-free JS at
// runtime (ADR 0013 decision 7: it does not import src/cli/json.ts's types).
// They give test/scripts/github-action-report.test.ts real type-checking
// instead of `any`. This file sits outside package.json `files`, so it never
// ships and never changes the published types.
//
// The types are minimal and structural: only the fields each function reads,
// not the full GenerateEnvManifestResult shapes. That is report.mjs's real,
// duck-typed contract, and it is what the test fixtures build. Per ADR 0013,
// report.mjs and the JSON output agree by convention, not through a shared
// type. This file is the same kind of hand-synced copy, for type-checking only.

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

// Structural mirrors of only the `EvidenceModel` slices that report.mjs reads
// (`src/build/evidence-model.ts`, ADR 0024 and ADR 0038). `result.evidence` is
// `--json`'s copy of the evidence file `--evidence <path>` writes (ADR 0038).
// It is present only when the CLI ran with `--evidence` (see the `args`
// description in action.yml). There is no `result.docs` or `result.usage`:
// the CLI has no `--docs` or `--ownership` flags (ADR 0046).
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
  // defensive handling: a partial payload is exactly as valid as a full one.
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
  // Optional: classifyFindings() never reads it, and renderMarkdownSummary()
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
