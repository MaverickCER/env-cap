import type { SourcePosition } from "./source-position.js"

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

/**
 * The one shape every model in this package uses to point at a declared
 * contract: the file it's declared in, and the binding it's exported as.
 * Nothing else -- see ADR 0039.
 *
 * @remarks
 * Deliberately *not* carrying `contractName`. A display name is a rendering
 * concern, resolved on demand from `ContractModel` (the one model that owns
 * it) by whichever renderer actually needs prose; duplicating it onto every
 * reference made it a second, independently-stale copy of a fact that can
 * change under a `documentEnv()` edit. Deliberately not carrying a
 * pre-formatted `identity` string either -- `${file}#${exportName}` is
 * trivially derivable, and a stored copy is one more thing that can disagree
 * with the two fields it was built from. Code that genuinely needs a map key
 * builds that string locally, at the point of use.
 */
export interface ContractRef {
  /** Root-relative, POSIX-separated path of the file declaring the contract -- see `displayPath()`. */
  readonly file: string
  /** The binding name the `createEnv()` result is exported as. */
  readonly exportName: string
}

/** Points at a declared contract and, optionally, one of its variables -- the shape every `CompatibilityIssue`/documentation finding can be resolved to. Unlike {@link ContractRef}, both identity fields are optional here: a finding can legitimately know only the file (an unresolvable `documentEnv()` link) or neither. */
export interface ContractEvidenceReference {
  readonly model: "contract"
  /** Root-relative, POSIX-separated path of the file declaring the contract, when known -- see `displayPath()`. */
  readonly file: string | undefined
  /** The contract's exported binding name, when known. */
  readonly exportName: string | undefined
  /** The environment variable name, when the finding is variable-level rather than contract-level. */
  readonly variable: string | undefined
  /** Exact file:line:column this finding is about -- the contract's `createEnv()` declaration, its `documentEnv()` declaration, or the specific variable's own declaration, whichever is most relevant to the finding. `undefined` only when no single position is more relevant than another (e.g. an `indeterminate-ownership` finding, which can have multiple candidate sites -- see `IndeterminateOwnershipFinding.dynamicAccessSites` for the full list instead). See ADR 0036. */
  readonly position: SourcePosition | undefined
}

/** Points at a contract by name for an ownership/usage finding -- `usage-report.ts`'s finding types don't consistently carry `file`/`exportName` together, only `contractName`. */
export interface OwnershipEvidenceReference {
  readonly model: "ownership"
  readonly contractName: string
  /** Root-relative path of the file declaring the contract, when the source finding carries one. */
  readonly file: string | undefined
  /** The environment variable name, when the finding is variable-level rather than contract-level. */
  readonly variable: string | undefined
  /** See {@link ContractEvidenceReference.position}. */
  readonly position: SourcePosition | undefined
}

/** Points at a generated artifact's path -- what `checkEnvArtifacts()`'s drift findings are about, not a declared contract or variable at all. */
export interface ChangeEvidenceReference {
  readonly model: "change"
  /** Absolute path of the generated artifact. */
  readonly path: string
}
