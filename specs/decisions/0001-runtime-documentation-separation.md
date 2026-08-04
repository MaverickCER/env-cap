# 0001: Separate `createEnv` (runtime) from `documentEnv` (build-time, inert)

## Status

Accepted. Implemented in `src/runtime/create.ts`, `src/runtime/document.ts`,
and `src/runtime/types.ts`.

## Design evolution

The first implementation combined runtime validation and documentation metadata
into a single environment definition.

The approach was initially attractive because it provided a single source of
truth:

```ts
defineEnv({
  DATABASE_URL: {
    processor,
    validator,
    description,
    owner,
    expiresAt,
  },
})
```

During implementation, this design exposed several constraints:

- Runtime consumers and build tooling had different information requirements.
- Documentation fields could grow independently from validation requirements.
- Rich metadata increased the risk of accidentally shipping non-runtime data
  into client bundles.
- Runtime validation should remain deterministic and independent from
  operational tooling.

The design was changed before stabilization by separating runtime execution
from documentation analysis.

This decision reflects an intentional tradeoff: the API became slightly more
verbose in exchange for a smaller runtime boundary, clearer security
properties, and better long-term maintainability.

## Context

An environment-contract system has two fundamentally different categories of
information for each variable:

1. **Runtime behavior** — how a value is processed and validated. This
   includes defaults, processors, and validators. This information must be
   available to `validateEnv()` during application startup across every
   supported runtime environment (server, edge, browser, tests).

2. **Operational documentation** — how a human understands and maintains the
   variable. This includes descriptions, ownership, expiration dates, refresh
   guidance, runbooks, and related operational context. This information is
   useful for generated documentation and maintenance workflows, but it has no
   role in resolving the runtime value.

The initial API design combined both concerns:

```ts
defineEnv({
  DATABASE_URL: {
    processor,
    validator,
    description,
    owner,
    expiresAt,
    refreshInstructions,
  },
})
```

While convenient, this couples runtime behavior to documentation concerns.
Documentation naturally grows over time and may contain large amounts of
human-oriented context, while runtime initialization should remain minimal,
predictable, and safe to execute in every environment.

## Decision

Separate runtime creation from build-time documentation using two operations
against the same schema definition:

```ts
export const databaseEnv = createEnv(databaseSchema, {
  name: "database",
})

documentEnv(databaseSchema, {
  owner: "platform",
  variables: {
    DATABASE_URL: {
      description: "...",
    },
  },
})
```

`createEnv()` accepts only runtime-relevant schema information. Its
`EnvDefinition` type intentionally excludes fields that exist exclusively for
documentation.

`documentEnv()` is intentionally inert at runtime. It does not register
values, mutate global state, or retain documentation data. Its implementation
exists so build tooling can statically discover documentation metadata through
AST parsing while allowing developers to keep documentation associated with
the schema it describes.

The build system links `documentEnv()` data back to the corresponding
`createEnv()` schema during generation. The runtime never needs to know that
documentation exists.

## Consequences

- **Runtime remains small and stable.** Documentation can grow with project
  needs without increasing runtime memory usage, validation cost, or bundle
  size. The runtime package remains focused only on resolving and validating
  environment variables.

- **Runtime errors intentionally do not include documentation metadata.**
  Validation failures cannot include descriptions, owners, or operational
  guidance because that information is not available to the runtime layer.
  Generated documentation artifacts are the appropriate place for human
  context, while runtime errors should remain focused on validation state and
  failure details.

- **Documentation can still enter a client bundle if developers import it
  incorrectly.** Separating `createEnv()` and `documentEnv()` does not
  prevent bundlers from including literal documentation data passed into a
  function call. If a schema file containing `documentEnv()` is imported into
  a browser bundle, those literals may be included because bundlers cannot
  generally remove arguments passed into executed functions.

  This is an application-boundary concern rather than a runtime design flaw.
  Documentation fields should be treated as potentially public and should not
  contain secrets, credentials, internal-only security details, or information
  that should not be exposed to clients.

- **Documentation coverage is convention-based rather than mandatory.**
  `createEnv()` can exist without a matching `documentEnv()` call. The build
  tooling treats missing documentation as a discoverable issue rather than a
  runtime failure. This preserves flexibility while still allowing teams to
  enforce documentation standards through generated reports and CI checks.

- **Schema ownership remains capability-local.** Developers can keep runtime
  configuration and operational knowledge near the capability that owns it without
  forcing a centralized environment file. The build layer can aggregate this
  information for reporting without introducing runtime coupling.

## Future reconsiderations before 1.0

This decision intentionally prioritizes runtime simplicity and build-time
analysis. Before a 1.0 release, several areas should continue to be evaluated:

- **Whether the two-call API provides sufficient ergonomics.**
  Keeping runtime and documentation separate improves boundaries, but requiring
  two declarations may create friction. Future versions may explore syntax
  improvements without merging the responsibilities back together. See the
  README's ["Status"](../../README.md#status) section for this package's
  general pre-1.0 stability posture.

- **Whether documentation completeness should remain opt-in.**
  The current model allows teams to adopt documentation gradually. Enterprise
  environments may prefer stricter defaults where undocumented variables fail
  builds.

- **Whether generated artifacts need additional operational workflows.**
  The current design reports lifecycle information but intentionally does not
  manage rotation, secret retrieval, or infrastructure operations. Those
  capabilities may belong in separate tooling rather than expanding the
  runtime package.

- **Whether the runtime API is stable enough for a major release.**
  The current separation creates a strong boundary, but usage across different
  deployment environments may reveal additional runtime requirements that
  should be addressed before committing to a 1.x compatibility guarantee.

## Alternatives considered

- **A single API containing runtime and documentation fields.**

  Rejected: this couples the runtime API, memory model, and type surface to
  documentation complexity. It also creates unnecessary opportunities for
  documentation data to become part of runtime errors, logs, telemetry, or
  client bundles.

- **Documentation stored in separate files with no schema relationship.**

  Rejected: an unlinked documentation system cannot reliably determine whether
  documentation matches the current schema. The build system would lose the
  ability to identify issues such as undocumented variables, stale
  documentation entries, or mismatched variable references.

  Keeping `documentEnv()` structurally connected to the schema allows the
  generator to validate documentation completeness while maintaining a strict
  separation between runtime execution and build-time analysis.
