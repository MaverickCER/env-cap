/**
 * Formats a metadata key for display in generated docs/examples:
 * "lastRotation" -> "Last Rotation". Shared by `docs.ts` and `env-example.ts`
 * so both generated artifacts label metadata the same way.
 */
export function humanizeKey(key: string): string {
  // No `spaced.length === 0` guard: `.charAt(0)`/`.slice(1)` on an empty
  // string are both already safe (return `""`), so the ternary this used to
  // be was provably redundant for its only possible trigger (`key === ""`,
  // the sole way `.replace()` here can produce an empty `spaced` -- it only
  // ever inserts characters, never removes them).
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/**
 * Formats a `metadata`/`dataResidency` value for display in generated docs/examples -- a string
 * renders as-is; anything else (ADR 0035 widened `metadata` to any value) renders as its JSON
 * text, so an object/array value never prints `[object Object]`. Shared by `docs.ts` and
 * `env-example.ts`, same rationale as {@link humanizeKey}.
 */
export function renderMetadataValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value)
}
