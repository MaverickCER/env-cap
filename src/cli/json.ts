import type { CompatibilityIssue, GenerateEnvArtifactsResult } from "../build/index.js"
// Imported from the leaf module, not the `../build/index.js` barrel. The
// barrel eagerly loads its full build-time surface, including (indirectly)
// `typescript`, an optional peer dependency. Loading it to read a version
// string would slow every CLI invocation that loads this module. That
// includes `env-cap init` and `env-cap --help`, which never run build-time
// analysis. src/cli/index.ts imports the barrel lazily for the same reason.
// test/cli/init-no-build-import.test.ts guards both.
import { readToolVersion } from "../build/tool-version.js"

/**
 * The machine-readable contract of `--json` lives here, in one place. Tests
 * can snapshot it without spying on the stdout of `main()`. And the CLI's
 * control-flow function does not become the owner of a public contract.
 * See ADR 0013.
 */

/** Bump only when a consumer written for the previous version could
 *  misinterpret the new payload: a field changes type or meaning, or is
 *  removed. An additive field keeps the version. See ADR 0013. */
export const JSON_SCHEMA_VERSION = 1

// One version source, shared with the `./build` entry: `readToolVersion()`
// returns `tsup`'s build-time constant, so the CLI never reads its own
// manifest at runtime. See ADR 0040.
const TOOL_VERSION: string = readToolVersion()

/**
 * Which passes this invocation actually asked for: recorded explicitly so a
 * consumer never has to infer intent from which top-level keys happen to be
 * present.
 *
 * @remarks
 * Without this, `"manifest": undefined` is ambiguous. It could mean that no
 * `--location` was passed, or that the manifest pass ran and produced nothing.
 * Telling those apart needs the CLI flags of the run, and the envelope
 * never carries them. A CI step
 * gating on "did the docs pass run?" would otherwise have to reconstruct the
 * command line. `evidence` records the request specifically (the model itself
 * is always computed, per ADR 0038, but only *included* in this envelope on
 * request: see `JsonSuccessPayload.evidence`).
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
  /** Which passes this invocation requested: always present, so "not requested" is never confused with "computed empty." See {@link JsonRequestedPasses}. */
  readonly requested: JsonRequestedPasses
  /** Present only when the caller requested `--evidence`.
   *  `GenerateEnvArtifactsResult.evidence` itself is always populated (ADR
   *  0038, "free to compute, always real"). The `--json` envelope omits it by
   *  default so an ordinary `--location` report doesn't silently grow by the
   *  full evidence model every time. */
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
 * success envelope. `result.evidence` is always populated (ADR 0038).
 * `includeEvidence` (default `false`) decides whether the envelope carries it.
 * The CLI passes `true` only when the caller requested `--evidence`.
 *
 * The caller supplies `requested` because inferring it from the populated keys
 * of `result` would recreate the ambiguity this field removes (see
 * {@link JsonRequestedPasses}). By default each pass counts as requested when
 * its result is present. That is correct for a normal generate run, and it
 * lets a test call this without threading flags through. The CLI always
 * passes the real flags.
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

/**
 * The `--json` success envelope for `--check`, which writes nothing: every pass result is absent by
 * construction, so `requested` alone says which artifacts the run checked.
 */
export function serializeCheckSuccess(
  checkResult: { readonly ok: boolean; readonly stale: readonly string[] },
  requested: JsonRequestedPasses,
): JsonSuccessPayload {
  return serializeSuccess(
    { manifest: undefined, docs: undefined, usage: undefined },
    checkResult,
    false,
    requested,
  )
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
      // exactOptionalPropertyTypes: omit the key rather than set it to
      // `undefined` when the thrown error carries no issues of its own.
      ...(hasIssues(error) ? { issues: error.issues } : {}),
    },
  }
}

/**
 * The complete `--json` envelope shape, success or failure: the target
 * type the published JSON Schema (`schemas/env-cap-report.schema.json`,
 * `npm run schema`) is generated from. See ADR 0019.
 */
export type JsonReportPayload = JsonSuccessPayload | JsonErrorPayload

/** Writes a `--json` envelope to stdout, pretty-printed with a trailing newline. */
export function writeJson(payload: JsonReportPayload): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
}
