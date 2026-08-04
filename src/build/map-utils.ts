/**
 * `map.get(key)` after iterating `map`'s own `.keys()` is always defined --
 * this makes that invariant an explicit, named operation instead of a bare
 * `!` non-null assertion at each call site, with a real error (not a
 * silent `undefined`) if it's ever violated by a future bug.
 */
export function mustGet<K, V>(map: ReadonlyMap<K, V>, key: K): V {
  const value = map.get(key)
  if (value === undefined)
    throw new Error(`Internal error: expected key "${String(key)}" to be present in map.`)
  return value
}
