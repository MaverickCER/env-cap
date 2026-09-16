// Deliberately does NOT import "./src/env.ts" here. Verified empirically
// (not assumed): Next.js's next.config.ts loader (next/dist/build/next-
// config-ts/transpile-config.js) transpiles only this one file via SWC, then
// `require()`s whatever it imports as plain, already-compiled JS -- it does
// not transpile a further TypeScript import graph. Attempting it fails with
// `Cannot find module './src/env.js'` even though the .ts source is right
// there. scripts/validate-env.ts (run via `tsx`, which -- unlike Next's
// config loader -- resolves the whole TS import graph) is the real
// build-time gate instead; see the "build" script in package.json and that
// file's own comment. instrumentation.ts's register() (which does import
// "./src/env.ts") covers the `next dev`/`next start` server-startup path,
// which next.config.ts's own load can't gate either way -- config loading
// happens before a server instance exists.
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // env-cap's runtime tracks "has validateEnv() run yet" in module-level
  // state (src/runtime/registry.ts). Without this, Turbopack/webpack code-
  // splits `env-cap` into a separate bundled copy per chunk (the
  // instrumentation chunk, the API route chunk, the page/SSR chunk), each
  // getting its OWN independent copy of that state -- so
  // instrumentation.ts's validateEnv() call marks ITS copy's contracts
  // ready while every other chunk's copy still throws EnvNotReadyError.
  // Confirmed empirically: removing this line reproduces exactly that
  // failure under `next start`. `serverExternalPackages` opts a package out
  // of bundling entirely for server code, so every chunk resolves the same
  // `require("env-cap")` through Node's own module cache instead -- a real
  // singleton again, the same guarantee a plain Node script already gets for
  // free.
  serverExternalPackages: ["env-cap"],
}

export default nextConfig
