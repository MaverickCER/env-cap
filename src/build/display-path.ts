/**
 * Renders an absolute path for a human-facing generated artifact
 * (`ENVIRONMENT.md`/`OWNERSHIP.md`) or a root-relative canonical model field,
 * root-relative when possible. The one place this conversion lives -- every
 * model builder and renderer that needs "the path as a reader should see it"
 * goes through this, so two of them can never disagree about the form of the
 * same file's path (which would silently break every `${file}#${exportName}`
 * lookup that crosses between them).
 *
 * A `DiscoveredContract.file` keeps its own absolute path untouched -- that's
 * the correct, unambiguous fact, and what stays sane when discovery spans
 * multiple roots (a `packages`-discovered file living outside `root`
 * entirely, ADR 0014).
 */

import path from "node:path"

/**
 * Renders `absolutePath` relative to `root`, POSIX-separated regardless of
 * platform (matching every other rendered path in this package's Markdown and
 * JSON output). Falls back to `absolutePath` itself, unchanged, whenever the
 * result would need to climb outside `root` (a `packages`-discovered file, or
 * any other path not under root) -- never manufactures a `../` escape, which
 * reads as a real relative path to a consumer and resolves to nothing useful.
 */
export function displayPath(root: string, absolutePath: string): string {
  const relative = path.relative(root, absolutePath)
  if (relative.startsWith("..") || path.isAbsolute(relative)) return absolutePath
  return relative.split(path.sep).join("/")
}
