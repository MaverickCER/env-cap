/**
 * A structured pointer back to where a `Finding` (or, later, any other
 * model's derived fact) came from -- never a formatted string. See ADR 0024
 * and ADR 0026.
 *
 * @remarks
 * Deliberately only as many `model` variants as something in this codebase
 * actually needs to reference today (`"contract"`, `"ownership"`,
 * `"change"`). This is an additive, growable union, not a speculative
 * six-model union built ahead of a real consumer -- a later phase (e.g. the
 * Dependency or Lifecycle Model) adds its own variant only once a finding
 * or projector genuinely needs to point at it.
 */
export type EvidenceReference =
  ContractEvidenceReference | OwnershipEvidenceReference | ChangeEvidenceReference

/** Points at a declared contract and, optionally, one of its variables -- the shape every `CompatibilityIssue`/documentation finding can be resolved to. */
export interface ContractEvidenceReference {
  readonly model: "contract"
  /** Absolute path of the file declaring the contract, when known. */
  readonly file: string | undefined
  /** The contract's exported binding name, when known. */
  readonly exportName: string | undefined
  /** The environment variable name, when the finding is variable-level rather than contract-level. */
  readonly variable: string | undefined
}

/** Points at a contract by name for an ownership/usage finding -- `usage-report.ts`'s finding types don't consistently carry `file`/`exportName` together, only `contractName`. */
export interface OwnershipEvidenceReference {
  readonly model: "ownership"
  readonly contractName: string
  /** Root-relative path of the file declaring the contract, when the source finding carries one. */
  readonly file: string | undefined
  /** The environment variable name, when the finding is variable-level rather than contract-level. */
  readonly variable: string | undefined
}

/** Points at a generated artifact's path -- what `checkEnvArtifacts()`'s drift findings are about, not a declared contract or variable at all. */
export interface ChangeEvidenceReference {
  readonly model: "change"
  /** Absolute path of the generated artifact. */
  readonly path: string
}
