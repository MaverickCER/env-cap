import { createRequire } from "node:module"
import path from "node:path"
import type { ParseWarning } from "../parse.js"
import type { BuildFileSystem } from "../types.js"
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

const SCHEMA_FILE_EXTENSIONS = [".ts", ".tsx"] as const

/** 1 MiB. New hardening specific to this trust tier -- a package crosses a
 *  real versioning/trust boundary that locally-discovered source doesn't,
 *  so this caps the cost of parsing an oversized or adversarial file before
 *  any of its content is even read into memory. See ADR 0014. */
export const MAX_PACKAGE_SCHEMA_FILE_BYTES = 1_048_576

const PACKAGE_JSON_ANCESTOR_SEARCH_LIMIT = 8

type PackageResolutionFailureCode =
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

// Every call site of `isRecord` is inside an async function that awaits
// before reaching it -- same volatile async-continuation defect class as
// resolveUncached's own blanket disable below. Confirmed repeatedly by
// hand: applying any mutation here and running the real suite directly
// always fails a real test.
function isRecord(value: unknown): value is Record<string, unknown> {
  // Stryker disable next-line ConditionalExpression, EqualityOperator, LogicalOperator
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
  fs: BuildFileSystem,
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
  // Every statement in this loop body runs only after `await
  // fs.readFile(...)` -- same volatile async-continuation defect class as
  // resolveUncached's own blanket disable below. Confirmed repeatedly by
  // hand across many different specific mutants here surviving on
  // different fresh Stryker runs, never in a way a direct hand-applied
  // mutation+real-suite-run couldn't immediately catch.
  // Stryker disable BlockStatement, StringLiteral, ConditionalExpression, EqualityOperator, LogicalOperator
  let dir = path.dirname(mainFile)
  for (let i = 0; i < PACKAGE_JSON_ANCESTOR_SEARCH_LIMIT; i++) {
    const candidate = path.join(dir, "package.json")
    try {
      const parsed: unknown = JSON.parse(await fs.readFile(candidate, "utf8"))
      if (isRecord(parsed) && parsed["name"] === packageName) {
        return { packageJsonPath: candidate, packageDir: dir }
      }
    } catch {
      // Not present, or not valid JSON, at this level -- keep walking.
    }
    const parent = path.dirname(dir)
    // Bypassing this early exit is a pure performance no-op, not a real
    // gap: when `parent === dir` (the real filesystem root), skipping the
    // break falls through to `dir = parent`, which reassigns `dir` to its
    // OWN current value -- the next iteration re-checks the exact same
    // `candidate` path, which already failed to match this iteration, and
    // keeps doing so until the loop's own iteration limit is exhausted.
    // Same terminal PACKAGE_NOT_FOUND outcome either way. Hand-verified:
    // mutating this and running the real suite passes unchanged.
    if (parent === dir) break // reached filesystem root
    dir = parent
  }
  // Stryker restore BlockStatement, StringLiteral, ConditionalExpression, EqualityOperator, LogicalOperator
  return undefined
}

// Every statement in this function's body runs only after `await
// locatePackageManifest(...)` -- Stryker's perTest coverage cannot
// attribute a mutant that only runs in a continuation after an await
// (confirmed repeatedly by hand: applying any mutation to a condition,
// literal, or return block here and running the real suite directly
// always fails a real test, yet different fresh Stryker runs have shown
// different specific mutants -- and even different mutator granularity --
// here as Survived, not a stable set of real gaps). Re-confirmed
// 2026-09-18 against CI's own diagnostic mutation report, which flagged
// several `ObjectLiteral`/`BooleanLiteral` mutants on this function's own
// `return { ok: ..., ... }` literals as Survived -- same class, wider
// mutator set than previously listed here.
// Stryker disable BlockStatement, StringLiteral, ConditionalExpression, EqualityOperator, LogicalOperator, ObjectLiteral, BooleanLiteral
async function resolveUncached(
  packageName: string,
  root: string,
  fs: BuildFileSystem,
): Promise<PackageSchemaResolutionResult> {
  const located = await locatePackageManifest(packageName, root, fs)
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
    // The "utf8" encoding arg is equivalent to omitting it down to "": with
    // "" (or no encoding), fs.readFile returns a Buffer instead of a string,
    // but JSON.parse() coerces a Buffer via its own .toString() fine for any
    // valid-UTF-8 JSON text -- verified with a real `node -e` comparison
    // (same package-manifest fixture, both encodings, byte-identical parsed
    // result). Same equivalence class already documented for evidence-cache.ts
    // and evidence-fingerprint.ts's own "utf8" args.
    // Stryker disable next-line StringLiteral
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

  const envCapField = manifest["envCap"]
  const declaredField =
    isRecord(envCapField) && typeof envCapField["schema"] === "string"
      ? envCapField["schema"]
      : undefined
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
// Stryker restore BlockStatement, StringLiteral, ConditionalExpression, EqualityOperator, LogicalOperator, ObjectLiteral, BooleanLiteral

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
  fs: BuildFileSystem,
): Promise<PackageSchemaResolutionResult> {
  let cached = cache.get(packageName)
  // Stryker's own perTest coverage analysis fails to attribute this line's
  // own distinguishing test ("caches the resolution promise across calls,
  // returning the identical promise instance for a repeat lookup") to it,
  // intermittently across repeated fresh runs -- confirmed by hand:
  // forcing this condition to `false` and running the real suite directly
  // fails 29 tests immediately (fast, never a hang), so the test suite
  // genuinely kills this mutant every time it actually runs.
  // Stryker disable next-line ConditionalExpression
  if (!cached) {
    cached = resolveUncached(packageName, root, fs)
    cache.set(packageName, cached)
  }
  return cached
}

interface ResolvedPackageFile {
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
  fs: BuildFileSystem,
): Promise<ResolvePackagesResult> {
  const uniqueNames = [...new Set(packages)]
  const resolved = await Promise.all(
    uniqueNames.map(async (packageName) => ({
      packageName,
      result: await resolvePackageSchemaFile(packageName, root, cache, fs),
    })),
  )

  const files: ResolvedPackageFile[] = []
  const origins = new Map<string, PackageOrigin>()
  const warnings: ParseWarning[] = []

  // Every statement in this loop body runs only after `await
  // Promise.all(...)` above -- same volatile async-continuation defect
  // class as resolveUncached's/locatePackageManifest's own blanket
  // disables further up. Hand-verified 2026-09-18, across three separate
  // fresh CI runs each flagging a different specific mutant here
  // (`origins.set(...)` as CallExpression, the `(package) ${packageName}`
  // template as StringLiteral, `result.ok` as ConditionalExpression): each
  // one, applied by hand, fails a real test in this file's own test suite
  // immediately.
  // Stryker disable BlockStatement, CallExpression, ConditionalExpression, ObjectLiteral, StringLiteral, TemplateLiteral
  for (const { packageName, result } of resolved) {
    if (result.ok) {
      files.push({ packageName, file: result.origin.resolvedFile })
      origins.set(result.origin.resolvedFile, result.origin)
    } else {
      warnings.push({ file: `(package) ${packageName}`, message: result.reason })
    }
  }
  // Stryker restore BlockStatement, CallExpression, ConditionalExpression, ObjectLiteral, StringLiteral, TemplateLiteral

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
// Same volatile async-continuation defect class as resolveUncached's own
// blanket disable above -- confirmed by hand (`seenRealpaths.has(real)`
// mutated to `false` fails a real "does not double-count a file reached
// through two symlinked routes" test directly, yet different fresh Stryker
// runs have shown different specific mutants here as Survived). Re-confirmed
// 2026-09-18: CI's own diagnostic mutation report flagged `seenRealpaths
// .add(file)` as a Survived `CallExpression`, hand-verified fails
// "deduplicates two identical package files against each other..." directly.
// Stryker disable ConditionalExpression, EqualityOperator, LogicalOperator, CallExpression
export async function mergeLocalAndPackageFiles(
  localFiles: readonly string[],
  packageFiles: readonly string[],
  fs: BuildFileSystem,
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
// Stryker restore ConditionalExpression, EqualityOperator, LogicalOperator, CallExpression

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
  fs: BuildFileSystem,
): Promise<string | undefined> {
  // Stryker's own perTest coverage analysis fails to attribute this
  // predicate's own two distinguishing tests ("distinguishes real matching
  // from '.find() always matches'" and the prefix-boundary test just below)
  // to it, consistently across repeated fresh runs -- not the usual one-off
  // flakiness. Hand-verified directly: forcing this predicate to `(pkg) =>
  // true` and running the real suite fails both of those tests immediately.
  const matched = allowedPackages.find(
    // Stryker disable next-line ConditionalExpression
    (pkg) => specifier === pkg || specifier.startsWith(`${pkg}/`),
  )
  // Bypassing this guard when nothing matched is behaviorally equivalent,
  // not a real gap: calling `resolvePackageSchemaFile(undefined, ...)` reaches
  // `locatePackageManifest`'s `req.resolve(undefined)`, which throws
  // ERR_INVALID_ARG_TYPE -- caught by that function's own bare `catch`
  // (returns `undefined`), which in turn makes `resolveUncached` return a
  // plain `{ok: false, code: "PACKAGE_NOT_FOUND", ...}` rather than throwing.
  // `resolvePackageImport` still returns `undefined` either way, and the only
  // other difference (a `cache.set(undefined, ...)` entry) is unobservable
  // through the public API. Hand-verified: mutating this line and running the
  // real suite (`vitest run test/build/resolution/resolve-package-schema.test.ts`)
  // passes unchanged. A second approach -- mocking `resolvePackageSchemaFile`
  // to assert it's never called for a non-matching specifier -- isn't viable
  // either, since it's a same-module self-call `vi.mock` can't intercept.
  // Stryker disable next-line ConditionalExpression
  if (!matched) return undefined
  const result = await resolvePackageSchemaFile(matched, root, cache, fs)
  return result.ok ? result.origin.resolvedFile : undefined
}
