# 0020: Declaration maps are emitted by a separate `tsc` pass, not tsup's own `dts` pipeline

## Status

Accepted. Implemented in `tsconfig.build.json`, `scripts/emit-dts-shims.mjs`,
and `package.json`'s `build` script (`tsup && tsc -p tsconfig.build.json &&
node scripts/emit-dts-shims.mjs`).

## Context

Sourcemaps (`sourcemap: true`) were straightforward to enable across all
five `tsup.config.ts` targets. Declaration maps (`.d.ts.map`, letting an
editor's "Go to Definition" on an imported type land in real `.ts` source
instead of the bundled `.d.ts`) were expected to be equally simple: tsup's
`dts` option accepts a `compilerOptions` object, and passing
`{ declarationMap: true }` there looked like the natural way to enable them.

It doesn't work. Reading the installed `tsup@8.5.1`'s bundled dts pipeline
(`rollup-plugin-dts`, used whenever `dts: true` or `dts: {...}` is set)
showed two things: first, `dts.compilerOptions` is only honored by tsup's
separate, opt-in `experimentalDts` pipeline -- not the default one this
project uses. Second, and more fundamentally, `rollup-plugin-dts`'s own
`DEFAULT_OPTIONS` hardcodes `declarationMap: false` internally, so even
routing the option correctly wouldn't have produced a working map: the
bundling step that merges multiple source files' declarations into one
`dist/index.d.ts` per entry point has no path to emit a coherent merged map
at all. Building it and inspecting `dist/index.d.ts.map` confirmed this
directly -- no file was produced.

## Decision

Declaration files and their maps are emitted by a genuinely separate `tsc`
invocation, not tsup at all:

1. All five `tsup.config.ts` targets set `dts: false`. tsup only produces
   the bundled `.js`/`.cjs` output (plus sourcemaps) for each entry point.
2. A new `tsconfig.build.json` (extending the project's own `tsconfig.json`)
   runs `tsc --declaration --declarationMap --emitDeclarationOnly` against
   `src/` (excluding `test/` and `src/cli/**`, which ships no public types),
   emitting one real per-file `.d.ts`/`.d.ts.map` pair per source file into
   `dist/.dts/`, mirroring `src/`'s own directory structure. Plain `tsc`
   reliably produces correct per-file maps -- it's specifically
   `rollup-plugin-dts`'s _bundling_ step that can't, not TypeScript's
   declaration emit itself.
3. Since `tsc` (unlike `rollup-plugin-dts`) has no bundling step, and
   `package.json#exports` pins each entry point to a single filename (e.g.
   `dist/index.d.ts`), a new `scripts/emit-dts-shims.mjs` writes a one-line
   re-export shim for each public entry point's `.d.ts`/`.d.cts`
   (`export * from "./.dts/<target>/index.js";`), pointing package.json's
   declared type location at the real per-file declarations underneath.
4. `package.json`'s `build` script becomes `tsup && tsc -p
tsconfig.build.json && node scripts/emit-dts-shims.mjs` -- three steps,
   run in that order, every time.

Verified end-to-end, not just at the file-existence level: an installed
tarball (`npm pack`, installed into a scratch project) resolves a real,
non-`any` type through the shim -- a deliberately wrong `Processor`
signature in a scratch consumer produced a genuine `tsc` type error against
the shipped declarations, proving the shim isn't silently degrading to
`any`.

## Consequences

- The build has three sequential steps instead of one. A contributor
  changing `tsup.config.ts`'s `dts`/`sourcemap` settings needs to
  understand why `dts: false` appears on every target and where the real
  declarations actually come from -- this ADR, plus the inline comments on
  `tsup.config.ts`'s `dts: false` lines and at the top of
  `scripts/emit-dts-shims.mjs`, are that record.
- `dist/.dts/` ships inside the published npm tarball (`files` includes the
  whole `dist` directory) -- it's not optional scaffolding, the four shim
  files depend on it existing at the paths they reference.
- If `src/eslint-plugin/` (or any future `dts`-bearing entry point) is
  added, both `scripts/emit-dts-shims.mjs`'s `ENTRIES` list and
  `tsconfig.build.json`'s `include`/`exclude` need the new entry point
  accounted for -- `tsconfig.build.json`'s `include: ["src"]` already covers
  a new directory under `src/` by default; only an entry point that should
  be _excluded_ (like `src/cli/`, which ships no declarations at all) needs
  an explicit exclude added.
- If a future `tsup`/`rollup-plugin-dts` release adds real declaration-map
  support to the bundling pipeline, this three-step build can collapse back
  to tsup's native `dts: true` -- nothing about this decision assumes the
  gap is permanent, only that it exists today.

## Alternatives considered

- **`dts: { compilerOptions: { declarationMap: true } }` as originally
  planned.** Rejected after verification -- doesn't work, for the two
  reasons in Context above (wrong pipeline, and that pipeline's own
  hardcoded default even if it were reached).
- **tsup's `experimentalDts` option**, which does read `compilerOptions`.
  Not pursued -- it's explicitly experimental in tsup itself, uses a
  different (per-file, not bundled) output shape that would itself require
  the same shim-file treatment to fit `package.json#exports`' one-file-per-
  entry-point pins, and swapping one experimental dependency behavior for
  another doesn't remove the actual complexity, just relocates it.
- **Give up on declaration maps entirely.** Rejected -- "Go to Definition"
  landing in real source instead of a bundled `.d.ts` is a real editor-
  experience improvement or long-time maintainers and external contributors
  alike, and the separate-`tsc`-pass approach achieves it without giving up
  tsup's bundling for the actual JS output.
