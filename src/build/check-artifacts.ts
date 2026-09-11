import type { EvidenceModel } from "./evidence-model.js"
import { normalizeEvidenceSnapshotForComparison } from "./evidence-snapshot.js"
import { computeArtifacts } from "./generate-env-artifacts.js"
import type { GenerateEnvArtifactsOptions } from "./generate-env-artifacts.js"
import { renderManifest } from "./manifest.js"
import { normalizeDocsForComparison, renderDocs } from "./docs.js"
import type { UndocumentedContractRef, UndocumentedVariableRef } from "./docs.js"
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

// `catch { return undefined }` below is this function's LAST statement --
// an empty catch body would already fall through to the exact same
// implicit `undefined` return, making the block's own content
// unobservable either way (this repo's `noImplicitReturns` still requires
// an explicit `return` somewhere on this path, so the block can never be
// truly empty; whatever's left inside it stays a Stryker BlockStatement
// magnet regardless of exact wording). Hand-verified directly (mutating
// the source to a genuinely empty `catch {}` and running the real test
// suite) -- every test still passes. A disable comment placed at several
// narrower points (on `return undefined` itself; directly above `catch`;
// an unscoped disable/restore pair bracketing just the catch clause) did
// NOT reliably suppress this specific mutant across repeated verification
// runs (Stryker's directive attachment is AST-leading-comment-based, and
// nothing inside this small function gave it an unambiguous anchor) --
// bracketing the WHOLE function declaration, matching the pattern that
// reliably works for a no-op function body elsewhere in this codebase
// (see `runtime/document.ts`'s `documentEnv()`), is what finally holds.
// Stryker disable BlockStatement
async function readIfExists(filePath: string, fs: BuildFileSystem): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, "utf8")
  } catch {
    return undefined
  }
}
// Stryker restore BlockStatement

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

  // `c.manifestOptions && c.manifestComputed` is runtime-redundant given
  // the third clause: `generate-env-artifacts.ts`'s `computeArtifacts()`
  // only ever sets `manifestOutputPath` inside its own `if (manifestOptions)`
  // block, and `manifestComputed` is unconditionally `manifestOptions ?
  // computeManifest(...) : undefined` -- so `manifestOutputPath` truthy
  // already implies both. Kept for TS narrowing (`c.manifestComputed
  // .activeContracts` below needs `manifestComputed` narrowed away from
  // `| undefined`, which isn't inferrable from a same-object-but-different-
  // field check).
  // Stryker disable next-line ConditionalExpression, LogicalOperator
  if (c.manifestOptions && c.manifestComputed && c.manifestOutputPath) {
    const expected = renderManifest(c.manifestComputed.activeContracts, c.manifestOutputPath)
    findings.push(await compareTextArtifact("manifest", c.manifestOutputPath, expected, options.fs))
  }

  // `c.docsOptions` alone already implies `c.docsPath` will be set too
  // (`computeArtifacts()` only ever sets `docsPath` inside its own `if
  // (docsOptions)` block) -- same class as the manifest/envExample/usage
  // guards elsewhere in this function. Kept for the same TS-narrowing
  // reason (`c.docsPath`'s own type is `string | undefined`). Hand-verified:
  // replacing `&&` with `||` and running the full `vitest run` leaves every
  // test but the two tsc-backed json-schema ones passing.
  // Stryker disable next-line LogicalOperator
  if (c.docsOptions && c.docsPath) {
    const previousContent = await readIfExists(c.docsPath, options.fs)
    const expected = renderDocs(c.docsComputed.contractModelContracts, {
      expiringWithinDays: c.docsOptions.expiringWithinDays ?? DEFAULT_EXPIRING_WITHIN_DAYS,
      undocumentedContracts: c.docsComputed.documentation.undocumentedContracts.map(
        (ref): UndocumentedContractRef => relativizeRef(c.root, ref),
      ),
      // `RenderDocsOptions.undocumentedVariables` is consumed by `renderDocs()`
      // ONLY via `.length` (the security-review counter), never by content
      // or identity -- same equivalence already established for
      // `generate-documentation.ts`'s identical call site. Hand-verified:
      // mapping every entry to `undefined` instead and running the full
      // `vitest run` leaves every test passing.
      // Stryker disable ArrowFunction
      undocumentedVariables: c.docsComputed.documentation.undocumentedVariables.map(
        (ref): UndocumentedVariableRef => relativizeRef(c.root, ref),
      ),
      // Stryker restore ArrowFunction
      generatedAt: c.generatedAt,
      previousContent,
    })
    findings.push(
      await compareTextArtifact(
        "docs",
        c.docsPath,
        expected,
        options.fs,
        normalizeDocsForComparison,
      ),
    )

    // `c.docsOptions.envExample` is runtime-redundant here too, same
    // reasoning as the manifest check above: `computeArtifacts()` only ever
    // sets `envExamplePath` inside its own `if (docsOptions.envExample)`
    // block, so `envExamplePath` truthy already implies it. `docsOptions
    // .envExample`'s own value is never read past this line (only used as
    // a truthy gate) -- kept for readability/documentation of intent, not
    // because anything downstream needs it narrowed.
    // Stryker disable next-line ConditionalExpression, LogicalOperator
    if (c.docsOptions.envExample && c.envExamplePath) {
      const existing = await readIfExists(c.envExamplePath, options.fs)
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

  // `c.usageOptions` is runtime-redundant here too, same reasoning as the
  // manifest/envExample guards above: `computeArtifacts()` only ever sets
  // `usageReportPath` inside its own `if (usageOptions?.report)` block, so
  // `usageReportPath` truthy already implies `usageOptions` (and its
  // `.report`) are too.
  // Stryker disable next-line LogicalOperator
  if (c.usageOptions && c.usageReportPath) {
    const expected = renderUsageReport(c.usageComputed.result)
    findings.push(await compareTextArtifact("usage", c.usageReportPath, expected, options.fs))
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
