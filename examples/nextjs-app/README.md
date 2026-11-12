# Next.js example

A minimal todo app with a real `NEXT_PUBLIC_*` client variable and server-only variables, using only env-cap's published API.

It is not a fourth flagship. The [flagships](../README.md) grow one Node app from a project to an organization. This example shows the fail-fast contract inside a framework, where bundling and several execution phases make "validate once, read anywhere" harder.

```text
src/
  env.ts                        the one module that calls validateEnv()
  instrumentation.ts            Next.js's startup hook; imports env.ts
  features/todos/
    env.server.schema.ts        DATABASE_URL, SESSION_SECRET, INTERNAL_API_KEY
    env.public.schema.ts        NEXT_PUBLIC_APP_NAME
  lib/session.ts, lib/store.ts  "server-only" modules
  app/page.tsx                  server component, force-dynamic, reads publicEnv
  app/todo-app.tsx              "use client"; receives appName as a prop
  app/api/todos/route.ts        imports "@/env" first
  generated/env.manifest.ts     generated, do not edit
scripts/
  validate-env.ts               the gate that runs before next build
  generate-docs/run.ts          writes ENVIRONMENT.md, OWNERSHIP.md and .env.example
```

## Run it

Build the repository root first ([examples/README.md](../README.md#before-you-run-one)). The committed `.env` holds placeholder values; put real ones in `.env.local` if you prefer.

| Step | Command         | Exit code          | Line of output to look for                                                       |
| ---- | --------------- | ------------------ | -------------------------------------------------------------------------------- |
| 1    | `npm install`   | `0`                | none                                                                             |
| 2    | `npm run build` | `0`                | ``[validate-env] Environment contract satisfied -- proceeding to `next build`.`` |
| 3    | `npm start`     | runs until stopped | none; open the printed URL                                                       |

CI's `examples` job runs step 2 only. That job does not yet block a merge, and nothing in CI runs `next start` or sends a request.

`npm run build` runs, in order:

1. `docs:reports`: the CLI writes the manifest and `docs/env.evidence.json`, then `scripts/generate-docs/run.ts` writes the Markdown reports ([ADR 0046](../../specs/decisions/0046-cli-restricted-to-runtime-and-evidence-output.md)).
2. `scripts/validate-env.ts`: runs `src/env.ts` through `tsx`, after loading `.env` files with Next.js's `loadEnvConfig`.
3. `next build`, only if step 2 passed.

## Try a failure

Break `SESSION_SECRET` in `.env.local` and run `npm run build`. Expect a non-zero exit and env-cap's `EnvValidationError`, with `next build` never started. CI does not run this step.

## The client and server boundary

- `DATABASE_URL`, `SESSION_SECRET` and `INTERNAL_API_KEY` are read only in `session.ts`, `store.ts` and `route.ts`. Each imports [`server-only`](https://www.npmjs.com/package/server-only), so pulling one into a client bundle is a build error.
- `NEXT_PUBLIC_APP_NAME` is read once on the server in `page.tsx`. It reaches the client component `<TodoApp>` as a prop; the client component never imports env-cap.

## Why validation is imported in every route

env-cap records "validateEnv() has run" in module state. Turbopack splits this app into several chunks, and each chunk can get its own copy of that state. Validating in `instrumentation.ts` alone therefore does not mark `route.ts`'s copy as ready.

The example handles this in three places:

1. `route.ts` and `page.tsx` import `"@/env"` on their first line. Validation then runs inside the same bundle as the read; after the first run it returns the cached result.
2. `next.config.ts` lists env-cap in `serverExternalPackages`, so that Node's module cache serves one copy.
3. `page.tsx` sets `export const dynamic = "force-dynamic"`. Static generation runs in a worker that never calls `register()`, so a prerendered page would throw `EnvNotReadyError`.

## Out of scope

Multi-user auth, a real database and CSRF protection are out of scope. The single demo user and the admin route's `x-internal-api-key` header exist to give `SESSION_SECRET` and `INTERNAL_API_KEY` a reason to exist.
