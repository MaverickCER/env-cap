import { displayPath } from "./display-path.js"
import { byContractIdentity } from "./sort-by-identity.js"
import { governanceFieldsOf, type EnvGovernanceFields } from "./governance-fields.js"
import type { DiscoveredContract } from "./link.js"
import type { DiscoveredVariableEvidence } from "./parse.js"
import type { PackageOrigin } from "./resolution/resolve-package-schema.js"
import type { SourcePosition } from "./source-position.js"

function relativizePosition(root: string, position: SourcePosition): SourcePosition {
  return { ...position, file: displayPath(root, position.file) }
}

/**
 * The first of env-cap's seven canonical fact models (ADR 0024) -- a
 * versioned, JSON-serializable projection of every declared environment
 * variable's structural and documentation contract. See ADR 0025.
 *
 * @remarks
 * Deliberately broader than the persisted evidence snapshot's
 * (`evidence-snapshot.ts`) `ManifestChangeReport` scope: that diff is scoped
 * to *active* contracts and *only* the `documentEnv()`-sourced fields,
 * matching `renderManifest()`'s own scope (ADR 0021). This model includes
 * every discovered contract regardless of `active`, plus the AST-derived
 * schema facts (`hasDefault`/`hasProcessor`/etc.) the change report
 * deliberately excludes -- both are load-bearing for downstream
 * Finding/Evidence Model work.
 */

/** Bump only when a reader could misinterpret the new shape (a field changes
 *  type/meaning, or is removed) -- NOT for every additive field. Same
 *  discipline `evidence-model.ts`'s `EVIDENCE_MODEL_SCHEMA_VERSION` and
 *  `src/cli/json.ts`'s `JSON_SCHEMA_VERSION` already document. */
export const CONTRACT_MODEL_SCHEMA_VERSION = 3

/**
 * One variable's full statically-discoverable contract: schema-shaped facts plus linked documentation.
 *
 * @see {@link DependencyModelVariable} -- this same declared variable's access status.
 * @see {@link OwnershipModelVariable} -- this same declared variable's effective owner.
 * @see {@link LifecycleModelVariable} -- this same declared variable's lifecycle data.
 * @see `CatalogVariable` (`docs.ts`) -- this same declared variable, reshaped for the generated
 * docs catalog/JSON. Plain reference, not `{@link}`: `CatalogVariable` is intentionally not part
 * of the public surface (see `typedoc.json`'s `intentionallyNotExported`).
 */
export interface ContractModelVariable extends EnvGovernanceFields {
  readonly key: string
  readonly hasDefault: boolean
  readonly defaultValue:
    { readonly ok: true; readonly value: unknown } | { readonly ok: false } | undefined
  readonly hasProcessor: boolean
  readonly processorSource: string | undefined
  readonly processorReturnType: string | undefined
  readonly hasValidator: boolean
  readonly validatorSource: string | undefined
  readonly context: string | undefined
  readonly description: string | undefined
  readonly refreshInstructions: string | undefined
  readonly setupInstructions: string | undefined
  readonly required: boolean | undefined
  readonly documented: boolean
  /** The `evidence` sub-object from this variable's linked documentation -- re-verified every run, unlike every declared-only field above. See {@link runtime.VariableEvidenceDocs} and ADR 0037. */
  readonly evidence: DiscoveredVariableEvidence | undefined
  /** Where this variable's own schema property is declared. See ADR 0036. */
  readonly declaration: SourcePosition
}

/** One `createEnv()` contract's full statically-discoverable contract, active or not. */
export interface ContractModelContract extends EnvGovernanceFields {
  /** Root-relative, POSIX-separated -- matches `DiscoveredContractSummary.file`. */
  readonly file: string
  readonly exportName: string
  readonly contractName: string
  readonly active: boolean
  readonly category: string | undefined
  readonly exclusiveGroup: string | undefined
  readonly variables: readonly ContractModelVariable[]
  readonly documented: boolean
  readonly packageOrigin: PackageOrigin | undefined
  /** Where this contract's `createEnv(...)` call is declared. Always present. See ADR 0036. */
  readonly declaration: SourcePosition
  /** Where this contract's `documentEnv(...)` call is declared, if one exists. See ADR 0036. */
  readonly documentation: SourcePosition | undefined
}

export interface ContractModel {
  readonly schemaVersion: typeof CONTRACT_MODEL_SCHEMA_VERSION
  readonly contracts: readonly ContractModelContract[]
}

/**
 * Projects every discovered contract (active or not) into the Contract
 * Model's versioned, JSON-serializable shape.
 *
 * @remarks
 * Sorted deterministically (by file, then exportName, then variable key), so
 * `JSON.stringify` output is stable and diffs cleanly wherever this is
 * persisted.
 */
export function buildContractModel(
  contracts: readonly DiscoveredContract[],
  root: string,
): ContractModel {
  const projected: ContractModelContract[] = contracts.map((contract) => ({
    file: displayPath(root, contract.file),
    exportName: contract.exportName,
    contractName: contract.contractName,
    active: contract.active,
    category: contract.category,
    exclusiveGroup: contract.exclusiveGroup,
    ...governanceFieldsOf(contract),
    documented: contract.documented,
    packageOrigin: contract.packageOrigin,
    declaration: relativizePosition(root, contract.declaration),
    documentation: contract.documentation && relativizePosition(root, contract.documentation),
    variables: [...contract.variables]
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((variable) => ({
        key: variable.key,
        hasDefault: variable.hasDefault,
        defaultValue: variable.defaultValue,
        hasProcessor: variable.hasProcessor,
        processorSource: variable.processorSource,
        processorReturnType: variable.processorReturnType,
        hasValidator: variable.hasValidator,
        validatorSource: variable.validatorSource,
        context: variable.context,
        description: variable.description,
        // Explicit (not `...governanceFieldsOf`) because this stage interleaves
        // `refreshInstructions`/`setupInstructions`/`required` between the
        // governance fields, and the persisted `env.evidence.json` is compared
        // key-order-sensitively.
        owner: variable.owner,
        sensitivity: variable.sensitivity,
        expiresAt: variable.expiresAt,
        refreshInstructions: variable.refreshInstructions,
        setupInstructions: variable.setupInstructions,
        required: variable.required,
        purpose: variable.purpose,
        legalBasis: variable.legalBasis,
        retention: variable.retention,
        dataResidency: variable.dataResidency,
        auditRequired: variable.auditRequired,
        metadata: variable.metadata,
        documented: variable.documented,
        evidence: variable.evidence,
        declaration: relativizePosition(root, variable.declaration),
      })),
  }))

  projected.sort(byContractIdentity)

  return { schemaVersion: CONTRACT_MODEL_SCHEMA_VERSION, contracts: projected }
}
