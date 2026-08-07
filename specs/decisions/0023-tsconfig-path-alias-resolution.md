# 0023: TypeScript Path-Alias Resolution, On By Default

## Status

Proposed / **Experimental** (see [`VERSIONING.md`](../../VERSIONING.md)). Implemented in:

- `src/build/resolve-tsconfig-paths.ts`
- `src/build/resolve-import.ts` (`resolveImportSpecifier`, `ImportResolutionContext`)
- `src/build/generate-manifest.ts`, `generate-documentation.ts`, `generate-usage.ts`,
  `generate-env-artifacts.ts` (the `tsconfig` option)
- `src/cli/index.ts` (`--tsconfig`/`--no-tsconfig`)

The `tsconfig` option and the resolution behavior it controls are Experimental: they may
still change shape in a minor release without that being a semver violation, following the
same policy `packages` (ADR 0014) shipped under.

## Context

Every cross-file link this project computes -- `link.ts`'s `createEnv()`/`documentEnv()`
linking, and `dependency-graph.ts`'s usage/ownership scan -- funnels through one
resolution chokepoint, `resolveImportSpecifier()`. Until this decision, it recognized only
two specifier shapes: relative (`./foo`, `../foo`, via `resolveRelativeImport()`), and a
bare specifier matching an explicit `packages` allowlist (ADR 0014, via
`resolvePackageImport()`). Any other bare specifier -- critically, a **TypeScript path
alias** (`"@/lib/env"`, `"~/schema/env"`), configured via a project's own `tsconfig.json`
`compilerOptions.paths`/`baseUrl` and extremely common in real-world TypeScript
projects -- fell through both and returned `undefined`. `resolveRelativeImport()`'s own
doc comment said as much: a bare specifier is treated as "couldn't statically link," and
the caller warns rather than guesses.

The concrete cost: a `documentEnv()` call whose schema reference is imported via an alias
became an `unresolvedLinks` entry instead of a linked contract. A `createEnv()` contract
only ever consumed through an alias import was misreported as `abandoned` -- never
imported anywhere -- by `deriveOwnershipFindings()`, or produced a false-positive
`unconsumedOwnedVariables` finding. Both are exactly the class of wrong finding ADR 0010's
ownership engine exists to never produce, and for any project organizing its own source
with aliases (a majority of real-world TypeScript codebases), the Dependency & Ownership
Report -- this project's core "who owns this, who depends on it" answer -- was
systematically inaccurate.

## Decision

1. **On by default, unlike `packages`.** `generateEnvManifest`/`generateDocumentation`/
   `generateUsageReport`/`generateEnvArtifacts` (and the CLI) auto-detect
   `root/tsconfig.json` and use its `paths`/`baseUrl` for alias resolution with no
   configuration required. This deliberately diverges from ADR 0014's opt-in posture: a
   package crosses a real trust/versioning boundary into another package's `node_modules`
   copy, but a project's own `tsconfig.json` only ever points at files already inside the
   same, already-trusted local project -- there is no new boundary being crossed, so
   opt-in would only mean silently wrong reports for every project that doesn't know to
   ask for correctness. An explicit `tsconfig` option overrides the path (for monorepos
   where the relevant config isn't at `root`), and `tsconfig: false` disables the
   mechanism entirely (a CLI `--tsconfig <path>`/`--no-tsconfig` pair mirrors this).

2. **Exactly `root/tsconfig.json`, never an upward directory walk.** Auto-detection does
   _not_ use `ts.findConfigFile()` (which walks parent directories looking for the nearest
   config) -- every other root-relative mechanism in this codebase (schema discovery,
   `packages` resolution) treats `root` as a hard boundary, never searching above it. This
   also matches `tsc -p <root>`'s behavior (an explicit project directory) rather than bare
   `tsc`'s cwd-upward-walk default, which is the more apt comparison here since `root` is
   always an explicit, caller-supplied directory, never an implicit cwd. Walking upward
   could silently pick up an unrelated ancestor tsconfig in a monorepo.

3. **The alias-matching algorithm is delegated entirely to the TypeScript compiler.**
   `ts.readConfigFile()` + `ts.parseJsonConfigFileContent()` load the config (handling
   JSONC and `extends`-chain merging for free -- neither exists anywhere else in this
   codebase), and `ts.resolveModuleName()` -- the same function `tsc`/`tsserver` themselves
   call -- does the actual longest-prefix `paths` matching, `*` wildcard substitution,
   multiple-fallback-target resolution, and `baseUrl` fallback. This avoids reimplementing
   a solved algorithm with new bug surface; the net-new code in
   `resolve-tsconfig-paths.ts` is limited to loading config, caching, and enforcing the
   safety boundary below. `ts.sys` is used directly as the resolution host (an existing
   Node-backed singleton). This call is necessarily synchronous -- `ts.resolveModuleName()`
   has no async form.

4. **The gate for building a resolution is "`paths` non-empty OR `baseUrl` set,"
   not `paths` alone.** A `baseUrl`-only tsconfig (no `paths` at all) still makes
   TypeScript resolve bare specifiers relative to `baseUrl` (e.g. `import "./src/env/schema"`), and `ts.resolveModuleName()` already handles that once
   `compilerOptions.baseUrl` is passed through -- gating on `paths` alone would silently
   drop this real, common case.

5. **Never resolves into `node_modules`.** `ts.resolveModuleName()` can, in principle, fall
   through to classic Node resolution and land inside `node_modules`. Any resolved path
   containing a `node_modules` path segment (checked after `path.normalize()`, so mixed
   separators can't slip past it on Windows) is discarded. Bare package specifiers continue
   to be handled exclusively by `resolvePackageImport()` (ADR 0014) -- this mechanism never
   overlaps with that trust boundary, and this codebase's cross-package discovery keeps its
   existing explicit-allowlist requirement unchanged.

6. **`.ts`/`.tsx` only, matching `resolveRelativeImport()`'s and
   `resolve-package-schema.ts`'s existing scope.** A resolved non-`.ts`/`.tsx` file is
   discarded, not merely deprioritized. This is not a new restriction unique to aliases --
   every static-analysis entry point in this codebase is `.ts`/`.tsx`-only today -- and it
   is a real safety property, not just a scope boundary: feeding a resolved `.json` or
   other non-source file straight into `ts.createSourceFile()` wouldn't error, it would
   silently parse garbage, which is exactly the "guess" this codebase's warn-don't-guess
   philosophy exists to avoid.

7. **`resolveImportSpecifier()`'s resolution order is relative → alias → package.** Alias
   resolution runs before package resolution because it resolves the consuming project's
   own local source (already-trusted, no versioning boundary) -- the same precedence
   relative resolution already has over package resolution. Wiring this into
   `dependency-graph.ts` (not just `link.ts`) is load-bearing, not optional, for the same
   reason ADR 0014 called out for `packages`: without it, a contract's consumer reached
   only through an alias could never resolve, and the contract would be misreported as
   `abandoned`.

8. **Failures become one `ParseWarning`, never a throw.** `loadTsconfigPaths()` is called
   exactly once per `generate*()`/`computeArtifacts()` invocation -- the same point
   `resolveAllowlistedPackages()` is already called once -- so at most one tsconfig-related
   warning is ever produced per run, never once per file scanned. A missing _default_
   `tsconfig.json` is silent (most projects don't use aliases, and this must not be noisy);
   a missing _explicit_ `tsconfig` path, or malformed JSON, is a real misconfiguration and
   warns.

### Explicit scope boundaries

- **Project references are not followed.** `env-cap` analyzes one configured project root
  at a time, with one fixed `compilerOptions` object regardless of which file is importing.
  Traversing referenced projects would require resolving and merging multiple
  `compilerOptions` sets and would materially expand analysis scope -- it deserves its own
  ADR if ever pursued, not a silent extension of this one.
- **`jsconfig.json` is not auto-detected.** `env-cap` analyzes TypeScript projects today; a
  `jsconfig.json`-based (JS + `checkJs`) project is a distinct, unhandled case elsewhere in
  this codebase too. A project can still opt in today via an explicit
  `tsconfig: "jsconfig.json"` override -- the loader only cares about the file's JSON
  shape, not its name -- and native auto-detection of `jsconfig.json` alongside
  `tsconfig.json` could be added later without an API change.
- **This does not reopen ADR 0010's or ADR 0014's boundaries.** Alias resolution only
  changes how a specifier already reachable from the consuming project's own scanned
  source resolves -- it does not walk an allow-listed package's own `node_modules` copy to
  verify what that package's internal source consumes, and it does not recurse into that
  package's own dependencies. That remains explicitly out of scope; see ADR 0014's own
  "Alternatives considered" (which already rejected following a package's internal
  re-export chain as scope creep) and ADR 0010's "never reaches `node_modules`" boundary
  for the dependency-ownership engine.

## Consequences

- A project organizing its own source with `tsconfig.json` path aliases now gets an
  accurate Dependency & Ownership Report, manifest, and docs Catalog with zero
  configuration -- the common case just works, matching `tsc`'s own behavior.
- `env-cap` gains its first resolution mechanism that is on by default rather than
  explicitly opted into, a deliberate departure from ADR 0014's precedent, justified by the
  different trust posture (no new boundary crossed) documented in Decision 1 above.
- A monorepo whose relevant `tsconfig.json` isn't at `root` needs an explicit `tsconfig`
  override to benefit; without one, alias imports in that project silently continue to
  behave as before this decision (an `unresolvedLinks`/`abandoned` finding), not
  differently -- there is no regression, only a missed opportunity until configured.
- The `typescript` package (already a peer dependency, used elsewhere in this codebase only
  for AST walking) is now also used for its config-loading and module-resolution APIs, a
  new but well-precedented use of an existing dependency.

## Alternatives considered

- **Hand-rolled longest-prefix `paths` matcher.** Rejected -- reimplements an algorithm
  TypeScript itself already gets right (wildcard substitution, multiple fallback targets,
  `extends` merging), with strictly more bug surface and no offsetting benefit.
- **`ts.findConfigFile()`'s upward directory walk**, matching bare `tsc`'s default
  behavior. Rejected -- breaks with `root`'s existing hard-boundary role everywhere else in
  this codebase (schema discovery, `packages` resolution) and could silently pick up an
  unrelated ancestor tsconfig in a monorepo. `tsc -p <root>`'s explicit-directory behavior
  is the closer analog anyway, since `root` is always caller-supplied, never an implicit
  cwd.
- **Opt-in only, mirroring `packages` (ADR 0014).** Rejected -- `packages`' opt-in
  requirement exists because it crosses a real trust/versioning boundary into another
  package's `node_modules` copy; a project's own `tsconfig.json` paths never cross that
  boundary, so opt-in would only cost every unconfigured project a wrong report for no
  corresponding safety benefit.
- **Traversing into an allow-listed package's own `node_modules` copy to verify its
  internal consumption of its own declared schema, recursively into its own
  dependencies.** Rejected as out of scope for this decision -- it would reopen ADR 0010's
  "never reaches `node_modules`" boundary and reverse the alternative ADR 0014 already
  rejected ("follow a package's internal re-export chain... rejected as scope creep").
  Recursing into nested dependencies would multiply that trust-surface expansion further.
  If ever pursued, it is a materially larger, separate feature deserving its own ADR and
  its own security review.
- **Widening resolution past `.ts`/`.tsx` (e.g. `.mts`/`.cts`/`.js`) specifically for the
  alias path.** Rejected -- would introduce a new asymmetry against `resolveRelativeImport()`'s
  and `resolve-package-schema.ts`'s existing `.ts`/`.tsx`-only scope. Widening the whole
  codebase's static-analysis scope to more extensions is a legitimate future enhancement,
  but it isn't specific to aliases and belongs in its own change.
