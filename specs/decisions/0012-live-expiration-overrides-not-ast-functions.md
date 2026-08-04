# 0012: Live Expiration Overrides Are a JS-Level Callback, Not an AST-Discoverable Function

## Status

Accepted.

Implemented in:

- `src/build/live-expirations.ts`
- `src/build/generate-documentation.ts`
- `src/build/generate-env-artifacts.ts`

## Considered and Denied: Add Async Function Support to `expiresAt`

The first shape considered for "let `expiresAt` come from somewhere dynamic" was to
widen the type schema authors write directly inside `documentEnv()`:

```ts
documentEnv(paypalSchema, {
  variables: {
    PAYPAL_CLIENT_SECRET: {
      expiresAt: async () => fetchRotationDateFromVault(),
    },
  },
})
```

**Denied.**

This is why: `expiresAt` (and everything else `documentEnv()` carries) is read entirely
by static analysis (ADR 0002, "Build Tooling Parses Schema Files as AST; It Never
Imports or Executes Them"). `src/build/parse.ts` never `import()`s or `require()`s a
discovered schema file -- it hands the file's source text to
`ts.createSourceFile()` and walks the resulting syntax tree. The one place a value is
actually _computed_ out of that tree is `evaluateLiteral()`
(`src/build/literal-eval.ts`), which structurally resolves string/number/boolean/
`null`/array/object literal nodes into real JS values -- and nothing else. It has no
case for a function or arrow-function expression, by design: evaluating one would mean
calling it, and calling anything found in a schema file's source text is exactly the
"discovery becomes code execution" outcome ADR 0002 exists to rule out.

Concretely, an `expiresAt: async () => ...` written in a schema file could never be
resolved by the generator. At best, the parser could notice a function expression sits
there and skip it with a warning -- which is precisely what a half-built, dead branch
in this codebase attempted before this decision: `parse.ts`/`link.ts`/`docs.ts` all
carried a `string | (() => Promise<string>)` union for `expiresAt`, with an
`evaluated.value instanceof Function` check that could never be true, since
`evaluateLiteral()` can never produce a `Function` value in the first place. That dead
scaffolding was removed as part of this decision (see the "Simplify expiration
metadata" changeset).

There is no version of "a function embedded in the AST, invoked by the generator" that
doesn't collapse into "the generator executes arbitrary code found in a schema file."
Widening `expiresAt`'s type without widening what the parser is allowed to do would
just leave the type promising something the implementation can never deliver.

## Decision: `liveExpirationDates`, a Post-Discovery, Orchestration-Layer Callback

Approved instead: expiration metadata from a live source is supplied as a plain
JavaScript value passed to `generateEnvArtifacts()`/`generateDocumentation()` as a normal
function argument -- never written inside, or parsed out of, a schema file.

```ts
liveExpirationDates?: (
  variableNames: readonly string[],
) => Promise<Readonly<Record<string, string>>>;
```

The callback is invoked by the orchestration layer (`generateDocumentation()`,
`generateEnvArtifacts()`), never by anything in the AST discovery/linking path
(`discoverSchemaFiles()`/`parseSchemaFile()`/`linkFiles()`), and only after those steps
have already produced a fully-linked `DiscoveredContract[]`:

1. Discovery and linking run exactly as before -- 100% static, unchanged.
2. `collectVariableNames()` collects the unique variable keys across every linked
   contract's `variables`.
3. If `liveExpirationDates` was provided (and, in `generateEnvArtifacts()`, only if a `docs`
   pass was actually requested -- no point fetching metadata nothing will render), it
   is invoked exactly once with those names.
4. `applyLiveExpirationOverrides()` -- a pure function operating on already-discovered
   data, not on source text -- rebuilds the contracts array with each variable's
   `expiresAt` replaced by a valid override where one was returned, and left as the
   static `documentEnv()` value everywhere else.
5. Only this rebuilt array is handed to `computeDocumentation()`/`renderDocs()`.

This keeps the two concerns -- "what does the codebase statically declare" and "what
does a live system currently say" -- separated by _when_ and _how_ they run, not
blurred together in one type. AST discovery never becomes aware that live overrides
exist at all.

Two narrower choices made while implementing this:

- **`variableNames: readonly string[]`, not a wider context object.** A broader shape
  (e.g. passing the full `DiscoveredContract[]` alongside the names) was considered so
  a future callback could see contract/ownership context, not just bare variable
  names. Deferred, not adopted: this package is pre-1.0 (`0.1.0`, no published
  consumers), so widening the callback's parameter later is a free, non-breaking
  addition, while shipping a wider shape now and narrowing it later would not be.
- **`Readonly<Record<string, string>>`, not `Readonly<Record<string, string | undefined>>`.**
  An absent key and an explicit `{ KEY: undefined }` entry always produce the
  identical outcome ("preserve the static value") -- there is no behavior the
  `| undefined` state adds. Dropping it removes a redundant state from the contract
  entirely: a key is either present with a valid override, or it isn't. A returned
  value is additionally validated with the same ISO-8601 `parseIsoDate()` rule the
  static path already uses (exported from `docs.ts` for reuse) before being applied;
  an invalid value is treated exactly like an absent key rather than corrupting
  rendered output, matching this codebase's existing "warn/skip, never guess" policy.

## Consequences

### The callback boundary is the only place dynamic expiration data can enter

Every other stage of `expiresAt` handling -- discovery, linking, static
`documentEnv()` values, rendering -- remains provably pure and synchronous, since the
function-typed scaffolding that would have made parts of it asynchronous was removed
alongside this decision. `resolveLiveExpirationDates()` in `live-expirations.ts` is the
single, explicit, orchestration-only seam where a generation run can do anything other
than read already-discovered data.

### Contract-level `expiresAt` cannot be overridden this way

Because the callback is keyed by variable name, only `DiscoveredVariable.expiresAt`
is ever replaced by `applyLiveExpirationOverrides()`; a contract-level `expiresAt`
(the whole-feature sunset date set via `documentEnv()`'s own `expiresAt`, distinct
from a per-variable one) always stays static. This is a direct, intentional
consequence of the chosen callback shape, not an oversight.

### The returned override data is defensively isolated

`applyLiveExpirationOverrides()` rebuilds every contract and variable (and their
`metadata`/`extra` records) into new objects rather than reusing references from the
input, and `resolveLiveExpirationDates()` deep-freezes the result before returning it.
Nothing about mutating the docs-pass-specific contracts array can leak back into the
un-overridden `linkResult.contracts` that the manifest/usage passes in the same
`generateEnvArtifacts()` run also read.

## Summary

Static discovery answers "what does the code declare"; `liveExpirationDates` answers
"what does a live system currently say" -- and the two are kept apart by running at
different times through different mechanisms, not by widening what the AST layer is
asked to evaluate. A function written inside a schema file can never be executed by
this generator, by design (ADR 0002); a function passed as a normal JS argument to
`generateEnvArtifacts()` always could be, safely, because invoking it was never in tension
with "never execute a discovered schema file" in the first place.
