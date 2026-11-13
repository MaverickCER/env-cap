# evidence

Build your own views of the evidence file (`@maverickcer/env-cap/evidence`).

`defineEvidenceProjection()` declares a pure transform from an `EvidenceModel` to a shape you define:
a dashboard row, an inventory table or a CI comment. The projectors read the model
through a read-only membrane, and `.project()` also returns which model fields fed each output field
(ADR 0032). ADR 0031 explains why this is its own entry point.

`generateEvidenceModel()` in `@maverickcer/env-cap/build` assembles the model at build time. This
module imports no Node module and no TypeScript compiler, and takes the `EvidenceModel` shape as a
type only. So a projection can run over a JSON-parsed evidence file outside Node; CI runs this
entry under Bun, Deno and a Web-globals bundle.

## Interfaces

### EvidenceProjection()

The function `defineEvidenceProjection()` returns. Callable directly for
the common case (`projection(evidence)` -> `T`); `.project()` returns the
same value alongside automatic provenance: see ADR 0032.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* `Record`\<`string`, `unknown`\> |

```ts
EvidenceProjection(evidence): T;
```

The function `defineEvidenceProjection()` returns. Callable directly for
the common case (`projection(evidence)` -> `T`); `.project()` returns the
same value alongside automatic provenance: see ADR 0032.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `evidence` | [`EvidenceModel`](build.md#evidencemodel) |

#### Returns

`T`

#### Methods

##### project()

```ts
project(evidence): EvidenceProjectionResult<T>;
```

Same computation as calling the projection directly, plus which `EvidenceModel` field paths fed each output key: see [EvidenceProjectionResult](#evidenceprojectionresult).

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `evidence` | [`EvidenceModel`](build.md#evidencemodel) |

###### Returns

[`EvidenceProjectionResult`](#evidenceprojectionresult)\<`T`\>

***

### EvidenceProjectionResult

`project()`'s return shape: the computed output, plus which `EvidenceModel` field paths fed each output key.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-1"></a> `T` *extends* `Record`\<`string`, `unknown`\> |

#### Properties

##### sources

```ts
readonly sources: Readonly<Record<keyof T, readonly string[]>>;
```

##### value

```ts
readonly value: T;
```

## Type Aliases

### EvidenceProjectionSchema

```ts
type EvidenceProjectionSchema<T> = { readonly [K in keyof T]: EvidenceProjector<T[K]> };
```

One independent, pure projector function per key of the projection's output shape `T`.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-2"></a> `T` *extends* `Record`\<`string`, `unknown`\> |

***

### EvidenceProjector

```ts
type EvidenceProjector<T> = (evidence) => T;
```

A pure function from the full Evidence Model to one field of a
projection's output shape. Must not mutate `evidence` (the membrane
`defineEvidenceProjection()` wraps it in enforces that at runtime, see
`createTrackingProxy()` below) and must not perform I/O; env-cap can
enforce the read-only half of purity but not the "no side effects" half.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-3"></a> `T` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `evidence` | [`EvidenceModel`](build.md#evidencemodel) |

#### Returns

`T`

## Functions

### defineEvidenceProjection()

```ts
function defineEvidenceProjection<T>(schema): EvidenceProjection<T>;
```

Declares a projection: a named, pure transform from the immutable
`EvidenceModel` to any consumer-defined output shape, built entirely from
`schema`'s independent per-field projector functions; see ADR 0031/0032.

The reference projections env-cap ships (`.env.example`, Environment
Configuration Reference, Configuration Ownership, etc.) are built through
this exact function, with no privileged internal path. A consumer's own
projection is a first-class citizen, not a lesser one.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-4"></a> `T` *extends* `Record`\<`string`, `unknown`\> |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `schema` | [`EvidenceProjectionSchema`](#evidenceprojectionschema)\<`T`\> |

#### Returns

[`EvidenceProjection`](#evidenceprojection)\<`T`\>

## References

### EvidenceModel

Re-exports [EvidenceModel](build.md#evidencemodel)

***

### EvidenceProvenance

Re-exports [EvidenceProvenance](build.md#evidenceprovenance)
