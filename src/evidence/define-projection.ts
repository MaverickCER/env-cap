import type { EvidenceModel } from "../build/evidence-model.js"

/**
 * A pure function from the full Evidence Model to one field of a
 * projection's output shape. Must not mutate `evidence` (the membrane
 * `defineEvidenceProjection()` wraps it in enforces that at runtime, see
 * `createTrackingProxy()` below) and must not perform I/O; env-cap can
 * enforce the read-only half of purity but not the "no side effects" half.
 */
export type EvidenceProjector<T> = (evidence: EvidenceModel) => T

/** One independent, pure projector function per key of the projection's output shape `T`. */
export type EvidenceProjectionSchema<T extends Record<string, unknown>> = {
  readonly [K in keyof T]: EvidenceProjector<T[K]>
}

/** `project()`'s return shape: the computed output, plus which `EvidenceModel` field paths fed each output key. */
export interface EvidenceProjectionResult<T extends Record<string, unknown>> {
  readonly value: T
  readonly sources: Readonly<Record<keyof T, readonly string[]>>
}

/**
 * The function `defineEvidenceProjection()` returns. Callable directly for
 * the common case (`projection(evidence)` -> `T`); `.project()` returns the
 * same value alongside automatic provenance: see ADR 0032.
 */
export interface EvidenceProjection<T extends Record<string, unknown>> {
  (evidence: EvidenceModel): T
  /** Same computation as calling the projection directly, plus which `EvidenceModel` field paths fed each output key: see {@link EvidenceProjectionResult}. */
  project(evidence: EvidenceModel): EvidenceProjectionResult<T>
}

/**
 * Declares a projection: a named, pure transform from the immutable
 * `EvidenceModel` to any consumer-defined output shape, built entirely from
 * `schema`'s independent per-field projector functions; see ADR 0031/0032.
 *
 * The reference projections env-cap ships (`.env.example`, Environment
 * Configuration Reference, Configuration Ownership, etc.) are built through
 * this exact function, with no privileged internal path. A consumer's own
 * projection is a first-class citizen, not a lesser one.
 */
export function defineEvidenceProjection<T extends Record<string, unknown>>(
  schema: EvidenceProjectionSchema<T>,
): EvidenceProjection<T> {
  function project(evidence: EvidenceModel): EvidenceProjectionResult<T> {
    const value = {} as Record<string, unknown>
    const sources = {} as Record<string, readonly string[]>
    for (const key of Object.keys(schema)) {
      const projector = schema[key as keyof T]
      const { proxy, readPaths } = createTrackingProxy(evidence)
      value[key] = projector(proxy)
      sources[key] = readPaths()
    }
    return { value: value as T, sources: sources as Readonly<Record<keyof T, readonly string[]>> }
  }

  function invoke(evidence: EvidenceModel): T {
    return project(evidence).value
  }

  return Object.assign(invoke, { project })
}

/**
 * The error every membrane write-trap below throws.
 *
 * @remarks
 * It is a function, not a module-level `const`, because Stryker's `perTest`
 * coverage cannot attribute a module-load string to the test that covers it.
 * It is exported so a test can pin the exact message. A trap's
 * `.toThrow(TypeError)` cannot: a mutated trap body still throws the engine's
 * own Proxy invariant `TypeError`.
 */
export function readOnlyMembraneError(): TypeError {
  return new TypeError(
    "EvidenceModel is read-only inside a projector. A projection must be a pure function of its evidence argument. See ADR 0032.",
  )
}

/**
 * Wraps a fresh, unfrozen clone of `evidence` in a Proxy membrane that
 * throws on any write and records every field path read through it.
 *
 * @remarks
 * Deliberately does not rely on `Object.freeze()` for the read-only
 * guarantee. A `Proxy` `get` trap on a frozen, non-configurable data
 * property must, by the spec, return the exact (`===`) value the target
 * holds. A wrapping proxy therefore cannot stand in for a frozen object's
 * nested properties (see ADR 0032). The membrane's own
 * `set`/`deleteProperty`/`defineProperty`/`setPrototypeOf` traps enforce
 * immutability instead, which works on an unfrozen target. The caller's
 * `evidence` (typically already `deepFreeze()`-d by `generateEvidenceModel()`)
 * is never mutated: `structuredClone()` gives this membrane its own
 * disposable copy to wrap, so a genuinely frozen `EvidenceModel` can still
 * be projected.
 */
function createTrackingProxy(evidence: EvidenceModel): {
  proxy: EvidenceModel
  readPaths: () => readonly string[]
} {
  const clone = structuredClone(evidence)
  const paths = new Set<string>()
  const wrapped = new WeakMap<object, unknown>()

  function wrap<V>(value: V, path: readonly string[]): V {
    if (value === null || typeof value !== "object") return value
    const target = value
    const cached = wrapped.get(target)
    if (cached) return cached as V

    const proxy = new Proxy(target, {
      get(currentTarget, prop, receiver) {
        const result: unknown = Reflect.get(currentTarget, prop, receiver)
        if (typeof prop !== "string") return result
        if (Array.isArray(currentTarget) && prop === "length") return result
        const nextPath = [...path, prop]
        paths.add(nextPath.join("."))
        return wrap(result, nextPath)
      },
      set() {
        throw readOnlyMembraneError()
      },
      deleteProperty() {
        throw readOnlyMembraneError()
      },
      defineProperty() {
        throw readOnlyMembraneError()
      },
      setPrototypeOf() {
        throw readOnlyMembraneError()
      },
    })
    wrapped.set(target, proxy)
    return proxy
  }

  return { proxy: wrap(clone, []), readPaths: () => [...paths].sort() }
}
