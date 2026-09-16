// The real `next build`-time gate (see next.config.ts's comment for why the
// validation can't live there instead). Run via `tsx` -- unlike Next's own
// next.config.ts loader, tsx resolves the whole TypeScript import graph
// (env.ts -> features/todos/env.*.schema.ts -> generated/env.manifest.ts),
// so this genuinely exercises the same validateEnv() call instrumentation.ts
// uses for the dev/start server-startup path. `loadEnvConfig` is Next.js's
// own officially exported utility for reusing its .env.local/.env loading
// order outside of Next's own process -- without it, `process.env` here
// would be missing whatever this project keeps in .env.local.
// Default-import + destructure, not a named import: `@next/env` is CJS and
// its named-export shape isn't statically analyzable by every ESM interop
// shim (confirmed empirically -- `import { loadEnvConfig } from "@next/env"`
// throws `does not provide an export named 'loadEnvConfig'` under tsx even
// though the export is genuinely there at runtime).
import nextEnv from "@next/env"

const { loadEnvConfig } = nextEnv

loadEnvConfig(process.cwd())

await import("../src/env.js")

console.log("[validate-env] Environment contract satisfied -- proceeding to `next build`.")
