# 0017: A 4th public entry point (`./eslint-plugin`) for a capability-owned-access lint rule

## Status

Accepted. Implemented in `src/eslint-plugin/`, exported as
`env-cap/eslint-plugin`.

## Context

Nothing in `env-cap`'s runtime or build-time API stops application code from
reading `process.env` directly, bypassing a capability's `createEnv()`
contract entirely -- the whole ownership/visibility story this package tells
(ADR 0003, ADR 0010) is opt-in by convention, not enforced. A lint rule that
flags a raw `process.env` access outside a capability's own `env.schema.ts`
closes that gap, but a first draft of this idea risked breaking a real,
legitimate pattern: a build-time resolver that needs a raw bootstrap
credential (e.g. `VAULT_TOKEN`) to authenticate to a secrets vault, before
any `env-cap` contract exists to go through -- there is no capability to
"own" a variable whose entire purpose is bootstrapping the system that will
eventually manage every other variable. `test/integration/positive/enterprise/aws-secrets-manager`'s
`live-expirations.ts` demonstrates the general shape of this pattern
already (Node-only, build-time orchestration code with a materially
different trust boundary than application runtime code, per ADR 0012),
though that specific file authenticates via the AWS SDK's own implicit
credential chain rather than reading `process.env` directly itself.

## Decision

Ship the rule as `env-cap/eslint-plugin`, a new subpath export
on the existing package, rather than a standalone
`@maverickcer/eslint-plugin-env-cap` package. Concretely:

- **A 4th entry point, not a new package.** Ties the rule's version to the
  exact contract shape it enforces -- a breaking change to `createEnv()`'s
  API and a breaking change to the rule that understands it ship together,
  under the same semver number, instead of needing a second release
  pipeline, `CODEOWNERS` entry, and cross-repo version-compatibility matrix
  for what is, in practice, always used together with the runtime package.
- **Zero `allow` entries by default.** The rule ships maximally strict out
  of the box (beyond the built-in `env.schema.ts` exemption below) --
  `env-cap` never guesses at what a given project considers legitimate
  bootstrap code. A consuming project must explicitly populate `allow` with
  its own glob patterns to permit anything else.
- **`env.schema.ts`/`.tsx` exempted by default, and nothing else.** A
  schema file's entire job is declaring the raw shape `createEnv()`
  contracts wrap -- flagging `process.env` access inside the one place
  that's supposed to define the contract would make the rule fight its own
  purpose. No other file gets a free pass.
- **The vault/bootstrap-credential trust-boundary as `allow`'s canonical
  justification.** The `RuleOptions.allow` option, and the rule's own error
  message, point at this exact scenario -- a resolver that must read a raw
  credential from `process.env` to authenticate to a secrets manager before
  any contract exists to go through -- as the worked example for when
  `allow` is the correct escape hatch, not a workaround.

## Consequences

- A consuming project adopts the rule via
  `import envCapPlugin from "env-cap/eslint-plugin"` in its own
  flat config, with no second package to install or version-match.
- `eslint`/`typescript` are optional peer dependencies (`peerDependenciesMeta`)
  so a consumer who never touches `./eslint-plugin` is never nagged about
  either. `@typescript-eslint/utils`/`@typescript-eslint/types` are ordinary,
  bundled devDependencies of `env-cap` itself -- the published package still
  carries zero runtime dependencies.
- `@typescript-eslint/utils`'s main entry re-exports `ts-eslint` wrapper
  classes (`FlatESLint`/`ESLint`) that do a runtime `require("eslint")`; that
  breaks when bundled into this package's ESM output (no real `require` to
  call). The rule imports narrowly from `@typescript-eslint/utils/eslint-utils`
  (`RuleCreator`) and `@typescript-eslint/types` (`AST_NODE_TYPES`) instead
  of the main entry, avoiding that code path entirely -- and, as a side
  effect, keeping the bundled output over 15x smaller (roughly 28 KB vs.
  494 KB gzipped-uncompressed) than importing the whole package would.
- `globToRegExp()` (the `allow` option's matching engine) is the same
  algorithm `src/build/discover.ts` uses for its own `include`/`exclude`
  walk, but deliberately duplicated as `src/eslint-plugin/glob.ts` rather
  than imported from a shared internal module -- each `src/` subfolder maps
  to a public entry point (`.`/`./build`/`./helpers`/`./eslint-plugin`) with
  zero source-level import reaching outside it, so any one of them can move
  to its own repo/package with no cross-folder dependency to untangle first.
  A one-off matching-behavior fix has to land in both copies, a small,
  known cost against that guarantee (see `test/build/glob.test.ts` and
  `test/eslint-plugin/glob.test.ts`, which assert identical behavior from
  each copy).

## Alternatives considered

- **A standalone `@maverickcer/eslint-plugin-env-cap` package.** Rejected --
  the common, expected naming convention for an ESLint plugin, but it buys
  nothing here that a subpath export doesn't already provide, at the cost
  of a second release pipeline, a second `CODEOWNERS` surface, and a
  version-compatibility matrix between two packages that are, in every
  realistic case, adopted together.
- **Default-permissive `allow` (e.g. matching common bootstrap-script
  directory conventions like `scripts/**`).** Rejected -- guessing at what
  counts as trusted bootstrap code on a project's behalf is exactly the kind
  of silent, magic behavior this package avoids elsewhere (ADR 0002, ADR
  0005). A project that needs the escape hatch states so explicitly.
- **A shared internal `src/shared/glob.ts` module for `globToRegExp()`,
  imported by both `src/build` and `src/eslint-plugin`.** This was the
  original implementation, and it worked -- one algorithm, one place to fix
  a matching bug. Rejected in favor of per-folder duplication once each
  `src/` subfolder's independent splittability became a hard requirement:
  a module living outside every public entry point but imported by two of
  them is exactly the kind of cross-folder dependency that requirement
  rules out, since neither `build` nor `eslint-plugin` could move to its
  own repo without first deciding where `shared/` goes. Two 40-line copies
  cost less than that ambiguity.
- **Exempt any file matching `**/*.config.ts` or similar build-tooling
  conventions, not just `env.schema.ts`.** Rejected -- too broad a default
  exemption undermines the rule's entire purpose; a project's own build
  scripts are exactly the kind of file this rule should flag unless the
  project explicitly opts that specific file into `allow`.
