# 0007: Rename `transformer`/`Transformer` to `processor`/`Processor`

## Status

Accepted. Implemented in `src/runtime/types.ts`, `src/runtime/validate.ts`,
`src/runtime/errors.ts`, `src/build/parse.ts`, `src/build/compatibility.ts`,
`src/build/docs.ts`, and `src/helpers/processors.ts`, and reflected
throughout the documentation and examples.

## Context

The schema field responsible for turning a raw environment value into a
typed application value was originally named `transformer`, backed by a
`Transformer<T>` type (`(value: unknown) => T`). This mirrored the
terminology used by comparable environment-validation libraries, where the
job is described as reshaping a value from one type into another (e.g.
string to number).

In practice, this field is expected to do more than reshape a value's type.
It is the one place where a raw value should be turned into its final,
directly-usable form -- parsing a connection string into a `URL`, decoding a
token into its claims, resolving a reference into the actual secret,
splitting a delimited string into an array -- so that every consumer of the
resulting contract can use the value as-is, without re-deriving the same
result on every read. "Transform" describes a shape change; it does not
communicate that the output is meant to be the value's _final_ form,
computed once.

This mismatch was already visible inside the codebase itself:
`src/helpers/processors.ts` and its exported `processors` namespace
(`processors.url()`, `processors.number()`, ...) were named for the
finished-value contract from the start, and `helpers/index.ts`'s own
comments already described "processor/validator patterns." Only the
underlying schema field (`transformer:`) and its type (`Transformer<T>`)
had not caught up, so a developer writing `processor: processors.url()` --
correct under this decision -- previously had to write `transformer:
processors.url()`, bridging a naming gap between the helper they imported
and the field they assigned it to.

## Decision

Rename the runtime vocabulary end to end:

- `Transformer<T>` (`src/runtime/types.ts`) → `Processor<T>`
- `EnvDefinition.transformer` → `EnvDefinition.processor`
- `VariableFailure.kind: "transformer"` → `"processor"`, and its formatted
  heading, `"Transformer failed:"` → `"Processor failed:"`
- Build-time static-analysis fields (`src/build/parse.ts`): `hasTransformer`
  → `hasProcessor`, `transformerSource` → `processorSource`,
  `transformerReturnType` → `processorReturnType`
- The generated docs catalog line, `- Transformer: yes/no` → `- Processor:
yes/no`, and compatibility messages (`src/build/compatibility.ts`), e.g.
  `"Processor return types are declared incompatible..."`
- All prose referencing the concept across `specs/architecture.md`, the
  other ADRs, `README.md`, `SECURITY.md`, and the `examples/` schema files

The function signature is unchanged (`(value: unknown) => T`); this is a
vocabulary change, not a behavioral one. It exists to make the schema field
match the intent it was always meant to carry: produce a value that's ready
to use directly, computed once, rather than a value that merely has a
different shape than its input.

## Consequences

- **This is a breaking API change.** Every existing `env.schema.ts` using
  `transformer:` must rename that key to `processor:` before upgrading. The
  value assigned to it (a plain `(value: unknown) => T` function, or a call
  like `processors.url()`) does not need to change -- only the key name.

- **Naming is now consistent end to end.** The helper namespace
  (`processors.url()`), the schema field (`processor:`), the runtime type
  (`Processor<T>`), thrown error headings (`"Processor failed:"`), and
  generated documentation (`- Processor: yes`) all describe the same
  concept with the same word. A developer no longer has to translate
  between "processor" (what they import) and "transformer" (what they
  assign it to).

- **The name now sets the right expectation for schema authors.** A
  `processor` reads as "produce the value this contract should expose,"
  encouraging authors to do complete, one-time preparation (parsing,
  decoding, resolving) in that function rather than a narrow coercion that
  downstream code still has to finish preparing on every read. It also fits
  naturally with per-capability ownership ([0003](0003-no-global-env-object.md)):
  two capabilities can process the same raw variable into two different final
  forms, each already finished, with no shared coercion step to agree on.

- **No change to `EnvDefinition`'s minimal vocabulary.** This rename does
  not add, remove, or restructure fields -- `default`, `processor`, and
  `validator` remain the whole runtime vocabulary described in
  [0001](0001-runtime-documentation-separation.md).

## Alternatives considered

- **Keep `transformer`, and only address the helpers naming.** Rejected:
  the helpers module and its `processors` export were already named this
  way; the mismatch this decision fixes is that the _schema field_ never
  caught up, not the reverse.

- **Support both `transformer` and `processor` as accepted aliases.**
  Rejected. `EnvDefinition`'s whole design principle is a minimal, explicit
  vocabulary (see [0001](0001-runtime-documentation-separation.md)). A
  synonym field would double the surface `validateEnv()` and the
  build-time parser (`src/build/parse.ts`) both need to recognize,
  indefinitely, for no runtime benefit.

- **Deprecate `transformer` and migrate over a transition window.**
  Rejected. The package is pre-1.0 (`0.1.0`) with no external consumers
  depending on the existing field name yet, so a direct rename is simpler
  and cheaper than introducing, and later removing, a deprecation shim.
