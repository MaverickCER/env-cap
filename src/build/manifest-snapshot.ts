import fs from "node:fs/promises"
import path from "node:path"
import type { DiscoveredContract } from "./link.js"
import type { DiscoveredClassification, ParseWarning } from "./parse.js"

/**
 * The manifest's own `.ts` output is deliberately metadata-free (imports +
 * an array, see `manifest.ts`'s docstring) -- there is nothing in it for a
 * later `generateEnvManifest()` run to read back and diff against. This
 * module is the persisted, committed sidecar that makes "what changed in
 * `documentEnv()` since last time" answerable at all. See ADR 0021.
 */

/** Bump only when a reader could misinterpret the new shape (a field changes
 *  type/meaning, or is removed) -- NOT for every additive field. Same
 *  discipline `src/cli/json.ts`'s `JSON_SCHEMA_VERSION` already documents;
 *  this format is meant to stay backwards-compatible across ordinary
 *  releases. */
export const MANIFEST_SNAPSHOT_SCHEMA_VERSION = 1

export interface ManifestSnapshotVariable {
  readonly key: string
  readonly description: string | undefined
  readonly owner: string | undefined
  readonly classification: DiscoveredClassification | undefined
  readonly expiresAt: string | undefined
  readonly refreshInstructions: string | undefined
  readonly required: boolean | undefined
  readonly extra: Readonly<Record<string, string>>
  readonly documented: boolean
}

export interface ManifestSnapshotContract {
  /** Root-relative, POSIX-separated -- matches `DiscoveredContractSummary.file`. */
  readonly file: string
  readonly exportName: string
  readonly contractName: string
  readonly active: boolean
  readonly category: string | undefined
  readonly exclusiveGroup: string | undefined
  readonly owner: string | undefined
  readonly classification: DiscoveredClassification | undefined
  readonly expiresAt: string | undefined
  readonly metadata: Readonly<Record<string, string>> | undefined
  readonly variables: readonly ManifestSnapshotVariable[]
}

export interface ManifestSnapshot {
  readonly schemaVersion: typeof MANIFEST_SNAPSHOT_SCHEMA_VERSION
  readonly contracts: readonly ManifestSnapshotContract[]
}

/**
 * Sorted deterministically (by file, then exportName, then variable key) so
 * `JSON.stringify` output is stable and diffs cleanly in PRs. Scoped to
 * **active** contracts only, matching `renderManifest()`'s own scope -- a
 * contract flipping to `active: false` disappears from `manifest.ts` itself,
 * so it disappears from this snapshot too.
 */
export function buildManifestSnapshot(
  activeContracts: readonly DiscoveredContract[],
  root: string,
): ManifestSnapshot {
  const contracts: ManifestSnapshotContract[] = activeContracts.map((contract) => ({
    file: path.relative(root, contract.file).split(path.sep).join("/"),
    exportName: contract.exportName,
    contractName: contract.contractName,
    active: contract.active,
    category: contract.category,
    exclusiveGroup: contract.exclusiveGroup,
    owner: contract.owner,
    classification: contract.classification,
    expiresAt: contract.expiresAt,
    metadata: contract.metadata,
    variables: [...contract.variables]
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
      .map((variable) => ({
        key: variable.key,
        description: variable.description,
        owner: variable.owner,
        classification: variable.classification,
        expiresAt: variable.expiresAt,
        refreshInstructions: variable.refreshInstructions,
        required: variable.required,
        extra: variable.extra,
        documented: variable.documented,
      })),
  }))

  contracts.sort((a, b) => {
    if (a.file !== b.file) return a.file < b.file ? -1 : 1
    return a.exportName < b.exportName ? -1 : a.exportName > b.exportName ? 1 : 0
  })

  return { schemaVersion: MANIFEST_SNAPSHOT_SCHEMA_VERSION, contracts }
}

/** Derives the sidecar snapshot path from a manifest's own output path (e.g. `src/generated/env.manifest.ts` -> `src/generated/env.manifest.snapshot.json`). */
export function manifestSnapshotPath(manifestOutputPath: string): string {
  const dir = path.dirname(manifestOutputPath)
  const base = path.basename(manifestOutputPath).replace(/\.tsx?$/, "")
  return path.join(dir, `${base}.snapshot.json`)
}

/**
 * Distinguishes *why* there's no usable previous snapshot, rather than
 * collapsing every case into a bare `undefined`. A missing file is the
 * normal, silent, expected first-run case. An unparseable file or a
 * `schemaVersion` this build doesn't recognize are both real, diagnosable
 * problems -- `computeManifestChanges()` below surfaces those two (never
 * `"missing"`) as a `ParseWarning` instead of silently re-baselining.
 */
export type ManifestSnapshotReadResult =
  | { readonly status: "missing" }
  | { readonly status: "invalid-json"; readonly detail: string }
  | { readonly status: "unsupported-version"; readonly foundVersion: unknown }
  | { readonly status: "ok"; readonly snapshot: ManifestSnapshot }

export async function readManifestSnapshot(
  snapshotPath: string,
): Promise<ManifestSnapshotReadResult> {
  let text: string
  try {
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
  if (foundVersion !== MANIFEST_SNAPSHOT_SCHEMA_VERSION) {
    return { status: "unsupported-version", foundVersion }
  }

  return { status: "ok", snapshot: parsed as ManifestSnapshot }
}

export async function writeManifestSnapshot(
  snapshotPath: string,
  snapshot: ManifestSnapshot,
): Promise<void> {
  await fs.mkdir(path.dirname(snapshotPath), { recursive: true })
  await fs.writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8")
}

/** One field's before/after value in a {@link ManifestContractUpdate} or {@link ManifestVariableUpdate}. */
export interface ManifestFieldChange {
  /** The changed field's name (dotted, e.g. `metadata.runbook`, for a per-key record change). */
  readonly field: string
  /** The value from the previous snapshot, or `undefined` if the field was unset. */
  readonly previous: string | undefined
  /** The value in the current run, or `undefined` if the field is now unset. */
  readonly current: string | undefined
}

/** Identifies one contract for {@link ManifestChangeReport} purposes. */
export interface ManifestContractRef {
  /** Stable identity: `${file}#${exportName}`. */
  readonly identity: string
  /** Root-relative, POSIX-separated file path. */
  readonly file: string
  /** The binding name the `createEnv()` result is exported as. */
  readonly exportName: string
  /** Resolved display name (see {@link DiscoveredContract.contractName}). */
  readonly contractName: string
}

/** Identifies one variable for {@link ManifestChangeReport} purposes. */
export interface ManifestVariableRef {
  /** Stable identity: `${contractIdentity}#${key}`. */
  readonly identity: string
  /** The owning contract's {@link ManifestContractRef.identity}. */
  readonly contractIdentity: string
  /** Root-relative, POSIX-separated file path of the owning contract. */
  readonly file: string
  /** The owning contract's exported binding name. */
  readonly exportName: string
  /** The owning contract's resolved display name. */
  readonly contractName: string
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

/** The result of diffing two manifest snapshots -- see `result.manifest.changes` (ADR 0021). */
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

function contractIdentity(contract: { file: string; exportName: string }): string {
  return `${contract.file}#${contract.exportName}`
}

function toContractRef(contract: ManifestSnapshotContract): ManifestContractRef {
  return {
    identity: contractIdentity(contract),
    file: contract.file,
    exportName: contract.exportName,
    contractName: contract.contractName,
  }
}

function toVariableRef(
  contract: ManifestSnapshotContract,
  variable: ManifestSnapshotVariable,
): ManifestVariableRef {
  const contractId = contractIdentity(contract)
  return {
    identity: `${contractId}#${variable.key}`,
    contractIdentity: contractId,
    file: contract.file,
    exportName: contract.exportName,
    contractName: contract.contractName,
    key: variable.key,
  }
}

function toComparable(value: string | boolean | undefined): string | undefined {
  return value === undefined ? undefined : typeof value === "boolean" ? String(value) : value
}

/** Appends a `field` entry to `changes` iff `previous`/`current` differ. */
function pushIfDifferent(
  changes: ManifestFieldChange[],
  field: string,
  previous: string | boolean | undefined,
  current: string | boolean | undefined,
): void {
  const previousValue = toComparable(previous)
  const currentValue = toComparable(current)
  if (previousValue !== currentValue)
    changes.push({ field, previous: previousValue, current: currentValue })
}

function contractFieldChanges(
  previous: ManifestSnapshotContract,
  current: ManifestSnapshotContract,
): ManifestFieldChange[] {
  const changes: ManifestFieldChange[] = []
  pushIfDifferent(changes, "contractName", previous.contractName, current.contractName)
  pushIfDifferent(changes, "active", previous.active, current.active)
  pushIfDifferent(changes, "category", previous.category, current.category)
  pushIfDifferent(changes, "exclusiveGroup", previous.exclusiveGroup, current.exclusiveGroup)
  pushIfDifferent(changes, "owner", previous.owner, current.owner)
  pushIfDifferent(changes, "classification", previous.classification, current.classification)
  pushIfDifferent(changes, "expiresAt", previous.expiresAt, current.expiresAt)
  changes.push(...recordFieldChanges(previous.metadata, current.metadata, "metadata"))
  return changes
}

function variableFieldChanges(
  previous: ManifestSnapshotVariable,
  current: ManifestSnapshotVariable,
): ManifestFieldChange[] {
  const changes: ManifestFieldChange[] = []
  pushIfDifferent(changes, "description", previous.description, current.description)
  pushIfDifferent(changes, "owner", previous.owner, current.owner)
  pushIfDifferent(changes, "classification", previous.classification, current.classification)
  pushIfDifferent(changes, "expiresAt", previous.expiresAt, current.expiresAt)
  pushIfDifferent(
    changes,
    "refreshInstructions",
    previous.refreshInstructions,
    current.refreshInstructions,
  )
  pushIfDifferent(changes, "required", previous.required, current.required)
  pushIfDifferent(changes, "documented", previous.documented, current.documented)
  changes.push(...recordFieldChanges(previous.extra, current.extra, "extra"))
  return changes
}

/** Per-key diff of an arbitrary `extra`/`metadata` record -- a changed, added, or removed key each become their own `<prefix>.<key>` field entry. */
function recordFieldChanges(
  previous: Readonly<Record<string, string>> | undefined,
  current: Readonly<Record<string, string>> | undefined,
  prefix: string,
): ManifestFieldChange[] {
  const keys = new Set([...Object.keys(previous ?? {}), ...Object.keys(current ?? {})])
  const changes: ManifestFieldChange[] = []
  for (const key of [...keys].sort()) {
    const previousValue = previous?.[key]
    const currentValue = current?.[key]
    if (previousValue !== currentValue)
      changes.push({ field: `${prefix}.${key}`, previous: previousValue, current: currentValue })
  }
  return changes
}

function byIdentity<T extends { identity: string }>(a: T, b: T): number {
  return a.identity < b.identity ? -1 : a.identity > b.identity ? 1 : 0
}

/**
 * Pure. `previous === undefined` (no snapshot last time, for any reason --
 * see `ManifestSnapshotReadResult`) reports everything in `current` as
 * added, nothing as removed/updated.
 */
export function diffManifestSnapshots(
  previous: ManifestSnapshot | undefined,
  current: ManifestSnapshot,
): ManifestChangeReport {
  const previousContracts = new Map(
    (previous?.contracts ?? []).map((c) => [contractIdentity(c), c]),
  )
  const currentContracts = new Map(current.contracts.map((c) => [contractIdentity(c), c]))

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
      const changes = contractFieldChanges(previousContract, currentContract)
      if (changes.length > 0) updatedContracts.push({ ...toContractRef(currentContract), changes })
    }

    const previousVariables = new Map((previousContract?.variables ?? []).map((v) => [v.key, v]))
    const currentVariables = new Map(currentContract.variables.map((v) => [v.key, v]))

    for (const [key, currentVariable] of currentVariables) {
      const previousVariable = previousVariables.get(key)
      if (!previousVariable) {
        addedVariables.push(toVariableRef(currentContract, currentVariable))
        continue
      }
      const changes = variableFieldChanges(previousVariable, currentVariable)
      if (changes.length > 0)
        updatedVariables.push({ ...toVariableRef(currentContract, currentVariable), changes })
    }

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

export interface ManifestChangesComputation {
  readonly report: ManifestChangeReport
  readonly snapshot: ManifestSnapshot
  /** Set only when the previous snapshot existed but was unusable (corrupt JSON or an unrecognized `schemaVersion`) -- never set for the ordinary "no snapshot yet" first-run case. */
  readonly readWarning: ParseWarning | undefined
}

/**
 * The one I/O-performing helper both `generateEnvManifest()` and
 * `generate-env-artifacts.ts`'s `computeArtifacts()` share: builds the
 * current snapshot, reads the previous one, diffs. Writing the new snapshot
 * stays a separate, explicit step on the real write path -- this never
 * writes anything itself, so it's safe to call from a read-only compute too.
 */
export async function computeManifestChanges(
  root: string,
  manifestOutputPath: string,
  activeContracts: readonly DiscoveredContract[],
): Promise<ManifestChangesComputation> {
  const snapshot = buildManifestSnapshot(activeContracts, root)
  const snapshotPath = manifestSnapshotPath(manifestOutputPath)
  const read = await readManifestSnapshot(snapshotPath)

  let previous: ManifestSnapshot | undefined
  let readWarning: ParseWarning | undefined

  if (read.status === "invalid-json") {
    readWarning = {
      file: snapshotPath,
      message: `Manifest snapshot could not be parsed as JSON (${read.detail}); treating this run as if no previous snapshot existed.`,
    }
  } else if (read.status === "unsupported-version") {
    readWarning = {
      file: snapshotPath,
      message: `Manifest snapshot has schemaVersion ${JSON.stringify(read.foundVersion)}, which this version of env-cap does not understand (expected ${MANIFEST_SNAPSHOT_SCHEMA_VERSION}); treating this run as if no previous snapshot existed.`,
    }
  } else if (read.status === "ok") {
    previous = read.snapshot
  }

  return { report: diffManifestSnapshots(previous, snapshot), snapshot, readWarning }
}
