import path from "node:path"
import { buildCitationSnapshots, verifyDynamicAccessCitations } from "./citation-verification.js"
import type { DynamicAccessCitationProblem } from "./citation-verification.js"
import { deepEqual } from "./deep-equal.js"
import type { ContractRef } from "./evidence-reference.js"
import type { ContractModelContract, ContractModelVariable } from "./contract-model.js"
import type { EvidenceModel } from "./evidence-model.js"
import { EVIDENCE_MODEL_SCHEMA_VERSION } from "./evidence-model.js"
import type { DiscoveredContract } from "./link.js"
import type { ParseWarning } from "./parse.js"
import type { DynamicAccessAssertion } from "./source-position.js"
import type { BuildFileSystem } from "./types.js"

/**
 * The persisted evidence artifact and everything that reads/diffs it.
 *
 * Not a sibling of `env.manifest.ts`. `env.manifest.ts` is a *runtime build
 * artifact* -- real TypeScript, imported and executed by the running
 * application. This module's own artifact is a *CI/reporting artifact*: the
 * literal `EvidenceModel` a caller gets back from `generateEvidenceModel()`,
 * serialized to disk, read only by `--check`, by CI tooling, and by whatever
 * a project's own reporting/projection code chooses to do with it -- never
 * imported by anything under `src/runtime/`, never a build input to the
 * application itself. Its location is never derived from a manifest's own
 * output path (there is no `<manifest>.snapshot.json` sidecar mechanism
 * anymore); a caller supplies it directly, independent of whether a `.ts`
 * manifest is even being generated at all.
 *
 * Two jobs, one file: this is both (a) the baseline `diffContracts()`
 * compares the current run's `ContractModel` against to produce
 * `ManifestChangeReport`, and (b) the committed-baseline content-hash source
 * `buildCitationSnapshots()` (`citation-verification.ts`) uses to tell a
 * "fresh" developer dynamic-access citation from a "stale" one (ADR 0037).
 * Whether a project commits this file to git or regenerates it fresh every CI
 * run is that project's call -- a missing file is always treated as the normal
 * first-run state, never an error.
 */

/** One field's before/after value in a {@link ManifestContractUpdate} or {@link ManifestVariableUpdate}. */
export interface ManifestFieldChange {
  /** The changed field's name. */
  readonly field: string
  /** The value from the previous snapshot, or `undefined` if the field was unset. */
  readonly previous: string | undefined
  /** The value in the current run, or `undefined` if the field is now unset. */
  readonly current: string | undefined
}

/** Identifies one contract for {@link ManifestChangeReport} purposes -- see {@link ContractRef} for why neither a `contractName` nor a pre-formatted `identity` is carried here. */
export type ManifestContractRef = ContractRef

/** Identifies one variable for {@link ManifestChangeReport} purposes -- its owning contract's identity plus its own key. See {@link ContractRef}. */
export interface ManifestVariableRef extends ContractRef {
  /** The environment variable name. */
  readonly key: string
}

/** A contract present in both snapshots, with at least one changed field. */
export interface ManifestContractUpdate extends ManifestContractRef {
  /** Every field that changed between the previous and current snapshot. */
  readonly changes: readonly ManifestFieldChange[]
}

/** A variable present in both snapshots, with at least one changed field. */
export interface ManifestVariableUpdate extends ManifestVariableRef {
  /** Every field that changed between the previous and current snapshot. */
  readonly changes: readonly ManifestFieldChange[]
}

/**
 * The result of diffing two `ContractModel.contracts` arrays -- see
 * `diffContracts()`. Comprehensive by construction: every own field of
 * `ContractModelContract`/`ContractModelVariable` (schema facts --
 * `hasDefault`/`processorSource`/`validatorSource`/... -- alongside
 * documented metadata) participates, and every discovered contract is
 * covered, not only active ones. A field-by-field, hand-maintained diff
 * (this module's previous design) would need updating by hand every time
 * Contract Model gains a field; the generic differ below can't drift out of
 * sync with the model it diffs.
 */
export interface ManifestChangeReport {
  /** Contracts present now but not in the previous snapshot. */
  readonly addedContracts: readonly ManifestContractRef[]
  /** Contracts present in the previous snapshot but not now. */
  readonly removedContracts: readonly ManifestContractRef[]
  /** Variables present now but not in the previous snapshot. */
  readonly addedVariables: readonly ManifestVariableRef[]
  /** Variables present in the previous snapshot but not now. */
  readonly removedVariables: readonly ManifestVariableRef[]
  /** Contracts present in both snapshots with at least one changed field. */
  readonly updatedContracts: readonly ManifestContractUpdate[]
  /** Variables present in both snapshots with at least one changed field. */
  readonly updatedVariables: readonly ManifestVariableUpdate[]
}

/** `${file}#${exportName}` -- built here, at the point of use, purely to key the two `Map`s `diffContracts()` matches previous against current with. Deliberately never stored on a ref; see {@link ContractRef}. */
function contractIdentity(contract: ContractRef): string {
  return `${contract.file}#${contract.exportName}`
}

function toContractRef(contract: ContractModelContract): ManifestContractRef {
  return { file: contract.file, exportName: contract.exportName }
}

function toVariableRef(
  contract: ContractModelContract,
  variable: ContractModelVariable,
): ManifestVariableRef {
  return { file: contract.file, exportName: contract.exportName, key: variable.key }
}

/** Any value → its diffable string form. Non-string values (including `undefined`, which passes through) render as their JSON text, so an object/array/number/boolean field is still comparable without a per-field type list. */
function toComparable(value: unknown): string | undefined {
  // Bypassing this early return is behaviorally equivalent, not a real gap:
  // `JSON.stringify(undefined) === undefined` too (verified via a real
  // `node -e` check), so falling through to the final `return
  // JSON.stringify(value)` produces the identical `undefined` result either
  // way. Hand-verified: mutating this and running the real suite
  // (`vitest run test/build/evidence-snapshot.test.ts`) passes unchanged.
  // Stryker disable next-line ConditionalExpression
  if (value === undefined) return undefined
  if (typeof value === "string") return value
  return JSON.stringify(value)
}

/**
 * Walks every own key of `previous`/`current` (except `skipKeys`, the
 * identity fields already used to match this pair up), appending a
 * `ManifestFieldChange` for each that differs. Generic on purpose -- see
 * `ManifestChangeReport`'s own doc comment.
 */
function genericFieldChanges(
  previous: Readonly<Record<string, unknown>>,
  current: Readonly<Record<string, unknown>>,
  skipKeys: ReadonlySet<string>,
): ManifestFieldChange[] {
  const keys = new Set([...Object.keys(previous), ...Object.keys(current)])
  const changes: ManifestFieldChange[] = []
  for (const key of [...keys].sort()) {
    if (skipKeys.has(key)) continue
    const previousValue = previous[key]
    const currentValue = current[key]
    if (deepEqual(previousValue, currentValue)) continue
    // `metadata` is a free-form record (ADR 0035) -- reported per-key
    // (`metadata.<key>`), not as one opaque blob, so a report reader sees
    // exactly which key changed. Every other field (including every other
    // object-shaped one, e.g. `defaultValue`) is reported as a single,
    // whole-value change -- there's no equivalent "named sub-keys a reader
    // would want broken out" structure to any of them.
    if (key === "metadata") {
      changes.push(
        ...recordFieldChanges(
          previousValue as Readonly<Record<string, unknown>> | undefined,
          currentValue as Readonly<Record<string, unknown>> | undefined,
        ),
      )
    } else {
      changes.push({
        field: key,
        previous: toComparable(previousValue),
        current: toComparable(currentValue),
      })
    }
  }
  return changes
}

/** Per-key diff of the `metadata` record -- a changed, added, or removed key each become their own `metadata.<key>` field entry. */
function recordFieldChanges(
  previous: Readonly<Record<string, unknown>> | undefined,
  current: Readonly<Record<string, unknown>> | undefined,
): ManifestFieldChange[] {
  const keys = new Set([...Object.keys(previous ?? {}), ...Object.keys(current ?? {})])
  const changes: ManifestFieldChange[] = []
  for (const key of [...keys].sort()) {
    const previousValue = previous?.[key]
    const currentValue = current?.[key]
    if (!deepEqual(previousValue, currentValue))
      changes.push({
        field: `metadata.${key}`,
        previous: toComparable(previousValue),
        current: toComparable(currentValue),
      })
  }
  return changes
}

/**
 * Deterministic order for every array in a `ManifestChangeReport`: by file,
 * then export name, then (for a variable ref) key. Derives the same total
 * order the removed `identity` field's plain string comparison used to give,
 * from the identity fields themselves -- see {@link ContractRef}.
 */
function byIdentity<T extends ContractRef & { key?: string }>(a: T, b: T): number {
  return (
    a.file.localeCompare(b.file) ||
    a.exportName.localeCompare(b.exportName) ||
    // The `?? ""` fallbacks themselves are unreachable through any real
    // array this function ever sorts: a `ManifestContractRef` never carries
    // a `key` at all, but its own array can never hold two entries sharing
    // both file+exportName (contracts are unique by that pair) so the key
    // term is never reached for them either way; a `ManifestVariableRef`'s
    // `key` is always a real, non-empty string, never `undefined`. Hand-
    // verified: mutating both fallbacks to a distinguishing sentinel and
    // running the real suite (this file plus
    // check-artifacts.test.ts/generate-evidence.test.ts) passes unchanged.
    // Stryker disable next-line StringLiteral
    (a.key ?? "").localeCompare(b.key ?? "")
  )
}

/**
 * Pure. `previous === undefined` (no snapshot last time, for any reason --
 * see `EvidenceSnapshotReadResult`) reports everything in `current` as
 * added, nothing as removed/updated.
 */
export function diffContracts(
  previous: readonly ContractModelContract[] | undefined,
  current: readonly ContractModelContract[],
): ManifestChangeReport {
  const previousContracts = new Map((previous ?? []).map((c) => [contractIdentity(c), c]))
  const currentContracts = new Map(current.map((c) => [contractIdentity(c), c]))

  const addedContracts: ManifestContractRef[] = []
  const removedContracts: ManifestContractRef[] = []
  const updatedContracts: ManifestContractUpdate[] = []
  const addedVariables: ManifestVariableRef[] = []
  const removedVariables: ManifestVariableRef[] = []
  const updatedVariables: ManifestVariableUpdate[] = []

  for (const [identity, currentContract] of currentContracts) {
    const previousContract = previousContracts.get(identity)

    if (!previousContract) {
      addedContracts.push(toContractRef(currentContract))
    } else {
      const changes = genericFieldChanges(
        previousContract as unknown as Record<string, unknown>,
        currentContract as unknown as Record<string, unknown>,
        new Set([
          // "file"/"exportName" can never actually differ here: both
          // contracts of a matched pair share the same Map key
          // (`contractIdentity()`), itself derived from file+exportName, so
          // they're always structurally equal for two contracts matched
          // into one updatedContracts entry. Hand-verified equivalent via
          // direct mutation + a real suite run.
          // Stryker disable next-line StringLiteral
          "file",
          // Stryker disable next-line StringLiteral
          "exportName",
          // Genuinely skipped AND real-tested -- see "does not report the
          // whole variables array as a changed field" below.
          "variables",
        ]),
      )
      if (changes.length > 0) updatedContracts.push({ ...toContractRef(currentContract), changes })
    }

    // This `?? []` fallback only ever fires when `previousContract` itself
    // is undefined (a real contract's `.variables` is never undefined). In
    // that exact case, poisoning it with a garbage element is unobservable:
    // (a) `previousVariables.get(key)` below is only ever called with a REAL
    // current variable's key -- `.map((v) => [v.key, v])` on a garbage
    // STRING element reads `.key` off a string (always `undefined`), so the
    // poisoned entry's own Map key is `undefined`, which no real variable
    // key can ever equal; (b) the one place `previousVariables` is iterated
    // directly (the removed-variables loop below) is already gated by `if
    // (previousContract)`, itself proven redundant-but-narrowing above --
    // when `previousContract` is undefined, that loop never runs regardless
    // of what garbage this Map might contain. Hand-verified: mutating this
    // and running the real suite passes unchanged.
    // Stryker disable next-line ArrayDeclaration
    const previousVariables = new Map((previousContract?.variables ?? []).map((v) => [v.key, v]))
    const currentVariables = new Map(currentContract.variables.map((v) => [v.key, v]))

    for (const [key, currentVariable] of currentVariables) {
      const previousVariable = previousVariables.get(key)
      if (!previousVariable) {
        addedVariables.push(toVariableRef(currentContract, currentVariable))
        continue
      }
      // Same reasoning as the "file"/"exportName" skip above, one level
      // down: `previousVariable` and `currentVariable` are matched via this
      // exact same `key` (both retrieved by it), so their own `.key` fields
      // are always structurally equal -- `deepEqual`'s own equality check
      // already `continue`s past an unchanged "key" with or without this
      // skip. Hand-verified equivalent via direct mutation + a real suite
      // run (both the array and its one string element).
      // Stryker disable ArrayDeclaration,StringLiteral
      const changes = genericFieldChanges(
        previousVariable as unknown as Record<string, unknown>,
        currentVariable as unknown as Record<string, unknown>,
        new Set(["key"]),
      )
      // Stryker restore ArrayDeclaration,StringLiteral
      if (changes.length > 0)
        updatedVariables.push({ ...toVariableRef(currentContract, currentVariable), changes })
    }

    // Bypassing this guard is behaviorally equivalent, not a real gap:
    // `previousVariables` (above) is ALWAYS empty whenever `previousContract`
    // is undefined (its own `?? []` fallback), so the loop below is already
    // a no-op in that case regardless of this guard -- the guard exists only
    // so TypeScript narrows `previousContract` to `ContractModelContract`
    // (not `| undefined`) for `toVariableRef`'s first argument, the same
    // "redundant at runtime, needed for TS narrowing" class already
    // documented for `registry.ts`/`create.ts`/`check-artifacts.ts`. Hand-
    // verified: mutating this and running the real suite passes unchanged.
    // Stryker disable next-line ConditionalExpression
    if (previousContract) {
      for (const [key, previousVariable] of previousVariables) {
        if (!currentVariables.has(key))
          removedVariables.push(toVariableRef(previousContract, previousVariable))
      }
    }
  }

  for (const [identity, previousContract] of previousContracts) {
    if (currentContracts.has(identity)) continue
    removedContracts.push(toContractRef(previousContract))
    for (const variable of previousContract.variables)
      removedVariables.push(toVariableRef(previousContract, variable))
  }

  return {
    addedContracts: addedContracts.sort(byIdentity),
    removedContracts: removedContracts.sort(byIdentity),
    addedVariables: addedVariables.sort(byIdentity),
    removedVariables: removedVariables.sort(byIdentity),
    updatedContracts: updatedContracts.sort(byIdentity),
    updatedVariables: updatedVariables.sort(byIdentity),
  }
}

/** Distinguishes *why* there's no usable previous snapshot, rather than collapsing every case into a bare `undefined`. A missing file is the normal, silent, expected first-run/never-configured case. An unparseable file or a `schemaVersion` this build doesn't recognize are both real, diagnosable problems. */
export type EvidenceSnapshotReadResult =
  | { readonly status: "missing" }
  | { readonly status: "invalid-json"; readonly detail: string }
  | { readonly status: "unsupported-version"; readonly foundVersion: unknown }
  | { readonly status: "ok"; readonly snapshot: EvidenceModel }

export async function readEvidenceSnapshot(
  snapshotPath: string,
  fs: BuildFileSystem,
): Promise<EvidenceSnapshotReadResult> {
  let text: string
  try {
    // "utf8" vs "" encoding equivalence, same established class as
    // resolve-package-schema.ts/evidence-cache.ts/evidence-fingerprint.ts:
    // the result is immediately JSON.parse()d below, and JSON.parse()
    // coerces a Buffer (what "" would return) via .toString() identically
    // to a decoded string for any valid-UTF-8 JSON text.
    // Stryker disable next-line StringLiteral
    text = await fs.readFile(snapshotPath, "utf8")
  } catch {
    return { status: "missing" }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    return {
      status: "invalid-json",
      detail: error instanceof Error ? error.message : String(error),
    }
  }

  const foundVersion = (parsed as { schemaVersion?: unknown } | null)?.schemaVersion
  if (foundVersion !== EVIDENCE_MODEL_SCHEMA_VERSION)
    return { status: "unsupported-version", foundVersion }

  return { status: "ok", snapshot: parsed as EvidenceModel }
}

export async function writeEvidenceSnapshot(
  snapshotPath: string,
  snapshot: EvidenceModel,
  fs: BuildFileSystem,
): Promise<void> {
  await fs.mkdir(path.dirname(snapshotPath), { recursive: true })
  // "utf8" vs "" encoding equivalence -- verified via a real `node -e`
  // byte-for-byte comparison of the two written files (both encodings write
  // a string's UTF-8 bytes identically; "" is not a special "raw" mode for
  // writeFile the way it changes readFile's return type).
  // Stryker disable next-line StringLiteral
  await fs.writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8")
}

/**
 * `snapshot`, with two fields normalized to a constant -- the comparison
 * basis `--check` uses:
 *
 * - `provenance.generatedAt` is a live timestamp stamped fresh on every real
 *   `generate` run; comparing it byte-for-byte against a
 *   freshly-rendered-for-`--check` copy would report drift every single
 *   time, even with zero real changes, since the two renders' timestamps
 *   can never match. `toolVersion`/`commit` stay compared as-is -- both are
 *   real, meaningfully-stable provenance across a `--check` run and the
 *   `generate` run it's verifying, not something that varies on its own.
 * - `change` describes "what's different from whatever snapshot was on disk
 *   the moment this run computed it" -- inherently not reproducible by a
 *   second computation, since by the time `--check` re-derives it, the file
 *   just written *is* the new baseline (the diff naturally comes back empty
 *   against itself). This isn't drift; it's `change`'s own definition, so
 *   `--check` doesn't attempt to re-verify it, the same treatment as
 *   `generatedAt`.
 * - every `now`-relative expiry countdown -- `lifecycle.expiring[].daysRemaining`
 *   and the day-count inside an `EXPIRED`/`EXPIRING_SOON` finding message -- is
 *   the same class as `generatedAt`: a static `expiresAt` produces a different
 *   number every day, so a committed artifact would go "stale" with zero real
 *   edits. Normalized to a constant so `--check` (and the golden tests) verify
 *   the substance, not the calendar. The raw `expiresAt` strings stay compared.
 */
// A module-level `const` regex, evaluated once at module load -- the
// documented Stryker "static" covered-mutant false-Survivor
// (ignoreStatic + perTest can't attribute a mutant evaluated once at module
// load, even with real, passing test coverage; see
// [[feedback_stryker_mutation_score_formula]] and reference-projections.ts's
// own identical pattern in both this package and data-cap). Confirmed here:
// Stryker's own JSON report attributes both Regex mutants below to
// test/cli/direct-run.test.ts's 3 unrelated tests, not to any test that
// actually exercises this regex. Hand-verified killed instead: mutating
// `\d+` to `\d` or `\D+` and running the real suite
// (`vitest run test/build/evidence-snapshot.test.ts`) fails the "masks the
// day count in EXPIRED/EXPIRING_SOON finding messages" test (its "15
// day(s)" fixture was chosen specifically to distinguish both mutants).
// Stryker disable next-line Regex
const EXPIRY_DAY_COUNT = /\b\d+ day\(s\)/g

export function normalizeEvidenceSnapshotForComparison(snapshot: EvidenceModel): EvidenceModel {
  return {
    ...snapshot,
    provenance: { ...snapshot.provenance, generatedAt: "" },
    change: {
      ...snapshot.change,
      manifest: {
        addedContracts: [],
        removedContracts: [],
        addedVariables: [],
        removedVariables: [],
        updatedContracts: [],
        updatedVariables: [],
      },
      renamedVariables: [],
    },
    lifecycle: {
      ...snapshot.lifecycle,
      expiring: snapshot.lifecycle.expiring.map((entry) => ({ ...entry, daysRemaining: 0 })),
    },
    finding: {
      ...snapshot.finding,
      findings: snapshot.finding.findings.map((f) =>
        f.code === "EXPIRED" || f.code === "EXPIRING_SOON"
          ? { ...f, message: f.message.replace(EXPIRY_DAY_COUNT, "N day(s)") }
          : f,
      ),
    },
  }
}

/** Everything reading a previous evidence snapshot and diffing the current run against it produces, in one call. Never writes anything itself -- writing the fresh snapshot stays a separate, explicit step on the real write path. */
export interface EvidenceChangesComputation {
  readonly report: ManifestChangeReport
  /** Set only when the previous snapshot existed but was unusable (corrupt JSON or an unrecognized `schemaVersion`) -- never set for the ordinary "no snapshot yet" first-run case. */
  readonly readWarning: ParseWarning | undefined
  readonly dynamicAccessAcknowledgments: ReadonlyMap<string, readonly DynamicAccessAssertion[]>
  readonly dynamicAccessCitationProblems: readonly DynamicAccessCitationProblem[]
}

/**
 * The one I/O-performing helper every caller wanting change/citation-freshness
 * data shares: reads the previous evidence snapshot (if `snapshotPath` is
 * given and a file exists there), diffs the current run's `ContractModel`
 * against it, and re-checks every current `dynamicAccess` citation's
 * freshness. `snapshotPath` is always caller-supplied, directly -- there is
 * no derivation from a manifest's own output path.
 */
export async function computeEvidenceChanges(
  root: string,
  snapshotPath: string,
  activeContracts: readonly DiscoveredContract[],
  currentContracts: readonly ContractModelContract[],
  readFile: (filePath: string) => Promise<string>,
  fs: BuildFileSystem,
): Promise<EvidenceChangesComputation> {
  const read = await readEvidenceSnapshot(snapshotPath, fs)

  let previous: EvidenceModel | undefined
  let readWarning: ParseWarning | undefined

  if (read.status === "invalid-json") {
    readWarning = {
      file: snapshotPath,
      message: `Evidence snapshot could not be parsed as JSON (${read.detail}); treating this run as if no previous snapshot existed.`,
    }
  } else if (read.status === "unsupported-version") {
    readWarning = {
      file: snapshotPath,
      message: `Evidence snapshot has schemaVersion ${JSON.stringify(read.foundVersion)}, which this version of env-cap does not understand (expected ${EVIDENCE_MODEL_SCHEMA_VERSION}); treating this run as if no previous snapshot existed.`,
    }
  }
  // A separate top-level `if`, not an `else if` chained onto the block
  // above -- deliberately, so this line's own disable comment (below)
  // reliably attaches to it (an `else if` chained after a closing `}` does
  // not, the same AST-leading-comment-attachment issue already documented
  // for a `catch` clause). Bypassing this condition is behaviorally
  // equivalent, not a real gap: by elimination, the only remaining status
  // once the two branches above don't match is "missing", whose
  // `EvidenceSnapshotReadResult` variant carries no `.snapshot` field at all
  // -- `read.snapshot` reads `undefined` off it either way, identical to
  // `previous`'s own untouched initial value. Hand-verified: mutating this
  // and running the real suite (this file plus
  // check-artifacts.test.ts/generate-evidence.test.ts) passes unchanged.
  // Stryker disable next-line ConditionalExpression
  if (read.status === "ok") {
    previous = read.snapshot
  }

  const dynamicAccessAcknowledgments = await buildCitationSnapshots(
    activeContracts,
    previous,
    root,
    readFile,
  )

  return {
    report: diffContracts(previous?.contract.contracts, currentContracts),
    readWarning,
    dynamicAccessAcknowledgments,
    dynamicAccessCitationProblems: verifyDynamicAccessCitations(
      activeContracts,
      root,
      dynamicAccessAcknowledgments,
    ),
  }
}
