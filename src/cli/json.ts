import { readFileSync } from "node:fs"
import type { CompatibilityIssue, GenerateEnvArtifactsResult } from "../build/index.js"

/**
 * `--json`'s machine-readable contract lives here, in one place, so it's
 * unit/snapshot-testable without going through `main()`'s stdout spying and
 * doesn't make the CLI's control-flow function the de facto owner of a
 * public contract. See ADR 0013.
 */

/** Bump only when a consumer written for the previous version could
 *  misinterpret the new payload (a field changes type/meaning, or is
 *  removed) -- NOT for every additive field. See ADR 0013. */
export const JSON_SCHEMA_VERSION = 1
const JSON_KIND = "env-cap-report"

// Read once per process, not once per invocation of serializeSuccess()/
// serializeFailure() -- resolved via import.meta.url (not process.cwd()) so
// it always reflects the installed package's own version regardless of
// where the CLI is invoked from (npx, a local devDependency, a global install).
const TOOL_VERSION: string = (
  JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
    version: string
  }
).version

/** The `--json` envelope for a successful run (generation completed without throwing). */
export interface JsonSuccessPayload extends GenerateEnvArtifactsResult {
  readonly schemaVersion: typeof JSON_SCHEMA_VERSION
  readonly kind: typeof JSON_KIND
  readonly toolVersion: string
  readonly ok: true
  /** Present only when invoked with --check. Governs --check's own pass/fail
   *  exit code, independent of this envelope's top-level `ok` (which keeps
   *  its existing, unrelated meaning: "did generation complete without
   *  throwing"). See ADR 0016. */
  readonly checkResult?: { readonly ok: boolean; readonly stale: readonly string[] }
}

/** A thrown error's shape in the `--json` envelope. */
export interface JsonErrorInfo {
  readonly name: string
  readonly message: string
  /** Populated only when the thrown error carries a `CompatibilityIssue[]` (the generator errors in `build/errors.ts` all do). */
  readonly issues?: readonly CompatibilityIssue[]
}

/** The `--json` envelope for a failed run (generation threw). */
export interface JsonErrorPayload {
  readonly schemaVersion: typeof JSON_SCHEMA_VERSION
  readonly kind: typeof JSON_KIND
  readonly toolVersion: string
  readonly ok: false
  readonly error: JsonErrorInfo
}

function hasIssues(error: unknown): error is { issues: readonly CompatibilityIssue[] } {
  return (
    typeof error === "object" &&
    error !== null &&
    Array.isArray((error as { issues?: unknown }).issues)
  )
}

/** Wraps a completed {@link generateEnvArtifacts} result in the `--json` success envelope. */
export function serializeSuccess(
  result: GenerateEnvArtifactsResult,
  checkResult?: { readonly ok: boolean; readonly stale: readonly string[] },
): JsonSuccessPayload {
  return {
    schemaVersion: JSON_SCHEMA_VERSION,
    kind: JSON_KIND,
    toolVersion: TOOL_VERSION,
    ok: true,
    ...result,
    ...(checkResult ? { checkResult } : {}),
  }
}

/** Wraps a thrown error in the `--json` failure envelope. */
export function serializeFailure(error: unknown): JsonErrorPayload {
  return {
    schemaVersion: JSON_SCHEMA_VERSION,
    kind: JSON_KIND,
    toolVersion: TOOL_VERSION,
    ok: false,
    error: {
      name: error instanceof Error ? error.name : "Error",
      message: error instanceof Error ? error.message : String(error),
      issues: hasIssues(error) ? error.issues : undefined,
    },
  }
}

/**
 * The complete `--json` envelope shape, success or failure -- the target
 * type the published JSON Schema (`schemas/env-cap-report.schema.json`,
 * `npm run schema`) is generated from. See ADR 0019.
 */
export type JsonReportPayload = JsonSuccessPayload | JsonErrorPayload

/** Writes a `--json` envelope to stdout, pretty-printed with a trailing newline. */
export function writeJson(payload: JsonReportPayload): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
}
