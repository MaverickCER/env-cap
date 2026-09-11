# 0014: Cross-Package Schema Discovery via an Explicit Package Allowlist

## Status

Proposed / **Experimental** (see [`VERSIONING.md`](../../VERSIONING.md)).
Implemented in:

- `src/build/resolve-package-schema.ts`
- `src/build/resolve-import.ts` (`resolveImportSpecifier`)
- `src/build/link.ts` (`DiscoveredContract.packageOrigin`)
- `src/build/dependency-graph.ts`
- `src/build/manifest.ts`

The `packages` option, the `PackageOrigin` type it attaches to discovered
contracts, and the `"envCap": { "schema": "<path>" }` package.json convention
are all Experimental: they may still change shape in a minor release without
that being a semver violation. This is genuinely first-of-its-kind surface
for the project -- a new cross-trust-boundary resolution mechanism with real
edge cases (upward `package.json` walks, symlink/realpath handling,
package-manager-specific layouts) that benefits from real-world feedback
before being locked to the same strict stability guarantee the rest of the
public build API carries. This does **not** license casual churn: a
publishing package that adopts the convention starts building real
automation around it from day one, so the Experimental label buys room to
refine based on genuine feedback, not permission to change it for its own
sake.

## Context

`generateEnvManifest()`/`generateEnvArtifacts()` could not, until this
decision, see a schema that exists only inside an installed package's
`node_modules` copy. Two independent boundaries blocked it:

1. `discoverSchemaFiles()` (`discover.ts`) unconditionally prunes
   `node_modules` during its directory walk -- `ALWAYS_SKIP_DIR_NAMES`,
   applied regardless of `include`/`exclude`.
2. `resolveRelativeImport()` (`resolve-import.ts`) unconditionally returns
   `undefined` for bare/package specifiers -- only `./`- and `../`-prefixed
   specifiers ever resolve.

`test/integration/positive/enterprise/paypal-consumer`'s README documented this honestly as "a real
discovery boundary, not glossed over," worked around only by pointing `root`
at a shared parent directory of monorepo-sibling source folders -- a
technique that provides no help for a genuinely separately-published npm
package with no sibling source visible outside its own `node_modules` copy.

A large organization with many internal, separately-published packages
(`@acme/payments-sdk`, `@acme/auth-sdk`, ...) -- no monorepo, no shared
source tree -- had no way to consolidate env-var contracts across package
boundaries at all. The threat model for extending discovery across a package
boundary is different from local discovery: a package crosses a real trust
and versioning boundary (a transitive artifact someone else publishes and
updates independently), even though ADR 0002's "never execute" invariant is
not weakened by anything in this decision -- only _which files get fed into_
the existing AST-only pipeline changes.

## Decision

1. **A publishing package opts itself in** by declaring a dedicated
   `"envCap": { "schema": "<path>" }` field in its own `package.json`,
   pointing at its own real, uncompiled `.ts`/`.tsx` schema source file --
   not a compiled or bundled entry point. Compiled/bundled output risks
   identifier renaming (bundlers rename local variables to avoid
   collisions), CJS/ESM shape mismatches (`parse.ts` only recognizes ESM
   `import`/`export const` syntax), and minification (which renames every
   local identifier by design) -- any of which would silently break
   `isCallToName`'s `createEnv`/`documentEnv` identifier matching. The
   package ships that one file via a narrow `files` addition (e.g.
   `"files": ["dist", "src/env.schema.ts"]`), not its whole `src/` tree. This
   field's value is part of the package's public contract, not an internal
   implementation detail -- once any consumer's build depends on discovering
   it, moving or renaming the declared file is effectively a breaking change
   for that package, the same as moving a file referenced by `exports`
   would be, independent of whether `env-cap` itself treats the surface as
   Experimental.

2. **A consuming project opts itself in** by passing an explicit
   `packages: readonly string[]` allowlist to `generateEnvManifest`/
   `generateDocumentation`/`generateUsageReport`/`generateEnvArtifacts`
   (and the CLI's repeatable `--package <name>` flag). No package is ever
   considered unless named exactly in this array. There is no auto-scan of
   installed dependencies for the `envCap` field.

3. **Resolution never walks `node_modules`.** An allow-listed name resolves
   entirely through Node's own package-resolution machinery
   (`createRequire(...).resolve(...)`), bounded to a handful of `fs` calls
   per package regardless of `node_modules` size, and correct across
   npm/pnpm/yarn installs uniformly since none are special-cased. When a
   package's `exports` map omits `"./package.json"`, resolution falls back
   to locating the main entry and walking upward through ancestor
   directories -- but that walk cannot stop at the _nearest_ `package.json`,
   since dual CJS/ESM packages commonly ship decoy marker files (e.g.
   `dist/cjs/package.json` containing only `{"type":"commonjs"}`, no `name`
   field) at intermediate directory levels. The walk continues until a
   `package.json`'s own `name` field actually matches the target package.

4. **The resolved file must pass layered validation before it is ever
   parsed**: a lexical boundary check on the declared path string (it must
   not escape the package directory), a `.ts`/`.tsx` extension check, a
   **realpath-based containment check** (resolving both the target file and
   the package directory via `fs.realpath` and verifying the real target is
   still contained within the real package root -- necessary because
   `packageDir` itself is frequently a symlink under real-world installs,
   e.g. pnpm's content-addressable store, so a purely lexical check on
   either side of the comparison can be wrong), and a fixed size cap
   (`MAX_PACKAGE_SCHEMA_FILE_BYTES`, 1 MiB) checked via `fs.stat` before any
   content is read into memory. A symlink is not rejected on sight -- the
   realpath containment check is the actual authority, so a symlink
   resolving _within_ the package directory is harmless and allowed; only a
   real target outside it is rejected. Any failure at any step
   (`PackageResolutionFailureCode`: `PACKAGE_NOT_FOUND`,
   `MALFORMED_PACKAGE_JSON`, `FIELD_MISSING`, `INVALID_EXTENSION`,
   `OUTSIDE_PACKAGE`, `FILE_TOO_LARGE`) becomes exactly one `ParseWarning`
   per package, never a throw, never a guess -- the package's contract is
   simply absent from the result, exactly as an unresolvable local reference
   already behaves today.

5. **`resolveRelativeImport()`'s bare-specifier no-op is preserved
   unmodified.** A new composed entry point, `resolveImportSpecifier()`, is
   what `link.ts` and `dependency-graph.ts` actually call: it tries the
   relative resolver first and falls back to package resolution only for
   specifiers matching an allow-listed name. Wiring this into
   `dependency-graph.ts` (not just `link.ts`) is load-bearing, not optional:
   without it, a cross-package contract's consumer
   (`import { x } from "@acme/pkg"`) could never resolve, and the contract
   would be misreported as `abandoned` by `generateUsageReport()`.

6. **Local and package-resolved files are merged and deduplicated by
   realpath**, not lexical path, before being handed to `linkFiles()` --
   package-resolved files are already realpath-canonicalized, but local
   `discoverSchemaFiles()` hits may themselves traverse a symlink (a
   symlinked `root`, or an included path reached through one). A lexical-
   only dedup would miss the same physical file reached through two
   different symlinked routes and silently double-count it into two
   identical contracts.

7. **Generated manifests import a package-resolved contract by bare package
   name**, not a relative path to the (analysis-only) resolved file --
   `DiscoveredContract.packageOrigin` carries this. A relative path into
   `node_modules` would point at raw `.ts` source most consumer build
   configs don't compile, and wouldn't be a valid runtime import path
   anyway. This requires a publishing package to re-export its contract
   under the _same_ export name its schema file uses, from its own main
   entry point -- a violation fails loudly (a real compile/runtime error for
   the consumer), so this obligation is not separately verified here.

**This decision does not weaken or amend ADR 0002 in any way.** No file
resolved through `packages` is ever imported, required, or executed -- a
package-resolved file is fed into the exact same `parseSchemaFile()`/
AST-only pipeline as a locally-discovered file, indistinguishable from it
after resolution. Package discovery only changes _which files are found_,
never _what happens to a found file_. `discoverSchemaFiles()`'s existing
`node_modules`-pruning walk is untouched by this decision; the two
mechanisms never overlap -- the general walk never calls into package
resolution, and package resolution never calls `readdir`.

## Consequences

- A schema that exists only in an installed package's `node_modules` copy is
  now discoverable, but only for packages a project's own build
  configuration explicitly names -- the allowlist is authored by the same
  person who already has arbitrary code execution rights over that build
  configuration, so it is a convenience/scoping mechanism, not a new
  privilege boundary.
- `discoverSchemaFiles()`'s existing performance guarantee (never scans
  `node_modules`) is unmodified -- the two code paths structurally never
  overlap.
- A package crossing this boundary takes on two concrete, documented
  obligations: ship its schema source file (a narrow `files` addition, not
  its whole `src/`), and re-export each contract under its schema file's
  export name from its own main entry point.
- Being Experimental, the `packages` convention may still be refined (e.g.
  the exact package.json field name or shape) based on real adoption
  feedback before this ADR's Status is promoted to Accepted.

## Alternatives considered

- **Auto-scan every installed dependency's `package.json` for an `envCap`
  field, no allowlist.** Rejected. It would silently expand the trust
  boundary to every transitive dependency that happens to declare the
  field, including ones a team never audited for this purpose, and would
  reintroduce exactly the "walk potentially huge `node_modules`"
  performance/DoS surface `discoverSchemaFiles()`'s hardcoded skip exists to
  avoid, just moved into a different function.
- **Reuse the `exports` map with a well-known subpath (e.g.
  `"./env-schema"`) instead of a dedicated field.** Rejected. It would force
  the declared entry point to be a real, runtime-importable module,
  reopening the CJS/ESM/bundling/minification risks in Decision 1, and
  risks becoming a de facto second public API with expectations `env-cap`
  doesn't control. Adding an `exports` map at all is also a breaking
  encapsulation change for a package that doesn't already have one.
- **Follow a package's internal re-export chain to verify the main-entry
  re-export obligation.** Rejected as scope creep -- it would mean parsing a
  second package-owned file per package, expanding the trust surface for a
  case that already fails loudly (a real compile/runtime error) rather than
  silently.
- **Accept compiled `.js` output as a valid `envCap.schema` target.**
  Rejected for now, given the CJS/ESM/bundling/minification risks in
  Decision 1. Revisiting this is possible in a future version if a clean
  mitigation is found, but nothing in the current requirements demands it.
- **A dedicated `onPackageResolutionFailure: "warn" | "throw"` escalation
  option.** Considered, not added -- no real use case has asked for a way to
  hard-fail CI specifically on a package-resolution failure as distinct from
  every other warning-tier finding. If one surfaces, this is the natural
  future extension point, following the same "no knob nobody's asked for
  yet" precedent as ADR 0009.
