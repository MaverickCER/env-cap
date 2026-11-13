// This file does not import "./src/env.ts". Next.js's next.config.ts loader
// (next/dist/build/next-config-ts/transpile-config.js) transpiles only this
// file with SWC, then `require()`s its imports as compiled JS. A TypeScript
// import fails with `Cannot find module './src/env.js'`.
//
// Two other files gate the environment instead. scripts/validate-env.ts runs
// under `tsx`, which resolves the whole TypeScript import graph; the "build"
// script in package.json runs it. instrumentation.ts's register() imports
// "./src/env.ts" and covers `next dev` and `next start`. Config loading
// happens before a server exists, so this file could not gate startup anyway.
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // env-cap's runtime keeps "has validateEnv() run yet" in module-level state
  // (src/runtime/registry.ts). Without this setting, Turbopack and webpack
  // bundle a separate copy of env-cap into each chunk: instrumentation, API
  // route and page. instrumentation.ts's validateEnv() call then marks only its own
  // copy ready, and every other chunk throws EnvNotReadyError. Removing this
  // line reproduces that failure under `next start`. `serverExternalPackages`
  // keeps the package out of server bundles, so every chunk shares one copy
  // through Node's module cache.
  serverExternalPackages: ["@maverickcer/env-cap"],
}

export default nextConfig
