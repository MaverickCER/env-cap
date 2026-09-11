import { discoverSchemaFiles } from "./discover.js"
import { linkFiles } from "./link.js"
import type { LinkResult } from "./link.js"
import type { ParseWarning } from "./parse.js"
import type { BuildFileSystem } from "./types.js"
import type { ImportResolutionContext } from "./resolution/resolve-import.js"
import {
  mergeLocalAndPackageFiles,
  resolveAllowlistedPackages,
} from "./resolution/resolve-package-schema.js"
import type {
  PackageOrigin,
  PackageSchemaResolutionResult,
} from "./resolution/resolve-package-schema.js"
import {
  createAliasResolutionCache,
  loadTsconfigPaths,
} from "./resolution/resolve-tsconfig-paths.js"

/** Options for {@link assembleProject}. */
export interface AssembleProjectOptions {
  /** The filesystem capability -- `./build` never imports `node:fs` (ADR 0040). */
  readonly fs: BuildFileSystem
  readonly root: string
  readonly include: readonly string[]
  readonly exclude: readonly string[]
  readonly packages: readonly string[]
  readonly tsconfig: string | false | undefined
}

/**
 * Everything downstream model-building and artifact-rendering needs from one
 * discovery+link pass: the linked contract graph, the import-resolution
 * context every later resolution call (`computeScanSurface()`,
 * `buildDependencyModel()`, ...) must reuse to agree with `linkResult`, and a
 * shared file-read cache so a file matched by more than one later pass'
 * glob (e.g. a schema file also matched by the usage pass' broader
 * `SCAN_INCLUDE`) is only ever read from disk once.
 */
export interface AssembledProject {
  readonly root: string
  readonly readFileCached: (filePath: string) => Promise<string>
  readonly linkResult: LinkResult
  readonly context: ImportResolutionContext
  /** Keyed by resolved file path -- see `resolveAllowlistedPackages()`. */
  readonly origins: ReadonlyMap<string, PackageOrigin>
  readonly packageWarnings: readonly ParseWarning[]
  readonly tsconfigWarnings: readonly ParseWarning[]
}

/**
 * The one shared discovery+link pass every orchestrator needs -- local +
 * allow-listed-package schema discovery, tsconfig path-alias resolution, and
 * cross-file linking, exactly once. Extracted from what `computeArtifacts()`
 * (`generate-env-artifacts.ts`) and `generateEvidenceModel()`
 * (`generate-evidence.ts`) each used to run independently, so the two
 * orchestrators can never silently drift into scanning the same source tree
 * twice -- the same "shared discovery, computed once" principle ADR 0011
 * already established for manifest/docs/usage, now shared with evidence
 * assembly too.
 */
export async function assembleProject(options: AssembleProjectOptions): Promise<AssembledProject> {
  const { fs, root, include, exclude, packages, tsconfig } = options

  const fileCache = new Map<string, Promise<string>>()
  const readFileCached = (filePath: string): Promise<string> => {
    let cached = fileCache.get(filePath)
    if (!cached) {
      cached = fs.readFile(filePath, "utf8")
      fileCache.set(filePath, cached)
    }
    return cached
  }

  const localSchemaFiles = await discoverSchemaFiles({ fs, root, include, exclude })
  const packageCache = new Map<string, Promise<PackageSchemaResolutionResult>>()
  const {
    files: packageFiles,
    origins,
    warnings: packageWarnings,
  } = await resolveAllowlistedPackages(packages, root, packageCache, fs)
  const schemaFiles = await mergeLocalAndPackageFiles(
    localSchemaFiles,
    packageFiles.map((f) => f.file),
    fs,
  )
  const { resolution: tsconfigPaths, warning: tsconfigWarning } = await loadTsconfigPaths(
    root,
    tsconfig,
    fs,
  )
  const tsconfigWarnings = tsconfigWarning ? [tsconfigWarning] : []

  const context: ImportResolutionContext = {
    fs,
    root,
    packages,
    cache: packageCache,
    tsconfigPaths,
    aliasCache: createAliasResolutionCache(),
  }
  const linkResult = await linkFiles(schemaFiles, readFileCached, context, origins)

  return { root, readFileCached, linkResult, context, origins, packageWarnings, tsconfigWarnings }
}
