# Validation contexts example

One schema, one generated manifest, three variables:

```
features/app/env.schema.ts
  LOG_LEVEL       <- no context: participates in every validateEnv() run
  DATABASE_URL    <- context: "server"
  PUBLIC_API_URL  <- context: "client"
src/
  generated/env.manifest.ts  <- generated, do not edit
  server.ts                   <- validates with activeContexts: ["server"]
  client.ts                   <- validates with activeContexts: ["client"]
scripts/
  generate-manifest.mjs        <- build-time only, never imported by the app
docs/
  ENVIRONMENT.md                <- generated
```

`src/server.ts` and `src/client.ts` each validate the **same** manifest, each in its own process, each with a
different `activeContexts`. This is deliberately two separate npm scripts, not one script calling
`validateEnv()` twice.

`validateEnv()` is one-shot per process by design. See the Guide's
["Validate once during startup"](../../../../../GUIDE.md#3-validate-once-during-startup) and
[ADR 0022](../../../../../specs/decisions/0022-validation-contexts.md)'s cache invariant. A real server process and
a real browser bundle are two separate processes too. So this example's structure matches how the feature is
actually meant to be used, not a shortcut that only works in a toy script.

## Run it

```bash
npm install
npm run example:server
npm run example:client
```

Both run `generate:env` first (same generated manifest either way), then boot their own entry point.

`example:server` (`activeContexts: ["server"]`):

- prints `LOG_LEVEL` (no context, so it always participates)
- prints `DATABASE_URL` (`context: "server"` matches)
- **fails to read** `PUBLIC_API_URL` (`context: "client"` did not match this run). It prints the resulting
  `EnvNotReadyError` instead of crashing, to show exactly what that failure looks like

`example:client` (`activeContexts: ["client"]`) is the mirror image: `LOG_LEVEL` and `PUBLIC_API_URL` read
fine, `DATABASE_URL` throws.

The point of this example is that a variable outside the active context is genuinely unreadable in that
process. An unvalidated variable is unreadable in the same way. Filtering alone is not the point.

## The generated `activeContexts` export

Because this schema declares contexts, `src/generated/env.manifest.ts` also exports `activeContexts`. Its
value is `["client", "server"]`, every context this manifest has:

```ts
// src/generated/env.manifest.ts (generated)
export const activeContexts = ["client", "server"];
export const manifest = [appEnv];
```

`src/server.ts`/`src/client.ts` deliberately **don't** import and use it directly. Each hand-writes its own
narrowed `activeContexts: ["server"]` / `["client"]` instead. Using the full generated export in either
script would validate every context in both processes at once. The whole point of this example (that a
variable outside the active context is genuinely unreadable) would then disappear. Treat `activeContexts` as
a convenient starting point to copy and narrow, not something to pass through unmodified in a multi-context
deployment.

## What this example is *not* demonstrating

Validation contexts control whether `validateEnv()` processes a variable, and nothing else. This example uses
one schema file for both `DATABASE_URL` and `PUBLIC_API_URL` for simplicity.

Suppose `DATABASE_URL` here were a real secret in the same schema as a client-context variable. Its
*definition* would still ship wherever that manifest is imported, including any literal `default`.
`activeContexts` filtering happens after that, at `validateEnv()` time, not before.

A real application with an actual browser bundle should keep server-only schema files out of client-bound
code, as it already would without this feature. It does that via separate discovery/generated manifests
per contract (see the Guide's
["Runtime and build-time are intentionally separate"](../../../../../GUIDE.md#runtime-and-build-time-are-intentionally-separate)
and [ADR 0004](../../../../../specs/decisions/0004-no-client-server-package-split.md)). Validation contexts
complement that boundary, for the facets *within* an already-correctly-scoped manifest (an environment tier,
a secondary entry point). They are not a replacement for it.
