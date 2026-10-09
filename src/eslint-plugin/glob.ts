/**
 * Converts one glob pattern to a RegExp. Handles `**` as "any number of path
 * segments, including zero" (so `**\/node_modules/**` matches a root-level
 * `node_modules`, and `**\/env.schema.ts` matches a root-level file, not just
 * nested ones) -- a plain `**` -> `.*` substitution gets both of those wrong.
 *
 * Used by no-raw-process-env.ts's `allow` option.
 *
 * Deliberately duplicated (not shared) with
 * src/build/glob.ts, which needs the exact same matching behavior for its
 * own schema-discovery walk -- keeps this eslint-plugin-only module free of
 * any import reaching outside src/eslint-plugin, so `src/eslint-plugin`
 * stays independently splittable into its own package with zero
 * source-level cross-folder dependency. Not re-exported from `./index.js` --
 * Private tier per VERSIONING.md.
 */
/* jscpd:ignore-start -- deliberately duplicated across the build/ and eslint-plugin/ bundle boundaries; see this file's module doc */
export function globToRegExp(pattern: string): RegExp {
  let out = ""
  // First index the loop still has to handle: a `**` segment consumes the characters after its first
  // `*`. The loop walks a finite list of the pattern's own characters, so it cannot run unbounded.
  let resume = 0
  for (const [i, char] of pattern.split("").entries()) {
    if (i < resume) continue
    if (char === "*" && pattern[i + 1] === "*") {
      const precededBySlashOrStart = i === 0 || pattern[i - 1] === "/"
      const followedBySlash = pattern[i + 2] === "/"
      if (precededBySlashOrStart && followedBySlash) {
        out += "(?:.*/)?"
        resume = i + 3 // skip the second '*' and the following '/'
      } else {
        out += ".*"
        resume = i + 2 // skip the second '*'
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
