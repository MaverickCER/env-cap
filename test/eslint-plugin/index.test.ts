import { existsSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import envCapPlugin, { noNodeFs, noRawProcessEnv } from "../../src/eslint-plugin/index.js"

// Only test/eslint-plugin/no-raw-process-env.ts imports the rule module
// directly -- nothing imports this barrel (`src/eslint-plugin/index.ts`)
// itself, the actual `env-cap/eslint-plugin` entry point a
// consumer's flat config imports (see ADR 0017) -- so it shows as 0%
// covered without this test.
describe("env-cap/eslint-plugin entry point", () => {
  it("exports a flat-config-shaped plugin object with every rule", () => {
    expect(envCapPlugin).toEqual({
      rules: { "no-raw-process-env": noRawProcessEnv, "no-node-fs": noNodeFs },
    })
  })

  it("also re-exports each rule by name for direct consumption", () => {
    expect(noRawProcessEnv).toBeTypeOf("object")
    expect(noRawProcessEnv.meta.docs?.description).toContain("process.env")
    expect(noNodeFs).toBeTypeOf("object")
    expect(noNodeFs.meta.docs?.description).toContain("node:fs")
  })
})

const here = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(here, "../..")
const cjsDist = path.resolve(projectRoot, "dist/eslint-plugin/index.cjs")
const distMissing = !existsSync(cjsDist)

describe.skipIf(distMissing)(
  "env-cap/eslint-plugin entry point: CJS require() interop (requires `npm run build`)",
  () => {
    // src/eslint-plugin/index.ts has both a default export and a named
    // export (`noRawProcessEnv`) -- esbuild's plain CJS output for that
    // shape is `{ default: plugin, noRawProcessEnv }`, which would silently
    // break a `require("env-cap/eslint-plugin")` consumer
    // (e.g. an `eslint.config.cjs`) expecting the plugin object itself, the
    // same way `import envCapPlugin from "..."` already resolves it for ESM
    // consumers. See scripts/fix-eslint-plugin-cjs-interop.mjs.
    it("require() resolves directly to the plugin object, not { default: plugin }", () => {
      const require = createRequire(import.meta.url)
      const required = require(cjsDist) as typeof envCapPlugin & {
        noRawProcessEnv: typeof noRawProcessEnv
      }
      expect(required.rules["no-raw-process-env"]).toBeTypeOf("object")
      expect(required.noRawProcessEnv).toBeTypeOf("object")
    })
  },
)
