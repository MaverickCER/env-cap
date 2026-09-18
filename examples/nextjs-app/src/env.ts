// The single explicit module `next.config.ts` and `instrumentation.ts` both
// import. Validating here -- and only here -- means an invalid or missing
// environment variable fails `next build`/`next dev` itself, before any
// client bundle compiles and before any route handler runs, rather than
// surfacing as a runtime crash the first time a page happens to read
// `process.env`.
import { validateEnv } from "env-cap"
// Extensionless -- see instrumentation.ts's comment: Turbopack's resolver
// doesn't map a literal ".js" specifier back to this ".ts" source file the
// way tsc's own "moduleResolution: bundler" or tsx's loader do.
import { manifest } from "./generated/env.manifest"

await validateEnv({
  values: process.env,
  manifest,
})
