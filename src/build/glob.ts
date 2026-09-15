/**
 * Converts one glob pattern to a RegExp. Handles `**` as "any number of path
 * segments, including zero" (so `**\/node_modules/**` matches a root-level
 * `node_modules`, and `**\/env.schema.ts` matches a root-level file, not just
 * nested ones) -- a plain `**` -> `.*` substitution gets both of those wrong.
 *
 * Used by discover.ts's `include`/`exclude` schema-discovery walk.
 *
 * Deliberately duplicated (not shared) with
 * src/eslint-plugin/glob.ts, which needs the exact same matching behavior
 * for its own `allow` option -- keeps this build-only module free of any
 * import reaching outside src/build, so `src/build` stays independently
 * splittable into its own package with zero source-level cross-folder
 * dependency. Not re-exported from `./index.js` -- Private tier per
 * VERSIONING.md.
 */
/* jscpd:ignore-start -- deliberately duplicated across the build/ and eslint-plugin/ bundle boundaries; see this file's module doc */
export function globToRegExp(pattern: string): RegExp {
  let out = ""
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i]
    // The loop bound (`i < pattern.length`) already guarantees this branch
    // is never taken -- noUncheckedIndexedAccess can't express that
    // invariant from a bounds-checked loop, only that string indexing is
    // *generally* unsafe. A real guard (not a non-null assertion, forbidden
    // in src/) satisfies the type checker without hiding the possibility.
    if (char === undefined) continue
    if (char === "*" && pattern[i + 1] === "*") {
      const precededBySlashOrStart = i === 0 || pattern[i - 1] === "/"
      const followedBySlash = pattern[i + 2] === "/"
      if (precededBySlashOrStart && followedBySlash) {
        out += "(?:.*/)?"
        i += 2 // consume the second '*' and the following '/'
      } else {
        out += ".*"
        i += 1 // consume the second '*'
      }
    } else if (char === "*") {
      out += "[^/]*"
    } else if (char === "?") {
      out += "[^/]"
    } else if (".+^${}()|[]\\".includes(char)) {
      out += `\\${char}`
    } else {
      out += char
    }
  }
  return new RegExp(`^${out}$`)
}
/* jscpd:ignore-end */
