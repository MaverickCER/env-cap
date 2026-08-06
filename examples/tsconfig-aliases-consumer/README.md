# tsconfig-aliases-consumer example

An application that installs [`@examples/tsconfig-aliases`](../tsconfig-aliases/) from a real packed
tarball — not a monorepo sibling, not a directory symlink — and consumes its environment contract
alongside its own, separately alias-organized, local one:

```
tsconfig.json                        <- this app's OWN "@/*" -> "src/*" path alias (separate from the addon's)
src/
  features/billing/env.schema.ts     <- this app's own local capability contract ("billing")
  app.ts                             <- imports billingEnv via "@/*", paymentsEnv via the installed package
  generated/env.manifest.ts          <- generated: both contracts
  main.ts                            <- validateEnv() runs here, once
scripts/
  generate-manifest.mjs              <- build-time only, never imported by the app
docs/
  ENVIRONMENT.md                     <- generated
  OWNERSHIP.md                       <- generated -- the actual proof, see below
```

This pair of examples exists to prove that [ADR 0023](../../specs/decisions/0023-tsconfig-path-alias-resolution.md)
(tsconfig path-alias resolution) and [ADR 0014](../../specs/decisions/0014-cross-package-schema-discovery.md)
(cross-package schema discovery, both **Experimental**, see [`VERSIONING.md`](../../VERSIONING.md)) are
independent mechanisms in the same `resolveImportSpecifier()` chokepoint that compose correctly in one real
install — not just in isolated unit tests. `src/app.ts` imports two contracts, through two different
resolution mechanisms, in the same file:

```ts
import { billingEnv } from "@/features/billing/env.schema.js"; // ADR 0023: this app's own tsconfig alias
import { paymentsEnv } from "@examples/tsconfig-aliases"; // ADR 0014: a real installed package
```

## A real package boundary, and a real alias, at the same time

`generateEnvArtifacts()`'s general file-discovery walk still never looks inside `node_modules` — that
guarantee is completely unchanged (see [`specs/architecture.md`](../../specs/architecture.md)'s "build/"
section and [ADR 0002](../../specs/decisions/0002-static-analysis-never-execution.md)). Two independent,
opt-in-by-default-differently mechanisms are layered on top of it, both configured (or, for the alias,
*not* configured) in `scripts/generate-manifest.mjs`:

- `packages: ["@examples/tsconfig-aliases"]` — explicit, opt-in (ADR 0014). Resolves the addon's own
  declared `envCap.schema` field, never walking `node_modules` via `readdir`.
- No `tsconfig` option at all — this app's own `tsconfig.json` (declaring `"@/*": ["src/*"]`) is
  auto-detected automatically (ADR 0023), the same way `tsc` itself would.

Run it yourself and inspect what actually happens:

```bash
cd ../tsconfig-aliases && npm install && npm run pack:local && cd ../tsconfig-aliases-consumer
npm install
npm run generate:env
```

The first line builds and packs `@examples/tsconfig-aliases` into `tsconfig-aliases.tgz` (see its README) —
do this before `npm install` here, since this package's `package.json` depends on
`file:../tsconfig-aliases/tsconfig-aliases.tgz`, a real tarball install. `npm install` here then populates
`node_modules/@examples/tsconfig-aliases` with **only** `dist/`, `src/features/payments/env.schema.ts`, and
`package.json` — confirm it yourself:

```bash
find node_modules/@examples/tsconfig-aliases -type f
```

`npm run generate:env` discovers both contracts and writes `src/generated/env.manifest.ts` with a genuine
bare-package import for the cross-package one, and a relative import for the local one:

```ts
// AUTO-GENERATED FILE.
// DO NOT EDIT.

import { paymentsEnv } from "@examples/tsconfig-aliases";
import { billingEnv } from "../features/billing/env.schema";

export const manifest = [
  paymentsEnv,
  billingEnv,
];
```

## The actual proof: `docs/OWNERSHIP.md`

```bash
cat docs/OWNERSHIP.md
```

Both `billing` (this app's own, alias-only-imported contract) and `payments` (the cross-package contract)
list `src/app.ts` as their one real consumer — neither shows up in an "abandoned contract(s)" section, even
though `src/app.ts` never imports either one with a plain relative path. `generate-manifest.mjs`'s own
console output says so too: `No abandoned contracts -- both the local alias-organized and cross-package
contracts were resolved correctly.`

Before both ADR 0023 and ADR 0014 existed, neither import shape in `src/app.ts` would have resolved at
all — both contracts would have been misreported as abandoned.

## Run it

```bash
npm start
```

`npm start` regenerates the manifest/docs/ownership report, then boots `src/main.ts`, which validates both
contracts together and then runs `src/app.ts`, logging both resolved values.

`npm run verify:env` runs the packaged CLI's `--check` mode (with `--package @examples/tsconfig-aliases`,
matching what `scripts/generate-manifest.mjs` passes) — confirms every generated artifact is already up to
date without writing anything, the same drift guard a CI pipeline would run.
