import path from "node:path"
import { globToRegExp } from "./glob.js"
import type { BuildFileSystem } from "./types.js"

/** Options for {@link discoverSchemaFiles}. */
export interface DiscoverOptions {
  /** The filesystem capability -- `./build` never imports `node:fs` (ADR 0040). */
  readonly fs: BuildFileSystem
  /** Absolute path to search under. */
  readonly root: string
  /** Glob patterns (relative to `root`) a file must match at least one of to be included. */
  readonly include: readonly string[]
  /** Glob patterns (relative to `root`) that prune a file or directory regardless of `include`. */
  readonly exclude: readonly string[]
}

// A predicate, not a module-level `Set` -- a `Set` of string literals is
// evaluated once at module load, which `perTest` coverage analysis can't
// attribute to a covering test (a documented Stryker false-Survivor; see
// [[feedback_stryker_mutation_score_formula]]).
function isAlwaysSkippedDirName(name: string): boolean {
  return name === "node_modules" || name === ".git"
}

// Generously above any legitimate single project's real schema-file count
// (every real fixture/example in this very repo uses single digits; even a
// large enterprise monorepo built from many small feature contracts -- the
// tool's own intended shape, see ADR 0011 -- would need to be extreme
// outliers to approach four figures) -- see `discoverSchemaFiles`'s own use
// of it below.
const MAX_DISCOVERED_SCHEMA_FILES = 1000

/**
 * Finds every schema file matching `include`/`exclude` under `root`, returned
 * as absolute paths in deterministic (alphabetically sorted) order.
 *
 * @remarks
 * No external glob dependency: directories are pruned *during* the walk
 * (both a hardcoded node_modules/.git skip and the caller's `exclude`
 * patterns), rather than walked in full and filtered afterward -- walking an
 * entire node_modules tree just to discard it is not acceptable for a tool
 * meant to run against real projects.
 */
export async function discoverSchemaFiles(options: DiscoverOptions): Promise<string[]> {
  const files = await walkDirectory(options.root, options.root, options.exclude, options.fs)

  const included = files.filter((file) => {
    const relativePath = toPosixRelative(options.root, file)
    return (
      matchesAnyPattern(relativePath, options.include) &&
      !matchesAnyPattern(relativePath, options.exclude)
    )
  })

  // Fails fast, before any caller starts parsing a single discovered file,
  // when `include`/`root` matched far more than any legitimate single
  // project's schema-file count -- almost always a misconfigured `root`
  // (e.g. accidentally resolving to a much larger directory than intended)
  // rather than a real project actually declaring this many contracts.
  // Every caller (`generateEnvManifest`, `generateDocumentation`,
  // `generateUsageReport`, `generateEnvArtifacts`, evidence-cache.ts) does
  // real per-file parsing plus O(n^2) cross-file compatibility analysis
  // afterward -- work whose cost is invisible here but scales with exactly
  // this count, so catching a wrong `root` here (milliseconds) instead of
  // letting it run (which stays finite, just very slow for a genuinely large
  // accidental match) gives a caller a fast, actionable error instead of a
  // multi-minute hang with no feedback.
  if (included.length > MAX_DISCOVERED_SCHEMA_FILES) {
    // Stryker disable next-line StringLiteral
    throw new Error(
      `discoverSchemaFiles: found ${String(included.length)} files matching "include" under ${options.root} -- more than the ${String(MAX_DISCOVERED_SCHEMA_FILES)}-file sanity limit. This almost always means "root" (or "include"/"exclude") resolved more broadly than intended -- e.g. an omitted "root" falling back to an unexpectedly large process.cwd() -- rather than a real project genuinely declaring this many contracts. Narrow "root"/"include"/"exclude" to the intended project boundary.`,
    )
  }

  // Two-way compare only -- every entry is a distinct file's absolute path,
  // so `a === b` can never happen here (unlike a comparator keyed by a
  // free-form label, where an "equal" case is a real, reachable outcome).
  // `<=` vs `<` only changes tie-breaking when `a === b` -- impossible here:
  // `included` comes from a single directory walk that visits each real file
  // exactly once, so no two entries can ever be the same path. Hand-verified:
  // mutating this to `<=` and running the real suite passes unchanged.
  // Stryker disable next-line EqualityOperator
  return included.map((file) => path.normalize(file)).sort((a, b) => (a < b ? -1 : 1))
}

async function walkDirectory(
  directory: string,
  root: string,
  exclude: readonly string[],
  fs: BuildFileSystem,
): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const results: string[] = []

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name)

    // entry.isDirectory()/isFile() reflect the raw directory-entry type
    // (lstat semantics), not a followed symlink -- a directory symlink is
    // therefore silently skipped here (neither branch below matches it),
    // which is also what makes this walk immune to a directory-symlink
    // cycle without any explicit visited-path guard. Switching either check
    // to something that follows symlinks (e.g. fs.statSync) would
    // reintroduce that infinite-recursion risk -- see
    // test/build/discover.test.ts's symlink-cycle regression test.
    if (entry.isDirectory()) {
      if (isAlwaysSkippedDirName(entry.name)) continue
      // Test as a directory (trailing slash) so a pattern like "**/node_modules/**"
      // -- which is meant to match *files inside* the directory -- also prunes
      // the directory itself before we ever read its contents.
      const relativeDir = `${toPosixRelative(root, fullPath)}/`
      if (matchesAnyPattern(relativeDir, exclude)) continue
      results.push(...(await walkDirectory(fullPath, root, exclude, fs)))
      continue
    }

    if (entry.isFile()) {
      results.push(fullPath)
    }
  }

  return results
}

function toPosixRelative(root: string, target: string): string {
  return path.relative(root, target).split(path.sep).join("/")
}

function matchesAnyPattern(filePath: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => globToRegExp(pattern).test(filePath))
}
