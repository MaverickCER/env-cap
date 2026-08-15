import type { ManifestChangeReport } from "./manifest-snapshot.js"

/**
 * The sixth of env-cap's seven canonical fact models (ADR 0024) -- what
 * changed since the last committed manifest snapshot. See ADR 0030.
 *
 * @remarks
 * Wraps the existing `ManifestChangeReport` (ADR 0021) rather than
 * replacing it -- that type, and the manifest-generation consumer surface
 * built on it, stay exactly as they are. This model exists to give the
 * change report a versioned, model-namespaced shape Evidence Model can
 * assemble against, alongside the other six models.
 */

/** Bump only when a reader could misinterpret the new shape -- same discipline every other canonical model's `schemaVersion` follows. */
export const CHANGE_MODEL_SCHEMA_VERSION = 1

export interface ChangeModel {
  readonly schemaVersion: typeof CHANGE_MODEL_SCHEMA_VERSION
  /** The existing manifest change report, unmodified -- see ADR 0021. */
  readonly manifest: ManifestChangeReport
}

/** Wraps an already-computed `ManifestChangeReport` (e.g. `GenerateEnvManifestResult.changes`) in the Change Model's versioned shape. Does no computation of its own. */
export function buildChangeModel(manifest: ManifestChangeReport): ChangeModel {
  return { schemaVersion: CHANGE_MODEL_SCHEMA_VERSION, manifest }
}
