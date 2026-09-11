/**
 * The dual-package hazard: if a consumer's dependency tree resolves
 * `env-cap` through two different specifiers -- one importer
 * getting the ESM build, one `require()`r getting the CJS build (a mixed
 * ESM/CJS dependency graph, or a re-exporting intermediate package) -- Node
 * loads two entirely separate module instances. The runtime keeps
 * identity-sensitive state in module scope: `registry.ts`'s private
 * `WeakMap` associating a contract with its schema, and `cache.ts`'s
 * validation cache. Each instance gets its own.
 *
 * No npm package shipping both ESM and CJS builds can prevent this -- it's a
 * property of how Node's two module systems resolve independently. This test
 * pins the ACTUAL, understood consequence (ADR 0041): fail-fast, not silent.
 * A contract created by one instance and handed to the other's
 * `validateEnv()`/`resetEnvCache()` is rejected with a `TypeError`, and
 * `isEnvContract()` returns `false` -- it never validates against the wrong
 * schema or reads a stale cache silently. See SECURITY.md#dual-package-hazard.
 *
 * Requires `npm run build` to have produced dist/index.{js,cjs}; skips
 * gracefully otherwise, matching test/helpers/tree-shaking.test.ts's
 * convention.
 */
import { describe, expect, it } from "vitest"
import { createRequire } from "node:module"
import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import type { createEnv, isEnvContract, validateEnv } from "../../src/runtime/index.js"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const esmEntry = path.join(root, "dist/index.js")
const cjsEntry = path.join(root, "dist/index.cjs")
const distMissing = !existsSync(esmEntry) || !existsSync(cjsEntry)

interface RuntimeModule {
  readonly createEnv: typeof createEnv
  readonly validateEnv: typeof validateEnv
  readonly isEnvContract: typeof isEnvContract
}

async function loadEsm(): Promise<RuntimeModule> {
  return (await import(pathToFileURL(esmEntry).href)) as RuntimeModule
}

function loadCjs(): RuntimeModule {
  const require = createRequire(import.meta.url)
  return require(cjsEntry) as RuntimeModule
}

describe.skipIf(distMissing)(
  "dual-package hazard -- runtime registry/cache (requires `npm run build`)",
  () => {
    it("the same resolution path always yields the same module instance -- no hazard within one module graph", async () => {
      const a = await loadEsm()
      const b = await loadEsm()
      expect(a.createEnv).toBe(b.createEnv)
    })

    it("ESM and CJS builds load different module instances -- the documented hazard itself", async () => {
      const esm = await loadEsm()
      const cjs = loadCjs()
      expect(esm.createEnv).not.toBe(cjs.createEnv)
    })

    it("each instance recognizes its own contracts", async () => {
      const esm = await loadEsm()
      const cjs = loadCjs()
      const esmContract = esm.createEnv({ A: { processor: (v) => String(v) } }, { name: "own-esm" })
      const cjsContract = cjs.createEnv({ A: { processor: (v) => String(v) } }, { name: "own-cjs" })
      expect(esm.isEnvContract(esmContract)).toBe(true)
      expect(cjs.isEnvContract(cjsContract)).toBe(true)
    })

    it("fails fast across the hazard boundary: a foreign contract is not recognized, never misvalidated", async () => {
      const esm = await loadEsm()
      const cjs = loadCjs()
      const esmContract = esm.createEnv({ A: { processor: (v) => String(v) } }, { name: "cross" })

      expect(cjs.isEnvContract(esmContract)).toBe(false)
      expect(esm.isEnvContract(esmContract)).toBe(true)
      await expect(
        cjs.validateEnv({ values: { A: "1" }, manifest: [esmContract] }),
      ).rejects.toThrow(TypeError)
    })

    it("each instance still validates its own contracts correctly under the hazard", async () => {
      const esm = await loadEsm()
      const cjs = loadCjs()
      const esmContract = esm.createEnv(
        { A: { processor: (v) => String(v) } },
        { name: "degrade-esm" },
      )
      const cjsContract = cjs.createEnv(
        { A: { processor: (v) => String(v) } },
        { name: "degrade-cjs" },
      )

      await esm.validateEnv({ values: { A: "esm" }, manifest: [esmContract] })
      await cjs.validateEnv({ values: { A: "cjs" }, manifest: [cjsContract] })

      expect(esmContract.A).toBe("esm")
      expect(cjsContract.A).toBe("cjs")
    })
  },
)
