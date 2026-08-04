import type { CompatibilityIssue } from "./compatibility.js"

function formatIssues(header: string, issues: readonly CompatibilityIssue[]): string {
  const blocks = issues.map(
    (issue) =>
      `${issue.variable}\n${"-".repeat(Math.max(issue.variable.length, 3))}\n[${issue.severity}] ${issue.reason}\n\nDeclared in:\n${issue.files.join("\n")}`,
  )
  return [header, ...blocks].join("\n\n")
}

function countedHeader(
  prefix: string,
  singularNoun: string,
  issues: readonly CompatibilityIssue[],
): string {
  const noun = issues.length === 1 ? singularNoun : `${singularNoun}s`
  return `${prefix}\n\n${issues.length} ${noun} found:`
}

/**
 * Thrown by {@link generateEnvManifest} on a blocking compatibility/exclusive-group
 * finding, or an output path escaping `root`.
 *
 * @remarks
 * Nothing is written when this throws -- generation fails atomically, same as
 * {@link runtime.validateEnv} fails atomically at runtime.
 *
 * `code` is a stable, Stable-tier discriminant for programmatic handling --
 * prefer it over `.name`/`instanceof` when a message-independent switch is needed.
 */
export class EnvManifestGenerationError extends Error {
  /** Stable discriminant for programmatic handling; always `"ENV_MANIFEST_GENERATION_FAILED"`. */
  readonly code = "ENV_MANIFEST_GENERATION_FAILED"
  /** Every blocking finding, aggregated. */
  readonly issues: readonly CompatibilityIssue[]

  constructor(issues: readonly CompatibilityIssue[]) {
    super(
      formatIssues(
        countedHeader(
          "Environment manifest generation failed.",
          "incompatible declaration",
          issues,
        ),
        issues,
      ),
    )
    this.name = "EnvManifestGenerationError"
    this.issues = issues
    Error.captureStackTrace?.(this, EnvManifestGenerationError)
  }
}

/**
 * Thrown by {@link generateDocumentation} on a blocking undocumented-contract/
 * variable finding (when `onUndocumented: "throw"`), or an output path
 * (`location`/`envExample.location`) escaping `root`. Nothing is written
 * when this throws.
 *
 * @remarks
 * `code` is a stable, Stable-tier discriminant for programmatic handling --
 * prefer it over `.name`/`instanceof` when a message-independent switch is needed.
 */
export class EnvDocumentationGenerationError extends Error {
  /** Stable discriminant for programmatic handling; always `"ENV_DOCUMENTATION_GENERATION_FAILED"`. */
  readonly code = "ENV_DOCUMENTATION_GENERATION_FAILED"
  /** Every blocking finding, aggregated. */
  readonly issues: readonly CompatibilityIssue[]

  constructor(issues: readonly CompatibilityIssue[]) {
    super(
      formatIssues(
        countedHeader(
          "Environment documentation generation failed.",
          "documentation issue",
          issues,
        ),
        issues,
      ),
    )
    this.name = "EnvDocumentationGenerationError"
    this.issues = issues
    Error.captureStackTrace?.(this, EnvDocumentationGenerationError)
  }
}

/**
 * Thrown by {@link generateUsageReport} on a blocking abandoned-contract/
 * unconsumed-owned-variable finding (when `onOwnershipIssue: "throw"`), or an
 * output path (`report.location`) escaping `root`.
 *
 * @remarks
 * Never thrown for `unresolvedConsumers` or `indeterminate` findings -- both are "we don't
 * know" states, and uncertainty is never promoted to a failure.
 *
 * `code` is a stable, Stable-tier discriminant for programmatic handling --
 * prefer it over `.name`/`instanceof` when a message-independent switch is needed.
 */
export class EnvUsageAnalysisError extends Error {
  /** Stable discriminant for programmatic handling; always `"ENV_USAGE_ANALYSIS_FAILED"`. */
  readonly code = "ENV_USAGE_ANALYSIS_FAILED"
  /** Every blocking finding, aggregated. */
  readonly issues: readonly CompatibilityIssue[]

  constructor(issues: readonly CompatibilityIssue[]) {
    super(
      formatIssues(
        countedHeader("Dependency ownership report generation failed.", "ownership issue", issues),
        issues,
      ),
    )
    this.name = "EnvUsageAnalysisError"
    this.issues = issues
    Error.captureStackTrace?.(this, EnvUsageAnalysisError)
  }
}

/**
 * Thrown by {@link generateEnvArtifacts} when any requested pass (manifest/docs/usage)
 * reports a blocking finding, aggregated across all requested passes into
 * one error.
 *
 * @remarks
 * Nothing from any pass is written when this throws -- see
 * `generate-env-artifacts.ts`'s compute-atomic guarantee (ADR 0011). Write-phase failures
 * (a real I/O error after all computes already passed) are NOT wrapped in
 * this type -- they propagate as whatever `fs.writeFile` itself throws,
 * since by that point some artifacts may already be on disk.
 *
 * `code` is a stable, Stable-tier discriminant for programmatic handling --
 * prefer it over `.name`/`instanceof` when a message-independent switch is needed.
 */
export class EnvProjectGenerationError extends Error {
  /** Stable discriminant for programmatic handling; always `"ENV_PROJECT_GENERATION_FAILED"`. */
  readonly code = "ENV_PROJECT_GENERATION_FAILED"
  /** Every blocking finding, aggregated across all requested passes. */
  readonly issues: readonly CompatibilityIssue[]

  constructor(issues: readonly CompatibilityIssue[]) {
    super(
      formatIssues(countedHeader("Project generation failed.", "blocking issue", issues), issues),
    )
    this.name = "EnvProjectGenerationError"
    this.issues = issues
    Error.captureStackTrace?.(this, EnvProjectGenerationError)
  }
}
