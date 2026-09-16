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
  // A fast-failing pass-count guard, independent of `i` itself: on any real
  // `pattern`, `i` strictly advances toward `pattern.length` every pass (the
  // loop's own `i++`, plus an extra `i += 1`/`i += 2` when a `**` segment
  // consumes lookahead characters), so no correct input ever needs more
  // passes than `pattern.length`. A mutation that reverses any of those
  // advances (`i++` -> `i--`, `i += 1` -> `i -= 1`, `i += 2` -> `i -= 2`)
  // makes `i` walk away from `pattern.length` instead -- an infinite loop
  // that produces no observably wrong result for an assertion-based test to
  // catch, only a hang until Stryker's own mutant timeout. This counter
  // climbs every pass regardless of `i`'s (possibly-mutated) motion, so it
  // still reaches its bound and throws an ordinary, fast error instead.
  let passes = 0
  // The guard's own arithmetic/direction/comparison below are just as
  // unreachable/inconsequential for any correct `pattern` as the guard body
  // itself (see the disable comment on the `if` below): under correct code
  // `passes` never approaches `maxPasses`, so no real test input can observe
  // a change to any of them.
  // Stryker disable next-line ArithmeticOperator
  const maxPasses = pattern.length * 2 + 4
  // Widening this bound to `<=` is a genuine no-op: on the one extra pass at
  // `i === pattern.length`, `pattern[i]` is `undefined`, and the guard below
  // already `continue`s past it before anything else in the loop body runs.
  // Hand-verified: mutating this and running the real suite passes unchanged.
  // Stryker disable next-line EqualityOperator
  for (let i = 0; i < pattern.length; i++) {
    // Stryker disable next-line UpdateOperator
    passes++
    // Unreachable by design for any correct `pattern`, the same way the
    // `char === undefined` guard just below is: this guard's whole purpose
    // is to fail fast when a *mutated* build's loop-advance is broken, so no
    // real test input (which only ever exercises correct code) can reach it.
    // Stryker disable next-line BlockStatement,ConditionalExpression,EqualityOperator
    if (passes > maxPasses) {
      throw new Error(
        // Stryker disable next-line StringLiteral
        `globToRegExp: exceeded ${String(maxPasses)} iterations parsing pattern ${JSON.stringify(pattern)} -- this should never happen for any real pattern and indicates an internal parsing bug.`,
      )
    }
    const char = pattern[i]
    // The loop bound (`i < pattern.length`) already guarantees this branch
    // is never taken -- noUncheckedIndexedAccess can't express that
    // invariant from a bounds-checked loop, only that string indexing is
    // *generally* unsafe. A real guard (not a non-null assertion, forbidden
    // in src/) satisfies the type checker without hiding the possibility.
    // Hand-verified: mutating this condition to `false` and running the
    // real suite passes unchanged -- this branch is provably unreachable
    // within the loop bound, so no test can ever exercise it.
    // Stryker disable next-line ConditionalExpression
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
