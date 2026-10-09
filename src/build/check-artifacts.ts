import type { EvidenceModel } from "./evidence-model.js"
import { normalizeEvidenceSnapshotForComparison } from "./evidence-snapshot.js"
import { computeArtifacts } from "./generate-env-artifacts.js"
import type { GenerateEnvArtifactsOptions } from "./generate-env-artifacts.js"
import { renderManifest } from "./manifest.js"
import { normalizeDocsForComparison, renderDocs } from "./docs.js"
import type { UndocumentedContractRef } from "./docs.js"
import { DEFAULT_EXPIRING_WITHIN_DAYS, relativizeRef } from "./generate-documentation.js"
import { renderUsageReport } from "./usage-report.js"
import { computeReconciliation } from "./env-example.js"
import { EnvProjectGenerationError } from "./errors.js"
import type { BuildFileSystem } from "./types.js"

/**
 * `--check` / drift-guard support: computes every requested artifact exactly
 * as a real run would, but never writes to any of the four real target
 * paths. See ADR 0016.
 */

/** One artifact's drift status, as found by {@link checkEnvArtifacts}. */
export interface ArtifactCheckFinding {
  /** Which generated artifact this finding is about. */
  readonly artifact: "manifest" | "docs" | "envExample" | "usage" | "evidence"
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

// A file that cannot be read (absent, unreadable) is reported as missing rather than thrown.
function readIfExists(filePath: string, fs: BuildFileSystem): Promise<string | undefined> {
  return fs.readFile(filePath, "utf8").catch(() => undefined)
}

/**
 * Parses `text` as an `EvidenceModel` and re-serializes it with
 * `provenance.generatedAt` normalized out (see `normalizeEvidenceSnapshotForComparison()`)
 * -- so `--check` never reports drift solely because a fresh render's
 * timestamp differs from the committed file's. A parse failure returns
 * `text` unchanged, so a corrupted on-disk file simply fails to match
 * `expected`'s normalized form (reported as `"stale"`), rather than
 * crashing `--check` itself.
 */
/** @internal Exported for direct unit coverage -- reached through `checkEnvArtifacts()`'s `--evidence` pass in production, but the exact "returns text unchanged, not undefined/thrown" catch behavior isn't independently observable through that public path (any malformed `actual` already reads as "stale" against a well-formed `expected`, regardless of the catch's exact return value). */
export function normalizeEvidenceJsonForComparison(text: string): string {
  try {
    const parsed = JSON.parse(text) as EvidenceModel
    return JSON.stringify(normalizeEvidenceSnapshotForComparison(parsed), null, 2)
  } catch {
    return text
  }
}

async function compareTextArtifact(
  artifact: ArtifactCheckFinding["artifact"],
  filePath: string,
  expected: string,
  fs: BuildFileSystem,
  normalize: (s: string) => string = (s) => s,
): Promise<ArtifactCheckFinding> {
  const actual = await readIfExists(filePath, fs)
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

  if (c.manifest) {
    const expected = renderManifest(c.manifest.computed.activeContracts, c.manifest.outputPath)
    findings.push(
      await compareTextArtifact("manifest", c.manifest.outputPath, expected, options.fs),
    )
  }

  if (c.docs) {
    const previousContent = await readIfExists(c.docs.path, options.fs)
    const expected = renderDocs(c.docsComputed.contractModelContracts, {
      expiringWithinDays: c.docs.options.expiringWithinDays ?? DEFAULT_EXPIRING_WITHIN_DAYS,
      undocumentedContracts: c.docsComputed.documentation.undocumentedContracts.map(
        (ref): UndocumentedContractRef => relativizeRef(c.root, ref),
      ),
      undocumentedVariables: c.docsComputed.documentation.undocumentedVariables,
      generatedAt: c.generatedAt,
      previousContent,
    })
    findings.push(
      await compareTextArtifact(
        "docs",
        c.docs.path,
        expected,
        options.fs,
        normalizeDocsForComparison,
      ),
    )

    if (c.docs.envExamplePath !== undefined) {
      const existing = await readIfExists(c.docs.envExamplePath, options.fs)
      if (existing === undefined) {
        findings.push({
          artifact: "envExample",
          path: c.docs.envExamplePath,
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
          path: c.docs.envExamplePath,
          status: driftCount > 0 ? "stale" : "ok",
          // exactOptionalPropertyTypes: omit the key entirely rather than
          // set it to `undefined` -- `detail` is absent when there's
          // nothing to report, not present-but-empty.
          ...(driftCount > 0
            ? {
                detail: `${staleVariables.length} stale, ${variablesToComment.length} to comment, ${variablesToAdd.length} to add`,
              }
            : {}),
        })
      }
    }
  }

  if (c.usage?.reportPath !== undefined) {
    const expected = renderUsageReport({
      ...c.usageComputed.result,
      parseWarnings: [...c.packageWarnings, ...c.linkWarnings],
    })
    findings.push(await compareTextArtifact("usage", c.usage.reportPath, expected, options.fs))
  }

  if (c.evidencePath) {
    const expected = JSON.stringify(c.evidence, null, 2)
    findings.push(
      await compareTextArtifact(
        "evidence",
        c.evidencePath,
        expected,
        options.fs,
        normalizeEvidenceJsonForComparison,
      ),
    )
  }

  return { ok: findings.every((f) => f.status === "ok"), findings }
}
