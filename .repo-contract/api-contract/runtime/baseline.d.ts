/**
 * Contract-level documentation, plus everything {@link documentEnv}'s options used to carry that
 * only the generator ever read.
 *
 * @remarks
 * Generic over `S`, the exact schema type {@link documentEnv} infers from its `schema` argument --
 * this is what makes `variables` below a closed, checked map (a typo'd or renamed key is a
 * compile error, not a silent no-op) rather than an open `Record<string, VariableDocs>` any string
 * would satisfy. `S` defaults to the widest possible schema so this type is still nameable on its
 * own (e.g. in a helper function's own parameter type) without narrowing to one specific contract.
 */
export declare interface ContractDocs<S extends EnvSchema = EnvSchema> {
    /** Overrides the auto-generated label used in generated docs. Purely cosmetic. Wins over `createEnv()`'s own `name` option, which in turn wins over the exported binding name. */
    name?: string;
    /** Groups this contract under a heading in the generated docs' feature catalog. */
    category?: string;
    /** The generator throws if two *active* contracts declare the same `exclusiveGroup` -- use it to mark interchangeable features (e.g. two database backends) as mutually exclusive. */
    exclusiveGroup?: string;
    /** When `false`, this contract is excluded from the generated manifest, docs' required section, and exclusiveGroup checks -- it still appears, marked disabled, in the feature catalog. Defaults to `true`. */
    active?: boolean;
    /** Default owner for every variable in this contract that doesn't set its own `owner`. */
    owner?: string;
    /** Default sensitivity for every variable in this contract that doesn't set its own `sensitivity` -- see {@link VariableDocs.sensitivity} for why this is an open `string`. */
    sensitivity?: string;
    /** Whole-contract/feature sunset date, ISO date string. */
    expiresAt?: string;
    /** Marks this whole contract/feature as being phased out. Independent of `active` (on/off, not a phase-out signal). */
    deprecated?: boolean;
    /** Why this contract is deprecated, and/or what to use instead. Only meaningful alongside `deprecated: true`. */
    deprecatedReason?: string;
    /** Default reason this contract's variables' values are collected/used -- see {@link VariableDocs.purpose}. */
    purpose?: string;
    /** Default legal basis for this contract's variables -- see {@link VariableDocs.legalBasis}. */
    legalBasis?: string;
    /** Default retention policy for this contract's variables -- see {@link VariableDocs.retention}. */
    retention?: string;
    /** Default data residency for this contract's variables -- see {@link VariableDocs.dataResidency}. */
    dataResidency?: string | string[];
    /** Default audit-required assertion for this contract's variables -- see {@link VariableDocs.auditRequired}. */
    auditRequired?: boolean;
    /** Arbitrary contract-level documentation (e.g. `runbook`), rendered alongside this feature -- see {@link VariableDocs.metadata}. */
    metadata?: Record<string, unknown>;
    /**
     * Per-variable documentation, keyed by variable name -- keys are checked against `S`'s own keys
     * at compile time, so documenting a variable that was renamed or removed from `schema` (or a
     * plain typo) is a type error here, not a silently-ignored entry the generator would otherwise
     * have to report as "stale" after the fact. A schema key absent from `variables` entirely is
     * still valid (not every variable needs documentation) and is reported as undocumented by the
     * generator, exactly as before.
     */
    variables?: {
        readonly [K in keyof S]?: VariableDocs;
    };
}

/**
 * Declares a feature's environment contract. Colocate this call with the
 * feature that consumes the variables (e.g. `features/payments/env.schema.ts`).
 *
 * @remarks
 * `createEnv` is runtime-only: `processor`/`validator`/`default` are the
 * whole vocabulary, because they're the only fields {@link validateEnv} actually
 * reads. Documentation -- description, ownership, lifecycle, category, and
 * everything else that only exists to generate docs -- lives in a separate
 * {@link documentEnv} call (see `document.ts`), which is entirely optional and
 * never required for this to work.
 *
 * @returns An {@link EnvContract} exposing one read-only getter per key -- there is no
 * global env object, only per-feature contracts like `paymentsEnv.STRIPE_KEY`. Accessing a
 * key throws until {@link validateEnv} has run successfully for the runtime this contract
 * was passed to.
 */
export declare function createEnv<S extends EnvSchema>(schema: S, options?: CreateEnvOptions): EnvContract<S>;

export declare interface CreateEnvOptions {
    /**
     * A short, stable label for this contract (e.g. "payments", "database").
     * Used in error messages. Defaults to an auto-generated anonymous label if
     * omitted -- providing one is strongly recommended for readable validation
     * errors.
     */
    name?: string;
    /**
     * Pass `import.meta.url` here so validation errors point at the file that
     * declared the failing variable (e.g. "features/payments/env.schema.ts")
     * instead of just the short `name` label. There is no portable way for
     * `createEnv` to discover its caller's module URL on its own -- this is
     * always correct and never goes stale, since it's supplied by the JS
     * engine rather than hand-typed.
     */
    source?: string;
}

/**
 * A default may be a literal value, or a zero-arg thunk evaluated lazily when the raw value is
 * undefined.
 *
 * @remarks
 * The union is redundant at the type level (`unknown` alone already accepts a
 * function) -- it's kept because this type is public API, and collapsing it to bare `unknown`
 * would erase the one thing a reader of the generated `.d.ts` needs to learn here.
 */
export declare type DefaultValue = unknown | (() => unknown);

/**
 * Documents a schema for the generator: explains values, assigns ownership,
 * and describes lifecycle, feeding the generated docs artifact and
 * `.env.example`. Pass it the *same* schema object given to {@link createEnv}, so
 * the generator can statically link the two and verify every variable is
 * documented -- and so TypeScript can check `docs.variables`' keys against
 * `schema`'s own keys, the same object identity doing double duty for both
 * the generator's static link and the type checker's.
 *
 * @remarks
 * A no-op at runtime by design -- nothing passed here is retained anywhere,
 * and this can never throw, no matter how malformed `schema`/`docs` are.
 * Calling it is entirely optional: {@link createEnv} works identically whether or
 * not a matching `documentEnv` call exists. The real "is everything
 * documented?" check, and every artifact this data drives (the docs
 * artifact's ownership matrix, dependency graph, lifecycle report, and
 * security review; `.env.example`'s comments), runs entirely inside
 * {@link build.generateEnvManifest}'s static analysis -- this function's only job at
 * runtime is to exist as a safe, harmless marker the AST parser can find,
 * and to give you type-checked argument shapes while writing it.
 *
 * `S` is inferred from `schema`, never written out by hand -- pass the
 * schema object literal (or a `const`-inferred reference to it) directly for
 * the strongest inference; an explicitly-widened `schema: EnvSchema`
 * annotation loses the per-key literal type and falls back to accepting any
 * string key in `docs.variables`, same as before this generic existed.
 */
export declare function documentEnv<S extends EnvSchema>(schema: S, docs: ContractDocs<S>): void;

/**
 * The object returned by {@link createEnv}. Each key is a lazily-resolved getter backed by the
 * runtime cache -- there is no global env object, only per-feature contracts like this one.
 *
 * @remarks
 * `toString()` is intersected in (rather than left to the ambient `Object.prototype`
 * declaration) because `create.ts` genuinely overrides it to return a redacted
 * `EnvContract("name")` representation, never resolved values -- see ADR 0006. Declaring
 * it here means the type accurately describes what calling `String(contract)` returns.
 */
export declare type EnvContract<S extends EnvSchema> = {
    readonly [K in keyof S]: InferEnvValue<S[K]>;
} & {
    /** Returns the redacted `EnvContract("name")` representation, never resolved values -- see ADR 0006. */
    toString(): string;
};

/** Configuration for one schema entry: how to default, process, and validate a single raw environment value. */
export declare interface EnvDefinition<T> {
    /** Literal fallback or lazy thunk used when the raw value is `undefined`. */
    default?: DefaultValue;
    /** Converts the raw (or defaulted) value to `T`; passed through unprocessed when omitted. */
    processor?: Processor<T>;
    /** Rejects an invalid processed value; return `true` to accept it. */
    validator?: Validator<T>;
    /**
     * The validation context this variable belongs to (e.g. `"server"`,
     * `"production"`, `"worker"`) -- entirely application-defined; env-cap
     * never interprets, detects, or infers this string. Omitted (the
     * default) means the variable participates in every {@link validateEnv}
     * run regardless of `activeContexts`. A variable belongs to at most one
     * validation context -- see ADR 0022 for why this is a single `string`
     * and not `string[]`; do not widen it to an array to let one variable
     * join multiple contexts, that reintroduces the AND/OR ambiguity this
     * design deliberately avoids.
     *
     * @remarks
     * Validation contexts are a participation filter only -- not
     * authentication, authorization, or a bundling/security boundary. See
     * ADR 0022's Formal Invariants.
     */
    context?: string;
}

/**
 * Thrown when a contract's value is accessed via property access before
 * {@link validateEnv} has completed successfully for it.
 *
 * @remarks
 * `code` is a stable, Stable-tier discriminant for programmatic handling --
 * prefer it over `.name`/`instanceof` when a message-independent switch is needed.
 */
export declare class EnvNotReadyError extends Error {
    /** Stable discriminant for programmatic handling; always `"ENV_NOT_READY"`. */
    readonly code = "ENV_NOT_READY";
    constructor(contractName: string, key: string);
}

/**
 * A schema is a map of variable name -> definition.
 *
 * @remarks
 * `EnvDefinition<any>` is used only as the generic *bound* here (never surfaced to consumers):
 * TypeScript infers a precise, per-key literal type for `S` from the object passed to
 * {@link createEnv}, so the resolved contract type (see {@link InferEnvValue}) stays fully
 * strict. This is the same variance workaround used by schema libraries like zod/trpc for
 * heterogeneous generic maps.
 */
export declare type EnvSchema = Record<string, EnvDefinition<any>>;

/**
 * Thrown by {@link validateEnv} when one or more variables fail processing or
 * validation. Aggregates every failure across every contract in the batch --
 * the caller sees the whole picture in one error, not one-at-a-time.
 *
 * @remarks
 * `code` is a stable, Stable-tier discriminant for programmatic handling --
 * prefer it over `.name`/`instanceof` when a message-independent switch is needed.
 */
export declare class EnvValidationError extends Error {
    /** Stable discriminant for programmatic handling; always `"ENV_VALIDATION_FAILED"`. */
    readonly code = "ENV_VALIDATION_FAILED";
    /** Every variable failure across every contract in the batch. */
    readonly failures: readonly VariableFailure[];
    constructor(failures: readonly VariableFailure[]);
}

/**
 * Resolves the application-facing type for one schema entry: processor return type, else the
 * default's type, else `string` (the shape raw process.env values naturally arrive in).
 *
 * @remarks
 * Same documented generic-bound variance workaround as {@link EnvSchema} above --
 * `any` here is never surfaced to a consumer's inferred type.
 */
export declare type InferEnvValue<D extends EnvDefinition<any>> = D extends {
    /** Narrows to the processor's return type when one is present. */
    processor: Processor<infer P>;
} ? P : [UnwrapDefault<D>] extends [never] ? string : UnwrapDefault<D>;

/** Type guard: `true` when `value` was created by `createEnv` (i.e. is a registered contract). */
export declare function isEnvContract(value: unknown): value is object;

/** Processes a raw value into a typed, ready-to-use application value. Must not read any other key. */
export declare type Processor<T> = (value: unknown) => T;

/**
 * Core contract types for env-cap.
 *
 * These types are intentionally minimal: an `EnvDefinition` describes how to
 * turn one raw environment value into one typed, validated application
 * value. There is no `optional`/`required` flag anywhere in this file --
 * requiredness is just a validator that rejects `undefined`/empty values.
 *
 * Documentation fields (description, owner, expiresAt, category, ...) live
 * entirely in {@link documentEnv} (see `document.ts`), not here -- this file is
 * the runtime's whole vocabulary, and every field in it is read by
 * `validate.ts`/`create.ts`/`errors.ts` at runtime. If a field is only ever
 * read by the generator, it belongs in `document.ts`, not here. `context` is
 * the one exception worth calling out: it's also read by the build package
 * for documentation display (see ADR 0022), but it belongs here rather than
 * in `documentEnv()` because `validate.ts` reads it too, to decide pipeline
 * participation -- the same bar `default`/`processor`/`validator` already
 * clear.
 */
/** The raw, unprocessed source of environment values (e.g. `process.env`, a resolved secrets bag). */
export declare type RawEnv = Readonly<Record<string, unknown>>;

/**
 * Clears cached validation state. Intended for tests and dev tooling (e.g.
 * `beforeEach(() => resetEnvCache())` in a test suite that re-validates with
 * different fixture values per test) -- production applications validate
 * once at startup and should not normally call this.
 */
export declare function resetEnvCache(): void;

declare type UnwrapDefault<D> = D extends {
    default: infer Def;
} ? Def extends () => infer R ? R : Def : never;

/**
 * Validates every variable in every contract in `options.manifest` against
 * `options.values`, then caches the results.
 *
 * @remarks
 * Idempotent: the first successful (or failed) call is authoritative for the life of the
 * process -- later calls return (or re-throw) that same outcome without re-running any
 * processor or validator. Concurrent in-flight calls share one underlying run.
 *
 * @throws {EnvValidationError} If any variable fails processing or validation.
 */
export declare function validateEnv(options: validateEnvOptions): Promise<validateEnvResult>;

export declare interface validateEnvOptions {
    /** The raw source of environment values, e.g. `process.env` or a resolved secrets bag. */
    values: RawEnv;
    /**
     * Every contract to validate -- typically the `contracts` array imported
     * from a generated manifest (see {@link build.generateEnvManifest}). Pass all of them
     * in one call: {@link validateEnv} only ever initializes once per process, so
     * a second call returns the first call's cached result without
     * re-running anything, even if it passes a different manifest.
     */
    manifest: readonly EnvContract<any>[];
    /**
     * The validation contexts active for this run (e.g. `["server",
     * "production"]`) -- entirely application-defined; env-cap never
     * detects or infers these, the caller always computes and passes them
     * explicitly. A variable whose `context` isn't in this list is skipped
     * entirely (no default/processor/validator runs for it, and it stays in
     * its not-ready state, exactly as if this run had never happened for
     * it) -- see ADR 0022. A variable with no `context` always participates,
     * regardless of what's passed here. Omitted (the default) behaves as an
     * empty list: only variables with no `context` participate.
     *
     * @remarks
     * Not part of the validation cache's identity -- {@link validateEnv}
     * remains one-shot per process exactly as before this option existed. A
     * second call does not re-evaluate `activeContexts`; it returns the
     * first call's result outright. Different active contexts belong to
     * different processes (e.g. a server process and a browser bundle),
     * never to two calls within the same one.
     */
    activeContexts?: readonly string[];
}

/** Aggregate counts from a completed {@link validateEnv} run. */
export declare interface validateEnvResult {
    /** Number of contracts in the manifest that were validated. */
    readonly contractCount: number;
    /** Total number of variables validated across all contracts. */
    readonly variableCount: number;
}

/**
 * Validates an already-processed value; return `true` when valid, or a human-readable error
 * string when invalid.
 *
 * @remarks
 * Receives the full raw env for conditional validation (e.g. "required only if X").
 */
export declare type Validator<T> = (value: T, rawEnv: RawEnv) => true | string;

/**
 * Per-variable documentation. Every field is optional and unconstrained on
 * purpose -- there is no required shape, so documenting a variable never
 * fights the type checker, and you can add a field the generator doesn't
 * know about yet without it being rejected.
 */
export declare interface VariableDocs {
    /** Human-readable explanation of what this variable is and what it controls. */
    description?: string;
    /** Who owns this variable (a team, a handle, whatever your org uses). Overrides the contract's own `owner` for this key. */
    owner?: string;
    /**
     * How sensitive this variable's value is. Overrides the contract's own `sensitivity` for this
     * key.
     *
     * @remarks
     * Deliberately an open `string`, not a closed union: an org's own sensitivity vocabulary is its
     * own, and a level env-cap doesn't recognize is always honored, never dropped. The generator
     * still reports a `NONSTANDARD_SENSITIVITY_LEVEL` finding (severity `info`, never blocking) for
     * anything outside `secret`/`credential`/`pii`/`config`, so vocabulary drift stays visible
     * without being enforced.
     */
    sensitivity?: string;
    /** ISO date string (e.g. "2026-06-01") -- when this variable's current value stops being valid (a key rotation deadline, a sunset date, etc.). */
    expiresAt?: string;
    /** How to get a new value before/when it expires (e.g. "Rotate in the Stripe dashboard, then redeploy."). */
    refreshInstructions?: string;
    /**
     * The kind of authenticator/secret this variable holds (e.g. "api-key", "oauth-client-secret",
     * "database-password", "tls-certificate") -- feeds the NIST SP 800-53 IA-5 rotation-compliance
     * report's "authenticator type" column (IA-5's main statement requires an organization-defined
     * rotation period "by authenticator type," so this is what a generator groups/labels by).
     *
     * @remarks
     * Deliberately an open `string`, not a closed union -- same "open vocabulary" pattern as
     * {@link sensitivity}: an org's own authenticator taxonomy is its own, and IA-5 itself never
     * names a fixed set of types either.
     */
    authenticatorType?: string;
    /**
     * How often this variable's value must be rotated, in organization-defined terms (e.g. "90
     * days", "P90D", "6 months") -- IA-5's own "organization-defined time period" per authenticator
     * type (the time-based half of IA-5's two-trigger rotation model). Paired with
     * {@link lastRotatedAt} so a generator can compute whether rotation is actually current, rather
     * than only recording that a period was declared; see `lifecycle-model.ts`'s
     * `computeRotationStatus()` for exactly how the two combine with {@link expiresAt}.
     */
    rotationPeriod?: string;
    /**
     * ISO date string -- the last time this variable's value was actually rotated. Paired with
     * {@link rotationPeriod} to compute rotation compliance. Independent of {@link expiresAt}, which
     * states when the *current* value stops being valid, not when it was last changed -- a value can
     * be freshly rotated and still have a near-term `expiresAt` (a short-lived token), or long overdue
     * for rotation while its `expiresAt` (if any) is still comfortably in the future.
     */
    lastRotatedAt?: string;
    /**
     * IA-5's event-based rotation triggers that apply to this variable (e.g. "suspected compromise",
     * "personnel change", "system update") -- the event-based half of IA-5's two-trigger rotation
     * model. Structured and additive alongside the existing free-text {@link refreshInstructions}
     * rather than replacing it: this is a list a generator can render as its own column,
     * `refreshInstructions` stays prose ("how to actually rotate it"). Presence-only -- env-cap has
     * no way to observe whether a listed event actually occurred, so declaring this never by itself
     * changes a computed rotation-compliance status (see `lifecycle-model.ts`); it only makes the
     * event-based trigger's existence visible in generated output.
     */
    rotationTriggerEvents?: readonly string[];
    /**
     * Explicit, actionable instructions for obtaining this variable's value the *first* time --
     * where `refreshInstructions` is "how to rotate it once you already have one," this is "how to
     * get one at all" (e.g. "Create a restricted API key in the Stripe dashboard under Developers ->
     * API keys, scoped to read/write Charges."). A named field specifically so this can render as
     * its own labeled line in generated docs, rather than requiring a `metadata.setup`-style
     * convention with no dedicated rendering or type checking.
     */
    setupInstructions?: string;
    /** Documentation-level assertion that this variable must be set. Independent of how (or whether) a validator actually enforces it. */
    required?: boolean;
    /** Marks this variable as being phased out. Independent of `expiresAt` (a rotation/sunset date) and of the contract-level `active` switch (on/off, not a phase-out signal). */
    deprecated?: boolean;
    /** Why this variable is deprecated, and/or what to use instead. Only meaningful alongside `deprecated: true`. */
    deprecatedReason?: string;
    /** ISO date string -- by when a deprecated variable must be removed. Only meaningful alongside `deprecated: true`. */
    removeBy?: string;
    /** The previous environment variable name this one replaces, if this declaration is the result of a rename. Lets the Change Model correlate a remove+add pair into a single rename entry instead of two unrelated changes. */
    renamedFrom?: string;
    /** Why this variable's value is collected/used -- a framework-agnostic fact (pairs with `legalBasis`; a specific citation like a GDPR article belongs in `metadata` instead). Overrides the contract's own `purpose` for this key. */
    purpose?: string;
    /** The legal basis this variable's collection/use relies on -- framework-agnostic (e.g. "user consent," "contractual necessity"), never a specific statute name. Overrides the contract's own `legalBasis` for this key. */
    legalBasis?: string;
    /** Descriptive retention policy (e.g. "delete after 90 days"). A policy statement, not a computed value -- unlike `expiresAt`, nothing parses or evaluates this. Overrides the contract's own `retention` for this key. */
    retention?: string;
    /** Where this variable's value is/must be stored (a region, or a permitted set of regions). Overrides the contract's own `dataResidency` for this key. */
    dataResidency?: string | string[];
    /** Documentation-level assertion that this variable's handling must be auditable. Overrides the contract's own `auditRequired` for this key. */
    auditRequired?: boolean;
    /**
     * Developer-supplied evidence assertions for this variable -- verified over
     * time, unlike every other field above, which is declared and never
     * verified. Kept structurally separate for exactly that reason; see
     * {@link VariableEvidenceDocs}.
     */
    evidence?: VariableEvidenceDocs;
    /**
     * Structured, unsupported-key documentation -- any primitive or object value, for anything that
     * doesn't warrant its own named field. A previously-supported top-level key belongs in a named
     * field above instead of here once one exists for it.
     */
    metadata?: Record<string, unknown>;
}

/**
 * Developer-supplied evidence assertions for one variable -- categorically
 * different from every field on {@link VariableDocs}: those are
 * declared-and-never-verified, while `dynamicAccess` is re-checked against
 * reality on every run (fresh / stale / missing). Kept structurally separate,
 * in `VariableDocs.evidence` rather than folded in alongside `description`/
 * `owner`/..., specifically so that different epistemic status is visible in
 * the shape itself and not only in a doc comment. See ADR 0037.
 */
export declare interface VariableEvidenceDocs {
    /**
     * Citation(s) of where this variable is actually read dynamically --
     * somewhere env-cap's own static AST scan can't see (a shell script, a
     * Docker entrypoint, a sibling service). Each entry is a
     * `"<relative-path>:<line>:<column>"` citation.
     *
     * @remarks
     * A developer's re-acknowledgment that access happens, never a claim
     * env-cap itself observed anything -- tracked as its own independent fact
     * and never folded into the AST-derived `VariableAccessStatus`. Re-verified
     * every run: a citation whose file no longer exists, or whose content has
     * visibly changed since it was last acknowledged, is flagged rather than
     * trusted forever.
     */
    dynamicAccess?: readonly string[];
}

/**
 * Every error type here is constructed only from: the variable name, the
 * declaring contract's name, the failure kind, and a message string that the
 * *developer's own* processor/validator produced. Raw or processed environment
 * values are never read into an error -- see the Security section in the README.
 *
 * Documentation (description, owner, etc.) never appears here, even when a
 * {@link documentEnv} call exists for this variable -- `documentEnv` is
 * build-time-only and its data is never retained anywhere {@link validateEnv}
 * could read it back out. This is a deliberate consequence of keeping the
 * runtime minimal, not an oversight.
 */
/** One variable's processing or validation failure, as recorded by {@link validateEnv}. */
export declare interface VariableFailure {
    /** The schema key that failed. */
    readonly variable: string;
    /** The declaring contract's `name` (see {@link CreateEnvOptions}). */
    readonly contractName: string;
    /** `import.meta.url` (or similar) passed to `createEnv`'s `source` option, if any. Falls back to `contractName` when absent. */
    readonly source: string | undefined;
    /** Which stage produced the failure. */
    readonly kind: "processor" | "validator";
    /** The error message from the developer's own processor/validator, or the thrown error's message. */
    readonly message: string;
}

export { }
