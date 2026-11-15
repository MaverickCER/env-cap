# paypal-consumer example

An application that installs [`paypal-addon`](../paypal-addon/) from a real
packed tarball (not a monorepo sibling, not a directory symlink). It consumes
that package's environment contract alongside its own local one:

```
src/
  env.schema.ts   <- this app's own local feature contract ("app")
  env.manifest.ts <- generated: both the local contract and paypal-addon's
  main.ts         <- validateEnv() runs here, once
  app.ts          <- feature code imports both contracts directly
scripts/
  generate-manifest.mjs <- build-time only, never imported by the app
```

This pair of examples shows that feature ownership does not depend on
where a feature's code lives. Since
[ADR 0014](../../specs/decisions/0014-cross-package-schema-discovery.md)
(**Experimental**, see [`VERSIONING.md`](../../VERSIONING.md)), this holds even
when the feature ships as a genuinely separate, independently-published
package. No shared source tree, no monorepo, and no workspace protocol is
involved.

## A real discovery boundary, actually crossed

`generateEnvManifest()`'s general file-discovery walk still never looks
inside `node_modules`. That rule, and the performance/security reasoning
behind it, is completely unchanged (see
[`specs/architecture.md`](../../specs/architecture.md)'s "build/" section and
[ADR 0002](../../specs/decisions/0002-static-analysis-never-execution.md)).
What changed is a second, narrow, opt-in mechanism: `scripts/generate-manifest.mjs`
passes `packages: ["@examples/paypal-addon"]` to `generateEnvArtifacts()`.
That's the entire configuration required. `root` is this package's own
directory, exactly like `examples/application`, with no
shared-parent-directory workaround needed.

Run it yourself and inspect what actually happens:

```bash
cd ../paypal-addon && npm install && npm run pack:local && cd ../paypal-consumer
npm install
npm run generate:env
```

The first line builds and packs `paypal-addon` into `paypal-addon.tgz` (see
its README). Do this before `npm install` here. This package's `package.json`
depends on `file:../paypal-addon/paypal-addon.tgz`, a real tarball install,
not a directory reference. `npm install` here then populates
`node_modules/@examples/paypal-addon` with **only** `dist/`,
`src/env.schema.ts`, and `package.json`. Confirm it yourself:

```bash
find node_modules/@examples/paypal-addon -type f
```

`npm run generate:env` discovers both contracts and writes `src/env.manifest.ts`
with a genuine bare-package import for the cross-package one:

```ts
// GENERATED FILE -- do not edit by hand. Run `npx env-cap` to regenerate.

import { paypalEnv } from "@examples/paypal-addon";
import { appEnv } from "./env.schema";

export const manifest = [
  paypalEnv,
  appEnv,
];
```

That's the same bare specifier `src/app.ts` already uses via ordinary Node
module resolution. It is not a relative path into `node_modules`. Such a path
would point at raw `.ts` source most bundlers don't compile, and it isn't a
valid runtime import path. Discovery and runtime consumption remain two different
mechanisms, as they always have in this architecture. They now agree on the
same import for a package-resolved contract too.

The dependency-ownership report is correct across this boundary as well.
`--ownership` is no longer a CLI flag (see
[ADR 0046](../../../../../specs/decisions/0046-cli-restricted-to-runtime-and-evidence-output.md)).
Generating the report is a `generateUsageReport()` call from
`@maverickcer/env-cap/build` instead. It takes the same
`packages: ["@examples/paypal-addon"]` option a `--package @examples/paypal-addon`
CLI flag used to set. See `examples/team-service/scripts/generate-docs/run.ts`
for the pattern. This fixture has no such script of its own, since it's a
behavioral fixture, not a reader-facing example.

`paypal-addon`'s contract shows up with `src/app.ts` as a real consumer, not
in the "Abandoned ownership" section. Resolving `@examples/paypal-addon` as a
bare specifier during usage-scanning is exactly as load-bearing as resolving
it for the manifest import. Both go through the same allowlisted resolution.

## What the generated docs show

`npm run generate:env` also writes `docs/ENVIRONMENT.md`, one generated
artifact covering both contracts from their `documentEnv()` calls. It holds
`paypal-addon`'s three PayPal variables and this app's own `APP_NAME`/`PORT`.
Neither package's schema is copied or redeclared in the other.

## Run it

```bash
cp .env.example .env   # already committed with sandbox-safe placeholder values
npm start
```

`npm start` runs `generate:env`, which writes `src/env.manifest.ts` and
`docs/ENVIRONMENT.md`. Neither is gitignored; both are committed so you can
see them change in a diff. It then boots `src/main.ts`, which validates both
contracts and then runs `src/app.ts`. That file logs the resolved config and
calls `createCheckout()`.

Try deleting `PAYPAL_CLIENT_SECRET` from `.env` and re-running `npm start`.
The aggregated `EnvValidationError` names `paypal-addon`'s contract, not this
application's, even though both were validated in the same `validateEnv()`
call.
