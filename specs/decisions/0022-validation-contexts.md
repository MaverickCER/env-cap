# 0022: Generic validation contexts

## Status

Accepted.

## Context

ADR 0004 rejected a `runtime: "server"|"client"` option on `createEnv()`,
and rejected separate `/client`/`/server` packages, because a variable's
classification as server-only or client-safe doesn't change how it's
processed or validated -- and because the real boundary that keeps
server-only source out of a browser bundle is the application's module
graph (separate discovery -> separate generated manifests), not something
a runtime flag could enforce anyway.

That decision holds. But real usage since then has surfaced a narrower,
legitimate need it didn't address: a single validation run sometimes needs
to activate or deactivate variables by some caller-defined facet --
"which deployment target," "which environment tier," "which entry point"
-- without necessarily forking into multiple manifests for it. Examples:

- One manifest shared by a Node server and its browser bundle, where each
  process should only validate (and be able to read) the variables that
  apply to it.
- A single manifest validated with different `activeContexts` in
  development vs. production, to require a variable only where it
  actually matters.
- A backend that also runs a worker/edge entry point from the same
  codebase, where a handful of variables are entry-point-specific.

This ADR adds **validation contexts** to close that gap, while explicitly
not reopening what ADR 0004 already settled.

## Decision

A schema entry may declare a validation context:

```ts
DATABASE_URL: {
  context: "server",
  validator: validators.required(),
}
```

`validateEnv()` accepts the validation contexts active for this run:

```ts
await validateEnv({
  manifest,
  values: process.env,
  activeContexts: ["server", "production"],
})
```

**Matching rule:** a variable without a `context` participates in every
run. A variable with a `context` participates only when `activeContexts`
contains that exact string. Omitted `activeContexts` behaves as empty --
this isn't a special case, it's the general rule applied uniformly (an
empty set contains no string, so only context-less variables match),
which is exactly why every existing schema (none of which set `context`)
behaves identically before and after this feature exists.

**Skip means skip the entire pipeline.** A variable that doesn't match
never runs its `default`/`processor`/`validator`, is never counted as
validated, and is never written into the validated result -- it stays in
its not-ready state exactly as if this run had never happened for it.
Reading it throws `EnvNotReadyError`, the same error (and the same code
path) as reading any variable before `validateEnv()` has run. Getting this
right required a small, real bug fix alongside the new field: contract
readiness was tracked per _contract_, not per _variable_ (`create.ts`'s
getter only checked whether the whole contract had been validated, then
read the key from its cached values unconditionally). A context-skipped
variable is simply absent as an own property of that cached object, so the
getter now checks key presence, not just contract presence.

### Why `context` is first-class schema vocabulary, not documentation metadata

`EnvDefinition` is deliberately minimal (`default`/`processor`/`validator`
-- see ADR 0001, ADR 0007), and everything that doesn't change runtime
behavior lives in `documentEnv()` instead. `context` belongs with the
former, not the latter, for the same reason `default`/`processor`/
`validator` do: `validate.ts` reads it directly to decide whether the rest
of the pipeline runs at all. That build tooling can _also_ read it for
generated docs is incidental -- true of `hasDefault`/`hasProcessor`/
`hasValidator` today too -- not the justification.

### Why declarative metadata, not a callback

An alternative shape would let a variable decide participation itself,
e.g. `shouldInclude: (activeContexts) => boolean`. Rejected: ADR 0002
requires schemas to be statically analyzable without executing them: a
callback can't be evaluated by the AST parser, so build tooling could
never surface which context a variable belongs to in generated docs or
`.env.example` -- exactly the kind of unanalyzable schema entry ADR 0002
already treats as a parse-time warning, not a supported pattern.

### Why a single string, not an array, on the variable side

`context?: string`, not `context?: string[]`. A variable belongs to at
most one validation context. An array would require defining AND/OR
semantics for a variable that lists more than one -- and either answer
adds a second axis of complexity for a feature whose whole value is being
simple enough to reason about at a glance. If a real case ever needs one
variable to participate in more than one context, that should be solved
by an explicit new mechanism (a second field, or splitting into two
schema entries) -- never by loosening this field to `string | string[]`,
which would silently reintroduce the exact ambiguity this decision avoids.

### Why `activeContexts` is a plural array on `validateEnv()`

Unlike a variable, one validation run can have several simultaneously-true
facets -- `["server", "production"]` is both "which deployment target" and
"which environment tier" at once. The option is named `activeContexts`,
not `contexts`, specifically because "contexts" alone is ambiguous between
"declared" and "currently active"; the option is unambiguously the latter.

### Why omitted-context variables always participate

This is what makes the feature backward compatible without a migration or
an opt-in flag: every schema written before this feature exists has no
`context` fields, so under the matching rule above, every variable in it
keeps matching via the `context === undefined` branch regardless of what
(or whether) `activeContexts` is passed. No existing caller needs to
change anything.

## Formal invariants

These are the contract this feature makes, written down so future changes
don't erode it without a new ADR. (Also stated in
[`specs/architecture.md`](../architecture.md#validation-context-invariants),
which is the canonical copy -- repeated here for the record.)

1. **Matching** is exact-string only: no prefix matching, wildcards,
   hierarchy, or inheritance.
2. **Not runtime detection.** env-cap never infers `activeContexts` from
   any ambient signal. The application always computes and passes it.
3. **Not cache identity.** `validateEnv()` stays one-shot per process;
   `activeContexts` isn't part of what makes a second call a no-op, and
   there is no per-context cache dimension.
4. **Not a type-level concept.** `context` never alters `EnvContract`'s
   TypeScript shape or any inferred type. Every schema key remains a
   property of `EnvContract<S>` regardless of context; an out-of-context
   read is a runtime throw, not a compile-time error.
5. **Not authorization.** A validation context is not an authentication,
   authorization, or access-control mechanism -- it does not restrict
   _who_ can read a value, only whether a given `validateEnv()` run
   processes it at all.
6. **Not a bundling/security boundary.** Separate discovery/manifests (ADR 0004) remain the actual mechanism for keeping server-only source out of
   client-bound code. `activeContexts` filtering happens after the schema
   -- including any literal `default` value -- is already wherever it's
   going to be. Putting both `context: "server"` and `context: "client"`
   variables in one schema feeding one manifest that a client bundle
   imports does not stop the server-context variable's definition from
   shipping to the browser.

## Consequences

- **Generated docs and `.env.example` surface `context`**, extracted the
  same statically-analyzed way as `hasDefault`/`hasProcessor`/
  `hasValidator` (never executed -- a non-literal `context` warns and is
  ignored, same as every other unanalyzable field). Rendered as
  "Validation context," not the bare "Context," and paired with the
  non-boundary/non-authorization caveat wherever it's shown, so a
  generated artifact never reads as more of a guarantee than it is.
- **The generated manifest file also exports `activeContexts`** -- every
  validation context declared by any variable in an _active_ contract
  (`discoverValidationContexts()`, `src/build/manifest.ts`), sorted and
  deduplicated, named to match `validateEnvOptions.activeContexts` itself
  so application code can pass it straight through:
  `validateEnv({ manifest, values, activeContexts })`. It's every context
  the manifest has, meant as a starting point to narrow per process --
  importing it unmodified into every process defeats the point of scoping
  contexts per deployment target in the first place (see the README's
  "Validation contexts" section). Emitted only when at least one variable
  actually declares a `context`, immediately after the imports (`// all
currently active validation contexts`), so a project that doesn't use
  this feature gets byte-identical manifest output to before this ADR.
  This was originally scoped as _not_ touching the manifest at all (an
  earlier draft of this ADR said so); seeing the feature in real use made
  clear that hand-typing the discovered context list at every
  `validateEnv()` call site was the actual remaining friction, so this was
  added as an explicit, later revision -- see "Alternatives considered"
  for the scaffolded-`validateEnv()`-call approach that was tried first
  and rejected.
- **A validation run's participation detail isn't exposed as data.**
  `validateEnvResult` still reports only `contractCount`/`variableCount`
  (a skipped variable isn't counted in the latter). Future diagnostics
  could expose which variables were skipped and why (`{ skippedVariables,
activeContexts }`) without changing validation semantics -- not
  implemented here, to keep this change purely additive and minimal; see
  Alternatives.
- **Empty-string `context` is treated as absent, at the build layer.** A
  literal `context: ""` almost certainly signals a mistake, not an
  intentional empty context; the static analyzer warns and drops it
  (same "warn, don't guess" policy as every other field). The runtime
  itself does not add a check for this -- an empty string flowing through
  at runtime just never matches anything in practice, which is harmless,
  and adding runtime input-shape validation for a schema field has no
  precedent elsewhere in this codebase (the runtime trusts
  `default`/`processor`/`validator`'s shape too) and would cost bytes
  against the ADR 0008 gzip budget for a case the build-time warning
  already catches for anyone running the generator.

## Alternatives considered

- **`context: string[]` on the variable.** Rejected -- see "Why a single
  string, not an array" above.
- **A built-in `"shared"` sentinel value.** Rejected -- redundant with
  `context: undefined`, and it would imply env-cap has an opinion about
  what "shared" means, which contradicts the whole premise of contexts
  being entirely application-defined.
- **Hierarchical or wildcard contexts** (e.g. `"server.production"`
  matching an active `"server"`). Rejected -- the point of this feature is
  staying generic; a hierarchy would require env-cap to understand context
  semantics it has no business understanding. See Formal Invariant 1.
- **A callback (`shouldInclude`/`when`) instead of a declarative field.**
  Rejected -- breaks static analyzability (ADR 0002); see above.
- **Automatic context detection** (inspecting `window`, `NODE_ENV`, a
  bundler `define`, etc.). Rejected for the same reasons ADR 0004 already
  rejected automatic client/server detection: framework-dependent,
  unreliable across deployment targets, and it would put detection logic
  in the smallest, most security-sensitive part of the package. See
  Formal Invariant 2.
- **Using `context` for access control** (e.g. `context: "admin"` implying
  only "admin" code paths may read a variable). Rejected outright --
  contexts govern validation participation, never access. See Formal
  Invariant 5. Anyone with code access to a contract in an active context
  can read it, same as any other variable.
- **A scaffolded `validateEnv()` call written directly into the generated
  manifest file, preserved verbatim across regenerations.** Considered (and
  briefly drafted) as the mechanism for surfacing discovered contexts to
  application code: on first generation, write a trailing `await
validateEnv({ manifest, values: process.env, activeContexts: [...] })`
  call the developer could hand-edit; on regeneration, parse the existing
  file and leave everything below the imports untouched so those edits
  survive. Rejected for two concrete reasons: (1) `renderManifest()` is a
  pure function of `(contracts, outputFile)`, called both to write the
  real file and, in `--check` mode (`check-artifacts.ts`), to compute
  "what a fresh run would produce" for a byte-for-byte drift comparison --
  a preserved region breaks that comparison without new machinery to know
  which part is exempt. (2) The preserved/regenerated boundary was
  ambiguous in a way that mattered: if `export const manifest = [...]`
  itself fell on the preserved side, adding or removing an `env.schema.ts`
  file would stop automatically updating the manifest array, breaking the
  tool's core auto-discovery guarantee. The `activeContexts` export
  actually shipped avoids both problems -- it's plain, always-fresh,
  fully-regenerated data, exactly like `manifest` itself, with no
  user-owned region to parse or preserve.
- **A `runtime: "server" | "client"` option on `createEnv()`.** This is
  the alternative ADR 0004 already rejected, not a new one -- noted here
  only to be explicit about the difference: that alternative was a closed
  enum implying a bundling boundary the runtime can't actually enforce.
  `context` is an open, user-supplied string that only gates validation
  participation and makes no claim about bundling at all (see Formal
  Invariant 6).

## Relationship to ADR 0004

ADR 0004's decision -- no `/client`/`/server` package split, separate
discovery/manifests as the real module boundary -- is unchanged by this
ADR and remains the mechanism for keeping server-only source out of
client-bound code. Validation contexts are a complementary, orthogonal
feature: useful _within_ a manifest that's already scoped to one
deployment target but has more than one simultaneously-relevant facet (an
environment tier, a secondary entry point), not a substitute for scoping
that manifest correctly in the first place.
