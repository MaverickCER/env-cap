# Security policy

This document defines the security boundaries and threat model for
`env-cap`: what protections the package intentionally provides, what
responsibilities remain with the application, and why those boundaries exist.

For implementation details such as contract redaction, error handling,
`.env.example` generation, and documentation handling, see the [Security
section of the Guide](GUIDE.md#security-model). This document describes the policy
those mechanisms enforce rather than duplicating their implementation details.

## Reporting a vulnerability

Report suspected security vulnerabilities privately through a
[GitHub security advisory](https://github.com/maverickcer/env-cap/security/advisories/new).

Alternatively, contact the maintainer through the contact information
provided on the npm package page.

Please do not create a public issue for a suspected vulnerability before it
has been reviewed and triaged.

## Runtime security model

The runtime package (`createEnv`, `validateEnv`, and imports from the package
root) is intentionally limited to environment processing and validation. It
does not attempt to become a secret-management platform.

The runtime does not:

- **Persist secrets.**
  Resolved environment values exist only in memory. After successful
  validation, values are frozen and retained for the lifetime of the process.
  The runtime never writes secrets to disk, databases, external services, or
  persistent storage.

- **Retrieve secrets.**
  The package has no integrations with secret-management systems such as
  HashiCorp Vault, AWS Secrets Manager, Azure Key Vault, or Google Secret
  Manager. Applications are responsible for obtaining secrets through their
  existing infrastructure and passing resolved values into:

  ```ts
  validateEnv({ values })
  ```

* **Manage secret lifecycle operations.**
  There is no rotation engine, scheduler, command execution, or automated
  refresh process. Fields such as `expiresAt` and refresh instructions from
  `documentEnv()` are documentation metadata only. They are consumed by
  generated artifacts and never executed by the runtime.

* **Send telemetry.**
  No package entry point (`.`, `./build`, or `./helpers`) performs network
  requests or sends usage information.

* **Log secret values.**
  The library does not write logs or emit environment values. Validation
  errors contain contract information, variable names, and messages produced
  by user-provided processors or validators, but the library itself never
  inserts raw or processed secret values into errors.

* **Embed documentation metadata into runtime state.**
  `documentEnv()` is intentionally inert during execution. Documentation
  fields are only consumed by build-time static analysis and are not retained
  by the runtime validation system.

Runtime contracts intentionally contain only:

- variable definitions required for processing (`default`, `processor`,
  `validator`)
- resolved, frozen values accessible through explicit property access
- minimal identity information required for runtime errors

Information that exists only for humans, operators, or generated artifacts
belongs in `documentEnv()`. Responsibilities such as secret storage, rotation,
telemetry, and access auditing belong to infrastructure outside this package.

## Dual-package hazard

The runtime keeps identity-sensitive state in module scope: the private
`WeakMap` that associates a contract object with its schema
(`src/runtime/registry.ts`), and the validation cache
(`src/runtime/cache.ts`). If a consumer's dependency tree resolves
`env-cap` through two different specifiers — one importer
getting the ESM build, one `require()`r getting the CJS build, via a mixed
ESM/CJS dependency graph or a re-exporting intermediate package — Node
loads two entirely separate module instances, each with its own registry
and cache. No npm package that ships both ESM and CJS builds can prevent
this; it is a property of how Node's two module systems resolve
independently.

`env-cap` treats this as a checked, documented risk class rather than an
unstated unknown
([ADR 0041](specs/decisions/0041-dual-package-hazard-checked-documented.md));
`test/runtime/dual-package-hazard.test.ts` pins the exact consequence in
CI. That consequence is **fail-fast, not silent corruption**: a contract
created by `createEnv()` in one instance and passed to `validateEnv()`,
`resetEnvCache()`, or `isEnvContract()` resolved from the other instance is
not recognized — `validateEnv()`/`resetEnvCache()` throw a `TypeError`
("this value was not created by createEnv()") and `isEnvContract()` returns
`false`, immediately and visibly, rather than validating against the wrong
schema or reading a stale cache. Keep each capability's `createEnv()` call
and the `validateEnv()` call that consumes its manifest resolving through
the same module specifier (the normal case for an application that imports
`env-cap` one way throughout).

## Build-time security model

`generateEnvManifest()` (`./build`) is a static-analysis tool, not an
execution engine.

The build system:

- **Never imports or executes schema files.**
  Schema files are analyzed as TypeScript ASTs. Only safe literal
  expressions are evaluated, such as strings, numbers, booleans, arrays, and
  object literals.

  Dynamic expressions such as:

  - function calls
  - variables
  - computed values
  - interpolated template strings

  are treated as unresolved information and reported rather than executed or
  guessed.

- **Never writes outside the configured project root.**
  All generated output paths (`location`, `docs.location`,
  `envExample.location`) are resolved and verified against `root` before any
  file is written.

  Paths that escape the configured root through absolute paths or traversal
  segments fail before any file is written. A direct `generateEnvManifest()`/
  `generateDocumentation()`/`generateUsageReport()` call throws that pass's
  own error type (`EnvManifestGenerationError`/`EnvDocumentationGenerationError`/
  `EnvUsageAnalysisError`); through `generateEnvArtifacts()` or the CLI (the
  primary documented workflow), the same escape is aggregated into
  `EnvProjectGenerationError` instead.

- **Never overwrites existing hand-managed `.env.example` files.**
  If a generated example would conflict with an existing file, the generator
  preserves the original and writes generated output separately.

- **Avoids unnecessary traversal of dependency directories.**
  The general file-discovery walk that powers `include`/`exclude` glob
  matching excludes directories such as `node_modules` and `.git` during
  traversal rather than scanning and filtering afterward -- this walk never
  descends into `node_modules` at all, regardless of `include`/`exclude`.

  A separate, narrow, **Experimental** mechanism exists for reading a schema
  that lives only inside an installed dependency: the `packages` option
  (see [ADR 0014](specs/decisions/0014-cross-package-schema-discovery.md)).
  It is opt-in -- no package is ever considered unless its exact name
  appears in a `packages` array the consuming project supplies -- and
  bounded by construction, not by a traversal exclusion: it reads exactly
  one `package.json` per named package to find a declared entry point, then
  reads exactly one declared file, verified to be a real file (not a
  symlink escaping the package directory) under a fixed size cap, before it
  is parsed. It never calls `readdir` on any directory, named package or
  not, and a package's own transitive dependencies are never considered.

  A second, separate **Experimental** mechanism resolves TypeScript path
  aliases (`compilerOptions.paths`/`baseUrl` in `tsconfig.json`) during
  static analysis, on by default (see
  [ADR 0023](specs/decisions/0023-tsconfig-path-alias-resolution.md)).
  Unlike `packages`, it never crosses into `node_modules`: any resolution
  landing on a path containing a `node_modules` segment is discarded, so a
  bare specifier can only ever resolve into `node_modules` through the
  `packages` mechanism above, never through alias resolution. It only ever
  resolves to a real `.ts`/`.tsx` file already inside the scanned project.

## Application responsibilities

`env-cap` intentionally does not attempt to solve problems outside the
environment-contract lifecycle.

Applications remain responsible for:

- **Protecting documentation metadata.**
  Values passed to `documentEnv()` are ordinary source-code data. If an
  `env.schema.ts` file is imported into a browser bundle, documentation fields
  inside that file may be included in the client output.

  This means:

  - descriptions are public
  - runbook links are public
  - operational notes are public
  - lifecycle instructions are public

  Documentation metadata must never contain credentials, private keys, or
  information that should not appear in a client bundle.

- **Writing safe processors and validators.**
  Custom validation logic controls its own errors.

  For example:

  ```ts
  throw new Error(`Invalid value: ${value}`)
  ```

  may expose a secret if the thrown message is later logged. The package
  protects values passing through its own runtime boundaries but cannot
  sanitize arbitrary application-generated error messages.

- **Managing secret storage and rotation.**
  Obtaining, storing, rotating, and revoking secrets are infrastructure
  responsibilities. `env-cap` validates configuration after it has been
  supplied; it does not replace a secret-management system.

## Supply-chain posture

For a reviewer checking this project's publish/build pipeline rather than
its runtime API: releases are published via npm's OIDC trusted publishing
(`.github/workflows/release.yml`) — there is no long-lived `NPM_TOKEN`
secret in this repository to leak, rotate, or scope. The workflow's
`id-token: write` permission is exchanged for a short-lived publish
credential per run, tied to this exact repository and workflow file, and
the same OIDC flow attaches npm provenance attestations to each published
version. The runtime and helpers entry points are verified against real
Node, Bun, and Deno engines in CI (`test/cross-runtime/`), not merely
asserted to be isomorphic by inspection. Test coverage is enforced
ratchet-up-only (see `vitest.config.ts`; [`CONTRIBUTING.md`](CONTRIBUTING.md)
forbids lowering a threshold to accommodate a drop). See
[`RELEASING.md`](RELEASING.md#first-time-setup) for the one-time
trusted-publisher setup this depends on.

## Supported versions

This project has not reached a `1.0` release.

**Today, before `1.0`:** security fixes are provided on the latest published
`0.x` version only. There is no separate long-term-support branch and no
extended security-support policy yet -- an application pinned to an older
`0.x` release does not receive backported fixes; upgrading to the latest
`0.x` is the only supported remediation path.

**Starting at `1.0`:** once this project ships a `1.0` release, security
fixes will be backported to the latest minor release of the previous major
version for a minimum of six months after a new major version ships. This
window may be extended at the maintainer's discretion -- for example, to
give large downstream consumers more migration time -- but once a minimum
end date has been stated for a given major version's backport window, it
will never be shortened. Fixes for the current major version continue to
target its latest published minor/patch release, exactly as fixes do today
for `0.x`; the backport commitment only extends that same treatment one
major version back, for a bounded time.

This is a forward commitment about a future release line, not a claim that
backporting has already been exercised -- see
[`ADOPTION.md`](ADOPTION.md#versioning-stability-and-long-term-support) for
how to weigh that distinction today.
