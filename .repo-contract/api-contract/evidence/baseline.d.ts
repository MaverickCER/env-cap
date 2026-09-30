/** Bump only when a reader could misinterpret the new shape -- same discipline every other canonical model's `schemaVersion` follows. */
declare const CHANGE_MODEL_SCHEMA_VERSION = 1;

/** Points at a generated artifact's path -- what `checkEnvArtifacts()`'s drift findings are about, not a declared contract or variable at all. */
declare interface ChangeEvidenceReference {
    readonly model: "change";
    /** Absolute path of the generated artifact. */
    readonly path: string;
}

/** The versioned, JSON-serializable root of the Change Model -- what changed since the last persisted evidence snapshot. See this module's own doc comment for the full picture. */
declare interface ChangeModel {
    readonly schemaVersion: typeof CHANGE_MODEL_SCHEMA_VERSION;
    /** The existing manifest change report, unmodified -- see ADR 0021. `addedVariables`/`removedVariables` still list a correlated rename's two halves separately; `renamedVariables` below is an additive, separately-computed view, not a filter over this field. */
    readonly manifest: ManifestChangeReport;
    /**
     * Every `addedVariables`/`removedVariables` pair this run's currently
     * declared `renamedFrom` values correlate into a single rename, sorted by
     * contract identity then current key.
     *
     * @remarks
     * Only ever populated from an *authored* `renamedFrom` -- never guessed
     * from name similarity (ADR 0010's "provable, not heuristic" ethos).
     * Variable-level only: Lifecycle Model deliberately has no contract-level
     * `renamedFrom` (ADR 0029), so there is no `renamedContracts` -- a
     * contract-level rename has no field to correlate from.
     */
    readonly renamedVariables: readonly RenamedVariable[];
}

/**
 * Every stable `code` a check in this file (or `exclusive-group.ts`) can
 * emit. Documented as an enumerated union so a consumer filtering/linking on
 * `code` has a closed list to switch over, rather than an arbitrary string --
 * see ADR 0024/0026. `exclusive-group.ts`'s check does not (yet) set one; see
 * that file's own comment for why.
 */
declare type CompatibilityIssueCode = "PROCESSOR_RETURN_TYPE_CONFLICT" | "PROCESSOR_SOURCE_CONFLICT" | "VALIDATOR_SOURCE_CONFLICT" | "DUPLICATE_VARIABLE_DOCUMENTATION" | "DUPLICATE_VARIABLE_SHAPE_ACROSS_CONTRACTS";

/** Bump only when a reader could misinterpret the new shape (a field changes
 *  type/meaning, or is removed) -- NOT for every additive field. Same
 *  discipline `evidence-model.ts`'s `EVIDENCE_MODEL_SCHEMA_VERSION` and
 *  `src/cli/json.ts`'s `JSON_SCHEMA_VERSION` already document. */
declare const CONTRACT_MODEL_SCHEMA_VERSION = 3;

/** Points at a declared contract and, optionally, one of its variables -- the shape every `CompatibilityIssue`/documentation finding can be resolved to. Unlike {@link ContractRef}, both identity fields are optional here: a finding can legitimately know only the file (an unresolvable `documentEnv()` link) or neither. */
declare interface ContractEvidenceReference {
    readonly model: "contract";
    /** Root-relative, POSIX-separated path of the file declaring the contract, when known -- see `displayPath()`. */
    readonly file: string | undefined;
    /** The contract's exported binding name, when known. */
    readonly exportName: string | undefined;
    /** The environment variable name, when the finding is variable-level rather than contract-level. */
    readonly variable: string | undefined;
    /** Exact file:line:column this finding is about -- the contract's `createEnv()` declaration, its `documentEnv()` declaration, or the specific variable's own declaration, whichever is most relevant to the finding. `undefined` only when no single position is more relevant than another (e.g. an `indeterminate-ownership` finding, which can have multiple candidate sites -- see `IndeterminateOwnershipFinding.dynamicAccessSites` for the full list instead). See ADR 0036. */
    readonly position: SourcePosition | undefined;
}

/** The versioned, JSON-serializable root of the Contract Model -- every discovered `createEnv()` contract (active or not), each with its own full statically-discoverable shape. See {@link ContractModelContract}. */
declare interface ContractModel {
    readonly schemaVersion: typeof CONTRACT_MODEL_SCHEMA_VERSION;
    readonly contracts: readonly ContractModelContract[];
}

/** One `createEnv()` contract's full statically-discoverable contract, active or not. */
declare interface ContractModelContract extends EnvGovernanceFields {
    /** Root-relative, POSIX-separated -- matches `DiscoveredContractSummary.file`. */
    readonly file: string;
    readonly exportName: string;
    readonly contractName: string;
    readonly active: boolean;
    readonly category: string | undefined;
    readonly exclusiveGroup: string | undefined;
    readonly variables: readonly ContractModelVariable[];
    readonly documented: boolean;
    readonly packageOrigin: PackageOrigin | undefined;
    /** Where this contract's `createEnv(...)` call is declared. Always present. See ADR 0036. */
    readonly declaration: SourcePosition;
    /** Where this contract's `documentEnv(...)` call is declared, if one exists. See ADR 0036. */
    readonly documentation: SourcePosition | undefined;
}

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
declare interface ContractModelVariable extends EnvGovernanceFields {
    readonly key: string;
    readonly hasDefault: boolean;
    readonly defaultValue: {
        readonly ok: true;
        readonly value: unknown;
    } | {
        readonly ok: false;
    } | undefined;
    readonly hasProcessor: boolean;
    readonly processorSource: string | undefined;
    readonly processorReturnType: string | undefined;
    readonly hasValidator: boolean;
    readonly validatorSource: string | undefined;
    readonly context: string | undefined;
    readonly description: string | undefined;
    readonly refreshInstructions: string | undefined;
    readonly setupInstructions: string | undefined;
    readonly required: boolean | undefined;
    readonly documented: boolean;
    /** The `evidence` sub-object from this variable's linked documentation -- re-verified every run, unlike every declared-only field above. See {@link runtime.VariableEvidenceDocs} and ADR 0037. */
    readonly evidence: DiscoveredVariableEvidence | undefined;
    /** Where this variable's own schema property is declared. See ADR 0036. */
    readonly declaration: SourcePosition;
}

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
declare interface ContractRef {
    /** Root-relative, POSIX-separated path of the file declaring the contract -- see `displayPath()`. */
    readonly file: string;
    /** The binding name the `createEnv()` result is exported as. */
    readonly exportName: string;
}

/**
 * Declares a projection: a named, pure transform from the immutable
 * `EvidenceModel` to any consumer-defined output shape, built entirely from
 * `schema`'s independent per-field projector functions -- see ADR 0031/0032.
 *
 * env-cap's own reference projections (`.env.example`, Environment
 * Configuration Reference, Configuration Ownership, etc.) are built through
 * this exact function, with no privileged internal path -- a consumer's own
 * projection is a first-class citizen, not a lesser one.
 */
export declare function defineEvidenceProjection<T extends Record<string, unknown>>(schema: EvidenceProjectionSchema<T>): EvidenceProjection<T>;

/** Bump only when a reader could misinterpret the new shape -- same discipline every other canonical model's `schemaVersion` follows. */
declare const DEPENDENCY_MODEL_SCHEMA_VERSION = 2;

/** The versioned, JSON-serializable root of the Dependency Model -- see this module's own doc comment for the full picture. */
declare interface DependencyModel {
    readonly schemaVersion: typeof DEPENDENCY_MODEL_SCHEMA_VERSION;
    readonly contracts: readonly DependencyModelContract[];
    /** Inverse of `contracts[].consumingFiles` -- one entry per file that consumes at least one contract, listing which contracts it reads. */
    readonly consumers: readonly DependencyModelConsumer[];
    readonly warnings: readonly ParseWarning[];
    /** Every surface actually scanned for usage -- see ADR 0036. Always has at least one entry (the application root). */
    readonly scannedSurfaces: readonly ScannedSurface[];
}

/** One consuming file, and every contract it depends on -- the inverse of `DependencyModelContract.consumingFiles`. */
declare interface DependencyModelConsumer {
    /** Root-relative, POSIX-separated. */
    readonly file: string;
    readonly contracts: readonly DependencyModelContractRef[];
}

/** One contract's dependency-ownership facts: which variables were accessed, which files consume it, and every dynamic/ambiguous access site found. See {@link DependencyModelVariable} for the per-variable breakdown. */
declare interface DependencyModelContract {
    /** Root-relative, POSIX-separated -- matches `ContractModelContract.file`. */
    readonly file: string;
    readonly exportName: string;
    readonly contractName: string;
    readonly imported: boolean;
    readonly hasDynamicAccess: boolean;
    readonly variables: readonly DependencyModelVariable[];
    /** Every file coupled to this contract -- contract-level "who depends on this," not proof any specific variable was read. */
    readonly consumingFiles: readonly string[];
    /** Files whose import of this contract's name couldn't be verified because it resolved through a file containing an unresolved wildcard re-export. */
    readonly ambiguousBarrelFiles: readonly string[];
    /** Every computed (dynamic) property-access site observed anywhere on this contract -- see ADR 0036. */
    readonly dynamicAccessSites: readonly SourcePosition[];
}

/** One contract, as referenced from the inverse (`consumers`) index -- see {@link ContractRef} for why no `contractName` is carried here. */
declare type DependencyModelContractRef = ContractRef;

/**
 * One variable's access status within a contract, plus every position it was found
 * member-accessed at, aggregated across every consuming file.
 *
 * @see {@link ContractModelVariable} -- this same declared variable's canonical starting point.
 */
declare interface DependencyModelVariable {
    readonly key: string;
    readonly status: VariableAccessStatus;
    /** Empty unless `status === "used"`. Previously discarded before reaching any public type -- see ADR 0027 (line only) and ADR 0036 (full position, file included per entry). */
    readonly positions: readonly SourcePosition[];
    /** Every developer-declared `dynamicAccess` citation's current freshness for this variable -- a wholly separate, independent fact from `status` above, never folded into it. Empty when no citation was declared, or when no manifest snapshot baseline was available to check against (the manifest pass wasn't also requested). See ADR 0037. */
    readonly dynamicAccessAssertions: readonly DynamicAccessAssertion[];
}

/** The statically-extracted contents of one variable's `evidence` sub-object. See {@link runtime.VariableEvidenceDocs}. */
declare interface DiscoveredVariableEvidence {
    /** Well-formed `"path:line:column"` entries from `evidence.dynamicAccess`, if set to an array of string literals -- a malformed entry warns and is dropped, never included here. See ADR 0037. */
    readonly dynamicAccess: readonly string[] | undefined;
}

/**
 * One developer-declared {@link runtime.VariableEvidenceDocs.dynamicAccess} citation's
 * current acknowledgment state -- a claim, never an observation. Kept fully
 * separate from `VariableAccessStatus` (which stays exactly 3-valued and
 * purely AST-derived) so a developer's assertion can never make env-cap
 * claim it observed something it didn't. See
 * `evidence-snapshot.ts`'s `computeDynamicAccessAcknowledgments()` (where
 * this is computed) and ADR 0037.
 */
declare interface DynamicAccessAssertion extends SourcePosition {
    /**
     * `"fresh"` -- the cited file currently exists and either matches the
     * committed baseline hash or has no baseline yet (a brand-new citation,
     * nothing to contradict it yet). `"stale"` -- the cited file exists but its
     * content has changed since the committed baseline. `"missing"` -- the
     * cited file no longer exists at all. Re-derived from scratch every run;
     * never cached across runs.
     */
    readonly acknowledgment: "fresh" | "stale" | "missing";
    /**
     * SHA-256 hex digest of the cited file's content *as observed this run* --
     * `undefined` iff `acknowledgment === "missing"` (nothing to hash). This is
     * the one field that makes freshness checking possible without a
     * snapshot-only shadow type: the live `EvidenceModel.dependency` a caller
     * gets back and the persisted evidence snapshot a later run reads back as
     * its baseline are the exact same shape -- this run's `contentHash` becomes
     * next run's comparison target directly. See `evidence-snapshot.ts` and
     * ADR 0037.
     */
    readonly contentHash: string | undefined;
}

/**
 * The declared governance-metadata field set every pipeline-stage contract and
 * variable type carries -- `owner` through `metadata`. The field names and types
 * are identical at every stage (parse -> link -> contract-model -> docs); only
 * the surrounding context differs (a `parse`-stage value is "statically resolved
 * from a string literal, or `undefined`"; a `link`/`contract-model`-stage value
 * is "from the linked `documentEnv()` call, or `undefined`"). This is the single
 * source of truth for the shape; each stage interface `extends` it.
 *
 * `metadata` is the open bag for keys `env-cap` has no named concept for (ADR
 * 0037); `dataResidency`/`auditRequired`/`legalBasis`/`purpose`/`retention` are
 * presence-only governance facts, never verified.
 *
 * Internal -- not re-exported from the public `.` barrel.
 */
declare interface EnvGovernanceFields {
    readonly owner: string | undefined;
    readonly sensitivity: string | undefined;
    readonly expiresAt: string | undefined;
    readonly purpose: string | undefined;
    readonly legalBasis: string | undefined;
    readonly retention: string | undefined;
    readonly dataResidency: string | readonly string[] | undefined;
    readonly auditRequired: boolean | undefined;
    readonly metadata: Readonly<Record<string, unknown>> | undefined;
}

/**
 * Bump only when a reader could misinterpret the new shape of `EvidenceModel`
 * itself (not any one sub-model's own `<MODEL>_SCHEMA_VERSION`, which is
 * versioned independently) -- same rule every other canonical model follows.
 */
declare const EVIDENCE_MODEL_SCHEMA_VERSION = 1;

/**
 * The seventh canonical fact model (ADR 0024): the assembled union of the
 * other six, plus provenance, the immutable input every
 * `defineEvidenceProjection()` projector runs over (`env-cap/evidence`,
 * ADR 0031).
 *
 * @remarks
 * This type is the one intentional exception to `src/build/`'s zero-
 * cross-folder-import rule: `src/evidence/` imports it with `import type`
 * only (fully erased at compile time under `verbatimModuleSyntax`), the same
 * shape as `helpers`' single sanctioned edge onto `runtime` -- see
 * `specs/architecture.md`. `src/evidence/` never imports a *value* from
 * here, only this shape, so it stays isomorphic and Node-free. An actual
 * `EvidenceModel` instance is produced by {@link generateEvidenceModel}
 * (`env-cap/build`, Node-only), which runs discovery once,
 * builds all six sub-models, and `deepFreeze()`s the result.
 */
export declare interface EvidenceModel {
    readonly schemaVersion: typeof EVIDENCE_MODEL_SCHEMA_VERSION;
    readonly provenance: EvidenceProvenance;
    readonly contract: ContractModel;
    readonly dependency: DependencyModel;
    readonly ownership: OwnershipModel;
    readonly lifecycle: LifecycleModel;
    readonly finding: FindingModel;
    readonly change: ChangeModel;
}

/**
 * The function `defineEvidenceProjection()` returns. Callable directly for
 * the common case (`projection(evidence)` -> `T`); `.project()` returns the
 * same value alongside automatic provenance -- see ADR 0032.
 */
export declare interface EvidenceProjection<T extends Record<string, unknown>> {
    (evidence: EvidenceModel): T;
    /** Same computation as calling the projection directly, plus which `EvidenceModel` field paths fed each output key -- see {@link EvidenceProjectionResult}. */
    project(evidence: EvidenceModel): EvidenceProjectionResult<T>;
}

/** `project()`'s return shape: the computed output, plus which `EvidenceModel` field paths fed each output key. */
export declare interface EvidenceProjectionResult<T extends Record<string, unknown>> {
    readonly value: T;
    readonly sources: Readonly<Record<keyof T, readonly string[]>>;
}

/** One independent, pure projector function per key of the projection's output shape `T`. */
export declare type EvidenceProjectionSchema<T extends Record<string, unknown>> = {
    readonly [K in keyof T]: EvidenceProjector<T[K]>;
};

/**
 * A pure function from the full Evidence Model to one field of a
 * projection's output shape. Must not mutate `evidence` -- the membrane
 * `defineEvidenceProjection()` wraps it in enforces that at runtime, see
 * `createTrackingProxy()` below -- and must not perform I/O; env-cap can
 * enforce the read-only half of purity but not the "no side effects" half.
 */
export declare type EvidenceProjector<T> = (evidence: EvidenceModel) => T;

/**
 * Who/when/what produced a given `EvidenceModel` instance. Caller-supplied,
 * never ambient-detected -- `generateEvidenceModel()` never shells out to
 * `git` itself, mirroring ADR 0012's live-expiration-callback precedent.
 */
export declare interface EvidenceProvenance {
    readonly generatedAt: string;
    readonly toolVersion: string;
    readonly commit: string | undefined;
}

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
declare type EvidenceReference = ContractEvidenceReference | OwnershipEvidenceReference | ChangeEvidenceReference;

/** One contract- or variable-level `expiresAt` falling within the configured "expiring soon" window. */
declare interface ExpiringEntry {
    /** Absolute path of the file declaring the contract. */
    readonly file: string;
    /** The contract's exported binding name. */
    readonly exportName: string;
    /** `undefined` for a contract-level `expiresAt`, set for a per-variable one. */
    readonly key: string | undefined;
    /** The raw ISO date string, unparsed. */
    readonly expiresAt: string;
    /** Days from `now` until expiry; negative when already expired. */
    readonly daysRemaining: number;
}

/** One rule violation or derived signal, in the Finding Model's canonical shape. */
declare interface Finding {
    /**
     * `"error"` for a provable, always-blocking violation (e.g. an
     * exclusive-group conflict); `"warning"` for everything gated by
     * `onIncompatibility`/`onUndocumented`/`onOwnershipIssue`'s default "warn"
     * behavior; `"info"` for an observation that is never actionable enough to
     * block anything, even under `--strict` -- see `INFO_ONLY_CODES` in
     * `generate-env-artifacts.ts`.
     */
    readonly severity: "error" | "warning" | "info";
    /** Stable, machine-readable identifier -- always set, unlike {@link CompatibilityIssue.code} which stays optional on that narrower, pre-existing type. */
    readonly code: FindingCode;
    /** Which source check produced this finding. */
    readonly family: FindingFamily;
    /** Human-readable explanation, reusing the source finding's own prose where one exists. */
    readonly message: string;
    /** Structured pointer back to what this finding is about. */
    readonly location: EvidenceReference;
}

/** Bump only when a reader could misinterpret the new shape -- same discipline every other canonical model's `schemaVersion` follows. */
declare const FINDING_MODEL_SCHEMA_VERSION = 3;

/**
 * The fourth of env-cap's seven canonical fact models (ADR 0024) -- every
 * rule violation and derived risk signal, unified behind one shape, with a
 * stable `code` and a structured {@link EvidenceReference} instead of four
 * independently-shaped finding families. See ADR 0026.
 */
/** Every stable `code` a {@link Finding} can carry. A superset of {@link CompatibilityIssueCode} plus one code per non-compatibility source family this model adapts. */
declare type FindingCode = CompatibilityIssueCode | "EXCLUSIVE_GROUP_VIOLATION" | "ARTIFACT_STALE" | "ARTIFACT_MISSING" | "UNDOCUMENTED_CONTRACT" | "UNDOCUMENTED_VARIABLE" | "STALE_DOC_ENTRY" | "EXPIRED" | "EXPIRING_SOON" | "UNRESOLVED_DOCUMENTENV_LINK" | "ABANDONED_CONTRACT" | "UNRESOLVED_CONSUMER" | "UNCONSUMED_OWNED_VARIABLE" | "INDETERMINATE_OWNERSHIP" | "MISSING_DYNAMIC_ACCESS_CITATION" | "STALE_DYNAMIC_ACCESS_CITATION" | "NONSTANDARD_SENSITIVITY_LEVEL";

/** Which source check produced a {@link Finding} -- coarser than `code`, for a consumer that only wants to filter by kind (e.g. "show me every documentation gap") without enumerating every individual code. */
declare type FindingFamily = "compatibility" | "drift" | "documentation" | "ownership";

/** The versioned, JSON-serializable root of the Finding Model -- every rule violation and derived risk signal from this run, unified behind {@link Finding}'s one shape. See this module's own doc comment for the full picture. */
declare interface FindingModel {
    readonly schemaVersion: typeof FINDING_MODEL_SCHEMA_VERSION;
    readonly findings: readonly Finding[];
}

/** Bump only when a reader could misinterpret the new shape -- same discipline every other canonical model's `schemaVersion` follows. */
declare const LIFECYCLE_MODEL_SCHEMA_VERSION = 3;

/** The versioned, JSON-serializable root of the Lifecycle Model -- see this module's own doc comment for the full picture. */
declare interface LifecycleModel {
    readonly schemaVersion: typeof LIFECYCLE_MODEL_SCHEMA_VERSION;
    /** Only contracts with at least one lifecycle-relevant field set, at the contract level or on at least one variable. */
    readonly contracts: readonly LifecycleModelContract[];
    /**
     * Every contract-/variable-level `expiresAt` within the configured window,
     * soonest-first -- see `computeExpiringEntries()`. `file` is root-relative
     * and POSIX-separated here, matching `LifecycleModelContract.file`/every
     * other canonical model -- unlike `ExpiringEntry`'s own doc comment, which
     * describes its shape in `computeExpiringEntries()`'s other direct
     * consumers (e.g. `DocumentationFindings.expiringSoon`), where `file`
     * stays the absolute path `renderDocs()` itself expects.
     */
    readonly expiring: readonly ExpiringEntry[];
}

/** One contract's own lifecycle data plus every variable of its that has at least one lifecycle field set. See {@link LifecycleModelVariable} for the per-variable shape. */
declare interface LifecycleModelContract {
    /** Root-relative, POSIX-separated -- matches `ContractModelContract.file`. */
    readonly file: string;
    readonly exportName: string;
    readonly contractName: string;
    readonly expiresAt: string | undefined;
    readonly deprecated: boolean | undefined;
    readonly deprecatedReason: string | undefined;
    /** See {@link LifecycleModelVariable.retention}. */
    readonly retention: string | undefined;
    /** Only variables with at least one lifecycle field set (`expiresAt`, `refreshInstructions`, `deprecated`, `removeBy`, `renamedFrom`, `retention`, `authenticatorType`, `rotationPeriod`, `lastRotatedAt`, `rotationTriggerEvents`) -- same "only what's relevant" scope `renderLifecycleReport()` already uses for its rows. */
    readonly variables: readonly LifecycleModelVariable[];
}

/**
 * One variable's lifecycle data (expiry, deprecation, rename correlation).
 *
 * @see {@link ContractModelVariable} -- this same declared variable's canonical starting point.
 */
declare interface LifecycleModelVariable {
    readonly key: string;
    readonly expiresAt: string | undefined;
    readonly refreshInstructions: string | undefined;
    readonly deprecated: boolean | undefined;
    readonly deprecatedReason: string | undefined;
    readonly removeBy: string | undefined;
    /** The previous variable name this one renames, if set -- see `ManifestChangeReport`'s rename correlation (ADR 0029/0030). */
    readonly renamedFrom: string | undefined;
    /** Descriptive retention policy (e.g. "delete after 90 days") -- a policy statement, never computed or parsed, deliberately independent of `expiresAt`'s actual temporal constraint. See ADR 0035. */
    readonly retention: string | undefined;
    /** See {@link runtime.VariableDocs.authenticatorType}. */
    readonly authenticatorType: string | undefined;
    /** See {@link runtime.VariableDocs.rotationPeriod}. */
    readonly rotationPeriod: string | undefined;
    /** See {@link runtime.VariableDocs.lastRotatedAt}. */
    readonly lastRotatedAt: string | undefined;
    /** See {@link runtime.VariableDocs.rotationTriggerEvents}. */
    readonly rotationTriggerEvents: readonly string[] | undefined;
    /** Computed, not stored -- see {@link RotationComplianceStatus} and `computeRotationStatus()`. */
    readonly rotationStatus: RotationComplianceStatus;
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
declare interface ManifestChangeReport {
    /** Contracts present now but not in the previous snapshot. */
    readonly addedContracts: readonly ManifestContractRef[];
    /** Contracts present in the previous snapshot but not now. */
    readonly removedContracts: readonly ManifestContractRef[];
    /** Variables present now but not in the previous snapshot. */
    readonly addedVariables: readonly ManifestVariableRef[];
    /** Variables present in the previous snapshot but not now. */
    readonly removedVariables: readonly ManifestVariableRef[];
    /** Contracts present in both snapshots with at least one changed field. */
    readonly updatedContracts: readonly ManifestContractUpdate[];
    /** Variables present in both snapshots with at least one changed field. */
    readonly updatedVariables: readonly ManifestVariableUpdate[];
}

/** Identifies one contract for {@link ManifestChangeReport} purposes -- see {@link ContractRef} for why neither a `contractName` nor a pre-formatted `identity` is carried here. */
declare type ManifestContractRef = ContractRef;

/** A contract present in both snapshots, with at least one changed field. */
declare interface ManifestContractUpdate extends ManifestContractRef {
    /** Every field that changed between the previous and current snapshot. */
    readonly changes: readonly ManifestFieldChange[];
}

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
declare interface ManifestFieldChange {
    /** The changed field's name. */
    readonly field: string;
    /** The value from the previous snapshot, or `undefined` if the field was unset. */
    readonly previous: string | undefined;
    /** The value in the current run, or `undefined` if the field is now unset. */
    readonly current: string | undefined;
}

/** Identifies one variable for {@link ManifestChangeReport} purposes -- its owning contract's identity plus its own key. See {@link ContractRef}. */
declare interface ManifestVariableRef extends ContractRef {
    /** The environment variable name. */
    readonly key: string;
}

/** A variable present in both snapshots, with at least one changed field. */
declare interface ManifestVariableUpdate extends ManifestVariableRef {
    /** Every field that changed between the previous and current snapshot. */
    readonly changes: readonly ManifestFieldChange[];
}

/** Bump only when a reader could misinterpret the new shape -- same discipline every other canonical model's `schemaVersion` follows. */
declare const OWNERSHIP_MODEL_SCHEMA_VERSION = 1;

/** Points at a contract by name for an ownership/usage finding -- `usage-report.ts`'s finding types don't consistently carry `file`/`exportName` together, only `contractName`. */
declare interface OwnershipEvidenceReference {
    readonly model: "ownership";
    readonly contractName: string;
    /** Root-relative path of the file declaring the contract, when the source finding carries one. */
    readonly file: string | undefined;
    /** The environment variable name, when the finding is variable-level rather than contract-level. */
    readonly variable: string | undefined;
    /** See {@link ContractEvidenceReference.position}. */
    readonly position: SourcePosition | undefined;
}

/** The versioned, JSON-serializable root of the Ownership Model -- see this module's own doc comment for the full picture. */
declare interface OwnershipModel {
    readonly schemaVersion: typeof OWNERSHIP_MODEL_SCHEMA_VERSION;
    readonly contracts: readonly OwnershipModelContract[];
    /** Every contract with no `owner` set at all. */
    readonly unownedContracts: readonly OwnershipModelContractRef[];
    /** Every variable whose effective owner (its own, falling back to the contract's) is still `undefined`. */
    readonly unownedVariables: readonly OwnershipModelVariableRef[];
}

/** One contract's own default owner plus every variable's effective owner. See {@link OwnershipModelVariable} for the per-variable shape. */
declare interface OwnershipModelContract {
    /** Root-relative, POSIX-separated -- matches `ContractModelContract.file`. */
    readonly file: string;
    readonly exportName: string;
    readonly contractName: string;
    /** The contract's own default owner -- not "effective" the way a variable's is, since there's no level above a contract to fall back to. */
    readonly owner: string | undefined;
    readonly variables: readonly OwnershipModelVariable[];
}

/** One contract, referenced by identity only -- see {@link ContractRef} for why no `contractName` is carried here. Resolve one from `ContractModel` when a renderer needs display text. */
declare type OwnershipModelContractRef = ContractRef;

/**
 * One variable's effective owner (its own, falling back to the contract's).
 *
 * @see {@link ContractModelVariable} -- this same declared variable's canonical starting point.
 */
declare interface OwnershipModelVariable {
    readonly key: string;
    /** The variable's own `owner`, falling back to the contract's -- see `effectiveOwner()`. */
    readonly owner: string | undefined;
}

/** One variable, referenced by its owning contract's identity plus its own key -- see {@link ContractRef}. */
declare interface OwnershipModelVariableRef extends ContractRef {
    readonly key: string;
}

/** Both the authored and resolved forms are kept -- diagnostics benefit from
 *  showing exactly what a package author wrote versus what it resolved to. */
declare interface PackageOrigin {
    /** The allow-listed package name that declared this schema. */
    readonly packageName: string;
    /** The `"envCap.schema"` value exactly as the package author wrote it. */
    readonly declaredField: string;
    /** Absolute, realpath-canonicalized path to the resolved schema file. */
    readonly resolvedFile: string;
    /** Absolute, realpath-canonicalized path to the package's own directory. */
    readonly packageDir: string;
}

/** A recoverable issue found while statically parsing or linking one schema file -- never fatal, always surfaced to the caller as data. */
declare interface ParseWarning {
    /** Absolute path of the file the warning applies to. */
    readonly file: string;
    /** Human-readable explanation of what was skipped and why. */
    readonly message: string;
}

/** One `addedVariables`/`removedVariables` pair in `manifest`, correlated into a single rename via the current declaration's `renamedFrom` field (ADR 0029). */
declare interface RenamedVariable {
    /** The owning contract's identity (`${file}#${exportName}`) -- a rename never crosses contracts. */
    readonly contractIdentity: string;
    readonly file: string;
    readonly exportName: string;
    readonly contractName: string;
    /** The variable's key before the rename -- matches a `manifest.removedVariables` entry. */
    readonly previousKey: string;
    /** The variable's key after the rename -- matches a `manifest.addedVariables` entry. */
    readonly currentKey: string;
}

/**
 * One variable's computed NIST SP 800-53 IA-5 rotation-compliance status --
 * see `computeRotationStatus()` for exactly how it's derived. Always present
 * on a `LifecycleModelVariable` (never `undefined`) since a variable with
 * literally nothing lifecycle-relevant set never reaches this model at all
 * (`hasLifecycleData()` below) -- `"undeclared"` is itself the honest value
 * for "reached this model for some other lifecycle reason (e.g. `deprecated`)
 * but declares none of the four rotation-specific fields."
 */
declare type RotationComplianceStatus = "compliant" | "overdue" | "expired" | "undeclared";

/** One named surface `buildDependencyGraph()`'s scan actually covered -- the
 *  application's own root, plus one entry per allow-listed `packages` (ADR
 *  0014) name whose source was also scanned. See ADR 0036: a claim like
 *  "no consumer found" is only ever as strong as what was actually
 *  searched, and this is what lets a renderer say so explicitly instead of
 *  implying an unbounded guarantee it can't back up. */
declare interface ScannedSurface {
    /** `"application"` for the local project root, `"package:<name>"` for an allow-listed package's own source. */
    readonly label: string;
    /** Root-relative, POSIX-separated. */
    readonly root: string;
}

/**
 * A precise pointer into a source file -- the shared shape every exact-position fact in the
 * build pipeline (declaration sites, usage sites, dynamic-access sites) uses, so a consumer never
 * has to reconcile three ad hoc `{ file; line; column }` shapes that happen to mean the same
 * thing. See ADR 0036.
 */
declare interface SourcePosition {
    /** Root-relative, POSIX-separated. */
    readonly file: string;
    /** 1-indexed line number. */
    readonly line: number;
    /** 1-indexed column number. */
    readonly column: number;
}

/**
 * What env-cap's static scan could prove about one variable's consumption:
 * it was member-accessed somewhere (`"used"`), it was never accessed at all
 * within the scanned surfaces (`"unconsumed"`), or a computed (dynamic)
 * property access on the owning contract makes the answer unprovable
 * (`"indeterminate"`).
 *
 * @remarks
 * Deliberately narrower than `@maverickcer/data-cap`'s equivalent, which
 * splits the unprovable case further (an unresolved *consumer* vs. an
 * indeterminate *field*). That split exists because a data-cap capability
 * exposes many fields at once, so it has a real "we resolved the consumer,
 * but can't tell which field it touched" state to name. env-cap's
 * consumption model is one value per key: a contract member access either
 * names the key statically (`"used"`) or it doesn't (`"indeterminate"`), and
 * there is no intermediate case where the consumer is known but the thing
 * consumed is ambiguous. Adding a fourth state here would be vocabulary
 * borrowed from a model env-cap doesn't have -- see ADR 0010's
 * "provable, not heuristic" rule. Developer-declared `dynamicAccess`
 * citations stay a wholly separate fact and are never folded into this
 * status (ADR 0037).
 */
declare type VariableAccessStatus = "used" | "unconsumed" | "indeterminate";

export { }
