import path from "node:path"
import { globToRegExp } from "./glob.js"
import type { BuildFileSystem } from "./types.js"

/** Options for {@link discoverSchemaFiles}. */
export interface DiscoverOptions {
  /** The filesystem capability: `./build` never imports `node:fs` (ADR 0040). */
  readonly fs: BuildFileSystem
  /** Absolute path to search under. */
  readonly root: string
  /** Glob patterns (relative to `root`) a file must match at least one of to be included. */
  readonly include: readonly string[]
  /** Glob patterns (relative to `root`) that prune a file or directory regardless of `include`. */
  readonly exclude: readonly string[]
}

// A predicate, not a module-level `Set`. A `Set` of string literals is
// evaluated once at module load, and `perTest` coverage analysis cannot
// attribute that to a covering test. Stryker then reports a false Survived.
function isAlwaysSkippedDirName(name: string): boolean {
  return name === "node_modules" || name === ".git"
}

// Generously above any legitimate single project's schema-file count. Every
// fixture and example in this repo uses single digits. A large monorepo of
// many small feature contracts is the intended shape (ADR 0011). Even that
// would have to be an extreme outlier to approach four figures. See `discoverSchemaFiles`'s use of it below.
const MAX_DISCOVERED_SCHEMA_FILES = 1000

/**
 * Finds every file matching `include`/`exclude` under `root`, returned as
 * absolute paths in deterministic (alphabetically sorted) order. No count
 * limit: the usage scan walks every TypeScript source file, and a large
 * project has thousands. The schema-specific sanity limit lives in
 * {@link discoverSchemaFiles}.
 *
 * @remarks
 * No external glob dependency. Directories are pruned *during* the walk
 * (both a hardcoded node_modules/.git skip and the caller's `exclude`
 * patterns), not walked in full and filtered afterward. Walking an entire
 * node_modules tree just to discard it is not acceptable for a tool meant to
 * run against real projects.
 */
export async function discoverFiles(options: DiscoverOptions): Promise<string[]> {
  const files = await walkDirectory(options.root, options.root, options.exclude, options.fs)

  return files
    .filter((file) => {
      const relativePath = toPosixRelative(options.root, file)
      return (
        matchesAnyPattern(relativePath, options.include) &&
        !matchesAnyPattern(relativePath, options.exclude)
      )
    })
    .map((file) => path.normalize(file))
    .sort()
}

/**
 * Finds every schema file matching `include`/`exclude` under `root`, as
 * absolute paths in alphabetical order. It is the walk of `discoverFiles`,
 * plus a sanity limit on the count.
 *
 * @remarks
 * No external glob dependency. Directories are pruned *during* the walk
 * (both a hardcoded node_modules/.git skip and the caller's `exclude`
 * patterns), not walked in full and filtered afterward. Walking an entire
 * node_modules tree just to discard it is not acceptable for a tool meant to
 * run against real projects.
 */
export async function discoverSchemaFiles(options: DiscoverOptions): Promise<string[]> {
  const included = await discoverFiles(options)

  // A match count this large almost always means a misconfigured `root`
  // (resolving to a much larger directory than intended), not a real project.
  // Every caller (`generateEnvManifest`, `generateDocumentation`,
  // `generateUsageReport`, `generateEnvArtifacts`, evidence-cache.ts) parses
  // each file and then runs an O(n^2) cross-file compatibility analysis.
  // Failing here takes milliseconds; letting that run on an accidental match
  // stays finite but can take minutes with no feedback.
  if (included.length > MAX_DISCOVERED_SCHEMA_FILES) {
    throw new Error(
      `discoverSchemaFiles: found ${String(included.length)} files matching "include" under ${options.root}, more than the ${String(MAX_DISCOVERED_SCHEMA_FILES)}-file sanity limit. This usually means "root" (or "include"/"exclude") resolved more broadly than intended, for example an omitted "root" falling back to a large process.cwd(). Narrow "root"/"include"/"exclude" to the intended project boundary.`,
    )
  }

  return included
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
    // (lstat semantics), not a followed symlink. A directory symlink is
    // therefore silently skipped here (neither branch below matches it).
    // That is also what makes this walk immune to a directory-symlink
    // cycle without any explicit visited-path guard. Switching either check
    // to something that follows symlinks (e.g. fs.statSync) would
    // reintroduce that infinite-recursion risk: see
    // test/build/discover.test.ts's symlink-cycle regression test.
    if (entry.isDirectory()) {
      if (isAlwaysSkippedDirName(entry.name)) continue
      // Test as a directory (trailing slash). Then a pattern like "**/node_modules/**",
      // written to match the files inside, also prunes the directory before
      // its contents are read.
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
