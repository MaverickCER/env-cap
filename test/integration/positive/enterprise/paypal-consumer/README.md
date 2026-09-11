# paypal-consumer example

An application that installs [`paypal-addon`](../paypal-addon/) from a real
packed tarball -- not a monorepo sibling, not a directory symlink -- and
consumes its environment contract alongside its own local one:

```
src/
  env.schema.ts   <- this app's own local capability contract ("app")
  env.manifest.ts <- generated: both the local contract and paypal-addon's
  main.ts         <- validateEnv() runs here, once
  app.ts          <- capability code imports both contracts directly
scripts/
  generate-manifest.mjs <- build-time only, never imported by the app
```

This pair of examples exists to show that capability ownership does not
depend on where a capability's code lives, and -- since
[ADR 0014](../../specs/decisions/0014-cross-package-schema-discovery.md)
(**Experimental**, see [`VERSIONING.md`](../../VERSIONING.md)) -- that this
now holds even when the capability ships as a genuinely separate,
independently-published package with no shared source tree, no monorepo, and
no workspace protocol involved.

## A real discovery boundary, actually crossed

`generateEnvManifest()`'s general file-discovery walk still never looks
inside `node_modules` -- that guarantee, and the performance/security
reasoning behind it, is completely unchanged (see
[`specs/architecture.md`](../../specs/architecture.md)'s "build/" section and
[ADR 0002](../../specs/decisions/0002-static-analysis-never-execution.md)).
What changed is a second, narrow, opt-in mechanism: `scripts/generate-manifest.mjs`
passes `packages: ["@examples/paypal-addon"]` to `generateEnvArtifacts()`.
That's the entire configuration required -- `root` is this package's own
directory, exactly like `examples/application`, no shared-parent-directory
workaround needed.

Run it yourself and inspect what actually happens:

```bash
cd ../paypal-addon && npm install && npm run pack:local && cd ../paypal-consumer
npm install
npm run generate:env
```

The first line builds and packs `paypal-addon` into `paypal-addon.tgz` (see
its README) -- do this before `npm install` here, since this package's
`package.json` depends on `file:../paypal-addon/paypal-addon.tgz`, a real
tarball install, not a directory reference. `npm install` here then
populates `node_modules/@examples/paypal-addon` with **only** `dist/`,
`src/env.schema.ts`, and `package.json` -- confirm it yourself:

```bash
find node_modules/@examples/paypal-addon -type f
```

`npm run generate:env` discovers both contracts and writes `src/env.manifest.ts`
with a genuine bare-package import for the cross-package one:

```ts
// AUTO-GENERATED FILE.
// DO NOT EDIT.

import { paypalEnv } from "@examples/paypal-addon";
import { appEnv } from "./env.schema";

export const manifest = [
  paypalEnv,
  appEnv,
];
```

That's not a relative path into `node_modules` (which would point at raw
`.ts` source most bundlers don't compile and isn't a valid runtime import
path) -- it's the same bare specifier `src/app.ts` already uses via ordinary
Node module resolution. Discovery and runtime consumption remain two
different mechanisms, as they always have in this architecture; they just
now agree on the same import for a package-resolved contract too.

The dependency-ownership report (`--ownership`, see the root README) is
correct across this boundary as well -- try it:

```bash
node ../../dist/cli/index.js --root . --ownership docs/OWNERSHIP.md --package @examples/paypal-addon
```

`paypal-addon`'s contract shows up with `src/app.ts` as a real consumer, not
in the "Abandoned ownership" section -- resolving `@examples/paypal-addon` as
a bare specifier during usage-scanning is exactly as load-bearing as
resolving it for the manifest import, and both go through the same
allowlisted resolution.

## What the generated docs show

`npm run generate:env` also writes `docs/ENVIRONMENT.md` covering both
contracts from their `documentEnv()` calls -- `paypal-addon`'s three PayPal
variables and this app's own `APP_NAME`/`PORT` -- in one generated artifact,
without either package's schema being copied or redeclared in the other.

## Run it

```bash
cp .env.example .env   # already committed with sandbox-safe placeholder values
npm start
```

`npm start` runs `generate:env` (writing `src/env.manifest.ts` and
`docs/ENVIRONMENT.md` -- neither is gitignored; both are committed so you can
see them change in a diff) and then boots `src/main.ts`, which
validates both contracts and then runs `src/app.ts`, which logs the resolved
config and calls `createCheckout()`.

Try deleting `PAYPAL_CLIENT_SECRET` from `.env` and re-running `npm start` --
the aggregated `EnvValidationError` names `paypal-addon`'s contract, not this
application's, even though both were validated in the same `validateEnv()`
call.
