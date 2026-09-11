import {
  readToolVersion,
  type CompatibilityIssue,
  type GenerateEnvArtifactsResult,
} from "../build/index.js"

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

// One version source, shared with the `./build` entry -- `readToolVersion()`
// returns `tsup`'s build-time constant, so the CLI never reads its own
// manifest at runtime. See ADR 0040.
const TOOL_VERSION: string = readToolVersion()

/**
 * Which passes this invocation actually asked for -- recorded explicitly so a
 * consumer never has to infer intent from which top-level keys happen to be
 * present.
 *
 * @remarks
 * Without this, `"manifest": undefined` is genuinely ambiguous: it could mean
 * "no `--location` was passed" or "the manifest pass ran and produced
 * nothing," and telling those apart required knowing which CLI flags the run
 * was invoked with -- information the envelope itself never carried. A CI step
 * gating on "did the docs pass run?" would otherwise have to reconstruct the
 * command line. `evidence` records the request specifically (the model itself
 * is always computed, per ADR 0038, but only *included* in this envelope on
 * request -- see `JsonSuccessPayload.evidence`).
 */
export interface JsonRequestedPasses {
  /** `--location` was passed. */
  readonly manifest: boolean
  /** `--docs` was passed. */
  readonly docs: boolean
  /** `--ownership` was passed. */
  readonly usage: boolean
  /** `--evidence` was passed. */
  readonly evidence: boolean
}

/** The `--json` envelope for a successful run (generation completed without throwing). */
export interface JsonSuccessPayload extends Omit<GenerateEnvArtifactsResult, "evidence"> {
  readonly schemaVersion: typeof JSON_SCHEMA_VERSION
  readonly kind: "env-cap-report"
  readonly toolVersion: string
  readonly ok: true
  /** Which passes this invocation requested -- always present, so "not requested" is never confused with "computed empty." See {@link JsonRequestedPasses}. */
  readonly requested: JsonRequestedPasses
  /** Present only when the caller actually requested `--evidence` --
   *  `GenerateEnvArtifactsResult.evidence` itself is always populated (ADR
   *  0038, "free to compute, always real"), but the `--json` envelope omits
   *  it by default so an ordinary `--location`/`--docs`/`--ownership` report
   *  doesn't silently grow by the full evidence model every time. */
  readonly evidence?: GenerateEnvArtifactsResult["evidence"]
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
  readonly kind: "env-cap-report"
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

/**
 * Wraps a completed {@link generateEnvArtifacts} result in the `--json`
 * success envelope. `includeEvidence` (default `false`) controls whether
 * `result.evidence` -- always populated on `result` itself, per ADR 0038 --
 * is actually included in the envelope; the CLI passes `true` only when the
 * caller requested `--evidence`.
 *
 * `requested` is supplied by the caller rather than inferred from `result`'s
 * own populated keys -- inferring it would reproduce exactly the ambiguity
 * this field exists to remove (see {@link JsonRequestedPasses}). It defaults
 * to deriving each pass from whether its result is present, which is correct
 * for a normal generate run and keeps this callable from a test without
 * threading flags through; the CLI always passes the real flags.
 */
export function serializeSuccess(
  result: Omit<GenerateEnvArtifactsResult, "evidence"> &
    Partial<Pick<GenerateEnvArtifactsResult, "evidence">>,
  checkResult?: { readonly ok: boolean; readonly stale: readonly string[] },
  includeEvidence = false,
  requested?: JsonRequestedPasses,
): JsonSuccessPayload {
  const { evidence, ...rest } = result
  return {
    schemaVersion: JSON_SCHEMA_VERSION,
    kind: "env-cap-report",
    toolVersion: TOOL_VERSION,
    ok: true,
    requested: requested ?? {
      manifest: rest.manifest !== undefined,
      docs: rest.docs !== undefined,
      usage: rest.usage !== undefined,
      evidence: includeEvidence,
    },
    ...rest,
    ...(includeEvidence ? { evidence } : {}),
    ...(checkResult ? { checkResult } : {}),
  }
}

/** Wraps a thrown error in the `--json` failure envelope. */
export function serializeFailure(error: unknown): JsonErrorPayload {
  return {
    schemaVersion: JSON_SCHEMA_VERSION,
    kind: "env-cap-report",
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
