import { displayPath } from "./display-path.js"
import { byContractIdentity } from "./sort-by-identity.js"
import { computeExpiringEntries, parseIsoDate } from "./docs.js"
import type { ExpiringEntry } from "./docs.js"
import type { DiscoveredContract, DiscoveredVariable } from "./link.js"

/**
 * The fifth of env-cap's seven canonical fact models (ADR 0024) -- every
 * contract and variable's lifecycle data (expiry, deprecation, rename
 * correlation), promoting `ExpiringEntry`/`computeExpiringEntries()`
 * (already a good precedent -- real, exported, reused across `renderDocs()`
 * and `generate-documentation.ts`) into a canonical, versioned shape
 * alongside the new deprecation/rename fields. See ADR 0029.
 *
 * As of schema version 3, this also carries NIST SP 800-53 IA-5 rotation
 * data (`authenticatorType`/`rotationPeriod`/`lastRotatedAt`/
 * `rotationTriggerEvents`) and a computed `rotationStatus` per variable --
 * see `computeRotationStatus()` below for the compliance-status judgment
 * call, and the `rotation-log` example generator (peer to `generate-docs/`)
 * for the first real consumer.
 */

/** Bump only when a reader could misinterpret the new shape -- same discipline every other canonical model's `schemaVersion` follows. */
export const LIFECYCLE_MODEL_SCHEMA_VERSION = 3

/**
 * One variable's computed NIST SP 800-53 IA-5 rotation-compliance status --
 * see `computeRotationStatus()` for exactly how it's derived. Always present
 * on a `LifecycleModelVariable` (never `undefined`) since a variable with
 * literally nothing lifecycle-relevant set never reaches this model at all
 * (`hasLifecycleData()` below) -- `"undeclared"` is itself the honest value
 * for "reached this model for some other lifecycle reason (e.g. `deprecated`)
 * but declares none of the four rotation-specific fields."
 */
export type RotationComplianceStatus = "compliant" | "overdue" | "expired" | "undeclared"

/**
 * One variable's lifecycle data (expiry, deprecation, rename correlation).
 *
 * @see {@link ContractModelVariable} -- this same declared variable's canonical starting point.
 */
export interface LifecycleModelVariable {
  readonly key: string
  readonly expiresAt: string | undefined
  readonly refreshInstructions: string | undefined
  readonly deprecated: boolean | undefined
  readonly deprecatedReason: string | undefined
  readonly removeBy: string | undefined
  /** The previous variable name this one renames, if set -- see `ManifestChangeReport`'s rename correlation (ADR 0029/0030). */
  readonly renamedFrom: string | undefined
  /** Descriptive retention policy (e.g. "delete after 90 days") -- a policy statement, never computed or parsed, deliberately independent of `expiresAt`'s actual temporal constraint. See ADR 0035. */
  readonly retention: string | undefined
  /** See {@link runtime.VariableDocs.authenticatorType}. */
  readonly authenticatorType: string | undefined
  /** See {@link runtime.VariableDocs.rotationPeriod}. */
  readonly rotationPeriod: string | undefined
  /** See {@link runtime.VariableDocs.lastRotatedAt}. */
  readonly lastRotatedAt: string | undefined
  /** See {@link runtime.VariableDocs.rotationTriggerEvents}. */
  readonly rotationTriggerEvents: readonly string[] | undefined
  /** Computed, not stored -- see {@link RotationComplianceStatus} and `computeRotationStatus()`. */
  readonly rotationStatus: RotationComplianceStatus
}

/** One contract's own lifecycle data plus every variable of its that has at least one lifecycle field set. See {@link LifecycleModelVariable} for the per-variable shape. */
export interface LifecycleModelContract {
  /** Root-relative, POSIX-separated -- matches `ContractModelContract.file`. */
  readonly file: string
  readonly exportName: string
  readonly contractName: string
  readonly expiresAt: string | undefined
  readonly deprecated: boolean | undefined
  readonly deprecatedReason: string | undefined
  /** See {@link LifecycleModelVariable.retention}. */
  readonly retention: string | undefined
  /** Only variables with at least one lifecycle field set (`expiresAt`, `refreshInstructions`, `deprecated`, `removeBy`, `renamedFrom`, `retention`, `authenticatorType`, `rotationPeriod`, `lastRotatedAt`, `rotationTriggerEvents`) -- same "only what's relevant" scope `renderLifecycleReport()` already uses for its rows. */
  readonly variables: readonly LifecycleModelVariable[]
}

/** The versioned, JSON-serializable root of the Lifecycle Model -- see this module's own doc comment for the full picture. */
export interface LifecycleModel {
  readonly schemaVersion: typeof LIFECYCLE_MODEL_SCHEMA_VERSION
  /** Only contracts with at least one lifecycle-relevant field set, at the contract level or on at least one variable. */
  readonly contracts: readonly LifecycleModelContract[]
  /**
   * Every contract-/variable-level `expiresAt` within the configured window,
   * soonest-first -- see `computeExpiringEntries()`. `file` is root-relative
   * and POSIX-separated here, matching `LifecycleModelContract.file`/every
   * other canonical model -- unlike `ExpiringEntry`'s own doc comment, which
   * describes its shape in `computeExpiringEntries()`'s other direct
   * consumers (e.g. `DocumentationFindings.expiringSoon`), where `file`
   * stays the absolute path `renderDocs()` itself expects.
   */
  readonly expiring: readonly ExpiringEntry[]
}

function hasLifecycleData(variable: DiscoveredVariable): boolean {
  return (
    variable.expiresAt !== undefined ||
    variable.refreshInstructions !== undefined ||
    variable.deprecated !== undefined ||
    variable.removeBy !== undefined ||
    variable.renamedFrom !== undefined ||
    variable.retention !== undefined ||
    hasRotationData(variable)
  )
}

/** Just the four rotation-specific fields -- broken out from {@link hasLifecycleData} since `computeRotationStatus()` needs the exact same "declares at least one" test to decide between `"undeclared"` and a real status. */
function hasRotationData(variable: {
  readonly authenticatorType: string | undefined
  readonly rotationPeriod: string | undefined
  readonly lastRotatedAt: string | undefined
  readonly rotationTriggerEvents: readonly string[] | undefined
}): boolean {
  return (
    variable.authenticatorType !== undefined ||
    variable.rotationPeriod !== undefined ||
    variable.lastRotatedAt !== undefined ||
    (variable.rotationTriggerEvents !== undefined && variable.rotationTriggerEvents.length > 0)
  )
}

const MS_PER_DAY = 86_400_000

/** Whole days per approximate calendar unit, used only by {@link parseRotationPeriodDays} -- see that function's own doc comment for why an approximation is an accepted tradeoff here. */
const DAYS_PER_WEEK = 7
const DAYS_PER_MONTH = 30
const DAYS_PER_YEAR = 365

/**
 * Parses `rotationPeriod` (e.g. "90 days", "P90D", "6 months") into a whole number of days, or
 * `undefined` when it isn't in either recognized grammar.
 *
 * @remarks
 * `rotationPeriod` is documented (`runtime/document.ts`) as an organization-defined string much
 * like `retention` -- but unlike `retention`, which is *never* parsed (a pure policy statement),
 * `computeRotationStatus()` genuinely needs a numeric due date to compare against `now`. This
 * function is the one place that tension is resolved: it recognizes two small, common, unambiguous
 * grammars (a plain "<n> <unit>" -- singular/plural/abbreviated, case-insensitive, with or without
 * a space, e.g. "90 days"/"90day"/"12weeks" -- and ISO 8601's calendar-duration form, date
 * components only (`PnYnMnD`, no `T`/time-of-day component since a rotation period is never
 * meaningfully finer than a day; bare `"P"` is not a duration) rather than attempting to parse
 * arbitrary prose ("quarterly", "every other release", ...) -- an org whose policy string doesn't
 * fit either grammar still has it stored and rendered verbatim everywhere else, it just can't feed
 * a computed due date, and `computeRotationStatus()` fails closed (`"overdue"`) rather than
 * guessing at one. Month/year are calendar approximations (30/365 days) -- acceptable for a
 * rotation-compliance signal, not precise enough for anything billing/calendar-accurate.
 *
 * A computed total of zero days (e.g. "0 days", "P0D", "P0Y0M0D" -- the digit grammar can't
 * produce a *negative* total, but zero is reachable) is treated the same as an unparseable
 * string, not a real duration: it returns `undefined` rather than `0`, so `computeRotationStatus()`
 * falls into its own "declared but unverifiable" fail-closed path (`"overdue"`) instead of computing
 * a degenerate due date equal to `lastRotatedAt` itself -- a nonsensical "rotate every zero days"
 * policy should read as un-computable, not silently produce a technically-correct-but-meaningless
 * due date.
 *
 * Both patterns are inlined at their `.exec()` call site, deliberately not hoisted to a
 * module-level `const` -- same precedent as `source-position.ts`'s `parsePositionCitation()`: a
 * module-level regex literal is a load-time-only ("static") mutation target, which Stryker's own
 * `perTest` coverage analysis can't attribute to a specific covering test (see this package's own
 * `stryker.config.mjs`), while an inline literal is re-evaluated -- and so mutation-tested -- on
 * every call.
 */
export function parseRotationPeriodDays(value: string): number | undefined {
  const trimmed = value.trim()

  const plain = /^(\d+)\s*(days?|d|weeks?|w|months?|mo|years?|y)$/i.exec(trimmed)
  if (plain) {
    const amount = Number(plain[1])
    // A zero amount ("0 days", "0w", ...) is rejected below, alongside the ISO branch's
    // identical `total > 0` guard -- see this function's own doc comment for why.
    if (amount > 0) {
      // Group 2 is mandatory in the pattern, so it is always captured when `plain` matched.
      const unit = String(plain[2]).toLowerCase()
      switch (unit) {
        case "day":
        case "days":
        case "d":
          return amount
        case "week":
        case "weeks":
        case "w":
          return amount * DAYS_PER_WEEK
        case "month":
        case "months":
        case "mo":
          return amount * DAYS_PER_MONTH
        case "year":
        case "years":
        case "y":
          return amount * DAYS_PER_YEAR
      }
    }
  }

  // Unlike the plain-form branch above, there's no separate "did anything match at all" guard
  // here -- a bare "P" (no `Y`/`M`/`D` component at all) leaves `iso[1]`/`iso[2]`/`iso[3]` all
  // `undefined`, each folds to `0` below, and the `total > 0` check just below already rejects
  // that (same as any other zero total) -- a dedicated presence check would be pure dead weight.
  const iso = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?$/i.exec(trimmed)
  if (iso) {
    const years = iso[1] === undefined ? 0 : Number(iso[1])
    const months = iso[2] === undefined ? 0 : Number(iso[2])
    const days = iso[3] === undefined ? 0 : Number(iso[3])
    const total = years * DAYS_PER_YEAR + months * DAYS_PER_MONTH + days
    if (total > 0) return total
  }

  return undefined
}

/**
 * Computes one variable's NIST SP 800-53 IA-5 rotation-compliance status from its lifecycle facts,
 * relative to `now`.
 *
 * @remarks
 * **The judgment call this function makes** (IA-5's main statement itself only says "change or
 * refresh authenticators [by an organization-defined period] or when [organization-defined events]
 * occur" -- it doesn't define how a *pre-existing* `expiresAt` and a *new* `rotationPeriod`/
 * `lastRotatedAt` pair should interact when both are declared on the same variable):
 *
 * - No rotation field declared at all (`hasRotationData()` false) -> `"undeclared"`. Not an error --
 *   most variables aren't authenticators, and saying nothing about rotation is the common, correct
 *   case, not a violation to report.
 * - `expiresAt` is treated as authoritative and checked first, independent of everything else: if
 *   it's a valid date already in the past, the status is `"expired"`, full stop. Rationale: `expiresAt`
 *   is a pre-existing, often externally-imposed hard deadline (an API key's own issuer-enforced
 *   expiry, a certificate's NotAfter) -- once that date passes, the value has *literally* stopped
 *   being valid, which is categorically worse than merely being overdue for an internal policy
 *   rotation, and no internal rotation record can retroactively un-expire it.
 * - Otherwise, if `rotationPeriod` is declared, it's checked against `lastRotatedAt`: both present,
 *   both parseable (see `parseRotationPeriodDays()`), *and* `lastRotatedAt` no later than `now` ->
 *   compute `lastRotatedAt + rotationPeriod` and compare to `now` (`"overdue"` if that due date has
 *   passed, else `"compliant"`). Any other case with `rotationPeriod` declared -- `lastRotatedAt`
 *   missing, either value not statically parseable, or `lastRotatedAt` itself in the future (a
 *   rotation can't have happened yet, so trusting it would let a bad timestamp manufacture false
 *   compliance) -- fails closed to `"overdue"`: IA-5 asks for evidence a rotation actually happened
 *   on schedule, and a declared obligation that can't be shown to have been met is reported as
 *   non-compliant rather than silently passed as compliant.
 * - Otherwise (rotation metadata declared -- `authenticatorType` and/or `lastRotatedAt` and/or
 *   `rotationTriggerEvents` -- but no `rotationPeriod` and no past-due `expiresAt`) -> `"compliant"`:
 *   nothing here states a time-based obligation this variable could be failing to meet.
 *
 * `rotationTriggerEvents` (the event-based trigger) deliberately never changes the returned status
 * by itself: env-cap has no way to observe whether a listed event (a suspected compromise, a
 * personnel change, ...) actually occurred, so treating its mere presence as either compliant or
 * overdue would be fabricating a signal. It's presence-only evidence that the event-based half of
 * IA-5's two-trigger model was at least *declared* -- a generator can and should still surface it,
 * just never fold it into this computed status.
 */
export function computeRotationStatus(
  variable: {
    readonly expiresAt: string | undefined
    readonly authenticatorType: string | undefined
    readonly rotationPeriod: string | undefined
    readonly lastRotatedAt: string | undefined
    readonly rotationTriggerEvents: readonly string[] | undefined
  },
  now: Date,
): RotationComplianceStatus {
  if (!hasRotationData(variable)) return "undeclared"

  // A missing `expiresAt` reads as the text "undefined", which does not parse, so it is skipped like any invalid value.
  const expiry = parseIsoDate(String(variable.expiresAt))
  if (expiry !== undefined && expiry.getTime() < now.getTime()) return "expired"

  if (variable.rotationPeriod !== undefined) {
    const lastRotated = parseIsoDate(String(variable.lastRotatedAt))
    const periodDays = parseRotationPeriodDays(variable.rotationPeriod)
    // `lastRotated` must be no later than `now` -- a rotation timestamped in the future hasn't
    // actually happened yet, so trusting it here would let a bad/clock-skewed value manufacture
    // false compliance (a due date computed from a future `lastRotated` is always further in the
    // future, so it would otherwise always read as "compliant" no matter how implausible).
    // Falling through treats it exactly like any other unverifiable `lastRotatedAt`: fail closed.
    if (
      lastRotated !== undefined &&
      lastRotated.getTime() <= now.getTime() &&
      periodDays !== undefined
    ) {
      const dueDate = lastRotated.getTime() + periodDays * MS_PER_DAY
      return dueDate < now.getTime() ? "overdue" : "compliant"
    }
    return "overdue"
  }

  return "compliant"
}

/**
 * Projects every discovered contract with at least one lifecycle-relevant
 * field set into the Lifecycle Model's versioned, JSON-serializable shape,
 * plus the already-established `expiring` view.
 */
export function buildLifecycleModel(
  contracts: readonly DiscoveredContract[],
  expiringWithinDays: number,
  now: Date,
  root: string,
): LifecycleModel {
  const modelContracts: LifecycleModelContract[] = []

  for (const contract of contracts) {
    const variables: LifecycleModelVariable[] = [...contract.variables]
      .filter(hasLifecycleData)
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((variable) => ({
        key: variable.key,
        expiresAt: variable.expiresAt,
        refreshInstructions: variable.refreshInstructions,
        deprecated: variable.deprecated,
        deprecatedReason: variable.deprecatedReason,
        removeBy: variable.removeBy,
        renamedFrom: variable.renamedFrom,
        retention: variable.retention,
        authenticatorType: variable.authenticatorType,
        rotationPeriod: variable.rotationPeriod,
        lastRotatedAt: variable.lastRotatedAt,
        rotationTriggerEvents: variable.rotationTriggerEvents,
        rotationStatus: computeRotationStatus(variable, now),
      }))

    const hasContractLevelData =
      contract.expiresAt !== undefined ||
      contract.deprecated !== undefined ||
      contract.deprecatedReason !== undefined ||
      contract.retention !== undefined

    if (!hasContractLevelData && variables.length === 0) continue

    modelContracts.push({
      file: displayPath(root, contract.file),
      exportName: contract.exportName,
      contractName: contract.contractName,
      expiresAt: contract.expiresAt,
      deprecated: contract.deprecated,
      deprecatedReason: contract.deprecatedReason,
      retention: contract.retention,
      variables,
    })
  }
  modelContracts.sort(byContractIdentity)

  return {
    schemaVersion: LIFECYCLE_MODEL_SCHEMA_VERSION,
    contracts: modelContracts,
    expiring: computeExpiringEntries(contracts, expiringWithinDays, now).map((entry) => ({
      ...entry,
      file: displayPath(root, entry.file),
    })),
  }
}
