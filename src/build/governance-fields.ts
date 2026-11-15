/**
 * The declared governance-metadata field set every pipeline-stage contract and
 * variable type carries: `owner` through `metadata`. The field names and types
 * are identical at every stage (parse -> link -> contract-model -> docs). Only
 * the surrounding context differs. A `parse`-stage value is "statically resolved
 * from a string literal, or `undefined`". A `link`/`contract-model`-stage value
 * is "from the linked `documentEnv()` call, or `undefined`". This is the single
 * source of truth for the shape; each stage interface `extends` it.
 *
 * `metadata` is the open bag for keys `env-cap` has no named concept for (ADR
 * 0037); `dataResidency`/`auditRequired`/`legalBasis`/`purpose`/`retention` are
 * presence-only governance facts, never verified.
 *
 * Internal: not re-exported from the public `.` barrel.
 */
export interface EnvGovernanceFields {
  readonly owner: string | undefined
  readonly sensitivity: string | undefined
  readonly expiresAt: string | undefined
  readonly purpose: string | undefined
  readonly legalBasis: string | undefined
  readonly retention: string | undefined
  readonly dataResidency: string | readonly string[] | undefined
  readonly auditRequired: boolean | undefined
  readonly metadata: Readonly<Record<string, unknown>> | undefined
}

/**
 * Copies exactly the `EnvGovernanceFields` out of a value that carries
 * them. Each pipeline stage (`link` -> `contract-model` -> `docs` catalog,
 * ...) projects its contract or variable into the next without re-listing
 * all nine fields.
 */
export function governanceFieldsOf(source: EnvGovernanceFields): EnvGovernanceFields {
  return {
    owner: source.owner,
    sensitivity: source.sensitivity,
    expiresAt: source.expiresAt,
    purpose: source.purpose,
    legalBasis: source.legalBasis,
    retention: source.retention,
    dataResidency: source.dataResidency,
    auditRequired: source.auditRequired,
    metadata: source.metadata,
  }
}
