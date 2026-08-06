# TypeScript path aliases example

```
tsconfig.json                        <- declares the "@/*" -> "src/*" path alias
src/
  features/payments/env.schema.ts    <- the contract, imported ONLY through the alias
  server.ts                          <- imports it as "@/features/payments/env.schema.js"
  generated/env.manifest.ts          <- generated, do not edit
scripts/
  generate-manifest.mjs              <- build-time only, never imported by the app
docs/
  ENVIRONMENT.md                     <- generated
  OWNERSHIP.md                       <- generated -- the actual proof, see below
```

`src/server.ts` never imports `env.schema.ts` with a relative path (`../features/payments/env.schema.js`).
It uses the `"@/*"` alias declared in this example's own `tsconfig.json` instead — the same way a real
application organizes imports around its own project root rather than counting `../..` segments.

## The bug this fixes (ADR 0023)

Before [ADR 0023](../../specs/decisions/0023-tsconfig-path-alias-resolution.md), `env-cap`'s static analysis
only understood two import shapes: relative (`./foo`, `../foo`) and an explicitly allow-listed package name
(`packages`, [ADR 0014](../../specs/decisions/0014-cross-package-schema-discovery.md)). A bare specifier
matching a `tsconfig.json` path alias — exactly what `src/server.ts` writes here — fell through both, and the
`payments` contract would have been misreported as **abandoned** (never imported anywhere) in
`docs/OWNERSHIP.md`, even though it plainly is imported and read.

Run it yourself and check the generated report:

```bash
npm install
npm run generate:env
cat docs/OWNERSHIP.md
```

`docs/OWNERSHIP.md` lists `payments` with `src/server.ts` as its one consumer — not in an "abandoned
contract(s)" section. `generate-manifest.mjs`'s own console output says so too: `No abandoned contracts --
the alias-only import was resolved correctly.`

## On by default

Unlike `packages`, nothing in `scripts/generate-manifest.mjs` opts into this — no `tsconfig` option is
passed to `generateEnvArtifacts()`. `env-cap` auto-detects this example's own `tsconfig.json` at `root`
automatically, the same way `tsc` itself would, because (unlike an installed package) a project's own
`tsconfig.json` never crosses a trust/versioning boundary. See
[TypeScript path aliases](../../README.md#typescript-path-aliases-pathsbaseurl) in the root README and
[`VERSIONING.md`](../../VERSIONING.md) for the Experimental-surface policy this ships under.

## Run it

```bash
npm install
npm start
```

`npm start` regenerates the manifest/docs/ownership report, then boots `src/server.ts`, which:

- validates `STRIPE_KEY` against the real, committed `.env`
- imports and reads `paymentsEnv.STRIPE_KEY` entirely through the `"@/*"` alias — both `env-cap`'s static
  analysis (build time) and `tsx` (runtime) resolve the same alias, independently, against the same
  `tsconfig.json`

`npm run verify:env` runs the packaged CLI's `--check` mode — confirms every generated artifact (manifest,
docs, `.env.example`, ownership report) is already up to date without writing anything, the same drift guard
a CI pipeline would run.

## Also installable as its own package

This example is dual-purpose, the same way [`paypal-addon`](../paypal-addon/) is: runnable standalone (above),
*and* installable as a real package. `package.json` declares `"envCap": { "schema":
"./src/features/payments/env.schema.ts" }` and re-exports `paymentsEnv` from its main entry point
(`src/index.ts`) — the same two obligations `paypal-addon`'s README documents in detail, see
[ADR 0014](../../specs/decisions/0014-cross-package-schema-discovery.md).

See [`examples/tsconfig-aliases-consumer`](../tsconfig-aliases-consumer/) for an application that installs
this package from a real packed tarball and discovers `paymentsEnv` across that real package boundary via
the `packages` allowlist — *alongside* its own, separately alias-organized, local contract. That pairing is
the point: ADR 0023 (this example) and ADR 0014 (`paypal-addon`/`paypal-consumer`) are independent
mechanisms in the same `resolveImportSpecifier()` chokepoint, and `tsconfig-aliases-consumer` proves they
compose correctly in one real install, not just in isolated unit tests.

```bash
npm install
npm run pack:local
```

`pack:local` builds `dist/` (via `tsconfig.build.json`, which deliberately only compiles `src/index.ts` and
`src/features/` — not `src/server.ts`, which isn't part of the package's public surface and would ship its
alias import unrewritten by `tsc`'s emit anyway) and packs it into a stable `tsconfig-aliases.tgz`, exactly
like `paypal-addon`'s own `pack:local`. Both `dist/` and `*.tgz` are gitignored build artifacts; run this
before installing `tsconfig-aliases-consumer`'s dependencies.
