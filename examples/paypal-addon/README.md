# paypal-addon example

A reusable internal package -- not an application feature folder -- that wraps
the PayPal SDK (with placeholder calls; there is no real PayPal integration
here) and owns its own environment contract:

```
src/
  env.schema.ts     <- the capability's contract: createEnv() + documentEnv()
  checkout.ts       <- createCheckout()
  subscriptions.ts  <- createSubscription()
  refunds.ts        <- createRefund()
  index.ts          <- public exports: paypalEnv, createCheckout, createSubscription, createRefund
```

This is the same ownership model as a `features/payments/env.schema.ts` in
`examples/basic-node` -- the only difference is that this capability ships as
its own installable package instead of living in the consuming application's
source tree. See [`examples/paypal-consumer`](../paypal-consumer/) for an
application that installs and consumes it.

There is no exported `paypalDoc` or similar -- `documentEnv()` returns `void`
and is inert at runtime by design (see the root README's
[Documentation and lifecycle metadata](../../README.md#documentation-and-lifecycle-metadata)
section). Its only job is to exist as a static marker `generateEnvManifest()`
can link back to `paypalSchema` during build-time discovery.

This package has no runnable entry point of its own -- see
`examples/paypal-consumer`'s README for how to run the two together with
`validateEnv()` and `createCheckout()`.

## What makes this package discoverable across a real package boundary

`paypal-consumer` installs this package from a **real packed tarball**, not a
directory symlink or a monorepo workspace reference -- `npm pack` filters the
tarball down to exactly what `package.json#files` lists, so
`node_modules/@examples/paypal-addon` in the consumer ends up containing only
`dist/`, `src/env.schema.ts`, and `package.json`. None of this package's other
source (`checkout.ts`, `subscriptions.ts`, `refunds.ts`, `index.ts`) is
visible outside its own repository. That's deliberate: it's the same shape a
genuinely separately-published npm package from a different team or
organization would have.

Making the environment contract discoverable in that shape requires this
package to take on two obligations -- both **Experimental**, see
[ADR 0014](../../specs/decisions/0014-cross-package-schema-discovery.md) and
[`VERSIONING.md`](../../VERSIONING.md):

1. **Declare a `"envCap": { "schema": "./src/env.schema.ts" }` field in
   `package.json`.** This tells `generateEnvArtifacts({ packages: [...] })`
   exactly which file to statically analyze -- still never imported or
   executed, the same AST-only guarantee as local discovery (ADR 0002). It
   points at the real, uncompiled `.ts` source, not `dist/env.schema.js`:
   compiled/bundled output risks identifier renaming, a CJS/ESM shape
   mismatch, or minification breaking the parser's `createEnv`/`documentEnv`
   call-site matching. That's why `"files"` below includes the source file
   directly, alongside the compiled `dist/` used at runtime.
2. **Re-export the contract under the same name from the main entry point.**
   `src/index.ts` re-exports `paypalEnv` unchanged -- this is what lets
   `paypal-consumer/src/app.ts`'s `import { paypalEnv } from "@examples/paypal-addon"`
   resolve back to the exact contract discovery found, both for the generated
   manifest's import line and for `generateUsageReport()`'s ownership graph.

```json
{
  "main": "./dist/index.js",
  "exports": { ".": "./dist/index.js" },
  "files": ["dist", "src/env.schema.ts"],
  "envCap": { "schema": "./src/env.schema.ts" }
}
```

## Building and packing this package for the consumer example

```bash
npm install
npm run pack:local
```

`pack:local` runs `tsc` (via `tsconfig.build.json`) to produce `dist/`, then
`npm pack --pack-destination .` and renames the versioned output to a stable
`paypal-addon.tgz` -- so `examples/paypal-consumer/package.json` doesn't need
hand-updating on every version bump. Both `dist/` and `*.tgz` are gitignored
build artifacts; run this before installing `paypal-consumer`'s dependencies
(see that package's README).

## Generating this package's own contract, docs, and `.env.example`

```bash
npm run generate:env
```

`scripts/generate-manifest.mjs` runs `generateEnvManifest()` scoped to just
this package's own `root`, so `paypalSchema` is documented and browsable
(`docs/ENVIRONMENT.md`, `.env.example`) even without installing this package
into a consuming application. This is separate from
`examples/paypal-consumer`'s own `generate:env`, which discovers this same
contract a second time via the `packages` allowlist -- see that package's
README for why.
