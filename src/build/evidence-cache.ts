import crypto from "node:crypto"
import path from "node:path"
import { discoverSchemaFiles } from "./discover.js"
import { displayPath } from "./display-path.js"
import type { EvidenceModel } from "./evidence-model.js"
import { readEvidenceSnapshot } from "./evidence-snapshot.js"
import { defaultExclude, defaultInclude } from "./generate-manifest.js"
import { computeScanSurface } from "./generate-usage.js"
import { generateEvidenceModel } from "./generate-evidence.js"
import type { GenerateEvidenceModelOptions } from "./generate-evidence.js"
import {
  mergeLocalAndPackageFiles,
  resolveAllowlistedPackages,
} from "./resolution/resolve-package-schema.js"
import type { PackageSchemaResolutionResult } from "./resolution/resolve-package-schema.js"
import { readToolVersion } from "./tool-version.js"
import type { BuildFileSystem } from "./types.js"

/**
 * A fast, honest read path for the persisted evidence artifact -- for a
 * report/projection script, a CI step, or any consumer that just wants the
 * current `EvidenceModel` without paying a full `generateEvidenceModel()`
 * recompute (schema parsing, cross-file linking, the dependency-graph AST
 * scan, all six model builds) on every single invocation, and without ever
 * risking silently-stale data. The mechanism: a cheap content fingerprint,
 * computed from raw file bytes with zero AST work, lets a caller cheaply
 * prove "nothing relevant to evidence generation has changed since this file
 * was last written" before trusting it.
 */

/** Options for {@link computeSourceFingerprint}. */
export interface ComputeSourceFingerprintOptions {
  /** The filesystem capability -- `./build` never imports `node:fs` (ADR 0040). */
  readonly fs: BuildFileSystem
  readonly root: string
  readonly include: readonly string[]
  readonly exclude: readonly string[]
  readonly packages: readonly string[]
}

/**
 * SHA-256 over the raw bytes of every schema file and every usage-scan-
 * surface file (the same file sets `assembleProject()`/`computeScanSurface()`
 * touch), plus env-cap's own installed version -- zero AST parsing or
 * linking. Still requires the discovery/glob walk itself (fingerprinting has
 * to know which files matter), but skips everything after it. Deterministic:
 * file paths are deduplicated and sorted before hashing, so the result never
 * depends on filesystem enumeration order.
 *
 * @remarks
 * Not a timestamp, and never compared as one -- a fresh mtime doesn't prove
 * content is unchanged (a checkout, a rebase, or a touch can all bump it
 * with no real edit), and content is the only thing that actually
 * invalidates a cached evidence artifact.
 */
export async function computeSourceFingerprint(
  options: ComputeSourceFingerprintOptions,
): Promise<string> {
  const { fs, root, include, exclude, packages } = options

  const localSchemaFiles = await discoverSchemaFiles({ fs, root, include, exclude })
  const packageCache = new Map<string, Promise<PackageSchemaResolutionResult>>()
  const { files: packageFiles, origins } = await resolveAllowlistedPackages(
    packages,
    root,
    packageCache,
    fs,
  )
  const schemaFiles = await mergeLocalAndPackageFiles(
    localSchemaFiles,
    packageFiles.map((f) => f.file),
    fs,
  )
  const { scanFiles } = await computeScanSurface(root, exclude, origins, fs)

  const allFiles = [...new Set([...schemaFiles, ...scanFiles])].sort()

  const hash = crypto.createHash("sha256")
  hash.update(readToolVersion())
  for (const file of allFiles) {
    // Root-relative, not the raw absolute path -- an absolute path bakes in
    // wherever this checkout happens to live (e.g. /home/runner/work/... in
    // CI vs a contributor's own machine), so hashing it directly made this
    // fingerprint -- and the committed .fingerprint sidecar that pins it --
    // differ by checkout location alone, with the file's content unchanged.
    hash.update(displayPath(root, file))
    try {
      // Empirically confirmed equivalent to omitting the encoding (and thus
      // getting a Buffer back instead of a string): `hash.update()` accepts
      // either, and for any valid-UTF-8 file (every real TS/JS source file
      // qualifies) a Buffer's raw bytes and its UTF-8-decoded string
      // produce byte-identical SHA-256 digests either way (verified via a
      // real `node -e` comparison, not just reasoning).
      // Stryker disable next-line StringLiteral
      hash.update(await fs.readFile(file, "utf8"))
    } catch {
      // A file the glob walk found but can't be read by the time we hash it
      // (deleted mid-run, a race with another process) -- folded into the
      // hash as a distinct marker so the fingerprint still changes rather
      // than silently treating a vanished file as if it were never there.
      hash.update("(unreadable)")
    }
  }
  return hash.digest("hex")
}

function fingerprintPathFor(evidencePath: string): string {
  return `${evidencePath}.fingerprint`
}

/** Writes `fingerprint`'s paired sidecar for `evidencePath` -- call immediately after writing the evidence artifact itself, so the two files always describe the same moment in the source tree's history. */
export async function writeEvidenceFingerprint(
  evidencePath: string,
  fingerprint: string,
  fs: BuildFileSystem,
): Promise<void> {
  // Empirically confirmed equivalent (real `node -e` byte comparison): the
  // written content is always a sha256 hex digest plus a newline, pure
  // ASCII, which "utf8" and an invalid/empty encoding write out to
  // byte-identical files either way.
  // Stryker disable next-line StringLiteral
  await fs.writeFile(fingerprintPathFor(evidencePath), `${fingerprint}\n`, "utf8")
}

/** Options for {@link getEvidenceModel} -- every `generateEvidenceModel()` option, plus where the cached artifact lives. */
export interface GetEvidenceModelOptions extends GenerateEvidenceModelOptions {
  /** Where the cached evidence artifact (and its `.fingerprint` sidecar) live, e.g. `docs/env.evidence.json`, relative to `root`. Required -- there is no honest default env-cap could guess at for where a project keeps this. */
  readonly location: string
}

/** The result of {@link getEvidenceModel}. */
export interface GetEvidenceModelResult {
  readonly evidence: EvidenceModel
  /** `"hit"` -- the committed evidence artifact's fingerprint matched current source; read from disk, no recompute. `"miss"` -- a real `generateEvidenceModel()` call ran. */
  readonly source: "hit" | "miss"
  /** Set only when `source === "miss"` -- why the cache wasn't trusted, for a caller that wants to log it. */
  readonly missReason: string | undefined
}

/**
 * Trusts the committed evidence artifact at `options.location` only when its
 * paired `.fingerprint` sidecar matches a freshly (cheaply) computed
 * {@link computeSourceFingerprint} -- never on file presence alone, never on
 * a timestamp. On any mismatch (stale fingerprint, missing/corrupt evidence
 * file, no fingerprint sidecar at all), falls back to a real
 * `generateEvidenceModel()` call -- never hard-fails, never silently serves
 * data that might be stale.
 *
 * @remarks
 * Never writes anything. A cache miss here does not self-heal the cache --
 * only an explicit write (`generateEnvArtifacts()`'s `evidence` option)
 * refreshes the committed artifact and its fingerprint together, so "when
 * was this last regenerated" stays under explicit control, never an
 * implicit side effect of a read. Two independent callers hitting the same
 * stale cache both recompute independently; neither one's recompute updates
 * the file the other reads.
 */
export async function getEvidenceModel(
  options: GetEvidenceModelOptions,
): Promise<GetEvidenceModelResult> {
  const root = path.resolve(options.root ?? process.cwd())
  const include = options.include ?? defaultInclude()
  const exclude = options.exclude ?? defaultExclude()
  // Empirically confirmed equivalent even with a garbage non-empty fallback:
  // an unresolvable package name contributes zero files to
  // `computeSourceFingerprint`'s hash (`resolveAllowlistedPackages` never
  // throws for one, per its own doc comment, just resolves nothing) --
  // verified directly (`node -e ...` against a built copy) that the
  // resulting fingerprint is byte-identical whether `packages` is `[]` or
  // `["garbage"]`. `??` vs `&&` is equivalent too: for the common case
  // (`options.packages` omitted, `undefined`), `&&` short-circuits to
  // `undefined` itself rather than `[]` -- but `new Set(undefined)` is
  // spec-defined to produce an empty Set, identical to `new Set([])`.
  // Stryker disable next-line ArrayDeclaration,LogicalOperator
  const packages = options.packages ?? []

  const evidencePath = path.resolve(root, options.location)
  const fingerprintPath = fingerprintPathFor(evidencePath)

  const recompute = async (missReason: string): Promise<GetEvidenceModelResult> => ({
    evidence: await generateEvidenceModel(options),
    source: "miss",
    missReason,
  })

  // Genuinely hard to trigger through the public API in isolation from
  // `recompute()`'s own `generateEvidenceModel()` call: both share the same
  // `discoverSchemaFiles`/`resolveAllowlistedPackages` machinery, so a
  // fault that breaks fingerprint computation (tried: a nonexistent `root`)
  // breaks evidence generation identically, and `recompute()` itself throws
  // uncaught before this catch's own behavior could ever be observed
  // in isolation; `resolveAllowlistedPackages` is also explicitly documented
  // ("never throw here") not to throw for a malformed entry. Kept as real,
  // defensive error handling regardless -- `fs.readFile` failures inside
  // `computeSourceFingerprint`'s per-file loop are already caught there
  // (see the "(unreadable)" marker above), so what could still reach here
  // is deliberately unclear/future-proofing, not a known-reachable path.
  let currentFingerprint: string
  // Stryker disable BlockStatement, StringLiteral
  try {
    currentFingerprint = await computeSourceFingerprint({
      fs: options.fs,
      root,
      include,
      exclude,
      packages,
    })
  } catch (error) {
    return recompute(
      `could not compute a source fingerprint (${error instanceof Error ? error.message : String(error)})`,
    )
  }
  // Stryker restore BlockStatement, StringLiteral

  let storedFingerprint: string
  try {
    storedFingerprint = (await options.fs.readFile(fingerprintPath, "utf8")).trim()
  } catch {
    return recompute(`no fingerprint sidecar found at ${fingerprintPath}`)
  }

  if (storedFingerprint !== currentFingerprint) {
    return recompute(
      "source fingerprint changed since the committed evidence artifact was last generated",
    )
  }

  const read = await readEvidenceSnapshot(evidencePath, options.fs)
  if (read.status !== "ok") {
    return recompute(
      read.status === "missing"
        ? `no evidence artifact found at ${evidencePath}`
        : read.status === "invalid-json"
          ? `evidence artifact at ${evidencePath} could not be parsed as JSON (${read.detail})`
          : `evidence artifact at ${evidencePath} has an unrecognized schemaVersion (${JSON.stringify(read.foundVersion)})`,
    )
  }

  return { evidence: read.snapshot, source: "hit", missReason: undefined }
}
