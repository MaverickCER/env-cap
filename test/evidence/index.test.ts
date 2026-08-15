import { existsSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import * as evidenceEntryPoint from "../../src/evidence/index.js"

// Nothing else imports src/evidence/index.ts directly -- every other test in
// this directory imports define-projection.ts's individual exports -- so
// without this test the barrel's re-export statement never actually
// executes and it shows as 0% covered, mirroring test/build/index.test.ts
// and test/eslint-plugin/index.test.ts's own header comments.
describe("env-cap/evidence entry point", () => {
  it("re-exports defineEvidenceProjection", () => {
    expect(evidenceEntryPoint.defineEvidenceProjection).toBeTypeOf("function")
  })
})

const here = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(here, "../..")
const cjsDist = path.resolve(projectRoot, "dist/evidence.cjs")
const distMissing = !existsSync(cjsDist)

describe.skipIf(distMissing)(
  "env-cap/evidence entry point: CJS require() interop (requires `npm run build`)",
  () => {
    // Unlike src/eslint-plugin/index.ts (ADR 0017), this entry point has
    // only named exports, so it needs none of
    // scripts/fix-eslint-plugin-cjs-interop.mjs's postprocessing -- esbuild's
    // ordinary CJS output already resolves named exports correctly.
    it("require() resolves defineEvidenceProjection directly", () => {
      const require = createRequire(import.meta.url)
      const required = require(cjsDist) as typeof evidenceEntryPoint
      expect(required.defineEvidenceProjection).toBeTypeOf("function")
    })
  },
)
