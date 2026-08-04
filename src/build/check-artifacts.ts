import { promises as fs } from "node:fs"
import { computeArtifacts } from "./generate-env-artifacts.js"
import type { GenerateEnvArtifactsOptions } from "./generate-env-artifacts.js"
import { renderManifest } from "./manifest.js"
import { normalizeDocsForComparison, renderDocs } from "./docs.js"
import { DEFAULT_EXPIRING_WITHIN_DAYS } from "./generate-documentation.js"
import { renderUsageReport } from "./usage-report.js"
import { computeReconciliation } from "./env-example.js"
import { EnvProjectGenerationError } from "./errors.js"

/**
 * `--check` / drift-guard support: computes every requested artifact exactly
 * as a real run would, but never writes to any of the four real target
 * paths. See ADR 0016.
 */

/** One artifact's drift status, as found by {@link checkEnvArtifacts}. */
export interface ArtifactCheckFinding {
  /** Which of the four generated artifacts this finding is about. */
  readonly artifact: "manifest" | "docs" | "envExample" | "usage"
  /** Absolute path the artifact would be written to. */
  readonly path: string
  /** `"missing"` if the file doesn't exist yet, `"stale"` if it exists but differs from what a real run would produce. */
  readonly status: "ok" | "stale" | "missing"
  /** Human-readable detail, set for `"stale"`/`"missing"` findings. */
  readonly detail?: string
}

/** The result of a completed {@link checkEnvArtifacts} run. */
export interface CheckEnvArtifactsResult {
  /** `true` iff every requested artifact is `"ok"`. */
  readonly ok: boolean
  /** One entry per requested artifact. */
  readonly findings: readonly ArtifactCheckFinding[]
}

async function readIfExists(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, "utf8")
  } catch {
    return undefined
  }
}

async function compareTextArtifact(
  artifact: ArtifactCheckFinding["artifact"],
  filePath: string,
  expected: string,
  normalize: (s: string) => string = (s) => s,
): Promise<ArtifactCheckFinding> {
  const actual = await readIfExists(filePath)
  if (actual === undefined)
    return { artifact, path: filePath, status: "missing", detail: "not yet generated" }
  if (normalize(actual) === normalize(expected)) return { artifact, path: filePath, status: "ok" }
  return {
    artifact,
    path: filePath,
    status: "stale",
    detail: "generated content differs from what's committed",
  }
}

/**
 * Verifies every requested artifact (`manifest`/`docs`/`envExample`/`usage`)
 * matches what a real {@link generateEnvArtifacts} run would produce, without
 * writing anything.
 *
 * @remarks
 * `--check` reports drift, it doesn't paper over a run that would otherwise fail --
 * see `@throws` below.
 *
 * @throws {EnvProjectGenerationError} On the same blocking findings a real run would throw on.
 */
export async function checkEnvArtifacts(
  options: GenerateEnvArtifactsOptions,
): Promise<CheckEnvArtifactsResult> {
  const c = await computeArtifacts(options)
  if (c.blocking.length > 0) throw new EnvProjectGenerationError(c.blocking)

  const findings: ArtifactCheckFinding[] = []

  if (c.manifestOptions && c.manifestComputed && c.manifestOutputPath) {
    const expected = renderManifest(c.manifestComputed.activeContracts, c.manifestOutputPath)
    findings.push(await compareTextArtifact("manifest", c.manifestOutputPath, expected))
  }

  if (c.docsOptions && c.docsComputed && c.docsPath) {
    const previousContent = await readIfExists(c.docsPath)
    const expected = renderDocs(c.docsContracts, c.root, {
      expiringWithinDays: c.docsOptions.expiringWithinDays ?? DEFAULT_EXPIRING_WITHIN_DAYS,
      undocumentedContracts: c.docsComputed.documentation.undocumentedContracts,
      undocumentedVariables: c.docsComputed.documentation.undocumentedVariables,
      generatedAt: c.generatedAt,
      previousContent,
    })
    findings.push(
      await compareTextArtifact("docs", c.docsPath, expected, normalizeDocsForComparison),
    )

    if (c.docsOptions.envExample && c.envExamplePath) {
      const existing = await readIfExists(c.envExamplePath)
      if (existing === undefined) {
        findings.push({
          artifact: "envExample",
          path: c.envExamplePath,
          status: "missing",
          detail: "not yet generated",
        })
      } else {
        const { staleVariables, variablesToComment, variablesToAdd } = computeReconciliation(
          c.docsContracts,
          existing,
        )
        const driftCount = staleVariables.length + variablesToComment.length + variablesToAdd.length
        findings.push({
          artifact: "envExample",
          path: c.envExamplePath,
          status: driftCount > 0 ? "stale" : "ok",
          detail:
            driftCount > 0
              ? `${staleVariables.length} stale, ${variablesToComment.length} to comment, ${variablesToAdd.length} to add`
              : undefined,
        })
      }
    }
  }

  if (c.usageOptions && c.usageComputed && c.usageReportPath) {
    const expected = renderUsageReport(c.usageComputed.result)
    findings.push(await compareTextArtifact("usage", c.usageReportPath, expected))
  }

  return { ok: findings.every((f) => f.status === "ok"), findings }
}
