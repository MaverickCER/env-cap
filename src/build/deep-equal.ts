/**
 * Structural equality for JSON-safe values -- `documentEnv()`'s `metadata` can hold an
 * object/array (ADR 0035), so two independently-declared-but-identical values are never `===`.
 * Values compared here are always JSON-safe (string/number/boolean/null/array/object,
 * recursively -- see `literal-eval.ts`), so this doesn't need to handle cycles, `Date`, `Map`, or
 * anything else `evaluateLiteral()` can never produce.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((v, i) => deepEqual(v, b[i]))
  }
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  return aKeys.every(
    (key) =>
      key in b &&
      deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  )
}
