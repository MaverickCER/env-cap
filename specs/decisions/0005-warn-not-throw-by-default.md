# 0005: Manifest generation warns by default; throwing is opt-in

## Status

Accepted. Implemented in `src/build/generate-manifest.ts`
(`onIncompatibility`) and `src/build/generate-documentation.ts`
(`onUndocumented`), both defaulting to `"warn"`.

## Context

`generateEnvManifest()` performs static analysis rather than executing
application code (see 0002). Because of this, some findings can be detected
with certainty while others represent potential issues that require human
judgment.

Two categories intentionally fall into the second group:

- **Duplicate variable incompatibility.**
  The build tool cannot execute processors or validators to determine their
  runtime behavior. It can only prove that two contracts are incompatible
  when both provide explicit, conflicting return-type annotations for the
  same variable name. Different implementations without annotations, or
  implementations that happen to produce different values at runtime, cannot
  be proven incompatible through static analysis alone.

- **Undocumented contracts or variables.**
  A `createEnv()` call without a matching `documentEnv()` call, or a variable
  that exists in the schema but not in documentation, indicates incomplete
  documentation coverage. However, documentation is intentionally optional
  (see 0001), so the absence of documentation is not inherently a runtime
  correctness failure.

## Decision

`onIncompatibility` and `onUndocumented` both default to `"warn"`.

When a warning-level finding is detected, it is included in the generation
result, surfaced through the CLI, and included in generated reporting output,
but contract generation continues and the output file is written.

Only findings that can be proven to be invalid are treated as generation
failures by default. For example, two contracts declaring the same variable
with explicitly incompatible return-type annotations are a confirmed
conflict and block generation.

Teams that want stricter enforcement can set either option to `"throw"`.
This converts that category of finding into an `EnvManifestGenerationError`,
allowing projects to enforce stricter CI requirements as their adoption
matures.

## Consequences

- **Projects can adopt `env-cap` incrementally.**
  A team does not need complete documentation coverage or immediate
  resolution of every potential duplicate-variable concern before generating
  its first contract. Documentation and stricter validation policies can be
  introduced over time through CLI flags such as `--strict` and
  `--strict-docs`, or through equivalent options passed directly to
  `generateEnvManifest()`.

- **Warnings require an intentional review process.**
  Because warnings do not fail generation by default, a project that only
  checks command exit codes could allow important findings to remain
  unresolved. The CLI surfaces warnings directly, and generated
  documentation artifacts provide additional visibility, but teams should
  decide how warnings are reviewed within their development workflow.

- **Strict enforcement does not require different analysis logic.**
  Teams can move from permissive adoption to strict CI enforcement without
  changing schemas or rewriting configuration. The same static analysis runs
  in both modes; the only difference is whether a detected condition is
  informational or fatal.

- **The package avoids pretending static analysis knows more than it does.**
  A warning represents uncertainty that requires human evaluation. Throwing
  for cases that cannot be proven would encourage developers to work around
  the tool rather than trust its results.

## Alternatives considered

- **Throw by default.**
  Rejected. This would require every project to achieve complete
  documentation coverage and resolve every potential duplicate-variable
  concern before the first successful contract generation. That conflicts
  with the design goal that documentation is optional and can be adopted
  incrementally.

- **Only report provable incompatibilities and ignore uncertain cases.**
  Rejected. Remaining silent about possible issues removes valuable context
  from developers and prevents teams from improving their configuration
  quality over time. The package follows a consistent policy: detect what can
  be proven, warn about what requires review, and avoid making assumptions
  about runtime behavior.
