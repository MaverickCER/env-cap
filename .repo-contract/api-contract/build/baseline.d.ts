import ts from 'typescript';

/** A contract never imported anywhere in the scanned repository. */
export declare interface AbandonedContractFinding {
    /** Resolved display name (see {@link DiscoveredContract.contractName}). */
    readonly contractName: string;
    /** Root-relative path of the file declaring the contract. */
    readonly file: string;
    /** Contract-level default owner, if set. */
    readonly owner: string | undefined;
}

/**
 * Opaque memoization for {@link resolveAliasImport}, created once per generate*() run via
 * {@link createAliasResolutionCache} and threaded through `ImportResolutionContext`. Kept
 * distinct from `TsconfigPathsResolution` (immutable config) so the cache's internal
 * representation stays free to change without touching that type's shape.
 */
declare interface AliasResolutionCache {
    /**
     * Keyed by `` `${importingFile}\0${specifier}` ``, not by `specifier` alone. With one
     * fixed `compilerOptions` object and no project-reference support, `paths`-pattern
     * substitution itself doesn't depend on the importing file -- but `ts.resolveModuleName()`'s
     * fallback behavior when `paths` doesn't match a real file (classic-mode ancestor search,
     * extension-preference edge cases) legitimately can. A `Map`, not a network call, so
     * keying defensively by both costs nothing.
     */
    readonly resolutions: Map<string, string | undefined>;
}

/**
 * Applies `overrides` onto a fresh copy of `contracts` -- every contract and
 * every variable (and their nested `metadata`/`extra` records) is rebuilt
 * into a new object, never the original reference, so the returned structure
 * shares no mutable object identity with `contracts` at any depth.
 *
 * @remarks
 * A key absent from `overrides`, or present but not a `parseIsoDate`-parseable
 * ISO-8601 string, leaves that variable's static `expiresAt` untouched --
 * same "warn/skip, never guess" policy the rest of the generator uses for
 * malformed data. Contract-level `expiresAt` is never touched; only
 * variable-level `expiresAt` is in scope for override.
 */
export declare function applyLiveExpirationOverrides(contracts: readonly DiscoveredContract[], overrides: Readonly<Record<string, string>>): readonly DiscoveredContract[];

/**
 * `--check` / drift-guard support: computes every requested artifact exactly
 * as a real run would, but never writes to any of the four real target
 * paths. See ADR 0016.
 */
/** One artifact's drift status, as found by {@link checkEnvArtifacts}. */
export declare interface ArtifactCheckFinding {
    /** Which generated artifact this finding is about. */
    readonly artifact: "manifest" | "docs" | "envExample" | "usage" | "evidence";
    /** Absolute path the artifact would be written to. */
    readonly path: string;
    /** `"missing"` if the file doesn't exist yet, `"stale"` if it exists but differs from what a real run would produce. */
    readonly status: "ok" | "stale" | "missing";
    /** Human-readable detail, set for `"stale"`/`"missing"` findings. */
    readonly detail?: string;
}

/** A variable that would otherwise be reported `unconsumedOwnedVariables`/`indeterminate`, but has at least one `"fresh"` developer-declared `dynamicAccess` citation -- the raw static status is always shown alongside the assertion, never replaced by it. See ADR 0037. */
export declare interface AssertedDynamicAccessFinding {
    /** Resolved display name (see {@link DiscoveredContract.contractName}). */
    readonly contractName: string;
    /** The environment variable name. */
    readonly key: string;
    /** What this variable's status would be without the fresh assertion. */
    readonly wouldBeStatus: "unconsumed" | "indeterminate";
    /** Every citation covering this variable, each with its own current freshness. */
    readonly dynamicAccessAssertions: readonly DynamicAccessAssertion[];
}

/**
 * Wraps an already-computed `ManifestChangeReport` (e.g.
 * `generateEnvArtifacts()`'s internal `evidenceChanges.report`) in the Change Model's versioned
 * shape, and correlates renames using the current run's `renamedFrom`
 * declarations. `currentContracts` should be the same contracts the
 * manifest was generated from (active contracts only, matching
 * `renderManifest()`'s own scope -- same as every other input to this
 * report family).
 */
export declare function buildChangeModel(manifest: ManifestChangeReport, currentContracts: readonly DiscoveredContract[], root: string): ChangeModel;

/**
 * Projects every discovered contract (active or not) into the Contract
 * Model's versioned, JSON-serializable shape.
 *
 * @remarks
 * Sorted deterministically (by file, then exportName, then variable key), so
 * `JSON.stringify` output is stable and diffs cleanly wherever this is
 * persisted.
 */
export declare function buildContractModel(contracts: readonly DiscoveredContract[], root: string): ContractModel;

/**
 * Runs the dependency-ownership engine (`buildDependencyGraph()`, Private)
 * and projects its result into the Dependency Model's versioned,
 * JSON-serializable shape -- including the inverse file-\>contracts index
 * neither `dependency-graph.ts` nor `usage-report.ts` exposes today.
 *
 * @param scannedSurfaces - See `buildDependencyGraph()`'s own parameter of
 * the same name -- passed straight through to the published model.
 * @param dynamicAccessAcknowledgments - See `buildDependencyGraph()`'s own
 * parameter of the same name (ADR 0037) -- passed straight through.
 */
export declare function buildDependencyModel(contracts: readonly DiscoveredContract[], scanFiles: readonly string[], readFile: (filePath: string) => Promise<string>, context: ImportResolutionContext, root: string, scannedSurfaces?: readonly ScannedSurface[], dynamicAccessAcknowledgments?: ReadonlyMap<string, readonly DynamicAccessAssertion[]>): Promise<DependencyModel>;

/** One directory entry from {@link BuildFileSystem.readdir} -- the subset of Node's `Dirent` `src/build/**` reads. */
export declare interface BuildDirent {
    readonly name: string;
    /** Same contract as Node's `Dirent.isDirectory()`. */
    readonly isDirectory: () => boolean;
    /** Same contract as Node's `Dirent.isFile()`. */
    readonly isFile: () => boolean;
}

/**
 * The filesystem capability `env-cap/build` requires from its caller.
 *
 * `./build` is a **library surface**: it must not acquire filesystem access
 * implicitly (no `node:fs` import anywhere under `src/` outside `src/cli/`).
 * Every public options object in `build/index.ts` carries a required `fs`
 * field of this type, and the caller supplies a concrete adapter -- the
 * `env-cap` CLI builds one over `node:fs/promises` (`src/cli/filesystem.ts`);
 * a test builds either that same real adapter or an in-memory fake. See ADR
 * 0040.
 *
 * "Ambient-fs-free" means specifically: `./build` never reaches for
 * `node:fs` itself. It still performs real filesystem operations -- the
 * capability is always handed in.
 *
 * The shape is modeled on `node:fs/promises`'s own signatures so a thin
 * adapter is a drop-in value, but uses minimal structural types
 * ({@link BuildDirent}/{@link BuildStats}) rather than Node's `Dirent`/
 * `Stats` -- the capability boundary shouldn't leak Node's type surface just
 * because the concrete adapter happens to be Node-backed. Only the
 * operations `src/build/**` actually calls are here.
 */
export declare interface BuildFileSystem {
    /** Read a UTF-8 text file. Rejects if the path doesn't exist or isn't readable. */
    readonly readFile: (path: string, encoding: "utf8") => Promise<string>;
    /** Write a UTF-8 text file, creating or truncating it. The parent directory must already exist. */
    readonly writeFile: (path: string, data: string, encoding: "utf8") => Promise<void>;
    /** Create a directory and every missing parent. A no-op if it already exists. */
    readonly mkdir: (path: string, options: {
        readonly recursive: true;
    }) => Promise<void>;
    /** List a directory's entries with their file-type info. */
    readonly readdir: (path: string, options: {
        readonly withFileTypes: true;
    }) => Promise<readonly BuildDirent[]>;
    /** Stat a path (following symlinks). Rejects if the path doesn't exist. */
    readonly stat: (path: string) => Promise<BuildStats>;
    /** Resolve a path to its canonical, symlink-free absolute form. */
    readonly realpath: (path: string) => Promise<string>;
}

/**
 * Adapts every existing finding family into the Finding Model's unified
 * shape -- an adapter over data that already exists, not a new source of
 * truth. Order of the returned array mirrors the order sources are given
 * above; a consumer wanting a specific order (by severity, by file, ...)
 * sorts it themselves.
 */
export declare function buildFindingModel(input: BuildFindingModelInput): FindingModel;

/**
 * Every source a {@link buildFindingModel} call can adapt, all optional --
 * a caller passes whichever of `generateEnvArtifacts()`'s `manifest`/`docs`/
 * `usage` results it actually requested, exactly like that result's own
 * top-level fields are each independently optional.
 */
export declare interface BuildFindingModelInput {
    /** Every `EvidenceReference.file` below is rendered relative to this, matching every other rendered path in this package's output -- see `displayPath()`. */
    readonly root: string;
    /** From `detectCompatibilityIssues()`. */
    readonly compatibilityIssues?: readonly CompatibilityIssue[];
    /** From `detectExclusiveGroupIssues()` -- kept separate from `compatibilityIssues` since it never sets its own `code` yet (ADR 0009), so this adapter synthesizes `"EXCLUSIVE_GROUP_VIOLATION"` for every entry. */
    readonly exclusiveGroupIssues?: readonly CompatibilityIssue[];
    /** From `checkEnvArtifacts()`'s result. Only `"stale"`/`"missing"` findings become a `Finding` -- `"ok"` means nothing to report. */
    readonly artifactCheckFindings?: readonly ArtifactCheckFinding[];
    /** From `generateDocumentation()`'s result. */
    readonly documentation?: DocumentationFindings;
    /** From `generateUsageReport()`'s result. */
    readonly abandonedContracts?: readonly AbandonedContractFinding[];
    /** From `generateUsageReport()`'s result. */
    readonly unresolvedConsumers?: readonly UnresolvedConsumerFinding[];
    /** From `generateUsageReport()`'s result. */
    readonly unconsumedOwnedVariables?: readonly UnconsumedOwnedVariableFinding[];
    /** From `generateUsageReport()`'s result. */
    readonly indeterminateOwnership?: readonly IndeterminateOwnershipFinding[];
    /** From `computeManifestChanges()`'s result -- every `dynamicAccess` citation that's gone `"stale"` or `"missing"` since it was last acknowledged. See ADR 0037. */
    readonly dynamicAccessCitationProblems?: readonly DynamicAccessCitationProblem[];
}

/**
 * Projects every discovered contract with at least one lifecycle-relevant
 * field set into the Lifecycle Model's versioned, JSON-serializable shape,
 * plus the already-established `expiring` view.
 */
export declare function buildLifecycleModel(contracts: readonly DiscoveredContract[], expiringWithinDays: number, now: Date, root: string): LifecycleModel;

/**
 * Projects every discovered contract (active or not, same scope as
 * `renderSecurityReview()`'s `noOwnerCount` this model itemizes) into the
 * Ownership Model's versioned, JSON-serializable shape.
 */
export declare function buildOwnershipModel(contracts: readonly DiscoveredContract[], root: string): OwnershipModel;

/**
 * Projects Finding Model into a SARIF 2.1.0 log.
 *
 * @remarks
 * `rules` lists every distinct `FindingCode` actually present in this run,
 * sorted -- not the full `FindingCode` union. A SARIF consumer treats the
 * rules array as "what this tool reported", and advertising rules that
 * produced no result makes a clean run look like it has unexplained silent
 * rules. `results` preserves Finding Model's own order, which a caller wanting
 * a different one sorts themselves.
 */
export declare function buildSarifLog(findingModel: FindingModel): SarifLog;

/** A path's stat info from {@link BuildFileSystem.stat} -- the subset of Node's `Stats` `src/build/**` reads. */
export declare interface BuildStats {
    /** Same contract as Node's `Stats.isFile()`. */
    readonly isFile: () => boolean;
    /** Size in bytes -- read by the package-schema resolver to enforce a size ceiling. */
    readonly size: number;
}

declare interface CatalogContract extends EnvGovernanceFields {
    readonly file: string;
    readonly exportName: string;
    readonly contractName: string;
    readonly active: boolean;
    readonly documented: boolean;
    readonly category: string | undefined;
    readonly exclusiveGroup: string | undefined;
    /** Keyed by variable name -- unique within one contract (a schema
     *  object-literal property name), unlike `contractName` at the top level. */
    readonly variables: Readonly<Record<string, CatalogVariable>>;
}

/**
 * Same data `renderCatalog()` renders to Markdown for one variable, reshaped for JSON/
 * programmatic consumers instead of prose.
 *
 * @see `ContractModelVariable` (`contract-model.ts`) -- this same declared variable's canonical
 * starting point. Plain reference, not `{@link}`: this type is intentionally not part of the
 * public surface (see `typedoc.json`'s `intentionallyNotExported`).
 */
declare interface CatalogVariable extends EnvGovernanceFields {
    readonly description: string | undefined;
    readonly refreshInstructions: string | undefined;
    readonly setupInstructions: string | undefined;
    readonly required: boolean | undefined;
    readonly hasDefault: boolean;
    readonly hasProcessor: boolean;
    readonly processorReturnType: string | undefined;
    readonly hasValidator: boolean;
    readonly documented: boolean;
    /** The variable's declared validation context, if any -- see ADR 0022. Participation data, not documentation: describes when `validateEnv()` processes this variable, not who may access it or what a bundler includes. */
    readonly context: string | undefined;
    /** The `evidence` sub-object from this variable's linked documentation -- re-verified every run, unlike every declared-only field above. See ADR 0037. */
    readonly evidence: DiscoveredVariableEvidence | undefined;
}

/** Bump only when a reader could misinterpret the new shape -- same discipline every other canonical model's `schemaVersion` follows. */
export declare const CHANGE_MODEL_SCHEMA_VERSION = 1;

/** Points at a generated artifact's path -- what `checkEnvArtifacts()`'s drift findings are about, not a declared contract or variable at all. */
export declare interface ChangeEvidenceReference {
    readonly model: "change";
    /** Absolute path of the generated artifact. */
    readonly path: string;
}

/** The versioned, JSON-serializable root of the Change Model -- what changed since the last persisted evidence snapshot. See this module's own doc comment for the full picture. */
export declare interface ChangeModel {
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
 * Verifies every requested artifact (`manifest`/`docs`/`envExample`/`usage`)
 * matches what a real {@link generateEnvArtifacts} run would produce, without
 * writing anything.
 *
 * @remarks
 * `--check` reports drift, it doesn't paper over a run that would otherwise fail --
 * see `@throws` below.
 *
 * @throws {EnvProjectGenerationError} On the same blocking findings a real run would throw on.
 */
export declare function checkEnvArtifacts(options: GenerateEnvArtifactsOptions): Promise<CheckEnvArtifactsResult>;

/** The result of a completed {@link checkEnvArtifacts} run. */
export declare interface CheckEnvArtifactsResult {
    /** `true` iff every requested artifact is `"ok"`. */
    readonly ok: boolean;
    /** One entry per requested artifact. */
    readonly findings: readonly ArtifactCheckFinding[];
}

/**
 * Every unique variable key across every linked contract's `variables`.
 * Contract-level `expiresAt` is out of scope for override -- the callback is
 * keyed by variable name, not contract name.
 */
export declare function collectVariableNames(contracts: readonly DiscoveredContract[]): string[];

/** One compatibility problem found between two or more declarations of the same variable, or an exclusive-group violation. */
export declare interface CompatibilityIssue {
    /** `"error"` blocks generation regardless of `onIncompatibility`; `"warning"` blocks only when `onIncompatibility: "throw"`; `"info"` never blocks, under any flag. */
    readonly severity: "error" | "warning" | "info";
    /** The environment variable name, or `"(contract) <name>"` for a contract-level (e.g. exclusive-group) issue. */
    readonly variable: string;
    /**
     * Every file declaring a conflicting definition. A pairwise comparison
     * (compatibility.ts, exclusive-group.ts) always produces exactly two; a
     * finding escalated from another family (generate-env-artifacts.ts's
     * `escalatedFindings()`, via `findingFiles()`) can produce zero, one, or
     * two, depending on what location information that finding actually
     * carries -- genuinely variable arity, not a tuple.
     */
    readonly files: readonly string[];
    /** Human-readable explanation of the conflict. */
    readonly reason: string;
    /**
     * Stable, machine-readable identifier for CI filtering / doc-linking /
     * GitHub Action annotations / IDE integration. `undefined` only for checks
     * that don't (yet) set one -- see {@link CompatibilityIssueCode} for the
     * full enumerated list of values a check in this file can produce.
     */
    readonly code?: CompatibilityIssueCode;
}

/**
 * Every stable `code` a check in this file (or `exclusive-group.ts`) can
 * emit. Documented as an enumerated union so a consumer filtering/linking on
 * `code` has a closed list to switch over, rather than an arbitrary string --
 * see ADR 0024/0026. `exclusive-group.ts`'s check does not (yet) set one; see
 * that file's own comment for why.
 */
export declare type CompatibilityIssueCode = "PROCESSOR_RETURN_TYPE_CONFLICT" | "PROCESSOR_SOURCE_CONFLICT" | "VALIDATOR_SOURCE_CONFLICT" | "DUPLICATE_VARIABLE_DOCUMENTATION" | "DUPLICATE_VARIABLE_SHAPE_ACROSS_CONTRACTS";

/**
 * Computes every contract- or variable-level `expiresAt` within `expiringWithinDays` of `now`, sorted soonest-first.
 */
export declare function computeExpiringEntries(contracts: readonly ExpiryBearingContract[], expiringWithinDays: number, now: Date): ExpiringEntry[];

/**
 * Diffs an existing `.env.example` against the current configuration into
 * three actionable sets. Pure and filesystem-independent -- `writeEnvExample`
 * is the only caller that reads the file itself.
 */
export declare function computeReconciliation(contracts: readonly DiscoveredContract[], existingContent: string): Reconciliation;

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
export declare function computeRotationStatus(variable: {
    readonly expiresAt: string | undefined;
    readonly authenticatorType: string | undefined;
    readonly rotationPeriod: string | undefined;
    readonly lastRotatedAt: string | undefined;
    readonly rotationTriggerEvents: readonly string[] | undefined;
}, now: Date): RotationComplianceStatus;

/**
 * Computes every number `renderSecurityReview()` reports, as real data.
 *
 * @remarks
 * Previously this arithmetic lived entirely inside the renderer as closure
 * locals that only ever became interpolated Markdown text -- no exported
 * type backed any of it, so nothing downstream (the `--json` envelope, a CI
 * gate, a future Finding Model adapter) could consume it as data. Extracted
 * so it can be reused wherever these facts are needed, not just prose.
 */
export declare function computeSecurityReviewCounters(contracts: readonly ContractModelContract[], expiringWithinDays: number, now: Date, undocumentedContractCount: number, undocumentedVariableCount: number): SecurityReviewCounters;

/**
 * SHA-256 over the raw bytes of every schema file and every usage-scan-
 * surface file (the same file sets `assembleProject()`/`computeScanSurface()`
 * touch), plus env-cap's own installed version -- zero AST parsing or
 * linking. Still requires the discovery/glob walk itself (fingerprinting has
 * to know which files matter), but skips everything after it. Deterministic:
 * file paths are deduplicated and sorted before hashing, so the result never
 * depends on filesystem enumeration order.
 *
 * @remarks
 * Not a timestamp, and never compared as one -- a fresh mtime doesn't prove
 * content is unchanged (a checkout, a rebase, or a touch can all bump it
 * with no real edit), and content is the only thing that actually
 * invalidates a cached evidence artifact.
 */
export declare function computeSourceFingerprint(options: ComputeSourceFingerprintOptions): Promise<string>;

/**
 * A fast, honest read path for the persisted evidence artifact -- for a
 * report/projection script, a CI step, or any consumer that just wants the
 * current `EvidenceModel` without paying a full `generateEvidenceModel()`
 * recompute (schema parsing, cross-file linking, the dependency-graph AST
 * scan, all six model builds) on every single invocation, and without ever
 * risking silently-stale data. The mechanism: a cheap content fingerprint,
 * computed from raw file bytes with zero AST work, lets a caller cheaply
 * prove "nothing relevant to evidence generation has changed since this file
 * was last written" before trusting it.
 */
/** Options for {@link computeSourceFingerprint}. */
export declare interface ComputeSourceFingerprintOptions {
    /** The filesystem capability -- `./build` never imports `node:fs` (ADR 0040). */
    readonly fs: BuildFileSystem;
    readonly root: string;
    readonly include: readonly string[];
    readonly exclude: readonly string[];
    readonly packages: readonly string[];
}

/** The Configuration Reference projection's output shape. */
export declare interface ConfigurationReference extends Record<string, unknown> {
    /** The standing "declared, not verified" notice -- see `evidenceDisclaimer()`. Carried in the data, not only in a renderer, so a consumer projecting this to their own format can't accidentally drop it. */
    readonly disclaimer: string;
    /** Every declared variable across every discovered contract, sorted by contract file, then export name, then key. */
    readonly entries: readonly ConfigurationReferenceEntry[];
}

/**
 * Configuration Reference: every declared variable, with its effective owner
 * and sensitivity already resolved, in one flat, sorted list.
 *
 * @remarks
 * Resolution (variable's own value falling back to its contract's) happens
 * here rather than being left to each consumer, so two readers of this
 * projection can never disagree about who owns a variable -- the same reason
 * `effectiveOwner()` exists on the generator side (ADR 0028).
 */
export declare const configurationReference: EvidenceProjection<ConfigurationReference>;

/**
 * env-cap's own built-in reference projections, declared through the exact
 * same public `defineEvidenceProjection()` a consumer would use (ADR
 * 0031/0032) -- no privileged internal path, no second way of reading the
 * Evidence Model.
 *
 * This is deliberate dogfooding, not a convenience layer: `renderDocs()`'s
 * Catalog/ownership/lifecycle sections and `renderUsageReport()`'s ownership
 * table now source their underlying data through these projections, so the
 * extensibility API is exercised by env-cap's own generated output on every
 * single run. If a projector here can't express something, that's a real gap
 * in the public API -- discovered by env-cap itself rather than by a consumer
 * reporting it.
 *
 * Every projection is pure and derives *only* from `EvidenceModel`. None
 * reads the filesystem, and none reaches back into `DiscoveredContract` --
 * that would defeat the point, since a consumer only ever has the model.
 */
/** One variable, flattened across Contract/Ownership/Lifecycle Model into the row a Configuration Reference renders. */
export declare interface ConfigurationReferenceEntry {
    /** Root-relative, POSIX-separated path of the declaring contract. */
    readonly file: string;
    readonly exportName: string;
    /** The declaring contract's display name, resolved from Contract Model -- the one model that owns it. */
    readonly contractName: string;
    readonly key: string;
    readonly description: string | undefined;
    /** Effective owner: the variable's own, falling back to its contract's. */
    readonly owner: string | undefined;
    /** Effective sensitivity: the variable's own, falling back to its contract's. Any string; see {@link runtime.VariableDocs.sensitivity}. */
    readonly sensitivity: string | undefined;
    readonly required: boolean | undefined;
    readonly hasDefault: boolean;
    readonly hasProcessor: boolean;
    readonly hasValidator: boolean;
    readonly expiresAt: string | undefined;
    /** Whether the declaring contract is active. Inactive contracts are included -- the reference documents everything discovered, same scope the Catalog always had. */
    readonly active: boolean;
}

/** Bump only when a reader could misinterpret the new shape (a field changes
 *  type/meaning, or is removed) -- NOT for every additive field. Same
 *  discipline `evidence-model.ts`'s `EVIDENCE_MODEL_SCHEMA_VERSION` and
 *  `src/cli/json.ts`'s `JSON_SCHEMA_VERSION` already document. */
export declare const CONTRACT_MODEL_SCHEMA_VERSION = 3;

/** Points at a declared contract and, optionally, one of its variables -- the shape every `CompatibilityIssue`/documentation finding can be resolved to. Unlike {@link ContractRef}, both identity fields are optional here: a finding can legitimately know only the file (an unresolvable `documentEnv()` link) or neither. */
export declare interface ContractEvidenceReference {
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
export declare interface ContractModel {
    readonly schemaVersion: typeof CONTRACT_MODEL_SCHEMA_VERSION;
    readonly contracts: readonly ContractModelContract[];
}

/** One `createEnv()` contract's full statically-discoverable contract, active or not. */
export declare interface ContractModelContract extends EnvGovernanceFields {
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
export declare interface ContractModelVariable extends EnvGovernanceFields {
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
export declare interface ContractRef {
    /** Root-relative, POSIX-separated path of the file declaring the contract -- see `displayPath()`. */
    readonly file: string;
    /** The binding name the `createEnv()` result is exported as. */
    readonly exportName: string;
}

/**
 * Recursively freezes `value` and everything reachable from it (array
 * elements, plain-object property values), so a mutation anywhere in the
 * structure throws instead of silently succeeding.
 *
 * @remarks
 * Generalized from `live-expirations.ts`'s former `DiscoveredContract[]`-
 * hardcoded `deepFreezeContracts()` (see ADR 0012) into a truly generic
 * utility, so Evidence Model's own immutability guarantee (a later phase)
 * can reuse it instead of duplicating the recursion.
 *
 * Only recurses into arrays and plain objects (`{}` or `Object.create(null)`)
 * -- a `Map`, `Set`, or class instance is frozen at its own top level but not
 * walked further. This codebase's fact models are plain JSON-serializable
 * data, never class instances, so this is deliberately narrow rather than a
 * general-purpose deep-freeze library. A `WeakSet` guards against infinite
 * recursion if a cyclic reference is ever passed in.
 */
export declare function deepFreeze<T>(value: T): T;

/** Bump only when a reader could misinterpret the new shape -- same discipline every other canonical model's `schemaVersion` follows. */
export declare const DEPENDENCY_MODEL_SCHEMA_VERSION = 2;

/** The versioned, JSON-serializable root of the Dependency Model -- see this module's own doc comment for the full picture. */
export declare interface DependencyModel {
    readonly schemaVersion: typeof DEPENDENCY_MODEL_SCHEMA_VERSION;
    readonly contracts: readonly DependencyModelContract[];
    /** Inverse of `contracts[].consumingFiles` -- one entry per file that consumes at least one contract, listing which contracts it reads. */
    readonly consumers: readonly DependencyModelConsumer[];
    readonly warnings: readonly ParseWarning[];
    /** Every surface actually scanned for usage -- see ADR 0036. Always has at least one entry (the application root). */
    readonly scannedSurfaces: readonly ScannedSurface[];
}

/** One consuming file, and every contract it depends on -- the inverse of `DependencyModelContract.consumingFiles`. */
export declare interface DependencyModelConsumer {
    /** Root-relative, POSIX-separated. */
    readonly file: string;
    readonly contracts: readonly DependencyModelContractRef[];
}

/** One contract's dependency-ownership facts: which variables were accessed, which files consume it, and every dynamic/ambiguous access site found. See {@link DependencyModelVariable} for the per-variable breakdown. */
export declare interface DependencyModelContract {
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
export declare type DependencyModelContractRef = ContractRef;

/**
 * One variable's access status within a contract, plus every position it was found
 * member-accessed at, aggregated across every consuming file.
 *
 * @see {@link ContractModelVariable} -- this same declared variable's canonical starting point.
 */
export declare interface DependencyModelVariable {
    readonly key: string;
    readonly status: VariableAccessStatus;
    /** Empty unless `status === "used"`. Previously discarded before reaching any public type -- see ADR 0027 (line only) and ADR 0036 (full position, file included per entry). */
    readonly positions: readonly SourcePosition[];
    /** Every developer-declared `dynamicAccess` citation's current freshness for this variable -- a wholly separate, independent fact from `status` above, never folded into it. Empty when no citation was declared, or when no manifest snapshot baseline was available to check against (the manifest pass wasn't also requested). See ADR 0037. */
    readonly dynamicAccessAssertions: readonly DynamicAccessAssertion[];
}

/**
 * Flags cases where two contracts declare the same variable name but appear to
 * disagree about its shape, so a human can confirm they're still meant to be "the same" var.
 *
 * @remarks
 * Duplicate variable names across contracts are not a merge problem -- each
 * contract independently processes its own copy of the raw value, there is no
 * runtime merge at all. This is purely a build-time lint.
 *
 * Only one thing is treated as *provable* without executing code: two
 * processors with explicit, differing `: T` return type annotations. That is
 * a hard error. Everything else (differing processor/validator source text
 * with no annotation, or none at all) is a warning -- we cannot prove
 * semantic non-equivalence via static analysis alone, and the library never
 * executes schema code to check further (see literal-eval.ts).
 */
export declare function detectCompatibilityIssues(contracts: readonly DiscoveredContract[]): CompatibilityIssue[];

/**
 * Flags *differently-named* variables in different contracts that share an
 * identical type shape -- a soft signal that two features may be
 * independently modelling the same underlying configuration value under two
 * names, worth a human glance before they drift apart.
 *
 * @remarks
 * Always `severity: "info"`, and never escalated to blocking by any flag,
 * including `--strict` -- an identical shape is genuinely common and
 * frequently correct (two unrelated features can both take a `number` timeout
 * with a validator, and that is not a defect). This is an observation offered
 * to a reader, not a rule; making it blockable would make it noise a team has
 * to suppress rather than a signal they can scan.
 *
 * Scope, deliberately narrow on every axis:
 *  - **Different keys only.** Same-key collisions across contracts are
 *    `detectCompatibilityIssues()`'s own, entirely separate concern above;
 *    reporting them here too would double-report one problem under two codes.
 *  - **Different contracts only.** Two same-shaped variables inside one
 *    contract are that contract's own deliberate design.
 *  - **Active contracts only.** An inactive contract is wired into nothing,
 *    so an overlap with it is not a live duplication.
 *  - **No exclusive-grouped contracts.** Members of an exclusive group are
 *    interchangeable alternatives by explicit authorial declaration --
 *    matching shapes there are the *point*, not a smell.
 *  - **Pairwise, never transitive.** Three mutually-matching variables emit
 *    three independent findings (A-B, A-C, B-C), never one merged "cluster":
 *    each pair is its own question a reader answers on its own, and a cluster
 *    would imply a transitive relationship this check never established.
 */
export declare function detectDuplicateVariableShapes(contracts: readonly DiscoveredContract[]): CompatibilityIssue[];

/**
 * Detects two *active* contracts declaring the same `exclusiveGroup` --
 * e.g. two interchangeable database backends both left enabled at once.
 *
 * @remarks
 * Unlike `detectCompatibilityIssues`, this is never a heuristic warning: an
 * author explicitly declared these contracts mutually exclusive, so any
 * violation is always a hard error, regardless of `onIncompatibility`. See
 * ADR 0009 for why this doesn't follow 0005's warn-by-default policy.
 *
 * Inactive contracts are ignored entirely here (filtered internally, not by
 * the caller) so this stays correct even when called directly via the
 * `/build` export -- an inactive contract can share a group with an active
 * one with no conflict, since it was never wired into anything.
 */
export declare function detectExclusiveGroupIssues(contracts: readonly DiscoveredContract[]): CompatibilityIssue[];

/** One `createEnv()` contract, merged with its linked `documentEnv()` documentation (if any). Its governance fields (`owner` .. `metadata`) are `EnvGovernanceFields` -- contract-level defaults that individual variables may override. */
export declare interface DiscoveredContract extends EnvGovernanceFields {
    /** Absolute path of the file declaring the `createEnv()` call. */
    readonly file: string;
    /** The binding name the `createEnv()` result is exported as. */
    readonly exportName: string;
    /** Resolved display name: linked `documentEnv()`'s `name`, else `createEnv()`'s own `name` option, else `exportName`. */
    readonly contractName: string;
    /** From the linked `documentEnv()`'s `active` option. Defaults to `true` when omitted or undocumented. */
    readonly active: boolean;
    /** From the linked `documentEnv()` call, if any. */
    readonly category: string | undefined;
    /** From the linked `documentEnv()` call, if any -- see {@link runtime.ContractDocs.exclusiveGroup}. */
    readonly exclusiveGroup: string | undefined;
    /** From the linked `documentEnv()` call, if any. */
    readonly deprecated: boolean | undefined;
    /** From the linked `documentEnv()` call, if any. */
    readonly deprecatedReason: string | undefined;
    /** Every variable declared in the schema, merged with its linked documentation. */
    readonly variables: readonly DiscoveredVariable[];
    /** Whether *any* `documentEnv()` call is linked to this contract at all. */
    readonly documented: boolean;
    /** Set when this contract was discovered via an allow-listed package's
     *  declared schema entry point rather than local discovery -- the bare
     *  package name `renderManifest()` must import from instead of computing a
     *  relative path to the (analysis-only) resolved file. See ADR 0014. */
    readonly packageOrigin: PackageOrigin | undefined;
    /** Where this contract's `createEnv(...)` call is declared. Always present -- every discovered contract has one, by definition. See ADR 0036. */
    readonly declaration: SourcePosition;
    /** Where this contract's `documentEnv(...)` call is declared, if one exists. Undefined for a contract that's never been documented. See ADR 0036. */
    readonly documentation: SourcePosition | undefined;
}

/** A contract's statically-extracted `documentEnv()` documentation. */
/** The `documentEnv()` contract-level documentation, resolved from static literals at the parse stage. Its governance fields (`owner` .. `metadata`) are `EnvGovernanceFields`. */
export declare interface DiscoveredContractDocs extends EnvGovernanceFields {
    /** Statically-resolved `name`, if set to a string literal. */
    readonly name: string | undefined;
    /** Statically-resolved `category`, if set to a string literal. */
    readonly category: string | undefined;
    /** Statically-resolved `exclusiveGroup`, if set to a string literal. */
    readonly exclusiveGroup: string | undefined;
    /** Defaults to `true` when the call's `active` field is absent or not statically resolvable. */
    readonly active: boolean;
    /** Statically-resolved `deprecated`, if set to a boolean literal. */
    readonly deprecated: boolean | undefined;
    /** Statically-resolved `deprecatedReason`, if set to a string literal. */
    readonly deprecatedReason: string | undefined;
    /** Per-variable documentation, keyed by variable name. */
    readonly variables: ReadonlyMap<string, DiscoveredVariableDocs>;
}

/** Root-relative projection of a {@link DiscoveredContract}, as returned by {@link generateEnvManifest}/{@link generateDocumentation}. */
export declare interface DiscoveredContractSummary {
    /** Root-relative, POSIX-separated file path. */
    readonly file: string;
    /** The binding name the `createEnv()` result is exported as. */
    readonly exportName: string;
    /** Resolved display name (see {@link DiscoveredContract.contractName}). */
    readonly contractName: string;
    /** Number of variables declared in this contract's schema. */
    readonly variableCount: number;
    /** Whether this contract was included in the generated manifest (`active` defaults to true). */
    readonly active: boolean;
    /** Whether a `documentEnv()` call is linked to this contract. */
    readonly documented: boolean;
}

/** One schema entry's statically-discoverable shape -- presence facts, never evaluated/executed values. */
export declare interface DiscoveredSchemaVariable {
    /** The environment variable name (the schema's object key). */
    readonly key: string;
    /** Whether the entry declares a `default`. */
    readonly hasDefault: boolean;
    /** The default's statically-evaluated literal value, if `hasDefault` and it was a literal we could evaluate -- `{ ok: false }` when present but not statically resolvable, `undefined` when absent. */
    readonly defaultValue: {
        /** Always `true` in this branch. */
        ok: true;
        /** The evaluated literal value. */
        value: unknown;
    } | {
        /** Always `false` in this branch: present but not statically resolvable. */
        ok: false;
    } | undefined;
    /** Whether the entry declares a `processor`. */
    readonly hasProcessor: boolean;
    /** The processor function's source text, normalized to single-line, if `hasProcessor`. */
    readonly processorSource: string | undefined;
    /** Only present when the processor has an explicit `: T` return type annotation -- the one thing we treat as provable. */
    readonly processorReturnType: string | undefined;
    /** Whether the entry declares a `validator`. */
    readonly hasValidator: boolean;
    /** The validator function's source text, normalized to single-line, if `hasValidator`. */
    readonly validatorSource: string | undefined;
    /** The variable's statically-resolved `context`, if set to a non-empty string literal (see ADR 0022). `undefined` when absent, non-literal, or empty. */
    readonly context: string | undefined;
    /** Where this variable's own schema property (e.g. `SESSION_SECRET: z.string()`) is declared -- distinct from the *contract's* `declaration`/`documentation` (`link.ts`); every variable has exactly one of these, always. See ADR 0036. */
    readonly declaration: SourcePosition;
}

/** One schema variable, merged with its linked `documentEnv()` documentation (if any). */
/**
 * One schema variable merged with its linked `documentEnv()` documentation. Its
 * governance fields (`owner` .. `metadata`) are `EnvGovernanceFields` --
 * each an individual-variable override of the contract's own value, from the
 * linked `documentEnv()` call's matching `variables` entry, or `undefined`.
 */
export declare interface DiscoveredVariable extends DiscoveredSchemaVariable, EnvGovernanceFields {
    /** From the linked `documentEnv()` call's matching `variables` entry, if any. */
    readonly description: string | undefined;
    /** From the linked `documentEnv()` call's matching `variables` entry, if any. */
    readonly refreshInstructions: string | undefined;
    /** From the linked `documentEnv()` call's matching `variables` entry, if any. */
    readonly authenticatorType: string | undefined;
    /** From the linked `documentEnv()` call's matching `variables` entry, if any. */
    readonly rotationPeriod: string | undefined;
    /** From the linked `documentEnv()` call's matching `variables` entry, if any. */
    readonly lastRotatedAt: string | undefined;
    /** From the linked `documentEnv()` call's matching `variables` entry, if any. */
    readonly rotationTriggerEvents: readonly string[] | undefined;
    /** From the linked `documentEnv()` call's matching `variables` entry, if any. */
    readonly setupInstructions: string | undefined;
    /** From the linked `documentEnv()` call's matching `variables` entry, if any. */
    readonly required: boolean | undefined;
    /** From the linked `documentEnv()` call's matching `variables` entry, if any. */
    readonly deprecated: boolean | undefined;
    /** From the linked `documentEnv()` call's matching `variables` entry, if any. */
    readonly deprecatedReason: string | undefined;
    /** From the linked `documentEnv()` call's matching `variables` entry, if any. */
    readonly removeBy: string | undefined;
    /** From the linked `documentEnv()` call's matching `variables` entry, if any -- the previous variable name this one renames, if this declaration is the result of a rename. */
    readonly renamedFrom: string | undefined;
    /** The linked `documentEnv()` entry's `evidence` sub-object -- the re-verified-every-run half of this variable's documentation, deliberately not flattened in alongside the declared-only fields above. See {@link runtime.VariableEvidenceDocs} and ADR 0037. */
    readonly evidence: DiscoveredVariableEvidence | undefined;
    /** Whether this specific key had a matching entry in the linked `documentEnv()` call, if any. */
    readonly documented: boolean;
}

/** One variable's statically-extracted `documentEnv()` documentation, as declared in that call's `variables` entry for this key -- governance fields (`owner` .. `metadata`) are `EnvGovernanceFields`, resolved from static literals. */
export declare interface DiscoveredVariableDocs extends EnvGovernanceFields {
    /** The environment variable name this documentation applies to. */
    readonly key: string;
    /** Statically-resolved `description`, if set to a string literal. */
    readonly description: string | undefined;
    /** Statically-resolved `refreshInstructions`, if set to a string literal. */
    readonly refreshInstructions: string | undefined;
    /** Statically-resolved `authenticatorType`, if set to a string literal. */
    readonly authenticatorType: string | undefined;
    /** Statically-resolved `rotationPeriod`, if set to a string literal. */
    readonly rotationPeriod: string | undefined;
    /** Statically-resolved `lastRotatedAt`, if set to a string literal. */
    readonly lastRotatedAt: string | undefined;
    /** Statically-resolved `rotationTriggerEvents`, if set to an array of string literals. */
    readonly rotationTriggerEvents: readonly string[] | undefined;
    /** Statically-resolved `setupInstructions`, if set to a string literal. */
    readonly setupInstructions: string | undefined;
    /** Statically-resolved `required`, if set to a boolean literal. */
    readonly required: boolean | undefined;
    /** Statically-resolved `deprecated`, if set to a boolean literal. */
    readonly deprecated: boolean | undefined;
    /** Statically-resolved `deprecatedReason`, if set to a string literal. */
    readonly deprecatedReason: string | undefined;
    /** Statically-resolved `removeBy`, if set to a string literal. */
    readonly removeBy: string | undefined;
    /** Statically-resolved `renamedFrom`, if set to a string literal. */
    readonly renamedFrom: string | undefined;
    /** Statically-extracted `evidence` sub-object -- the re-verified-every-run half of a variable's documentation, kept structurally apart from the declared-only fields above. `undefined` when the declaration has no `evidence` key at all. See {@link runtime.VariableEvidenceDocs} and ADR 0037. */
    readonly evidence: DiscoveredVariableEvidence | undefined;
}

/** The statically-extracted contents of one variable's `evidence` sub-object. See {@link runtime.VariableEvidenceDocs}. */
export declare interface DiscoveredVariableEvidence {
    /** Well-formed `"path:line:column"` entries from `evidence.dynamicAccess`, if set to an array of string literals -- a malformed entry warns and is dropped, never included here. See ADR 0037. */
    readonly dynamicAccess: readonly string[] | undefined;
}

/** Options for {@link discoverSchemaFiles}. */
declare interface DiscoverOptions {
    /** The filesystem capability -- `./build` never imports `node:fs` (ADR 0040). */
    readonly fs: BuildFileSystem;
    /** Absolute path to search under. */
    readonly root: string;
    /** Glob patterns (relative to `root`) a file must match at least one of to be included. */
    readonly include: readonly string[];
    /** Glob patterns (relative to `root`) that prune a file or directory regardless of `include`. */
    readonly exclude: readonly string[];
}

/**
 * Finds every schema file matching `include`/`exclude` under `root`, returned
 * as absolute paths in deterministic (alphabetically sorted) order.
 *
 * @remarks
 * No external glob dependency: directories are pruned *during* the walk
 * (both a hardcoded node_modules/.git skip and the caller's `exclude`
 * patterns), rather than walked in full and filtered afterward -- walking an
 * entire node_modules tree just to discard it is not acceptable for a tool
 * meant to run against real projects.
 */
export declare function discoverSchemaFiles(options: DiscoverOptions): Promise<string[]>;

/**
 * Renders an absolute path for a human-facing generated artifact
 * (`ENVIRONMENT.md`/`OWNERSHIP.md`) or a root-relative canonical model field,
 * root-relative when possible. The one place this conversion lives -- every
 * model builder and renderer that needs "the path as a reader should see it"
 * goes through this, so two of them can never disagree about the form of the
 * same file's path (which would silently break every `${file}#${exportName}`
 * lookup that crosses between them).
 *
 * A `DiscoveredContract.file` keeps its own absolute path untouched -- that's
 * the correct, unambiguous fact, and what stays sane when discovery spans
 * multiple roots (a `packages`-discovered file living outside `root`
 * entirely, ADR 0014).
 */
/**
 * Renders `absolutePath` relative to `root`, POSIX-separated regardless of
 * platform (matching every other rendered path in this package's Markdown and
 * JSON output). Falls back to `absolutePath` itself, unchanged, whenever the
 * result would need to climb outside `root` (a `packages`-discovered file, or
 * any other path not under root) -- never manufactures a `../` escape, which
 * reads as a real relative path to a consumer and resolves to nothing useful.
 */
export declare function displayPath(root: string, absolutePath: string): string;

/** Everything {@link generateDocumentation} found that isn't fully documented or up to date -- never blocks generation; a team that wants to gate CI on this reads `Finding[]` (the "documentation" family) from the persisted evidence artifact and decides for itself. See ADR 0038. */
export declare interface DocumentationFindings {
    /** Contracts with no linked `documentEnv()` call at all. */
    readonly undocumentedContracts: readonly {
        /** Absolute path of the file declaring the contract. */
        readonly file: string;
        /** The contract's exported binding name. */
        readonly exportName: string;
    }[];
    /** Schema variables with no matching entry in their contract's linked documentation. */
    readonly undocumentedVariables: readonly {
        /** Absolute path of the file declaring the contract. */
        readonly file: string;
        /** The contract's exported binding name. */
        readonly exportName: string;
        /** The undocumented environment variable name. */
        readonly key: string;
    }[];
    /** Documented variable entries with no matching schema variable (the schema key was removed or renamed). */
    readonly staleDocEntries: readonly {
        /** Absolute path of the file declaring the contract. */
        readonly file: string;
        /** The contract's exported binding name. */
        readonly exportName: string;
        /** The stale documented variable name. */
        readonly key: string;
    }[];
    /** Variables whose `expiresAt` falls within the configured window. */
    readonly expiringSoon: readonly ExpiringEntry[];
    /** Contract- or variable-level `sensitivity` values outside {@link STANDARD_SENSITIVITY_LEVELS}. Advisory only -- the declared level is always honored verbatim; this exists purely so vocabulary drift across a repo stays visible. */
    readonly nonstandardSensitivityLevels: readonly NonstandardSensitivityEntry[];
    /** `documentEnv()` calls that couldn't be statically linked to a schema. */
    readonly unresolvedLinks: readonly {
        /** Absolute path of the file containing the unlinkable call. */
        readonly file: string;
        /** Human-readable explanation of why the link couldn't be resolved. */
        readonly reason: string;
    }[];
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
export declare interface DynamicAccessAssertion extends SourcePosition {
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

/** One `dynamicAccess` citation env-cap can no longer vouch for -- the direct input to `finding-model.ts`'s `"STALE_DYNAMIC_ACCESS_CITATION"`/`"MISSING_DYNAMIC_ACCESS_CITATION"` findings. See ADR 0037. */
export declare interface DynamicAccessCitationProblem {
    readonly contractName: string;
    /** Root-relative, POSIX-separated. */
    readonly file: string;
    readonly exportName: string;
    /** The variable whose `dynamicAccess` citation this is. */
    readonly key: string;
    /** Where the citation points -- not the variable's own declaration. */
    readonly position: SourcePosition;
    readonly acknowledgment: "stale" | "missing";
}

/**
 * A variable's owner, falling back to its contract's default when the
 * variable itself doesn't set one.
 *
 * @remarks
 * The one place this resolution rule should live -- see ADR 0028. Every
 * caller that needs "who owns this variable" (the docs Catalog/ownership
 * matrix/security review, and, as of ADR 0028, the usage report's
 * variable-level ownership findings) must go through this, not
 * `variable.owner` or `contract.owner` alone, so two call sites can never
 * again disagree about who owns a variable the way `docs.ts` and
 * `usage-report.ts` once did.
 *
 * Structurally typed (not pinned to `DiscoveredContract`/`DiscoveredVariable`)
 * so the same one resolution rule also serves `ContractModelContract`/
 * `ContractModelVariable` (`contract-model.ts`) -- both shapes carry the same
 * field, and this rule must never have two independent implementations.
 */
export declare function effectiveOwner(contract: {
    readonly owner: string | undefined;
}, variable: {
    readonly owner: string | undefined;
}): string | undefined;

/**
 * Thrown by {@link generateDocumentation} on a blocking undocumented-contract/
 * variable finding (when `onUndocumented: "throw"`), or an output path
 * (`location`/`envExample.location`) escaping `root`. Nothing is written
 * when this throws.
 *
 * @remarks
 * `code` is a stable, Stable-tier discriminant for programmatic handling --
 * prefer it over `.name`/`instanceof` when a message-independent switch is needed.
 */
export declare class EnvDocumentationGenerationError extends Error {
    /** Stable discriminant for programmatic handling; always `"ENV_DOCUMENTATION_GENERATION_FAILED"`. */
    readonly code = "ENV_DOCUMENTATION_GENERATION_FAILED";
    /** Every blocking finding, aggregated. */
    readonly issues: readonly CompatibilityIssue[];
    constructor(issues: readonly CompatibilityIssue[]);
}

/**
 * Controls what happens when a `.env.example` already exists at the target
 * location. `"keep-sibling"` (default): never touch the existing file --
 * write a timestamped sibling instead, for the developer to diff/merge
 * manually. `"overwrite"`: replace the existing file with freshly rendered
 * content directly. `"skip"`: write nothing at all.
 */
export declare type EnvExampleOnExisting = "keep-sibling" | "overwrite" | "skip";

/** The result of a completed {@link writeEnvExample} call. */
export declare interface EnvExampleResult {
    /**
     * Where the example file actually got written. `undefined` only when
     * `onExisting: "skip"` left an existing file untouched and nothing was
     * written.
     */
    readonly writtenPath: string | undefined;
    /**
     * Set when a file already existed at the requested location and was left
     * untouched: with the default `"keep-sibling"`, `writtenPath` is a fresh
     * timestamped sibling instead; with `"skip"`, this is the only outcome and
     * `writtenPath` is `undefined`. Always `undefined` with `"overwrite"`.
     */
    readonly skippedExistingPath: string | undefined;
    /** Variable names (live or already commented-out) in an existing example file that no discovered contract declares anymore. */
    readonly staleVariables: readonly string[];
    /** Variables live in an existing example file whose feature is no longer active, and that no other active feature still needs -- safe to comment out. */
    readonly variablesToComment: readonly string[];
    /** Variables the current (active) configuration requires that aren't yet a live entry in an existing example file. */
    readonly variablesToAdd: readonly string[];
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
 * Thrown by {@link generateEnvManifest} on a blocking compatibility/exclusive-group
 * finding, or an output path escaping `root`.
 *
 * @remarks
 * Nothing is written when this throws -- generation fails atomically, same as
 * {@link runtime.validateEnv} fails atomically at runtime.
 *
 * `code` is a stable, Stable-tier discriminant for programmatic handling --
 * prefer it over `.name`/`instanceof` when a message-independent switch is needed.
 */
export declare class EnvManifestGenerationError extends Error {
    /** Stable discriminant for programmatic handling; always `"ENV_MANIFEST_GENERATION_FAILED"`. */
    readonly code = "ENV_MANIFEST_GENERATION_FAILED";
    /** Every blocking finding, aggregated. */
    readonly issues: readonly CompatibilityIssue[];
    constructor(issues: readonly CompatibilityIssue[]);
}

/**
 * Thrown by {@link generateEnvArtifacts} when any requested pass (manifest/docs/usage)
 * reports a blocking finding, aggregated across all requested passes into
 * one error.
 *
 * @remarks
 * Nothing from any pass is written when this throws -- see
 * `generate-env-artifacts.ts`'s compute-atomic guarantee (ADR 0011). Write-phase failures
 * (a real I/O error after all computes already passed) are NOT wrapped in
 * this type -- they propagate as whatever `fs.writeFile` itself throws,
 * since by that point some artifacts may already be on disk.
 *
 * `code` is a stable, Stable-tier discriminant for programmatic handling --
 * prefer it over `.name`/`instanceof` when a message-independent switch is needed.
 */
export declare class EnvProjectGenerationError extends Error {
    /** Stable discriminant for programmatic handling; always `"ENV_PROJECT_GENERATION_FAILED"`. */
    readonly code = "ENV_PROJECT_GENERATION_FAILED";
    /** Every blocking finding, aggregated across all requested passes. */
    readonly issues: readonly CompatibilityIssue[];
    constructor(issues: readonly CompatibilityIssue[]);
}

/**
 * Thrown by {@link generateUsageReport} on a blocking abandoned-contract/
 * unconsumed-owned-variable finding (when `onOwnershipIssue: "throw"`), or an
 * output path (`report.location`) escaping `root`.
 *
 * @remarks
 * Never thrown for `unresolvedConsumers` or `indeterminate` findings -- both are "we don't
 * know" states, and uncertainty is never promoted to a failure.
 *
 * `code` is a stable, Stable-tier discriminant for programmatic handling --
 * prefer it over `.name`/`instanceof` when a message-independent switch is needed.
 */
export declare class EnvUsageAnalysisError extends Error {
    /** Stable discriminant for programmatic handling; always `"ENV_USAGE_ANALYSIS_FAILED"`. */
    readonly code = "ENV_USAGE_ANALYSIS_FAILED";
    /** Every blocking finding, aggregated. */
    readonly issues: readonly CompatibilityIssue[];
    constructor(issues: readonly CompatibilityIssue[]);
}

/**
 * Bump only when a reader could misinterpret the new shape of `EvidenceModel`
 * itself (not any one sub-model's own `<MODEL>_SCHEMA_VERSION`, which is
 * versioned independently) -- same rule every other canonical model follows.
 */
export declare const EVIDENCE_MODEL_SCHEMA_VERSION = 1;

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
declare interface EvidenceProjection<T extends Record<string, unknown>> {
    (evidence: EvidenceModel): T;
    /** Same computation as calling the projection directly, plus which `EvidenceModel` field paths fed each output key -- see {@link EvidenceProjectionResult}. */
    project(evidence: EvidenceModel): EvidenceProjectionResult<T>;
}

/** `project()`'s return shape: the computed output, plus which `EvidenceModel` field paths fed each output key. */
declare interface EvidenceProjectionResult<T extends Record<string, unknown>> {
    readonly value: T;
    readonly sources: Readonly<Record<keyof T, readonly string[]>>;
}

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
export declare type EvidenceReference = ContractEvidenceReference | OwnershipEvidenceReference | ChangeEvidenceReference;

/** One contract- or variable-level `expiresAt` falling within the configured "expiring soon" window. */
export declare interface ExpiringEntry {
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

/** One contract- or variable-level `expiresAt` inside the configured window. */
export declare interface ExpiringSoonEntry {
    /** Root-relative, POSIX-separated path of the declaring contract. */
    readonly file: string;
    readonly exportName: string;
    /** The declaring contract's display name, resolved from Contract Model. */
    readonly contractName: string;
    /** `undefined` for a contract-level expiry, set for a per-variable one. */
    readonly key: string | undefined;
    /** The raw ISO date string, exactly as declared -- never reformatted. */
    readonly expiresAt: string;
    /** Days remaining as of the run that produced this evidence; negative when already expired. */
    readonly daysRemaining: number;
    /** `true` when `daysRemaining` is negative -- the deadline has already passed. */
    readonly expired: boolean;
    /** How to obtain a replacement value, if the declaration says. */
    readonly refreshInstructions: string | undefined;
    /** Effective owner, so a reader knows who to chase without a second lookup. */
    readonly owner: string | undefined;
}

/** The Expiring-Soon projection's output shape. */
export declare interface ExpiringSoonReport extends Record<string, unknown> {
    /** See {@link ConfigurationReference.disclaimer}. */
    readonly disclaimer: string;
    /** Every entry inside the window, soonest-first (already-expired entries lead, most-overdue first). */
    readonly entries: readonly ExpiringSoonEntry[];
    /** How many of `entries` are already past their `expiresAt`. */
    readonly expiredCount: number;
}

/**
 * Expiring-Soon report: Lifecycle Model's `expiring` view, joined with
 * ownership and refresh instructions so a reader can act on a row without
 * cross-referencing three other models by hand.
 *
 * @remarks
 * The window itself was applied upstream, when Lifecycle Model was built --
 * this projection deliberately does not re-filter by a date of its own.
 * Recomputing "soon" here would make the projection's answer depend on when
 * it happened to be *read* rather than when the evidence was *generated*,
 * which is exactly the reproducibility property the Evidence Model exists to
 * preserve.
 */
export declare const expiringSoonReport: EvidenceProjection<ExpiringSoonReport>;

/** The minimal shape {@link computeExpiringEntries} needs -- structural, not pinned to `DiscoveredContract`, so the exact same rule serves both `LinkResult`'s absolute-path contracts (`generate-documentation.ts`'s `documentation.expiringSoon`, Stable tier) and `ContractModel`'s root-relative ones, whichever a caller already has on hand. */
declare interface ExpiryBearingContract {
    readonly file: string;
    readonly exportName: string;
    readonly expiresAt: string | undefined;
    readonly variables: readonly {
        readonly key: string;
        readonly expiresAt: string | undefined;
    }[];
}

/** Parses `# KEY=value` lines out of an existing `.env`-style file -- variables it already knows about but has turned off. */
export declare function extractCommentedVariables(source: string): string[];

/**
 * Reads a `documentEnv()` call's second argument (the {@link runtime.ContractDocs} shape).
 *
 * @remarks
 * Anything not a statically-resolvable literal warns and is skipped (falls back to
 * "not set") rather than guessed at, same policy as schema-entry parsing.
 *
 * @param contextLabel - Used only to build human-readable warning messages.
 * @param warnings - Mutated in place: one entry is pushed per unresolvable field.
 */
export declare function extractContractDocs(docsArg: ts.Expression | undefined, filePath: string, contextLabel: string, warnings: ParseWarning[]): DiscoveredContractDocs;

/** Parses `KEY=value` lines out of an existing `.env`-style file, ignoring comments and blank lines. */
export declare function extractDeclaredVariables(source: string): string[];

/** Every variable key that appeared as a catalog heading in a previously-generated docs file. Exported for testing. */
export declare function extractPreviouslyDocumentedKeys(previousContent: string): Set<string>;

/**
 * Extracts one schema object literal's variables (processor/validator/default presence); never
 * evaluates or executes the schema.
 *
 * @param contextLabel - Used only to build human-readable warning messages (e.g. the contract's export name).
 * @param warnings - Mutated in place: one entry is pushed per skipped (non-static, invalid-key, or non-literal) property.
 */
export declare function extractSchemaVariables(schemaLiteral: ts.ObjectLiteralExpression, filePath: string, contextLabel: string, warnings: ParseWarning[], sourceFile: ts.SourceFile): DiscoveredSchemaVariable[];

/** The raw, single-file facts extracted by {@link parseSchemaFile}. */
export declare interface FileParseResult {
    /** Absolute path of the parsed file. */
    readonly file: string;
    /** The TypeScript AST for this file, reused by callers that need to inspect it further. */
    readonly sourceFile: ts.SourceFile;
    /** Top-level `const NAME = {...}` object-literal declarations, whether exported or not. */
    readonly localConsts: ReadonlyMap<string, ts.ObjectLiteralExpression>;
    /** Names of top-level `const` declarations that are exported (a subset of {@link localConsts}'s keys, plus non-object-literal exports). */
    readonly exportedConstNames: ReadonlySet<string>;
    /** Local binding name -> where it came from. Only named imports of a relative specifier are tracked (namespace/default/bare-package imports are irrelevant to schema linking). */
    readonly imports: ReadonlyMap<string, ImportBinding>;
    /** Every `createEnv(...)` call site found at the top level of this file. */
    readonly createEnvCalls: readonly RawCreateEnvCall[];
    /** Every `documentEnv(...)` call site found at the top level of this file. */
    readonly documentEnvCalls: readonly RawDocumentEnvCall[];
    /** Recoverable issues found while parsing this file. */
    readonly warnings: readonly ParseWarning[];
}

/** One rule violation or derived signal, in the Finding Model's canonical shape. */
export declare interface Finding {
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
export declare const FINDING_MODEL_SCHEMA_VERSION = 3;

/**
 * The fourth of env-cap's seven canonical fact models (ADR 0024) -- every
 * rule violation and derived risk signal, unified behind one shape, with a
 * stable `code` and a structured {@link EvidenceReference} instead of four
 * independently-shaped finding families. See ADR 0026.
 */
/** Every stable `code` a {@link Finding} can carry. A superset of {@link CompatibilityIssueCode} plus one code per non-compatibility source family this model adapts. */
export declare type FindingCode = CompatibilityIssueCode | "EXCLUSIVE_GROUP_VIOLATION" | "ARTIFACT_STALE" | "ARTIFACT_MISSING" | "UNDOCUMENTED_CONTRACT" | "UNDOCUMENTED_VARIABLE" | "STALE_DOC_ENTRY" | "EXPIRED" | "EXPIRING_SOON" | "UNRESOLVED_DOCUMENTENV_LINK" | "ABANDONED_CONTRACT" | "UNRESOLVED_CONSUMER" | "UNCONSUMED_OWNED_VARIABLE" | "INDETERMINATE_OWNERSHIP" | "MISSING_DYNAMIC_ACCESS_CITATION" | "STALE_DYNAMIC_ACCESS_CITATION" | "NONSTANDARD_SENSITIVITY_LEVEL";

/** Which source check produced a {@link Finding} -- coarser than `code`, for a consumer that only wants to filter by kind (e.g. "show me every documentation gap") without enumerating every individual code. */
export declare type FindingFamily = "compatibility" | "drift" | "documentation" | "ownership";

/** The versioned, JSON-serializable root of the Finding Model -- every rule violation and derived risk signal from this run, unified behind {@link Finding}'s one shape. See this module's own doc comment for the full picture. */
export declare interface FindingModel {
    readonly schemaVersion: typeof FINDING_MODEL_SCHEMA_VERSION;
    readonly findings: readonly Finding[];
}

/**
 * Build-time only. Discovers and links `env.schema.ts` files (same static
 * analysis as {@link generateEnvManifest}) and writes the rich Markdown "Catalog" --
 * every variable, its description, default, processor/validator flags,
 * owner, and expiry -- the single onboarding reference application
 * developers use to see what configuration a feature needs and how to set
 * it up. Optionally also writes a reconciling `.env.example`.
 *
 * @remarks
 * Documents every discovered contract, active or not, unlike {@link generateEnvManifest}.
 *
 * @throws {EnvDocumentationGenerationError} If `location`/`envExample.location` escape `root`.
 */
export declare function generateDocumentation(options: GenerateDocumentationOptions): Promise<GenerateDocumentationResult>;

/** Options for {@link generateDocumentation}. */
export declare interface GenerateDocumentationOptions {
    /** The filesystem capability -- `./build` never imports `node:fs` (ADR 0040). */
    fs: BuildFileSystem;
    /** Project root schema discovery is relative to. Defaults to `process.cwd()`. */
    root?: string | undefined;
    /** Output path for the Markdown docs artifact, relative to `root`. */
    location: string;
    /** Glob patterns for files to scan. Defaults to `defaultInclude()`. */
    include?: string[] | undefined;
    /** Glob patterns for files/directories to prune. Defaults to `defaultExclude()`. */
    exclude?: string[] | undefined;
    /** See `GenerateEnvManifestOptions.packages`; see ADR 0014. */
    packages?: readonly string[] | undefined;
    /** See `GenerateEnvManifestOptions.tsconfig`; see ADR 0023. */
    tsconfig?: string | false | undefined;
    /** How many days out counts as "expiring soon". Defaults to 30. */
    expiringWithinDays?: number | undefined;
    /**
     * Also emit a `.env.example`-style file, relative to `root`. `onExisting`
     * controls what happens when a file already exists there -- defaults to
     * `"keep-sibling"` (never overwrites; see `EnvExampleOnExisting` and
     * `EnvExampleResult`).
     */
    envExample?: {
        /** Output path for the `.env.example`-style file, relative to `root`. */
        location: string;
        /** What to do when a file already exists at `location`. Defaults to `"keep-sibling"`. */
        onExisting?: EnvExampleOnExisting | undefined;
    } | undefined;
    /**
     * Supplies expiration metadata from a live source as a post-discovery
     * override, invoked exactly once with every discovered variable name after
     * linking completes and before rendering. See `live-expirations.ts` and
     * ADR 0012. Omitted: behavior is unchanged from a purely static `expiresAt`.
     */
    liveExpirationDates?: LiveExpirationDates | undefined;
}

/** The result of a completed {@link generateDocumentation} run. */
export declare interface GenerateDocumentationResult {
    /** Absolute path the Markdown docs artifact was written to. */
    readonly docsPath: string;
    /** Set only when `options.envExample` was passed. */
    readonly envExample: EnvExampleResult | undefined;
    /** Root-relative summary of every discovered contract, active or not. */
    readonly contracts: readonly DiscoveredContractSummary[];
    /** Same descriptive content as the generated Markdown Catalog, reshaped for
     *  programmatic consumers -- see `buildCatalog()` in `docs.ts`. */
    readonly catalog: readonly CatalogContract[];
    /** Parse-time warnings collected across every analyzed file (including allow-listed package resolution). */
    readonly parseWarnings: readonly ParseWarning[];
    /** Everything found that isn't fully documented or up to date. */
    readonly documentation: DocumentationFindings;
}

/**
 * Orchestrates {@link generateEnvManifest}/{@link generateDocumentation}/
 * {@link generateUsageReport}, plus the persisted evidence artifact, by
 * composing their shared private compute/write pipeline directly, running
 * schema discovery+linking exactly once regardless of how many outputs are
 * requested -- an orchestrator, not a new analysis engine (see ADR 0011).
 *
 * @remarks
 * Two distinct atomicity guarantees, not one:
 *  - **Compute atomicity (guaranteed)**: every requested pass's blocking
 *    findings are checked, across all passes, before any pass writes
 *    anything.
 *  - **Write atomicity (NOT guaranteed, and not attempted)**: once writes
 *    begin, each `fs.writeFile` is independent. A real I/O failure partway
 *    through (disk full, permissions changed mid-run) can leave some
 *    artifacts on disk and not others. Transactional (temp-file + rename)
 *    writes across all three artifacts were considered and rejected as
 *    disproportionate machinery for a rare failure mode -- see ADR 0011.
 *
 * @throws {EnvProjectGenerationError} If any requested output location escapes `root`, or if any requested pass reports a blocking finding.
 */
export declare function generateEnvArtifacts(options: GenerateEnvArtifactsOptions): Promise<GenerateEnvArtifactsResult>;

/** Options for {@link generateEnvArtifacts}. */
export declare interface GenerateEnvArtifactsOptions {
    /** The filesystem capability, shared across every requested pass -- `./build` never imports `node:fs` (ADR 0040). */
    fs: BuildFileSystem;
    /** Directory glob patterns are resolved against, shared across every requested pass. Defaults to `process.cwd()`. */
    root?: string | undefined;
    /** Shared schema-discovery glob for the contract graph. Defaults to `["**\/env.schema.ts"]`. */
    include?: string[] | undefined;
    /** Glob patterns to exclude, shared across every requested pass. Defaults to node_modules/dist/.git. */
    exclude?: string[] | undefined;
    /** See `GenerateEnvManifestOptions.packages`; shared across every requested pass. See ADR 0014. */
    packages?: readonly string[] | undefined;
    /** See `GenerateEnvManifestOptions.tsconfig`; shared across every requested pass. See ADR 0023. */
    tsconfig?: string | false | undefined;
    /** Manifest pass options, or `false` to skip it entirely. */
    manifest?: Omit<GenerateEnvManifestOptions, "fs" | "root" | "include" | "exclude" | "packages" | "tsconfig"> | false | undefined;
    /** Docs pass options, or `false` to skip it entirely. */
    docs?: Omit<GenerateDocumentationOptions, "fs" | "root" | "include" | "exclude" | "packages" | "tsconfig" | "liveExpirationDates"> | false | undefined;
    /** Usage-report pass options, or `false` to skip it entirely. */
    usage?: Omit<GenerateUsageReportOptions, "fs" | "root" | "include" | "exclude" | "packages" | "tsconfig"> | false | undefined;
    /**
     * Where to write the persisted evidence artifact (the full, literal
     * `EvidenceModel`, plus a paired `.fingerprint` sidecar -- see
     * `evidence-cache.ts`), e.g. `docs/env.evidence.json`, relative to `root`.
     * Independent of `manifest.location` -- requesting this needs no other
     * pass, and generating a manifest never requires it. `EvidenceModel`
     * itself is always computed regardless of this option (ADR 0038, "free to
     * compute, always real") and always returned as `result.evidence`; this
     * option controls only whether it's also written to disk. Omitted:
     * nothing is written, `result.evidence` is still populated.
     */
    evidence?: {
        location: string;
    } | false | undefined;
    /**
     * Escalates every warning-severity `"documentation"`-family finding
     * (undocumented contracts/variables, stale doc entries, expiring/expired
     * entries, unresolvable `documentEnv()` links) into a blocking error, so a
     * run with any of them writes nothing and throws. Defaults to `"warn"` --
     * ADR 0038's stance, unchanged: documentation gaps never block by default.
     *
     * @remarks
     * Scoped deliberately narrowly, unlike `manifest.onIncompatibility`, which
     * gates only the compatibility family. `"info"`-severity findings are never
     * escalated by either -- see `Finding.severity`.
     */
    onUndocumented?: "warn" | "throw" | undefined;
    /**
     * Escalates every warning-severity `"ownership"`-family finding (abandoned
     * contracts, unresolved consumers, unconsumed owned variables,
     * indeterminate ownership, stale/missing `dynamicAccess` citations) into a
     * blocking error. Defaults to `"warn"` -- see {@link onUndocumented}.
     */
    onOwnershipIssue?: "warn" | "throw" | undefined;
    /**
     * Supplies expiration metadata from a live source (a secrets manager, an
     * internal inventory API, ...) as a post-discovery override applied only to
     * the docs pass. Invoked at most once, only when a `docs` pass is actually
     * requested, with every discovered variable name across all passes' shared
     * contract graph. See `live-expirations.ts` and ADR 0012. Omitted: behavior
     * is unchanged from a purely static `expiresAt`.
     */
    liveExpirationDates?: LiveExpirationDates | undefined;
}

/** The result of a completed {@link generateEnvArtifacts} run. */
export declare interface GenerateEnvArtifactsResult {
    /** Set only when `options.manifest` wasn't `false`. */
    readonly manifest: GenerateEnvManifestResult | undefined;
    /** Set only when `options.docs` wasn't `false`. */
    readonly docs: GenerateDocumentationResult | undefined;
    /** Set only when `options.usage` wasn't `false`. */
    readonly usage: GenerateUsageReportResult | undefined;
    /** Always populated, regardless of `options.evidence` -- see that option's own doc comment. */
    readonly evidence: EvidenceModel;
}

/**
 * Build-time only. Discovers `env.schema.ts` files, statically analyzes them
 * (never executes them) to link `createEnv()`/`documentEnv()` calls, checks
 * for provable incompatibilities between duplicate variable declarations,
 * and writes a deterministic manifest file that re-exports every discovered
 * active contract.
 *
 * @remarks
 * Never call this at application startup or import it from
 * runtime code -- wire it into an npm script, a bundler plugin, or a CI
 * step instead.
 *
 * @throws {EnvManifestGenerationError} If `location` escapes `root`, or if a blocking compatibility/exclusive-group issue is found.
 */
export declare function generateEnvManifest(options: GenerateEnvManifestOptions): Promise<GenerateEnvManifestResult>;

/** Options for {@link generateEnvManifest}. */
export declare interface GenerateEnvManifestOptions {
    /** The filesystem capability -- `./build` never imports `node:fs` (ADR 0040). */
    fs: BuildFileSystem;
    /** Directory glob patterns are resolved against. Defaults to `process.cwd()`. */
    root?: string | undefined;
    /** Output path for the generated manifest, relative to `root` (e.g. "src/generated/env.manifest.ts"). */
    location: string;
    /** Glob patterns for schema files. Defaults to `["**\/env.schema.ts"]`. */
    include?: string[] | undefined;
    /** Glob patterns to exclude. Defaults to node_modules/dist/.git. */
    exclude?: string[] | undefined;
    /**
     * Explicit allowlist of installed
     * package names whose declared `"envCap": { "schema": "<path>" }` entry
     * point should also be discovered, so a contract that ships as its own
     * separately-published package (no monorepo required) can be included in
     * the manifest. Opt-in only: a package is never considered unless its
     * exact name appears here. See ADR 0014.
     */
    packages?: readonly string[] | undefined;
    /**
     * Path to a tsconfig.json (relative to `root`)
     * whose `compilerOptions.paths`/`baseUrl` resolve aliased import specifiers (e.g.
     * `"@/lib/env.schema.js"`) encountered during static analysis, so a contract or consumer
     * reached only through an alias isn't misreported as abandoned/unresolved. Defaults to
     * `"tsconfig.json"` at `root` -- on automatically, no opt-in required, since (unlike
     * `packages`) this never crosses a trust/versioning boundary: every resolved file is
     * already local, already-trusted project source. Pass `false` to disable entirely. See
     * ADR 0023.
     */
    tsconfig?: string | false | undefined;
    /**
     * "warn" (default): only provable incompatibilities (conflicting explicit processor
     * return type annotations) block generation; everything else is reported as a warning.
     * "throw": warnings are escalated to hard errors too, for stricter CI gates.
     */
    onIncompatibility?: "warn" | "throw" | undefined;
}

/** The result of a completed {@link generateEnvManifest} run. */
export declare interface GenerateEnvManifestResult {
    /** Absolute path the manifest file was written to. */
    readonly outputPath: string;
    /** Root-relative summary of every discovered contract, active or not. */
    readonly contracts: readonly DiscoveredContractSummary[];
    /** Non-blocking compatibility/exclusive-group issues (severity `"warning"`). */
    readonly warnings: readonly CompatibilityIssue[];
    /** Parse-time warnings collected across every analyzed file (including allow-listed package resolution). */
    readonly parseWarnings: readonly ParseWarning[];
}

/**
 * Node-only assembly orchestrator (ADR 0024, ADR 0031): runs schema
 * discovery and linking once (via `assembleProject()`, shared with
 * `computeArtifacts()`), then builds all seven canonical fact models by
 * calling each model's own public builder directly -- this function
 * introduces no derivation logic of its own, only sequencing and the shared
 * discovery/linking every builder needs. The result is `deepFreeze()`-d
 * before being returned.
 *
 * @remarks
 * Deliberately never throws on a data-quality finding (a compatibility
 * issue, an undocumented variable, an abandoned contract, ...) -- every one
 * of those becomes a `Finding` in the returned model's `finding` field
 * instead. This is a real difference from `generateEnvManifest()`, which
 * throws by default: that's a "should I write this artifact" gate, while
 * Evidence Model assembly is a read-only snapshot whose entire purpose is
 * representing such issues as data for a consumer's own projection to act
 * on (see ADR 0024's mission statement). It still throws
 * `EnvProjectGenerationError` for a genuine configuration error --
 * `previousSnapshotLocation` escaping `root`.
 *
 * The dependency-graph scan underlying Dependency Model (via
 * `buildDependencyModel()`) and the one underlying Finding Model's
 * ownership-related findings (via `computeUsage()`) each run their own,
 * independent pass over the repository -- a real, accepted cost of calling
 * each half's already-tested public building block directly rather than
 * hand-deriving a second copy of either's logic here. Both are Node-only,
 * dev/CI-time-only work (never a runtime hot path), so the redundant I/O is
 * an honest tradeoff, not an oversight.
 */
export declare function generateEvidenceModel(options: GenerateEvidenceModelOptions): Promise<EvidenceModel>;

/** Options for {@link generateEvidenceModel}. */
export declare interface GenerateEvidenceModelOptions {
    /** The filesystem capability -- `./build` never imports `node:fs` (ADR 0040). */
    fs: BuildFileSystem;
    /** Directory glob patterns are resolved against. Defaults to `process.cwd()`. */
    root?: string | undefined;
    /** Schema-discovery glob for the contract graph. Defaults to `["**\/env.schema.ts"]`. */
    include?: string[] | undefined;
    /** Glob patterns to exclude, shared across every pass. Defaults to node_modules/dist/.git. */
    exclude?: string[] | undefined;
    /** See `GenerateEnvManifestOptions.packages`. See ADR 0014. */
    packages?: readonly string[] | undefined;
    /** See `GenerateEnvManifestOptions.tsconfig`. See ADR 0023. */
    tsconfig?: string | false | undefined;
    /**
     * Where a previously-persisted evidence artifact lives, relative to
     * `root` -- read (never written) as the baseline Change Model diffs
     * against and dynamic-access citation freshness (ADR 0037) compares
     * content hashes to. Independent of any `.ts` manifest a project may or
     * may not also generate -- there is no derivation from a manifest's own
     * location. Omitted: treated as the normal first-run state (everything
     * reads as added, no citation-freshness baseline to compare against),
     * never an error.
     */
    previousSnapshotLocation?: string | undefined;
    /** Feeds Lifecycle Model's `expiring` list. Defaults to 30. */
    expiringWithinDays?: number | undefined;
    /**
     * Supplies expiration metadata from a live source as a post-discovery
     * override, applied to Lifecycle Model's (and Finding Model's
     * `expiring-soon` findings') data only -- Contract Model still reflects the
     * schema's own static `expiresAt`. See `live-expirations.ts` and ADR 0012.
     */
    liveExpirationDates?: LiveExpirationDates | undefined;
    /**
     * Resolves the commit SHA to stamp onto `EvidenceModel.provenance.commit`.
     * Invoked at most once, after discovery/linking completes. env-cap never
     * shells out to `git` itself -- see ADR 0012's callback precedent. Omitted:
     * `commit` is `undefined`.
     */
    commit?: (() => Promise<string | undefined>) | undefined;
}

/**
 * Build-time only. Answers who owns each contract, which features depend on
 * it, and what the blast radius is if it changes -- the mirror image of
 * {@link generateEnvManifest}'s "safer migrations" story: a schema that was never
 * wired up, or was abandoned mid-removal, shows up here instead of sitting
 * unnoticed.
 *
 * @remarks
 * This is an additional, separate artifact, not a replacement for
 * {@link generateDocumentation}'s Catalog -- the two serve different audiences
 * (see ADR 0010).
 *
 * @throws {EnvUsageAnalysisError} If `report.location` escapes `root`.
 */
export declare function generateUsageReport(options: GenerateUsageReportOptions): Promise<GenerateUsageReportResult>;

/** Options for {@link generateUsageReport}. */
export declare interface GenerateUsageReportOptions {
    /** The filesystem capability -- `./build` never imports `node:fs` (ADR 0040). */
    fs: BuildFileSystem;
    /** Directory glob patterns are resolved against. Defaults to `process.cwd()`. */
    root?: string | undefined;
    /** Schema-discovery glob, for the contract graph -- self-sufficient like the other two generator functions. */
    include?: string[] | undefined;
    /** Glob patterns to exclude, for both schema discovery and the usage scan. Defaults to node_modules/dist/.git. */
    exclude?: string[] | undefined;
    /** See `GenerateEnvManifestOptions.packages`; see ADR 0014. */
    packages?: readonly string[] | undefined;
    /** See `GenerateEnvManifestOptions.tsconfig`; see ADR 0023. */
    tsconfig?: string | false | undefined;
    /** Also write the rendered Markdown report to this path, relative to `root`. Omitted: the report is only returned, not written. */
    report?: {
        /** Output path for the report, relative to `root`. */
        location: string;
    } | undefined;
}

/**
 * Public result of {@link generateUsageReport}.
 *
 * @remarks
 * Composed from the building-block types `usage-report.ts` (the renderer) owns, the same way
 * `GenerateDocumentationResult` composes from `docs.ts`'s `CatalogContract` --
 * keeps the renderer importable without its orchestrator (see
 * `RenderUsageReportOptions`'s own doc comment).
 */
export declare interface GenerateUsageReportResult extends RenderUsageReportOptions {
    /** Absolute path the report was written to, or `undefined` if `options.report` wasn't passed. */
    readonly reportPath: string | undefined;
}

/**
 * Trusts the committed evidence artifact at `options.location` only when its
 * paired `.fingerprint` sidecar matches a freshly (cheaply) computed
 * {@link computeSourceFingerprint} -- never on file presence alone, never on
 * a timestamp. On any mismatch (stale fingerprint, missing/corrupt evidence
 * file, no fingerprint sidecar at all), falls back to a real
 * `generateEvidenceModel()` call -- never hard-fails, never silently serves
 * data that might be stale.
 *
 * @remarks
 * Never writes anything. A cache miss here does not self-heal the cache --
 * only an explicit write (`generateEnvArtifacts()`'s `evidence` option)
 * refreshes the committed artifact and its fingerprint together, so "when
 * was this last regenerated" stays under explicit control, never an
 * implicit side effect of a read. Two independent callers hitting the same
 * stale cache both recompute independently; neither one's recompute updates
 * the file the other reads.
 */
export declare function getEvidenceModel(options: GetEvidenceModelOptions): Promise<GetEvidenceModelResult>;

/** Options for {@link getEvidenceModel} -- every `generateEvidenceModel()` option, plus where the cached artifact lives. */
export declare interface GetEvidenceModelOptions extends GenerateEvidenceModelOptions {
    /** Where the cached evidence artifact (and its `.fingerprint` sidecar) live, e.g. `docs/env.evidence.json`, relative to `root`. Required -- there is no honest default env-cap could guess at for where a project keeps this. */
    readonly location: string;
}

/** The result of {@link getEvidenceModel}. */
export declare interface GetEvidenceModelResult {
    readonly evidence: EvidenceModel;
    /** `"hit"` -- the committed evidence artifact's fingerprint matched current source; read from disk, no recompute. `"miss"` -- a real `generateEvidenceModel()` call ran. */
    readonly source: "hit" | "miss";
    /** Set only when `source === "miss"` -- why the cache wasn't trusted, for a caller that wants to log it. */
    readonly missReason: string | undefined;
}

/**
 * Groups every variable under its effective owner (its own, falling back to
 * its contract's), preserving input order within each owner.
 *
 * @remarks
 * The single implementation of "who owns what, rolled up per owner", shared
 * by the {@link ownershipSummary} projection and `docs.ts`'s own rendered
 * ownership matrix. Kept as one function precisely so env-cap's generated
 * Markdown and the projection a consumer reads can never disagree about the
 * grouping -- the same reason `effectiveOwner()` is the single resolution
 * rule (ADR 0028). Variables with no effective owner are omitted entirely
 * rather than bucketed under a synthetic `"unowned"` key, which would read
 * as a real team name; callers that need them ask for them separately.
 *
 * `ownerOf` is supplied by the caller so a model whose owners are already
 * resolved (`OwnershipModel`) and one whose aren't (`ContractModel`) both
 * work without this function guessing which it was handed.
 */
export declare function groupVariablesByOwner<C extends OwnerBearingContract>(contracts: readonly C[], ownerOf: (contract: C, variable: VariableOf<C>) => string | undefined): ReadonlyMap<string, readonly {
    contract: C;
    variable: VariableOf<C>;
}[]>;

/** One named import binding, tracked only for relative specifiers (see {@link FileParseResult.imports}). */
export declare interface ImportBinding {
    /** The raw module specifier as written in the import (e.g. `"./payments.schema.js"`). */
    readonly specifier: string;
    /** The name as exported by the source module -- accounts for `import { real as local }`. */
    readonly importedName: string;
}

/** Shared inputs threaded through every call to {@link resolveImportSpecifier} for one discovery/link run. */
declare interface ImportResolutionContext {
    /** The filesystem capability -- `./build` never imports `node:fs` (ADR 0040). */
    readonly fs: BuildFileSystem;
    /** Absolute path of the project root, used to resolve package specifiers. */
    readonly root: string;
    /** Explicit allowlist -- see ADR 0014. Empty/omitted means package resolution never fires, identical to today's behavior. */
    readonly packages: readonly string[];
    /** Memoizes package resolution per specifier across the whole run -- see `resolvePackageImport`'s own doc comment for why. */
    readonly cache: Map<string, Promise<PackageSchemaResolutionResult>>;
    /** Parsed `tsconfig.json` `paths`/`baseUrl`, or `undefined` when alias resolution found nothing to do or was disabled -- see ADR 0023. */
    readonly tsconfigPaths: TsconfigPathsResolution | undefined;
    /** Memoizes alias resolution across the whole run -- see `resolveAliasImport`'s own doc comment for why. Always allocated, even when `tsconfigPaths` is `undefined`, mirroring `cache` above. */
    readonly aliasCache: AliasResolutionCache;
}

/** A variable accessed only via dynamic (computed) property access -- usage cannot be determined statically. */
export declare interface IndeterminateOwnershipFinding {
    /** Resolved display name (see {@link DiscoveredContract.contractName}). */
    readonly contractName: string;
    /** The environment variable name. */
    readonly key: string;
    /** Human-readable explanation of why usage couldn't be determined. */
    readonly reason: string;
    /** Every AST-observed dynamic-access site backing `reason`, structured -- see ADR 0036. */
    readonly dynamicAccessSites: readonly SourcePosition[];
    /** See {@link UnconsumedOwnedVariableFinding.staleOrMissingCitations}. */
    readonly staleOrMissingCitations: readonly DynamicAccessCitationProblem[];
}

/** Bump only when a reader could misinterpret the new shape -- same discipline every other canonical model's `schemaVersion` follows. */
export declare const LIFECYCLE_MODEL_SCHEMA_VERSION = 3;

/** The versioned, JSON-serializable root of the Lifecycle Model -- see this module's own doc comment for the full picture. */
export declare interface LifecycleModel {
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
export declare interface LifecycleModelContract {
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
export declare interface LifecycleModelVariable {
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
 * Parses every discovered file, then resolves and links `createEnv`/
 * `documentEnv` calls into the merged, docs-enriched contract shape the rest
 * of the generator (`compatibility.ts`, `exclusive-group.ts`, `manifest.ts`,
 * `docs.ts`, `env-example.ts`) consumes.
 *
 * @remarks
 * Cross-file linking is deliberately narrow (see `resolveImportSpecifier`):
 * a `documentEnv()` call's schema reference resolves either to a `const` in
 * its own file, to a directly-imported named export of another file's
 * `const`, or (since ADR 0014) to an allow-listed package's declared schema
 * entry point. Anything else -- a re-export barrel, a namespace import, an
 * unlisted bare package specifier -- becomes an `unresolvedLinks` entry
 * rather than a throw or a guess, exactly like every other static-analysis
 * boundary in this codebase.
 *
 * `packageOrigins` (from `resolveAllowlistedPackages()`) tags any discovered
 * contract whose `file` matches a package-resolved path with that package's
 * origin -- purely a lookup; `discoveredFiles` must already include those
 * files (merged in by the caller via `mergeLocalAndPackageFiles()`).
 *
 * @param context - See `ImportResolutionContext`; drives how a resolved import specifier maps back to a file on disk.
 */
export declare function linkFiles(discoveredFiles: readonly string[], readFile: (filePath: string) => Promise<string>, context: ImportResolutionContext, packageOrigins?: ReadonlyMap<string, PackageOrigin>): Promise<LinkResult>;

/** The full result of {@link linkFiles}: every linked contract, plus every category of thing that didn't link cleanly. */
export declare interface LinkResult {
    /** Every `createEnv()` contract found, merged with its documentation. */
    readonly contracts: readonly DiscoveredContract[];
    /** Parse-time warnings collected across every analyzed file. */
    readonly warnings: readonly ParseWarning[];
    /** `documentEnv()` calls that couldn't be statically linked to a schema. */
    readonly unresolvedLinks: readonly UnresolvedLink[];
    /** Contracts with no linked `documentEnv()` call at all. */
    readonly undocumentedContracts: readonly {
        /** Absolute path of the file declaring the contract. */
        readonly file: string;
        /** The contract's exported binding name. */
        readonly exportName: string;
    }[];
    /** Schema variables with no matching entry in their contract's linked documentation. */
    readonly undocumentedVariables: readonly {
        /** Absolute path of the file declaring the contract. */
        readonly file: string;
        /** The contract's exported binding name. */
        readonly exportName: string;
        /** The undocumented environment variable name. */
        readonly key: string;
    }[];
    /** Documented variable entries with no matching schema variable (the schema key was removed or renamed). */
    readonly staleDocEntries: readonly {
        /** Absolute path of the file declaring the contract. */
        readonly file: string;
        /** The contract's exported binding name. */
        readonly exportName: string;
        /** The stale documented variable name. */
        readonly key: string;
    }[];
}

/**
 * Supplies expiration metadata from a live source (a secrets manager, an
 * internal inventory API, ...) as a post-discovery override -- the one
 * sanctioned escape hatch from static-only `expiresAt`.
 *
 * @remarks
 * Invoked exactly once per generation run, from the orchestration layer, after AST discovery/
 * linking completes and before documentation is rendered. Never invoked
 * during AST parsing or runtime validation -- see ADR 0012 for why a
 * function embedded in a schema file itself was rejected instead.
 */
export declare type LiveExpirationDates = (variableNames: readonly string[]) => Promise<Readonly<Record<string, string>>>;

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
export declare interface ManifestChangeReport {
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
export declare type ManifestContractRef = ContractRef;

/** A contract present in both snapshots, with at least one changed field. */
export declare interface ManifestContractUpdate extends ManifestContractRef {
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
export declare interface ManifestFieldChange {
    /** The changed field's name. */
    readonly field: string;
    /** The value from the previous snapshot, or `undefined` if the field was unset. */
    readonly previous: string | undefined;
    /** The value in the current run, or `undefined` if the field is now unset. */
    readonly current: string | undefined;
}

/** Identifies one variable for {@link ManifestChangeReport} purposes -- its owning contract's identity plus its own key. See {@link ContractRef}. */
export declare interface ManifestVariableRef extends ContractRef {
    /** The environment variable name. */
    readonly key: string;
}

/** A variable present in both snapshots, with at least one changed field. */
export declare interface ManifestVariableUpdate extends ManifestVariableRef {
    /** Every field that changed between the previous and current snapshot. */
    readonly changes: readonly ManifestFieldChange[];
}

/** One contract- or variable-level `sensitivity` declaring a level outside {@link STANDARD_SENSITIVITY_LEVELS}. */
export declare interface NonstandardSensitivityEntry {
    /** Absolute path of the file declaring the contract. */
    readonly file: string;
    /** The contract's exported binding name. */
    readonly exportName: string;
    /** `undefined` for a contract-level `sensitivity`, set for a per-variable one. */
    readonly key: string | undefined;
    /** The declared level, exactly as written. */
    readonly sensitivity: string;
}

/** The minimal shape {@link groupVariablesByOwner} needs -- structural, not pinned to one model, so the exact same grouping serves `OwnershipModel`'s already-resolved owners and `ContractModel`'s raw ones alike. */
export declare interface OwnerBearingContract {
    readonly owner: string | undefined;
    readonly variables: readonly unknown[];
}

/** Bump only when a reader could misinterpret the new shape -- same discipline every other canonical model's `schemaVersion` follows. */
export declare const OWNERSHIP_MODEL_SCHEMA_VERSION = 1;

/** One contract's dependency-ownership summary: who owns it, and who depends on it. */
export declare interface OwnershipDependencyEntry {
    /** Resolved display name (see {@link DiscoveredContract.contractName}). */
    readonly contractName: string;
    /** Root-relative path of the file declaring the contract. */
    readonly file: string;
    /** Contract-level default owner, if set. */
    readonly owner: string | undefined;
    /** Number of variables declared in this contract's schema. */
    readonly variableCount: number;
    /** Files coupled to this contract (imported it, referenced it, or read a
     *  member from it) -- contract-level "who depends on this," NOT proof any
     *  specific variable was read. Blast radius if this contract changes is
     *  `consumers.length`, computed by callers/renderers on demand rather than
     *  stored redundantly here. */
    readonly consumers: readonly string[];
}

/** Points at a contract by name for an ownership/usage finding -- `usage-report.ts`'s finding types don't consistently carry `file`/`exportName` together, only `contractName`. */
export declare interface OwnershipEvidenceReference {
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
export declare interface OwnershipModel {
    readonly schemaVersion: typeof OWNERSHIP_MODEL_SCHEMA_VERSION;
    readonly contracts: readonly OwnershipModelContract[];
    /** Every contract with no `owner` set at all. */
    readonly unownedContracts: readonly OwnershipModelContractRef[];
    /** Every variable whose effective owner (its own, falling back to the contract's) is still `undefined`. */
    readonly unownedVariables: readonly OwnershipModelVariableRef[];
}

/** One contract's own default owner plus every variable's effective owner. See {@link OwnershipModelVariable} for the per-variable shape. */
export declare interface OwnershipModelContract {
    /** Root-relative, POSIX-separated -- matches `ContractModelContract.file`. */
    readonly file: string;
    readonly exportName: string;
    readonly contractName: string;
    /** The contract's own default owner -- not "effective" the way a variable's is, since there's no level above a contract to fall back to. */
    readonly owner: string | undefined;
    readonly variables: readonly OwnershipModelVariable[];
}

/** One contract, referenced by identity only -- see {@link ContractRef} for why no `contractName` is carried here. Resolve one from `ContractModel` when a renderer needs display text. */
export declare type OwnershipModelContractRef = ContractRef;

/**
 * One variable's effective owner (its own, falling back to the contract's).
 *
 * @see {@link ContractModelVariable} -- this same declared variable's canonical starting point.
 */
export declare interface OwnershipModelVariable {
    readonly key: string;
    /** The variable's own `owner`, falling back to the contract's -- see `effectiveOwner()`. */
    readonly owner: string | undefined;
}

/** One variable, referenced by its owning contract's identity plus its own key -- see {@link ContractRef}. */
export declare interface OwnershipModelVariableRef extends ContractRef {
    readonly key: string;
}

/** The Ownership summary projection's output shape. */
export declare interface OwnershipSummary extends Record<string, unknown> {
    /** See {@link ConfigurationReference.disclaimer}. */
    readonly disclaimer: string;
    /** One entry per distinct owner, sorted by owner. */
    readonly owners: readonly OwnershipSummaryEntry[];
    /** Every variable with no effective owner at all, as `${contractName}.${key}`, sorted. Named separately rather than bucketed under a synthetic `"unowned"` owner, so "nobody owns this" can never be mistaken for a real team name. */
    readonly unowned: readonly string[];
}

/**
 * Ownership summary: the inverse of Ownership Model's per-contract view --
 * who owns what, rolled up per owner, plus an explicit unowned list.
 */
export declare const ownershipSummary: EvidenceProjection<OwnershipSummary>;

/** One owner and everything attributed to them. */
export declare interface OwnershipSummaryEntry {
    /** The owner string exactly as declared. */
    readonly owner: string;
    /** Every variable this owner is the effective owner of, as `${contractName}.${key}`, sorted. */
    readonly variables: readonly string[];
    /** Every contract declaring this owner as its contract-level default, by display name, sorted. */
    readonly contracts: readonly string[];
}

/** Both the authored and resolved forms are kept -- diagnostics benefit from
 *  showing exactly what a package author wrote versus what it resolved to. */
export declare interface PackageOrigin {
    /** The allow-listed package name that declared this schema. */
    readonly packageName: string;
    /** The `"envCap.schema"` value exactly as the package author wrote it. */
    readonly declaredField: string;
    /** Absolute, realpath-canonicalized path to the resolved schema file. */
    readonly resolvedFile: string;
    /** Absolute, realpath-canonicalized path to the package's own directory. */
    readonly packageDir: string;
}

declare type PackageResolutionFailureCode = "PACKAGE_NOT_FOUND" | "MALFORMED_PACKAGE_JSON" | "FIELD_MISSING" | "INVALID_EXTENSION" | "OUTSIDE_PACKAGE" | "FILE_TOO_LARGE";

declare type PackageSchemaResolutionResult = {
    readonly ok: true;
    readonly origin: PackageOrigin;
} | {
    readonly ok: false;
    readonly code: PackageResolutionFailureCode;
    readonly reason: string;
};

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
export declare function parseRotationPeriodDays(value: string): number | undefined;

/**
 * Structurally parses one file's AST for everything the generator needs:
 * `createEnv(...)`/`documentEnv(...)` call sites, the local `const`
 * declarations and imports needed to resolve an identifier passed to either
 * of them.
 *
 * @remarks
 * Never type-checks or executes the file -- see `link.ts` for how
 * these raw facts get resolved into actual schema/docs data, including
 * across files.
 */
export declare function parseSchemaFile(filePath: string, sourceText: string): FileParseResult;

/** A recoverable issue found while statically parsing or linking one schema file -- never fatal, always surfaced to the caller as data. */
export declare interface ParseWarning {
    /** Absolute path of the file the warning applies to. */
    readonly file: string;
    /** Human-readable explanation of what was skipped and why. */
    readonly message: string;
}

/** One `createEnv(...)` call site, as found by {@link parseSchemaFile}, before cross-file linking. */
declare interface RawCreateEnvCall {
    /** The binding name the call result is assigned to (must be exported to be usable -- see {@link parseSchemaFile}). */
    readonly exportName: string;
    /** How the first (schema) argument resolves within this file. */
    readonly schemaRef: SchemaRef;
    /** The second (options) argument expression, if the call passes one. */
    readonly optionsArg: ts.Expression | undefined;
    /** The full call expression AST node. */
    readonly node: ts.CallExpression;
}

/** One `documentEnv(...)` call site, as found by {@link parseSchemaFile}, before cross-file linking. */
declare interface RawDocumentEnvCall {
    /** How the first (schema) argument resolves within this file. */
    readonly schemaRef: SchemaRef;
    /** The second (docs) argument expression, if the call passes one. */
    readonly docsArg: ts.Expression | undefined;
    /** The full call expression AST node. */
    readonly node: ts.CallExpression;
}

/**
 * env-cap's own installed version -- stamped onto
 * `EvidenceModel.provenance.toolVersion` and mixed into
 * `computeSourceFingerprint()`. `./build` never reads its own manifest from
 * disk (ADR 0040).
 */
export declare function readToolVersion(): string;

/** The result of {@link computeReconciliation}: an existing `.env.example` diffed against the current configuration. */
export declare interface Reconciliation {
    /** Variable names (live or already commented-out) in an existing example file that no discovered contract declares anymore. */
    readonly staleVariables: readonly string[];
    /** Variables live in an existing example file whose feature is no longer active, and that no other active feature still needs -- safe to comment out. */
    readonly variablesToComment: readonly string[];
    /** Variables the current (active) configuration requires that aren't yet a live entry in an existing example file. */
    readonly variablesToAdd: readonly string[];
}

/** One `addedVariables`/`removedVariables` pair in `manifest`, correlated into a single rename via the current declaration's `renamedFrom` field (ADR 0029). */
export declare interface RenamedVariable {
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
 * Renders the full docs artifact: header + change summary + table of
 * contents, then the comprehensive catalog, ownership matrix (if used),
 * dependency graph, lifecycle report, and a security review.
 *
 * @remarks
 * Documents everything discovered, active or not, same scope as the catalog always
 * had. Fully regenerated every run -- unlike `.env.example`, nothing here is
 * meant to be hand-edited, so there's no "never overwrite" behavior.
 *
 * `contracts` is `ContractModel`'s own shape (`file` root-relative and
 * POSIX-separated already, per that model's convention) -- there is no
 * separate `root` parameter to resolve against, unlike this function's
 * pre-ADR-0038 signature.
 */
export declare function renderDocs(contracts: readonly ContractModelContract[], options: RenderDocsOptions): string;

/** Options for {@link renderDocs}. */
export declare interface RenderDocsOptions {
    /** How many days out counts as "expiring soon" in the lifecycle report and security review. */
    readonly expiringWithinDays: number;
    /** Contracts with no linked `documentEnv()` call at all. `file` must be root-relative, POSIX-separated -- matching `contracts`' own `ContractModel` convention, since this is matched against it by identity. */
    readonly undocumentedContracts: readonly UndocumentedContractRef[];
    /** Schema variables with no matching entry in their contract's linked documentation. `file` must be root-relative, POSIX-separated -- see `undocumentedContracts`. */
    readonly undocumentedVariables: readonly UndocumentedVariableRef[];
    /** Timestamp rendered into the header and used for expiry/days-remaining math. */
    readonly generatedAt: Date;
    /** Content already at `docs.location`, if any -- used only for the "changes since last report" summary. */
    readonly previousContent: string | undefined;
}

/**
 * Renders a deterministic `.env.example`-style file scoped to the *current*
 * configuration: every unique variable the active contracts require (one
 * live entry per key, alphabetical; a key declared by more than one active
 * contract renders once live and the rest commented-out with a pointer),
 * followed by variables unique to disabled contracts (commented-out, for
 * visibility -- a key already required by an active contract is not unique
 * and never repeated here). `reconciliationHeader`, when non-empty, is
 * spliced in right after the banner (see `computeReconciliation`).
 */
export declare function renderEnvExample(contracts: readonly DiscoveredContract[], reconciliationHeader?: readonly string[]): string;

/**
 * Renders the deterministic manifest source: sorted imports (aliased on name
 * collision) plus a `contracts` array, in the exact banner format schema
 * authors will recognize as generated. No timestamps, no randomness -- same
 * input files always produce byte-identical output.
 *
 * @remarks
 * When at least one discovered variable declares a `context` (ADR 0022),
 * this also emits `activeContexts` -- every validation context found across
 * `contracts`, as a plain array named to match {@link runtime.validateEnvOptions}'s
 * own `activeContexts` field -- so application code can import it alongside
 * `manifest` and pass it straight through: `validateEnv({ manifest, values, activeContexts })`.
 * It's every context this manifest has, meant as a starting point to narrow
 * per process/deployment, not a pre-scoped default -- see the README's
 * "Validation contexts" section. Omitted entirely (not even an empty array)
 * when no variable declares a `context` at all, so generated output for
 * projects that don't use this feature is untouched.
 */
export declare function renderManifest(contracts: readonly DiscoveredContract[], outputFile: string): string;

/**
 * Renders the Dependency & Ownership Report: who owns each variable, which
 * features consume each contract, and what the blast radius is if it
 * changes -- structured around exactly those three questions, never generic
 * "dead code"/"unused symbol" language.
 */
export declare function renderUsageReport(computed: RenderUsageReportOptions): string;

/** Everything {@link renderUsageReport} needs to render the Dependency &
 *  Ownership Report -- deliberately independent of (not derived from)
 *  `GenerateUsageReportResult` in `generate-usage.js`, the same way
 *  `RenderDocsOptions` in `docs.ts` doesn't derive from
 *  `GenerateDocumentationResult`. `generate-usage.ts` composes its own
 *  public result type from these building blocks instead, keeping this
 *  renderer module importable without its orchestrator. */
export declare interface RenderUsageReportOptions {
    /** Every contract's ownership/dependency summary. */
    readonly dependencyOwnership: readonly OwnershipDependencyEntry[];
    /** Contracts never imported anywhere in the scanned repository. */
    readonly abandonedContracts: readonly AbandonedContractFinding[];
    /** Advisory only, never gates `onOwnershipIssue` -- a contract only
     *  reaches here when an ambiguous barrel re-export makes "abandoned" or
     *  "consumed" both unprovable. */
    readonly unresolvedConsumers: readonly UnresolvedConsumerFinding[];
    /** Owned variables with no consumer found in the scanned repository. */
    readonly unconsumedOwnedVariables: readonly UnconsumedOwnedVariableFinding[];
    /** Variables accessed only via dynamic (computed) property access. */
    readonly indeterminate: readonly IndeterminateOwnershipFinding[];
    /** Variables a developer has re-acknowledged via `dynamicAccess`, freshly -- see ADR 0037. */
    readonly asserted: readonly AssertedDynamicAccessFinding[];
    /** Schema-discovery parse warnings plus, since ADR 0014, any `packages`
     *  resolution failures -- surfaced here too (not just from
     *  `generateEnvManifest`/`generateDocumentation`) so a team relying only
     *  on `--ownership` output still learns when a cross-package contract
     *  failed to resolve. */
    readonly parseWarnings: readonly ParseWarning[];
    /** Every surface actually scanned for usage -- see ADR 0036. Named explicitly next to `unconsumedOwnedVariables` so "no consumer found" is never read as a stronger claim than what was actually searched. */
    readonly scannedSurfaces: readonly ScannedSurface[];
}

/**
 * Orchestration entry point -- the only place `liveExpirationDates` is ever invoked.
 *
 * @remarks
 * No-ops (returns the exact same array reference, zero invocations)
 * when `liveExpirationDates` is undefined, which is what guarantees "omitted ->
 * behavior unchanged." Otherwise collects the unique discovered variable
 * names, invokes the callback exactly once, applies the result, and
 * deep-freezes the returned structure so it can never be mutated into
 * affecting `contracts` (used elsewhere, e.g. by the manifest/usage passes in
 * the same {@link generateEnvArtifacts} run) or anything else downstream.
 */
export declare function resolveLiveExpirationDates(contracts: readonly DiscoveredContract[], liveExpirationDates: LiveExpirationDates | undefined): Promise<readonly DiscoveredContract[]>;

/**
 * Resolves a relative import specifier (as written in source: `"./schema.js"`,
 * matching this codebase's own convention of `.js`-suffixed relative imports
 * pointing at `.ts` source files) to an absolute file path, relative to the
 * file that contains the import.
 *
 * @remarks
 * Deliberately narrow: only handles a direct relative specifier resolving to
 * a real `.ts`/`.tsx` file on disk. Bare/package specifiers, namespace
 * imports, and anything requiring real module resolution (re-export chains,
 * `exports` map lookups, etc.) return `undefined` -- the caller treats that
 * as "couldn't statically link" and warns rather than guesses, the same
 * philosophy `evaluateLiteral` already uses for non-literal expressions.
 *
 * @returns The resolved absolute path, or `undefined` when the specifier isn't relative or doesn't resolve to a real file.
 */
export declare function resolveRelativeImport(importingFile: string, specifier: string, fs: BuildFileSystem): Promise<string | undefined>;

/**
 * One variable's computed NIST SP 800-53 IA-5 rotation-compliance status --
 * see `computeRotationStatus()` for exactly how it's derived. Always present
 * on a `LifecycleModelVariable` (never `undefined`) since a variable with
 * literally nothing lifecycle-relevant set never reaches this model at all
 * (`hasLifecycleData()` below) -- `"undeclared"` is itself the honest value
 * for "reached this model for some other lifecycle reason (e.g. `deprecated`)
 * but declares none of the four rotation-specific fields."
 */
export declare type RotationComplianceStatus = "compliant" | "overdue" | "expired" | "undeclared";

/** SARIF's `level` enum -- see the SARIF 2.1.0 spec, section 3.27.10. */
declare type SarifLevel = "none" | "note" | "warning" | "error";

declare interface SarifLocation {
    readonly physicalLocation: {
        readonly artifactLocation: {
            readonly uri: string;
        };
        readonly region?: {
            readonly startLine: number;
            readonly startColumn: number;
        };
    };
}

/** A minimal SARIF 2.1.0 log -- only the properties this adapter actually populates, not the full spec surface. */
export declare interface SarifLog {
    readonly $schema: string;
    readonly version: "2.1.0";
    readonly runs: readonly {
        readonly tool: {
            readonly driver: {
                readonly name: string;
                readonly informationUri: string;
                readonly version: string;
                readonly rules: readonly {
                    readonly id: string;
                }[];
            };
        };
        readonly results: readonly SarifResult[];
    }[];
}

declare interface SarifResult {
    readonly ruleId: string;
    readonly level: SarifLevel;
    readonly message: {
        readonly text: string;
    };
    readonly locations?: readonly SarifLocation[];
}

/** One named surface `buildDependencyGraph()`'s scan actually covered -- the
 *  application's own root, plus one entry per allow-listed `packages` (ADR
 *  0014) name whose source was also scanned. See ADR 0036: a claim like
 *  "no consumer found" is only ever as strong as what was actually
 *  searched, and this is what lets a renderer say so explicitly instead of
 *  implying an unbounded guarantee it can't back up. */
export declare interface ScannedSurface {
    /** `"application"` for the local project root, `"package:<name>"` for an allow-listed package's own source. */
    readonly label: string;
    /** Root-relative, POSIX-separated. */
    readonly root: string;
}

/**
 * How a `createEnv`/`documentEnv` call's first argument resolves, before any
 * cross-file linking is attempted (that's `link.ts`'s job, not this file's --
 * this module only ever looks at one file's own AST).
 */
export declare type SchemaRef = {
    /** Discriminant: the schema argument is an inline object literal. */
    readonly kind: "literal";
    /** The object literal AST node itself. */
    readonly node: ts.ObjectLiteralExpression;
} | {
    /** Discriminant: the schema argument is a bare identifier referencing a local `const`. */
    readonly kind: "identifier";
    /** The referenced identifier's name, not yet resolved to a declaration. */
    readonly name: string;
} | {
    /** Discriminant: the schema argument isn't statically resolvable (not a literal or identifier). */
    readonly kind: "unresolvable";
};

/** Every number the security review reports, as structured data instead of only rendered Markdown text. */
export declare interface SecurityReviewCounters {
    readonly totalContracts: number;
    readonly totalVariableDeclarations: number;
    readonly activeVariableDeclarations: number;
    readonly uniqueVariableNames: number;
    readonly expiresAtSetCount: number;
    readonly expiredCount: number;
    readonly expiringSoonCount: number;
    readonly requiredCount: number;
    readonly refreshInstructionsCount: number;
    readonly noOwnerCount: number;
    readonly duplicateVariableNameCount: number;
    readonly undocumentedContractCount: number;
    readonly undocumentedVariableCount: number;
}

/**
 * A precise pointer into a source file -- the shared shape every exact-position fact in the
 * build pipeline (declaration sites, usage sites, dynamic-access sites) uses, so a consumer never
 * has to reconcile three ad hoc `{ file; line; column }` shapes that happen to mean the same
 * thing. See ADR 0036.
 */
export declare interface SourcePosition {
    /** Root-relative, POSIX-separated. */
    readonly file: string;
    /** 1-indexed line number. */
    readonly line: number;
    /** 1-indexed column number. */
    readonly column: number;
}

/**
 * The sensitivity vocabulary env-cap's own docs, examples, and `.env.example`
 * comments are written around. Purely advisory: `sensitivity` is an open
 * `string` (see {@link runtime.VariableDocs.sensitivity}), any value is
 * honored verbatim, and nothing here ever drops or rewrites a declared level.
 * A level outside this set only produces a non-blocking
 * `NONSTANDARD_SENSITIVITY_LEVEL` finding, so a team that deliberately runs
 * its own vocabulary sees one advisory line rather than silent data loss --
 * and a team that meant to write `"secret"` and typo'd `"secrets"` finds out.
 */
export declare const STANDARD_SENSITIVITY_LEVELS: ReadonlySet<string>;

/**
 * TypeScript path-alias resolution (ADR 0023).
 *
 * Resolves a bare import specifier (`"@/lib/env.schema.js"`) against a project's own
 * `tsconfig.json` `compilerOptions.paths`/`baseUrl`, so a schema or consumer reached only
 * through an alias isn't misreported by `link.ts`/`dependency-graph.ts` as unresolved or
 * abandoned. Unlike `resolve-package-schema.ts` (ADR 0014), this never crosses a
 * trust/versioning boundary -- every resolved file is already local, already-trusted
 * project source -- so it is on by default (auto-detecting `root/tsconfig.json`) rather
 * than requiring an explicit allowlist.
 *
 * The actual `paths`/`baseUrl` matching algorithm (longest-prefix matching, `*` wildcard
 * substitution, multiple fallback targets, `extends`-chain merging, JSONC parsing) is
 * delegated entirely to the TypeScript compiler via `ts.resolveModuleName()` and
 * `ts.parseJsonConfigFileContent()` -- the same functions `tsc`/`tsserver` themselves use --
 * rather than reimplemented here. This module's own logic is limited to loading the config,
 * caching resolutions, and enforcing the `node_modules` safety boundary below.
 */
/** Parsed `tsconfig.json` `paths`/`baseUrl` configuration, immutable for the life of one generate*() run. See {@link loadTsconfigPaths}. */
declare interface TsconfigPathsResolution {
    /** The subset of `compilerOptions` `ts.resolveModuleName()` needs -- at minimum `paths` and/or `baseUrl`. */
    readonly compilerOptions: ts.CompilerOptions;
    /** Absolute path of the tsconfig.json this was loaded from, for diagnostics. */
    readonly configFile: string;
}

/** An owned variable with no consumer found in the scanned repository. */
export declare interface UnconsumedOwnedVariableFinding {
    /** Resolved display name (see {@link DiscoveredContract.contractName}). */
    readonly contractName: string;
    /** The owning contract's default owner, if set. */
    readonly owner: string | undefined;
    /** The unconsumed environment variable name. */
    readonly key: string;
    /**
     * Every `dynamicAccess` citation for this variable that's currently
     * `"stale"` or `"missing"` (empty when none exist -- see ADR 0037).
     * Empty is the *strongest* "looks genuinely unused" signal: no developer
     * has ever claimed otherwise. A non-empty list means someone specifically
     * claimed dynamic access here once and that claim can no longer be
     * verified -- worth a human check before deleting, not a stronger reason
     * to trust "unconsumed." Exposed as the raw citations, not a collapsed
     * `high`/`low` label, matching this codebase's "show the receipt" pattern
     * (ADR 0036/0037) -- a reader can judge confidence from the actual
     * evidence rather than trusting a derived summary. See ADR 0038.
     */
    readonly staleOrMissingCitations: readonly DynamicAccessCitationProblem[];
}

/** Identifies a contract with no linked `documentEnv()` call at all. `file`'s absolute-vs-relative convention depends on where a given instance comes from -- see the specific field using this type (`DocumentationFindings.undocumentedContracts` is absolute; `RenderDocsOptions.undocumentedContracts` must be root-relative, matching the `ContractModel`-shaped `contracts` it's compared against). */
export declare interface UndocumentedContractRef {
    readonly file: string;
    /** The contract's exported binding name. */
    readonly exportName: string;
}

/** Identifies a schema variable with no matching entry in its contract's linked documentation. See {@link UndocumentedContractRef}'s own note on `file`. */
export declare interface UndocumentedVariableRef {
    readonly file: string;
    /** The contract's exported binding name. */
    readonly exportName: string;
    /** The undocumented environment variable name. */
    readonly key: string;
}

/** A contract reachable only through an unresolved barrel re-export -- can't be proven abandoned or consumed. */
export declare interface UnresolvedConsumerFinding {
    /** Resolved display name (see {@link DiscoveredContract.contractName}). */
    readonly contractName: string;
    /** Root-relative path of the file declaring the contract. */
    readonly file: string;
    /** Human-readable explanation of why usage couldn't be resolved. */
    readonly reason: string;
}

/** A `documentEnv()` call that could not be statically linked back to a `createEnv()` schema. */
export declare interface UnresolvedLink {
    /** Absolute path of the file containing the unlinkable call. */
    readonly file: string;
    /** Human-readable explanation of why the link couldn't be resolved. */
    readonly reason: string;
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
export declare type VariableAccessStatus = "used" | "unconsumed" | "indeterminate";

/** The element type of an {@link OwnerBearingContract}'s own `variables`, so callers never have to name it a second time. */
declare type VariableOf<C> = C extends {
    readonly variables: readonly (infer V)[];
} ? V : never;

/**
 * Writes a rendered `.env.example` to `location`. Behavior when a file
 * already exists there is governed by `options.onExisting` (default
 * `"keep-sibling"`, see `EnvExampleOnExisting`):
 *  - `"keep-sibling"`: the existing file is left alone; freshly generated
 *    content is written to a timestamped sibling instead
 *    (`<location>.<epoch-ms>`), prefixed with a reconciliation header
 *    comparing it against the existing file (omitted when there's nothing
 *    to report).
 *  - `"overwrite"`: the existing file is replaced directly with freshly
 *    rendered content -- no reconciliation header (the changes it would
 *    describe are already applied).
 *  - `"skip"`: nothing is written.
 * When no file exists yet at `location`, all three modes behave the same:
 * write fresh content, nothing to reconcile against. `staleVariables`/
 * `variablesToComment`/`variablesToAdd` are always computed and returned
 * when a prior file existed, even under `"overwrite"`/`"skip"`, as a
 * diagnostic -- independent of whether anything was actually written.
 */
export declare function writeEnvExample(contracts: readonly DiscoveredContract[], location: string, fs: BuildFileSystem, options?: {
    onExisting?: EnvExampleOnExisting;
}): Promise<EnvExampleResult>;

export { }
