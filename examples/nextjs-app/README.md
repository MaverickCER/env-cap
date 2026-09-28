# Next.js example

A deliberately minimal todo app demonstrating a real `NEXT_PUBLIC_*` (client)
vs. server-only environment variable boundary, using only `env-cap`'s
published API — never a private `src/` import.

Unlike the [three flagship examples](../README.md) (which grow one plain
Node/TypeScript app from an individual developer's project to an
organization's), this is a framework-integration example: the point isn't
capability-owned contracts at scale, it's proving `env-cap`'s fail-fast
contract mechanism actually works inside a real Next.js build/request
lifecycle, where module bundling and multiple execution phases (build-time
static generation, server startup, per-request handling) make "validate once,
read anywhere" meaningfully harder to get right than in a single-process Node
script.

```
src/
  env.ts                        <- the one explicit module: await validateEnv(...)
  instrumentation.ts            <- Next.js's official startup hook, imports env.ts
  features/todos/
    env.server.schema.ts        <- DATABASE_URL, SESSION_SECRET, INTERNAL_API_KEY
    env.public.schema.ts        <- NEXT_PUBLIC_APP_NAME
  lib/
    session.ts                  <- "server-only"; signs/verifies the demo session cookie
    store.ts                    <- "server-only"; in-memory todo store
  app/
    page.tsx                    <- server component; force-dynamic; reads publicEnv
    todo-app.tsx                <- "use client"; receives appName as a prop, never reads env-cap itself
    api/todos/route.ts          <- GET/POST/PATCH/DELETE; imports "@/env" first
  generated/
    env.manifest.ts             <- generated, do not edit
docs/
  ENVIRONMENT.md                <- generated
  OWNERSHIP.md                  <- generated
  env.evidence.json             <- generated, the full EvidenceModel
scripts/
  validate-env.ts                <- the real `next build`-time gate (see below)
next.config.ts
```

## The client/server boundary

`env.server.schema.ts`'s `DATABASE_URL`/`SESSION_SECRET`/`INTERNAL_API_KEY`
are read only from `session.ts`, `store.ts`, and `route.ts` — each of which
imports [`"server-only"`](https://www.npmjs.com/package/server-only) (Next's
own official convention), which throws a real build error the moment any of
those modules is pulled into a client bundle. `env.public.schema.ts`'s
`NEXT_PUBLIC_APP_NAME` carries no such marker: it's read once, server-side, in
`page.tsx`, and passed down to the `"use client"` `<TodoApp>` as a plain
prop — the client component never imports `env-cap` itself.

## The fail-fast build mechanism, and what it actually took

`src/env.ts` is the single explicit module every validation path shares:

```ts
import { validateEnv } from "env-cap"
import { manifest } from "./generated/env.manifest"

await validateEnv({ values: process.env, manifest })
```

An invalid or missing variable makes `npm run build` fail **before `next
build` even starts** — verified directly, not assumed: `scripts/validate-env.ts`
runs this module via `tsx` (which resolves the whole TypeScript import graph;
Next's own `next.config.ts` loader, confirmed empirically, does not) as an
explicit step before `next build` in the `build` npm script. Break
`SESSION_SECRET` in `.env.local` and `npm run build` exits non-zero with
`env-cap`'s own validation error, having never invoked `next build` at all.

Getting the *success* path right took more than that one script, for a
reason worth documenting rather than hiding: `env-cap`'s runtime tracks
"has `validateEnv()` run yet" in module-level state, and Turbopack code-splits
this app into several chunks (the `instrumentation.ts` chunk, the
`/api/todos` route chunk, the `/` page chunk) — each getting its own bundled
copy of that state. Validating once in `instrumentation.ts` does not make
`route.ts`'s separately-bundled copy of `env-cap` "ready" (confirmed by
hitting `EnvNotReadyError` under `next start` before this was fixed). Two
things fix it together:

- `next.config.ts` sets `serverExternalPackages: ["env-cap"]`, so every chunk
  resolves the same `require("env-cap")` through Node's module cache instead
  of a separately bundled copy.
- `route.ts` and `page.tsx` each import `"@/env"` (the same module
  `instrumentation.ts` imports) as their own first line — cheap and
  idempotent once already valid, and it guarantees validation happens inside
  the *same* bundle as the read, regardless of how the bundler splits chunks.

`page.tsx` also sets `export const dynamic = "force-dynamic"`: build-time
static generation runs in a worker that never calls `instrumentation.ts`'s
`register()` at all, so a statically prerendered page would hit
`EnvNotReadyError` no matter what. Forcing dynamic rendering defers every
read to real request time.

## Run it

```bash
npm install
cp .env.example .env.local
# fill in real values, e.g.:
#   DATABASE_URL=postgres://demo:demo@localhost:5432/todos
#   SESSION_SECRET=$(openssl rand -base64 32)
#   INTERNAL_API_KEY=some-non-empty-string
npm run build
npm start
```

`npm run build` runs `docs` (regenerating `src/generated/env.manifest.ts` and
`docs/`), then `scripts/validate-env.ts`, then `next build` — in that order,
so a broken contract never reaches Next's own build step. `npm run dev` skips
the explicit pre-build gate (`instrumentation.ts` covers the dev server
startup path instead) but still regenerates `docs/` first.

## What's out of scope

Multi-user auth, a real database, and CSRF protection are all deliberately
out of scope — this example exists to prove the environment-variable
boundary, not to be a production todo app. The single demo user
(`demo-user`) and the admin `DELETE` route's shared-secret header
(`x-internal-api-key`) are the minimum needed to give `SESSION_SECRET` and
`INTERNAL_API_KEY` a real, distinct reason to exist.
