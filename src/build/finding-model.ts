import type { ArtifactCheckFinding } from "./check-artifacts.js"
import type { CompatibilityIssue, CompatibilityIssueCode } from "./compatibility.js"
import type { EvidenceReference } from "./evidence-reference.js"
import type { DocumentationFindings } from "./generate-documentation.js"
import type {
  AbandonedContractFinding,
  IndeterminateOwnershipFinding,
  UnconsumedOwnedVariableFinding,
  UnresolvedConsumerFinding,
} from "./usage-report.js"

/**
 * The fourth of env-cap's seven canonical fact models (ADR 0024) -- every
 * rule violation and derived risk signal, unified behind one shape, with a
 * stable `code` and a structured {@link EvidenceReference} instead of four
 * independently-shaped finding families. See ADR 0026.
 */

/** Every stable `code` a {@link Finding} can carry. A superset of {@link CompatibilityIssueCode} plus one code per non-compatibility source family this model adapts. */
export type FindingCode =
  | CompatibilityIssueCode
  | "exclusive-group-violation"
  | "artifact-stale"
  | "artifact-missing"
  | "undocumented-contract"
  | "undocumented-variable"
  | "stale-doc-entry"
  | "expired"
  | "expiring-soon"
  | "unresolved-documentenv-link"
  | "abandoned-contract"
  | "unresolved-consumer"
  | "unconsumed-owned-variable"
  | "indeterminate-ownership"

/** Which source check produced a {@link Finding} -- coarser than `code`, for a consumer that only wants to filter by kind (e.g. "show me every documentation gap") without enumerating every individual code. */
export type FindingFamily = "compatibility" | "drift" | "documentation" | "ownership"

/** One rule violation or derived signal, in the Finding Model's canonical shape. */
export interface Finding {
  /** `"error"` for a provable, always-blocking violation (e.g. an exclusive-group conflict); `"warning"` for everything gated by `onIncompatibility`/`onUndocumented`/`onOwnershipIssue`'s default "warn" behavior. */
  readonly severity: "error" | "warning"
  /** Stable, machine-readable identifier -- always set, unlike {@link CompatibilityIssue.code} which stays optional on that narrower, pre-existing type. */
  readonly code: FindingCode
  /** Which source check produced this finding. */
  readonly family: FindingFamily
  /** Human-readable explanation, reusing the source finding's own prose where one exists. */
  readonly message: string
  /** Structured pointer back to what this finding is about. */
  readonly location: EvidenceReference
}

/** Bump only when a reader could misinterpret the new shape -- same discipline every other canonical model's `schemaVersion` follows. */
export const FINDING_MODEL_SCHEMA_VERSION = 1

export interface FindingModel {
  readonly schemaVersion: typeof FINDING_MODEL_SCHEMA_VERSION
  readonly findings: readonly Finding[]
}

/**
 * Every source a {@link buildFindingModel} call can adapt, all optional --
 * a caller passes whichever of `generateEnvArtifacts()`'s `manifest`/`docs`/
 * `usage` results it actually requested, exactly like that result's own
 * top-level fields are each independently optional.
 */
export interface BuildFindingModelInput {
  /** From `detectCompatibilityIssues()`. */
  readonly compatibilityIssues?: readonly CompatibilityIssue[]
  /** From `detectExclusiveGroupIssues()` -- kept separate from `compatibilityIssues` since it never sets its own `code` yet (ADR 0009), so this adapter synthesizes `"exclusive-group-violation"` for every entry. */
  readonly exclusiveGroupIssues?: readonly CompatibilityIssue[]
  /** From `checkEnvArtifacts()`'s result. Only `"stale"`/`"missing"` findings become a `Finding` -- `"ok"` means nothing to report. */
  readonly artifactCheckFindings?: readonly ArtifactCheckFinding[]
  /** From `generateDocumentation()`'s result. */
  readonly documentation?: DocumentationFindings
  /** From `generateUsageReport()`'s result. */
  readonly abandonedContracts?: readonly AbandonedContractFinding[]
  /** From `generateUsageReport()`'s result. */
  readonly unresolvedConsumers?: readonly UnresolvedConsumerFinding[]
  /** From `generateUsageReport()`'s result. */
  readonly unconsumedOwnedVariables?: readonly UnconsumedOwnedVariableFinding[]
  /** From `generateUsageReport()`'s result. */
  readonly indeterminateOwnership?: readonly IndeterminateOwnershipFinding[]
}

function fromCompatibilityIssue(issue: CompatibilityIssue, code: FindingCode): Finding {
  return {
    severity: issue.severity,
    code,
    family: "compatibility",
    message: issue.reason,
    location: {
      model: "contract",
      file: issue.files[0],
      exportName: undefined,
      variable: issue.variable,
    },
  }
}

/**
 * Adapts every existing finding family into the Finding Model's unified
 * shape -- an adapter over data that already exists, not a new source of
 * truth. Order of the returned array mirrors the order sources are given
 * above; a consumer wanting a specific order (by severity, by file, ...)
 * sorts it themselves.
 */
export function buildFindingModel(input: BuildFindingModelInput): FindingModel {
  const findings: Finding[] = []

  for (const issue of input.compatibilityIssues ?? []) {
    // Every check in detectCompatibilityIssues() sets a code as of ADR 0026 --
    // the fallback exists only for defense against a future check that forgets to.
    findings.push(fromCompatibilityIssue(issue, issue.code ?? "duplicate-variable-documentation"))
  }

  for (const issue of input.exclusiveGroupIssues ?? []) {
    findings.push(fromCompatibilityIssue(issue, "exclusive-group-violation"))
  }

  for (const check of input.artifactCheckFindings ?? []) {
    if (check.status === "ok") continue
    findings.push({
      severity: "warning",
      code: check.status === "missing" ? "artifact-missing" : "artifact-stale",
      family: "drift",
      message: check.detail ?? `${check.artifact} artifact is ${check.status}.`,
      location: { model: "change", path: check.path },
    })
  }

  const documentation = input.documentation
  if (documentation) {
    for (const c of documentation.undocumentedContracts) {
      findings.push({
        severity: "warning",
        code: "undocumented-contract",
        family: "documentation",
        message: `"${c.exportName}" has no documentEnv() call linked to it.`,
        location: {
          model: "contract",
          file: c.file,
          exportName: c.exportName,
          variable: undefined,
        },
      })
    }
    for (const v of documentation.undocumentedVariables) {
      findings.push({
        severity: "warning",
        code: "undocumented-variable",
        family: "documentation",
        message: `"${v.key}" (declared by "${v.exportName}") has no matching entry in a linked documentEnv()'s "variables".`,
        location: { model: "contract", file: v.file, exportName: v.exportName, variable: v.key },
      })
    }
    for (const s of documentation.staleDocEntries) {
      findings.push({
        severity: "warning",
        code: "stale-doc-entry",
        family: "documentation",
        message: `"${s.key}" is documented under "${s.exportName}" but no longer exists in that contract's schema.`,
        location: { model: "contract", file: s.file, exportName: s.exportName, variable: s.key },
      })
    }
    for (const e of documentation.expiringSoon) {
      const expired = e.daysRemaining < 0
      findings.push({
        severity: "warning",
        code: expired ? "expired" : "expiring-soon",
        family: "documentation",
        message: expired
          ? `"${e.key ?? e.exportName}" expired ${Math.abs(e.daysRemaining)} day(s) ago (expiresAt: ${e.expiresAt}).`
          : `"${e.key ?? e.exportName}" expires in ${e.daysRemaining} day(s) (expiresAt: ${e.expiresAt}).`,
        location: { model: "contract", file: e.file, exportName: e.exportName, variable: e.key },
      })
    }
    for (const u of documentation.unresolvedLinks) {
      findings.push({
        severity: "warning",
        code: "unresolved-documentenv-link",
        family: "documentation",
        message: u.reason,
        location: { model: "contract", file: u.file, exportName: undefined, variable: undefined },
      })
    }
  }

  for (const a of input.abandonedContracts ?? []) {
    findings.push({
      severity: "warning",
      code: "abandoned-contract",
      family: "ownership",
      message: `"${a.contractName}" is never imported anywhere in the scanned repository.`,
      location: {
        model: "ownership",
        contractName: a.contractName,
        file: a.file,
        variable: undefined,
      },
    })
  }
  for (const u of input.unresolvedConsumers ?? []) {
    findings.push({
      severity: "warning",
      code: "unresolved-consumer",
      family: "ownership",
      message: u.reason,
      location: {
        model: "ownership",
        contractName: u.contractName,
        file: u.file,
        variable: undefined,
      },
    })
  }
  for (const u of input.unconsumedOwnedVariables ?? []) {
    findings.push({
      severity: "warning",
      code: "unconsumed-owned-variable",
      family: "ownership",
      message: `"${u.key}" (declared by "${u.contractName}") has no consumer found in the scanned repository.`,
      location: {
        model: "ownership",
        contractName: u.contractName,
        file: undefined,
        variable: u.key,
      },
    })
  }
  for (const i of input.indeterminateOwnership ?? []) {
    findings.push({
      severity: "warning",
      code: "indeterminate-ownership",
      family: "ownership",
      message: i.reason,
      location: {
        model: "ownership",
        contractName: i.contractName,
        file: undefined,
        variable: i.key,
      },
    })
  }

  return { schemaVersion: FINDING_MODEL_SCHEMA_VERSION, findings }
}
