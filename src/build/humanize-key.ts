/**
 * Formats a metadata key for display in generated docs/examples:
 * "lastRotation" -> "Last Rotation". Shared by `docs.ts` and `env-example.ts`
 * so both generated artifacts label metadata the same way.
 */
export function humanizeKey(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
  return spaced.length === 0 ? spaced : spaced.charAt(0).toUpperCase() + spaced.slice(1)
}
