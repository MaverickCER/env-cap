import { createRequire } from "node:module"
import fs from "node:fs/promises"
import path from "node:path"
import type { ParseWarning } from "../parse.js"
import { isWithinDirectory } from "./resolve-within-root.js"

/**
 * Cross-package schema discovery (ADR 0014, Experimental -- see VERSIONING.md).
 *
 * Resolves an explicitly allow-listed installed package name to the one
 * schema file it declares via its own `"envCap": { "schema": "<path>" }`
 * package.json field. Every step here is `createRequire(...).resolve(...)`,
 * `fs.stat`/`fs.realpath`/`fs.readFile` on a path already fully known --
 * never a `readdir` walk of any directory, named package or not. This is a
 * completely separate code path from `discover.ts`'s `discoverSchemaFiles()`,
 * which continues to unconditionally prune `node_modules` during its own
 * walk exactly as before; the two never overlap.
 *
 * This module only ever locates a file. It never imports, requires, or
 * executes it -- a package-resolved file is fed into the exact same
 * `parseSchemaFile()`/AST-only pipeline as a locally-discovered file,
 * indistinguishable from it after resolution. See ADR 0002 and ADR 0014.
 */

export const SCHEMA_FILE_EXTENSIONS = [".ts", ".tsx"] as const

/** 1 MiB. New hardening specific to this trust tier -- a package crosses a
 *  real versioning/trust boundary that locally-discovered source doesn't,
 *  so this caps the cost of parsing an oversized or adversarial file before
 *  any of its content is even read into memory. See ADR 0014. */
export const MAX_PACKAGE_SCHEMA_FILE_BYTES = 1_048_576

const PACKAGE_JSON_ANCESTOR_SEARCH_LIMIT = 8

export type PackageResolutionFailureCode =
  | "PACKAGE_NOT_FOUND"
  | "MALFORMED_PACKAGE_JSON"
  | "FIELD_MISSING"
  | "INVALID_EXTENSION"
  | "OUTSIDE_PACKAGE"
  | "FILE_TOO_LARGE"

/** Both the authored and resolved forms are kept -- diagnostics benefit from
 *  showing exactly what a package author wrote versus what it resolved to. */
export interface PackageOrigin {
  /** The allow-listed package name that declared this schema. */
  readonly packageName: string
  /** The `"envCap.schema"` value exactly as the package author wrote it. */
  readonly declaredField: string
  /** Absolute, realpath-canonicalized path to the resolved schema file. */
  readonly resolvedFile: string
  /** Absolute, realpath-canonicalized path to the package's own directory. */
  readonly packageDir: string
}

export type PackageSchemaResolutionResult =
  | { readonly ok: true; readonly origin: PackageOrigin }
  | { readonly ok: false; readonly code: PackageResolutionFailureCode; readonly reason: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

interface LocatedManifest {
  readonly packageJsonPath: string
  readonly packageDir: string
}

/**
 * Locates a package's own package.json (not a nested one) purely through
 * Node's own resolver, anchored at `root` -- behaves exactly as if the
 * consuming project's own code, at `root`, wrote `import "<packageName>"`,
 * so this works uniformly across npm/pnpm/yarn installs without any
 * package-manager-specific handling.
 */
async function locatePackageManifest(
  packageName: string,
  root: string,
): Promise<LocatedManifest | undefined> {
  const req = createRequire(path.join(root, "package.json"))

  // Fast path: works whenever the package has no "exports" map, or its
  // "exports" map includes "./package.json" (this package's own does).
  try {
    const packageJsonPath = req.resolve(`${packageName}/package.json`)
    return { packageJsonPath, packageDir: path.dirname(packageJsonPath) }
  } catch {
    // Fall through -- the package's "exports" map likely omits
    // "./package.json" (ERR_PACKAGE_PATH_NOT_EXPORTED).
  }

  let mainFile: string
  try {
    mainFile = req.resolve(packageName)
  } catch {
    return undefined // not installed (MODULE_NOT_FOUND) or otherwise unresolvable
  }

  // Walk upward from the main entry looking for the package's own
  // package.json. Cannot stop at the *nearest* one: dual CJS/ESM packages
  // commonly ship decoy marker files (e.g. `dist/cjs/package.json`
  // containing only `{"type":"commonjs"}`, no "name" field) at intermediate
  // directory levels. Keep walking until a package.json's own "name" field
  // actually matches -- stopping earlier would silently miss a real
  // "envCap" field declared several levels further up.
  let dir = path.dirname(mainFile)
  for (let i = 0; i < PACKAGE_JSON_ANCESTOR_SEARCH_LIMIT; i++) {
    const candidate = path.join(dir, "package.json")
    try {
      const parsed: unknown = JSON.parse(await fs.readFile(candidate, "utf8"))
      if (isRecord(parsed) && parsed.name === packageName) {
        return { packageJsonPath: candidate, packageDir: dir }
      }
    } catch {
      // Not present, or not valid JSON, at this level -- keep walking.
    }
    const parent = path.dirname(dir)
    if (parent === dir) break // reached filesystem root
    dir = parent
  }
  return undefined
}

async function resolveUncached(
  packageName: string,
  root: string,
): Promise<PackageSchemaResolutionResult> {
  const located = await locatePackageManifest(packageName, root)
  if (!located) {
    return {
      ok: false,
      code: "PACKAGE_NOT_FOUND",
      reason: `Package "${packageName}" listed in "packages" could not be resolved from "${root}" -- is it installed?`,
    }
  }
  const { packageJsonPath, packageDir } = located

  let manifest: unknown
  try {
    manifest = JSON.parse(await fs.readFile(packageJsonPath, "utf8"))
  } catch {
    return {
      ok: false,
      code: "MALFORMED_PACKAGE_JSON",
      reason: `"${packageJsonPath}" is not valid JSON.`,
    }
  }
  if (!isRecord(manifest)) {
    return {
      ok: false,
      code: "MALFORMED_PACKAGE_JSON",
      reason: `"${packageJsonPath}" does not contain a JSON object.`,
    }
  }

  const envCapField = manifest.envCap
  const declaredField =
    isRecord(envCapField) && typeof envCapField.schema === "string" ? envCapField.schema : undefined
  if (declaredField === undefined) {
    return {
      ok: false,
      code: "FIELD_MISSING",
      reason: `"${packageName}"'s package.json has no "envCap.schema" field (or it is not a string).`,
    }
  }

  const lexicallyResolved = path.resolve(packageDir, declaredField)
  if (!isWithinDirectory(packageDir, lexicallyResolved)) {
    return {
      ok: false,
      code: "OUTSIDE_PACKAGE",
      reason: `"${packageName}"'s "envCap.schema" ("${declaredField}") resolves outside its own package directory.`,
    }
  }

  if (!SCHEMA_FILE_EXTENSIONS.some((ext) => lexicallyResolved.endsWith(ext))) {
    return {
      ok: false,
      code: "INVALID_EXTENSION",
      reason: `"${packageName}"'s "envCap.schema" ("${declaredField}") must be a ${SCHEMA_FILE_EXTENSIONS.join("/")} file, not compiled/bundled output.`,
    }
  }

  // Realpath-based containment check, on top of (not instead of) the lexical
  // check above: a symlink at the declared path could point anywhere on
  // disk without the *string* ever containing "..", and `packageDir` itself
  // is frequently a symlink under real-world installs (pnpm's
  // content-addressable store links every package in from elsewhere). A
  // symlink that resolves *within* the package directory is harmless and
  // allowed; only a real target outside it is rejected.
  let realFile: string
  let realPackageDir: string
  try {
    ;[realFile, realPackageDir] = await Promise.all([
      fs.realpath(lexicallyResolved),
      fs.realpath(packageDir),
    ])
  } catch {
    return {
      ok: false,
      code: "OUTSIDE_PACKAGE",
      reason: `"${packageName}"'s "envCap.schema" ("${declaredField}") does not resolve to a file that exists.`,
    }
  }
  if (!isWithinDirectory(realPackageDir, realFile)) {
    return {
      ok: false,
      code: "OUTSIDE_PACKAGE",
      reason: `"${packageName}"'s "envCap.schema" ("${declaredField}") resolves, after following symlinks, outside its own package directory.`,
    }
  }

  let stats
  try {
    stats = await fs.stat(realFile)
  } catch {
    return {
      ok: false,
      code: "OUTSIDE_PACKAGE",
      reason: `"${packageName}"'s "envCap.schema" ("${declaredField}") could not be read.`,
    }
  }
  if (!stats.isFile()) {
    return {
      ok: false,
      code: "OUTSIDE_PACKAGE",
      reason: `"${packageName}"'s "envCap.schema" ("${declaredField}") does not resolve to a regular file.`,
    }
  }
  if (stats.size > MAX_PACKAGE_SCHEMA_FILE_BYTES) {
    return {
      ok: false,
      code: "FILE_TOO_LARGE",
      reason: `"${packageName}"'s "envCap.schema" ("${declaredField}") is ${stats.size} bytes, exceeding the ${MAX_PACKAGE_SCHEMA_FILE_BYTES}-byte limit for a package-resolved schema file.`,
    }
  }

  return {
    ok: true,
    origin: { packageName, declaredField, resolvedFile: realFile, packageDir: realPackageDir },
  }
}

/**
 * Resolves one allow-listed package name. Memoized in a caller-owned
 * `cache` (one per `generate*()` invocation, shared with linking/dependency-
 * graph resolution) so a name referenced from multiple places -- multiple
 * scanned files bare-importing the same package, or a duplicate entry in
 * `packages` -- is only ever resolved once. The cache is populated with the
 * in-flight promise before it settles, so concurrent callers await the same
 * resolution rather than racing duplicate work.
 */
export function resolvePackageSchemaFile(
  packageName: string,
  root: string,
  cache: Map<string, Promise<PackageSchemaResolutionResult>>,
): Promise<PackageSchemaResolutionResult> {
  let cached = cache.get(packageName)
  if (!cached) {
    cached = resolveUncached(packageName, root)
    cache.set(packageName, cached)
  }
  return cached
}

export interface ResolvedPackageFile {
  readonly packageName: string
  readonly file: string
}

export interface ResolvePackagesResult {
  readonly files: readonly ResolvedPackageFile[]
  /** Keyed by resolved file path, for `DiscoveredContract.packageOrigin` lookups downstream. */
  readonly origins: ReadonlyMap<string, PackageOrigin>
  readonly warnings: readonly ParseWarning[]
}

/**
 * Resolves every allow-listed package name. Input is deduplicated first, so
 * a duplicate entry in `packages` (accidental or defensive) produces exactly
 * one resolution attempt and, on failure, exactly one warning -- never two.
 * Never throws: every failure becomes one `ParseWarning`, consistent with
 * every other static-analysis boundary in this codebase.
 */
export async function resolveAllowlistedPackages(
  packages: readonly string[],
  root: string,
  cache: Map<string, Promise<PackageSchemaResolutionResult>>,
): Promise<ResolvePackagesResult> {
  const uniqueNames = [...new Set(packages)]
  const resolved = await Promise.all(
    uniqueNames.map(async (packageName) => ({
      packageName,
      result: await resolvePackageSchemaFile(packageName, root, cache),
    })),
  )

  const files: ResolvedPackageFile[] = []
  const origins = new Map<string, PackageOrigin>()
  const warnings: ParseWarning[] = []

  for (const { packageName, result } of resolved) {
    if (result.ok) {
      files.push({ packageName, file: result.origin.resolvedFile })
      origins.set(result.origin.resolvedFile, result.origin)
    } else {
      warnings.push({ file: `(package) ${packageName}`, message: result.reason })
    }
  }

  return { files, origins, warnings }
}

/**
 * Combines local schema-discovery hits with package-resolved files into one
 * deduplicated list, keyed by realpath rather than lexical absolute path --
 * package-resolved files are already realpath-canonicalized (see
 * `resolveUncached` above), but local `discoverSchemaFiles()` hits are plain
 * `readdir`-derived absolute paths that may themselves traverse a symlink (a
 * symlinked `root`, or an included path reached through one). Deduplicating
 * on the lexical path alone would miss the case where the same physical file
 * is reached twice through two different symlinked routes -- one via local
 * glob discovery, one via package resolution -- and silently double-count it
 * into two identical contracts, including the more mundane case of a package
 * that's both locally glob-reachable (e.g. during a monorepo migration) and
 * explicitly allow-listed. On a collision, the local path string identity
 * wins (the package-resolved duplicate is dropped).
 */
export async function mergeLocalAndPackageFiles(
  localFiles: readonly string[],
  packageFiles: readonly string[],
): Promise<string[]> {
  const seenRealpaths = new Set<string>()
  const merged: string[] = []

  for (const file of localFiles) {
    let real: string
    try {
      real = await fs.realpath(file)
    } catch {
      real = file // shouldn't happen for a file discoverSchemaFiles just found via readdir, but never throw here
    }
    if (seenRealpaths.has(real)) continue
    seenRealpaths.add(real)
    merged.push(file)
  }

  for (const file of packageFiles) {
    if (seenRealpaths.has(file)) continue // already realpath-canonicalized by resolveUncached
    seenRealpaths.add(file)
    merged.push(file)
  }

  return merged
}

/**
 * Bare-specifier-to-allowlist matching, used by `resolve-import.ts`'s
 * `resolveImportSpecifier()` as its package-resolution fallback. Only ever
 * attempts resolution for a specifier that is (or is a subpath of) an
 * allow-listed package name -- any other bare specifier is not this
 * mechanism's concern and returns `undefined` immediately, identical to
 * `resolveRelativeImport()`'s existing bare-specifier no-op.
 */
export async function resolvePackageImport(
  specifier: string,
  allowedPackages: readonly string[],
  root: string,
  cache: Map<string, Promise<PackageSchemaResolutionResult>>,
): Promise<string | undefined> {
  const matched = allowedPackages.find(
    (pkg) => specifier === pkg || specifier.startsWith(`${pkg}/`),
  )
  if (!matched) return undefined
  const result = await resolvePackageSchemaFile(matched, root, cache)
  return result.ok ? result.origin.resolvedFile : undefined
}
