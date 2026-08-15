/**
 * Recursively freezes `value` and everything reachable from it (array
 * elements, plain-object property values), so a mutation anywhere in the
 * structure throws instead of silently succeeding.
 *
 * @remarks
 * Generalized from `live-expirations.ts`'s former `DiscoveredContract[]`-
 * hardcoded `deepFreezeContracts()` (see ADR 0012) into a truly generic
 * utility, so Evidence Model's own immutability guarantee (a later phase)
 * can reuse it instead of duplicating the recursion.
 *
 * Only recurses into arrays and plain objects (`{}` or `Object.create(null)`)
 * -- a `Map`, `Set`, or class instance is frozen at its own top level but not
 * walked further. This codebase's fact models are plain JSON-serializable
 * data, never class instances, so this is deliberately narrow rather than a
 * general-purpose deep-freeze library. A `WeakSet` guards against infinite
 * recursion if a cyclic reference is ever passed in.
 */
export function deepFreeze<T>(value: T): T {
  return deepFreezeInternal(value, new WeakSet())
}

function deepFreezeInternal<T>(value: T, seen: WeakSet<object>): T {
  if (value === null || typeof value !== "object") return value
  if (seen.has(value)) return value
  seen.add(value)

  if (Array.isArray(value)) {
    for (const item of value) deepFreezeInternal(item, seen)
  } else if (isPlainObject(value)) {
    for (const key of Object.keys(value)) {
      deepFreezeInternal((value as Record<string, unknown>)[key], seen)
    }
  }

  return Object.freeze(value)
}

function isPlainObject(value: object): boolean {
  const proto: unknown = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}
