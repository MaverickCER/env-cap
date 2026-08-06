import fs from "node:fs/promises"
import path from "node:path"
import {
  resolvePackageImport,
  type PackageSchemaResolutionResult,
} from "./resolve-package-schema.js"
import {
  resolveAliasImport,
  type AliasResolutionCache,
  type TsconfigPathsResolution,
} from "./resolve-tsconfig-paths.js"

/**
 * Resolves a relative import specifier (as written in source: `"./schema.js"`,
 * matching this codebase's own convention of `.js`-suffixed relative imports
 * pointing at `.ts` source files) to an absolute file path, relative to the
 * file that contains the import.
 *
 * @remarks
 * Deliberately narrow: only handles a direct relative specifier resolving to
 * a real `.ts`/`.tsx` file on disk. Bare/package specifiers, namespace
 * imports, and anything requiring real module resolution (re-export chains,
 * `exports` map lookups, etc.) return `undefined` -- the caller treats that
 * as "couldn't statically link" and warns rather than guesses, the same
 * philosophy `evaluateLiteral` already uses for non-literal expressions.
 *
 * @returns The resolved absolute path, or `undefined` when the specifier isn't relative or doesn't resolve to a real file.
 */
export async function resolveRelativeImport(
  importingFile: string,
  specifier: string,
): Promise<string | undefined> {
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) return undefined // bare/package specifier

  const withoutExt = specifier.replace(/\.(js|jsx|ts|tsx)$/, "")
  const base = path.resolve(path.dirname(importingFile), withoutExt)

  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ]) {
    if (await fileExists(candidate)) return candidate
  }
  return undefined
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath)
    return stat.isFile()
  } catch {
    return false
  }
}

/** Shared inputs threaded through every call to {@link resolveImportSpecifier} for one discovery/link run. */
export interface ImportResolutionContext {
  /** Absolute path of the project root, used to resolve package specifiers. */
  readonly root: string
  /** Explicit allowlist -- see ADR 0014. Empty/omitted means package resolution never fires, identical to today's behavior. */
  readonly packages: readonly string[]
  /** Memoizes package resolution per specifier across the whole run -- see `resolvePackageImport`'s own doc comment for why. */
  readonly cache: Map<string, Promise<PackageSchemaResolutionResult>>
  /** Parsed `tsconfig.json` `paths`/`baseUrl`, or `undefined` when alias resolution found nothing to do or was disabled -- see ADR 0023. */
  readonly tsconfigPaths: TsconfigPathsResolution | undefined
  /** Memoizes alias resolution across the whole run -- see `resolveAliasImport`'s own doc comment for why. Always allocated, even when `tsconfigPaths` is `undefined`, mirroring `cache` above. */
  readonly aliasCache: AliasResolutionCache
}

/**
 * The one specifier-resolution entry point `link.ts` and `dependency-graph.ts`
 * call, instead of each duplicating a
 * `(await resolveRelativeImport(...)) ?? resolveAliasImport(...) ?? (await resolvePackageImport(...))`
 * chain at every call site.
 *
 * @remarks
 * Purely a composition point -- no new resolution logic lives here. Tries, in order: the
 * relative resolver (cheap, no `fs.stat` beyond the local filesystem check it already
 * does); tsconfig path-alias resolution (ADR 0023, on by default) for a bare specifier
 * matching the project's own `tsconfig.json` `paths`/`baseUrl`; then package resolution
 * (ADR 0014) for a bare specifier matching an allow-listed package name. Alias resolution
 * runs before package resolution because it resolves the consuming project's own local
 * source (already-trusted, no versioning boundary), the same precedence relative
 * resolution already has over package resolution.
 */
export async function resolveImportSpecifier(
  importingFile: string,
  specifier: string,
  context: ImportResolutionContext,
): Promise<string | undefined> {
  const relative = await resolveRelativeImport(importingFile, specifier)
  if (relative) return relative

  if (context.tsconfigPaths) {
    const aliased = resolveAliasImport(
      specifier,
      importingFile,
      context.tsconfigPaths,
      context.aliasCache,
    )
    if (aliased) return aliased
  }

  return resolvePackageImport(specifier, context.packages, context.root, context.cache)
}
