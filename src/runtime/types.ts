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
 * read by the generator, it belongs in `document.ts`, not here.
 */

/** The raw, unprocessed source of environment values (e.g. `process.env`, a resolved secrets bag). */
export type RawEnv = Readonly<Record<string, unknown>>

/** Processes a raw value into a typed, ready-to-use application value. Must not read any other key. */
export type Processor<T> = (value: unknown) => T

/**
 * Validates an already-processed value; return `true` when valid, or a human-readable error
 * string when invalid.
 *
 * @remarks
 * Receives the full raw env for conditional validation (e.g. "required only if X").
 */
export type Validator<T> = (value: T, rawEnv: RawEnv) => true | string

/**
 * A default may be a literal value, or a zero-arg thunk evaluated lazily when the raw value is
 * undefined.
 *
 * @remarks
 * The union is redundant at the type level (`unknown` alone already accepts a
 * function) -- it's kept because this type is public API, and collapsing it to bare `unknown`
 * would erase the one thing a reader of the generated `.d.ts` needs to learn here.
 */
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
export type DefaultValue = unknown | (() => unknown)

/** Configuration for one schema entry: how to default, process, and validate a single raw environment value. */
export interface EnvDefinition<T> {
  /** Literal fallback or lazy thunk used when the raw value is `undefined`. */
  default?: DefaultValue
  /** Converts the raw (or defaulted) value to `T`; passed through unprocessed when omitted. */
  processor?: Processor<T>
  /** Rejects an invalid processed value; return `true` to accept it. */
  validator?: Validator<T>
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EnvSchema = Record<string, EnvDefinition<any>>

type UnwrapDefault<D> = D extends { default: infer Def }
  ? Def extends () => infer R
    ? R
    : Def
  : never

/**
 * Resolves the application-facing type for one schema entry: processor return type, else the
 * default's type, else `string` (the shape raw process.env values naturally arrive in).
 *
 * @remarks
 * Same documented generic-bound variance workaround as {@link EnvSchema} above --
 * `any` here is never surfaced to a consumer's inferred type.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type InferEnvValue<D extends EnvDefinition<any>> = D extends {
  /** Narrows to the processor's return type when one is present. */
  processor: Processor<infer P>
}
  ? P
  : [UnwrapDefault<D>] extends [never]
    ? string
    : UnwrapDefault<D>

/** The internal, non-enumerable identity + metadata attached to every contract created by `createEnv`. */
export interface ContractInternals<S extends EnvSchema = EnvSchema> {
  readonly id: symbol
  readonly name: string
  readonly source: string | undefined
  readonly schema: S
}

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
export type EnvContract<S extends EnvSchema> = {
  readonly [K in keyof S]: InferEnvValue<S[K]>
} & {
  /** Returns the redacted `EnvContract("name")` representation, never resolved values -- see ADR 0006. */
  toString(): string
}

export interface validateEnvOptions {
  /** The raw source of environment values, e.g. `process.env` or a resolved secrets bag. */
  values: RawEnv
  /**
   * Every contract to validate -- typically the `contracts` array imported
   * from a generated manifest (see {@link build.generateEnvManifest}). Pass all of them
   * in one call: {@link validateEnv} only ever initializes once per process, so
   * a second call returns the first call's cached result without
   * re-running anything, even if it passes a different manifest.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  manifest: readonly EnvContract<any>[]
}

/** Aggregate counts from a completed {@link validateEnv} run. */
export interface validateEnvResult {
  /** Number of contracts in the manifest that were validated. */
  readonly contractCount: number
  /** Total number of variables validated across all contracts. */
  readonly variableCount: number
}

export interface CreateEnvOptions {
  /**
   * A short, stable label for this contract (e.g. "payments", "database").
   * Used in error messages. Defaults to an auto-generated anonymous label if
   * omitted -- providing one is strongly recommended for readable validation
   * errors.
   */
  name?: string
  /**
   * Pass `import.meta.url` here so validation errors point at the file that
   * declared the failing variable (e.g. "features/payments/env.schema.ts")
   * instead of just the short `name` label. There is no portable way for
   * `createEnv` to discover its caller's module URL on its own -- this is
   * always correct and never goes stale, since it's supplied by the JS
   * engine rather than hand-typed.
   */
  source?: string
}
