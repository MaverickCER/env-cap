import type { ArtifactCheckFinding } from "./check-artifacts.js"
import type { CompatibilityIssue, CompatibilityIssueCode } from "./compatibility.js"
import { displayPath } from "./display-path.js"
import type { EvidenceReference } from "./evidence-reference.js"
import type { DocumentationFindings } from "./generate-documentation.js"
import type { DynamicAccessCitationProblem } from "./citation-verification.js"
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
  | "EXCLUSIVE_GROUP_VIOLATION"
  | "ARTIFACT_STALE"
  | "ARTIFACT_MISSING"
  | "UNDOCUMENTED_CONTRACT"
  | "UNDOCUMENTED_VARIABLE"
  | "STALE_DOC_ENTRY"
  | "EXPIRED"
  | "EXPIRING_SOON"
  | "UNRESOLVED_DOCUMENTENV_LINK"
  | "ABANDONED_CONTRACT"
  | "UNRESOLVED_CONSUMER"
  | "UNCONSUMED_OWNED_VARIABLE"
  | "INDETERMINATE_OWNERSHIP"
  | "MISSING_DYNAMIC_ACCESS_CITATION"
  | "STALE_DYNAMIC_ACCESS_CITATION"
  | "NONSTANDARD_SENSITIVITY_LEVEL"

/** Which source check produced a {@link Finding} -- coarser than `code`, for a consumer that only wants to filter by kind (e.g. "show me every documentation gap") without enumerating every individual code. */
export type FindingFamily = "compatibility" | "drift" | "documentation" | "ownership"

/** One rule violation or derived signal, in the Finding Model's canonical shape. */
export interface Finding {
  /**
   * `"error"` for a provable, always-blocking violation (e.g. an
   * exclusive-group conflict); `"warning"` for everything gated by
   * `onIncompatibility`/`onUndocumented`/`onOwnershipIssue`'s default "warn"
   * behavior; `"info"` for an observation that is never actionable enough to
   * block anything, even under `--strict` -- see `INFO_ONLY_CODES` in
   * `generate-env-artifacts.ts`.
   */
  readonly severity: "error" | "warning" | "info"
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
export const FINDING_MODEL_SCHEMA_VERSION = 3

/** The versioned, JSON-serializable root of the Finding Model -- every rule violation and derived risk signal from this run, unified behind {@link Finding}'s one shape. See this module's own doc comment for the full picture. */
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
  /** Every `EvidenceReference.file` below is rendered relative to this, matching every other rendered path in this package's output -- see `displayPath()`. */
  readonly root: string
  /** From `detectCompatibilityIssues()`. */
  readonly compatibilityIssues?: readonly CompatibilityIssue[]
  /** From `detectExclusiveGroupIssues()` -- kept separate from `compatibilityIssues` since it never sets its own `code` yet (ADR 0009), so this adapter synthesizes `"EXCLUSIVE_GROUP_VIOLATION"` for every entry. */
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
  /** From `computeManifestChanges()`'s result -- every `dynamicAccess` citation that's gone `"stale"` or `"missing"` since it was last acknowledged. See ADR 0037. */
  readonly dynamicAccessCitationProblems?: readonly DynamicAccessCitationProblem[]
}

// None of `finding-model.ts`'s current inputs (`CompatibilityIssue`,
// `DocumentationFindings`'s sub-types, `usage-report.ts`'s finding types)
// carry a `SourcePosition` themselves yet -- each is built one layer above
// this file, from a `DiscoveredContract`/`DiscoveredVariable` that now
// *does* carry `declaration`/`documentation` (ADR 0036), but threading that
// through each of those intermediate finding types is real, separate,
// currently-unstarted work, not something to fake here. `position:
// undefined` is an honest value (the field's own type is `SourcePosition |
// undefined`), not a placeholder -- every `EvidenceReference` below is
// deliberately left at that default until its upstream finding type is
// extended to carry one.
const NO_POSITION = undefined

function fromCompatibilityIssue(
  root: string,
  issue: CompatibilityIssue,
  code: FindingCode,
): Finding {
  // Unlike every other call site in this file, `issue.files` isn't always
  // populated: a pairwise comparison (compatibility.ts, exclusive-group.ts)
  // always supplies two, but an escalated finding from another family
  // (generate-env-artifacts.ts's escalatedFindings(), via findingFiles())
  // can genuinely supply none -- honest `file: undefined` then, the same
  // convention this file already uses below for findings with no file of
  // their own, not a fabricated path.
  const file = issue.files[0]
  return {
    severity: issue.severity,
    code,
    family: "compatibility",
    message: issue.reason,
    location: {
      model: "contract",
      file: file === undefined ? undefined : displayPath(root, file),
      exportName: undefined,
      variable: issue.variable,
      position: NO_POSITION,
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
  const { root } = input
  const findings: Finding[] = []

  for (const issue of input.compatibilityIssues ?? []) {
    // Every check in detectCompatibilityIssues() sets a code as of ADR 0026 --
    // the fallback exists only for defense against a future check that forgets to.
    findings.push(
      fromCompatibilityIssue(root, issue, issue.code ?? "DUPLICATE_VARIABLE_DOCUMENTATION"),
    )
  }

  for (const issue of input.exclusiveGroupIssues ?? []) {
    findings.push(fromCompatibilityIssue(root, issue, "EXCLUSIVE_GROUP_VIOLATION"))
  }

  for (const check of input.artifactCheckFindings ?? []) {
    if (check.status === "ok") continue
    findings.push({
      severity: "warning",
      code: check.status === "missing" ? "ARTIFACT_MISSING" : "ARTIFACT_STALE",
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
        code: "UNDOCUMENTED_CONTRACT",
        family: "documentation",
        message: `"${c.exportName}" has no documentEnv() call linked to it.`,
        location: {
          model: "contract",
          file: displayPath(root, c.file),
          exportName: c.exportName,
          variable: undefined,
          position: NO_POSITION,
        },
      })
    }
    for (const v of documentation.undocumentedVariables) {
      findings.push({
        severity: "warning",
        code: "UNDOCUMENTED_VARIABLE",
        family: "documentation",
        message: `"${v.key}" (declared by "${v.exportName}") has no matching entry in a linked documentEnv()'s "variables".`,
        location: {
          model: "contract",
          file: displayPath(root, v.file),
          exportName: v.exportName,
          variable: v.key,
          position: NO_POSITION,
        },
      })
    }
    for (const s of documentation.staleDocEntries) {
      findings.push({
        severity: "warning",
        code: "STALE_DOC_ENTRY",
        family: "documentation",
        message: `"${s.key}" is documented under "${s.exportName}" but no longer exists in that contract's schema.`,
        location: {
          model: "contract",
          file: displayPath(root, s.file),
          exportName: s.exportName,
          variable: s.key,
          position: NO_POSITION,
        },
      })
    }
    for (const e of documentation.expiringSoon) {
      const expired = e.daysRemaining < 0
      findings.push({
        severity: "warning",
        code: expired ? "EXPIRED" : "EXPIRING_SOON",
        family: "documentation",
        message: expired
          ? `"${e.key ?? e.exportName}" expired ${Math.abs(e.daysRemaining)} day(s) ago (expiresAt: ${e.expiresAt}).`
          : `"${e.key ?? e.exportName}" expires in ${e.daysRemaining} day(s) (expiresAt: ${e.expiresAt}).`,
        location: {
          model: "contract",
          file: displayPath(root, e.file),
          exportName: e.exportName,
          variable: e.key,
          position: NO_POSITION,
        },
      })
    }
    for (const n of documentation.nonstandardSensitivityLevels) {
      findings.push({
        severity: "info",
        code: "NONSTANDARD_SENSITIVITY_LEVEL",
        family: "documentation",
        message:
          `"${n.key ?? n.exportName}" declares sensitivity "${n.sensitivity}", which isn't one of the standard ` +
          "levels (secret/credential/pii/config) -- still honored verbatim, just flagged for vocabulary drift.",
        location: {
          model: "contract",
          file: displayPath(root, n.file),
          exportName: n.exportName,
          variable: n.key,
          position: NO_POSITION,
        },
      })
    }
    for (const u of documentation.unresolvedLinks) {
      findings.push({
        severity: "warning",
        code: "UNRESOLVED_DOCUMENTENV_LINK",
        family: "documentation",
        message: u.reason,
        location: {
          model: "contract",
          file: displayPath(root, u.file),
          exportName: undefined,
          variable: undefined,
          position: NO_POSITION,
        },
      })
    }
  }

  for (const a of input.abandonedContracts ?? []) {
    findings.push({
      severity: "warning",
      code: "ABANDONED_CONTRACT",
      family: "ownership",
      message: `"${a.contractName}" is never imported anywhere in the scanned repository.`,
      location: {
        model: "ownership",
        contractName: a.contractName,
        // a.file (AbandonedContractFinding.file) is already root-relative.
        file: a.file,
        variable: undefined,
        position: NO_POSITION,
      },
    })
  }
  for (const u of input.unresolvedConsumers ?? []) {
    findings.push({
      severity: "warning",
      code: "UNRESOLVED_CONSUMER",
      family: "ownership",
      message: u.reason,
      location: {
        model: "ownership",
        contractName: u.contractName,
        // u.file (UnresolvedConsumerFinding.file) is already root-relative.
        file: u.file,
        variable: undefined,
        position: NO_POSITION,
      },
    })
  }
  for (const u of input.unconsumedOwnedVariables ?? []) {
    findings.push({
      severity: "warning",
      code: "UNCONSUMED_OWNED_VARIABLE",
      family: "ownership",
      message: `"${u.key}" (declared by "${u.contractName}") has no consumer found in the scanned repository.`,
      location: {
        model: "ownership",
        contractName: u.contractName,
        file: undefined,
        variable: u.key,
        position: NO_POSITION,
      },
    })
  }
  for (const i of input.indeterminateOwnership ?? []) {
    findings.push({
      severity: "warning",
      code: "INDETERMINATE_OWNERSHIP",
      family: "ownership",
      message: i.reason,
      location: {
        model: "ownership",
        contractName: i.contractName,
        file: undefined,
        variable: i.key,
        // Multiple candidate sites, never one representative pointer -- see
        // `IndeterminateOwnershipFinding.dynamicAccessSites` for the full list.
        position: NO_POSITION,
      },
    })
  }

  for (const p of input.dynamicAccessCitationProblems ?? []) {
    const missing = p.acknowledgment === "missing"
    findings.push({
      severity: "warning",
      code: missing ? "MISSING_DYNAMIC_ACCESS_CITATION" : "STALE_DYNAMIC_ACCESS_CITATION",
      family: "ownership",
      message: missing
        ? `"${p.key}" (declared by "${p.contractName}") cites dynamic access at ${p.position.file}:${p.position.line}:${p.position.column}, but that file no longer exists. Re-run generate:env once the citation is corrected.`
        : `"${p.key}" (declared by "${p.contractName}") cites dynamic access at ${p.position.file}:${p.position.line}:${p.position.column}, but that file's content has changed since it was last acknowledged. Re-run generate:env once you've re-confirmed the citation still applies.`,
      location: {
        model: "ownership",
        contractName: p.contractName,
        // p.file (DynamicAccessCitationProblem.file) is already
        // root-relative -- unlike every other .file above, not a raw
        // absolute path -- so no displayPath() conversion here.
        file: p.file,
        variable: p.key,
        // The one ownership-family finding with a genuinely meaningful
        // position -- exactly where the (now-stale/missing) citation points.
        position: p.position,
      },
    })
  }

  return { schemaVersion: FINDING_MODEL_SCHEMA_VERSION, findings }
}
