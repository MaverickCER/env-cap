import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import vm from "node:vm"
import { buildSync } from "esbuild"
import { describe, expect, it } from "vitest"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const manifest = JSON.parse(readFileSync(path.join(root, "package.json")).toString()) as {
  exports: Record<string, { import: { default: string } }>
}

// The entry points "@maverickcer/env-cap" says run in a browser or an edge runtime: each must bundle for the browser
// platform with nothing from Node, or the claim is false for the first person who tries it.
const ISOMORPHIC = [".", "./helpers", "./evidence"]
const built = existsSync(path.join(root, "dist"))

describe.skipIf(!built)(
  "the isomorphic entry points, bundled for a browser (requires `npm run build`)",
  () => {
    it.each(ISOMORPHIC)(
      "%s bundles for the browser without Node's modules or globals",
      (subpath) => {
        const entry = manifest.exports[subpath]?.import.default
        if (entry === undefined) throw new Error(`package.json has no import entry for ${subpath}`)
        const result = buildSync({
          entryPoints: [path.join(root, entry)],
          bundle: true,
          platform: "browser",
          format: "esm",
          write: false,
          logLevel: "silent",
        })
        const code = result.outputFiles[0]?.text ?? ""
        expect(code.length).toBeGreaterThan(0)
        expect(code).not.toMatch(/node:|require\("(?:fs|path|os|child_process)"\)/)
        expect(code).not.toMatch(/\bprocess\./)
        // `processors.base64()` returns a Node Buffer, and the guide says so: that one use is the only one.
        expect(code.match(/\bBuffer\./g) ?? []).toHaveLength(subpath === "./helpers" ? 1 : 0)
      },
    )

    /**
     * Bundling proves what the code imports; running it proves what it reaches at run time. Each
     * client bundle is executed inside a V8 context that has only the Web globals an edge runtime
     * guarantees (no `process`, `Buffer`, `require`, `setImmediate`), as an IIFE whose exports are
     * read back, and the real entry points are called. `processors.base64()` is left out on purpose:
     * it needs `Buffer`, and the guide says so.
     */
    const WEB_GLOBALS = () => ({
      console,
      TextEncoder,
      TextDecoder,
      URL,
      URLSearchParams,
      atob,
      btoa,
      structuredClone,
      Date,
      Math,
      JSON,
      Promise,
      Error,
      TypeError,
      RangeError,
      Object,
      Array,
      Map,
      Set,
      Symbol,
      Reflect,
      Proxy,
      WeakMap,
      WeakSet,
      Number,
      String,
      Boolean,
      RegExp,
      BigInt,
      queueMicrotask,
    })

    function runInWebContext(subpath: string): Record<string, unknown> {
      const entry = manifest.exports[subpath]?.import.default
      if (entry === undefined) throw new Error(`package.json has no import entry for ${subpath}`)
      const result = buildSync({
        entryPoints: [path.join(root, entry)],
        bundle: true,
        platform: "browser",
        format: "iife",
        globalName: "__entry",
        write: false,
        logLevel: "silent",
      })
      const code = result.outputFiles[0]?.text ?? ""
      const context = vm.createContext(WEB_GLOBALS())
      vm.runInContext(code, context, { filename: `${subpath}.iife.js` })
      return vm.runInContext("__entry", context) as Record<string, unknown>
    }

    it(". runs under Web globals only: a contract is created, validated and redacts itself", async () => {
      const entry = runInWebContext(".") as {
        createEnv: (schema: unknown, options: { name: string }) => unknown
        validateEnv: (input: {
          values: Record<string, string>
          manifest: unknown[]
        }) => Promise<unknown>
        resetEnvCache: () => void
      }
      entry.resetEnvCache()
      const env = entry.createEnv(
        { PORT: { processor: (v: unknown) => Number(v) }, SECRET: {} },
        { name: "vm" },
      )
      await entry.validateEnv({ values: { PORT: "8080", SECRET: "do-not-print" }, manifest: [env] })
      expect(String(env)).not.toContain("do-not-print")
      expect(String(env)).toContain("vm")
    })

    it("./helpers runs under Web globals only (base64 excepted, as documented)", () => {
      const entry = runInWebContext("./helpers") as {
        processors: Record<string, (...args: unknown[]) => (value: unknown) => unknown>
        validators: Record<
          string,
          (...args: unknown[]) => (value: unknown, raw: unknown) => unknown
        >
      }
      expect(entry.processors["toNumber"]?.()("8080")).toBe(8080)
      expect(entry.processors["toBoolean"]?.()("true")).toBe(true)
      expect(entry.validators["range"]?.(1, 65535)(1024, {})).toBe(true)
    })

    it("./evidence runs under Web globals only: a projection computes and records its sources", () => {
      const entry = runInWebContext("./evidence") as {
        defineEvidenceProjection: (schema: Record<string, (e: never) => unknown>) => {
          project: (e: unknown) => {
            value: Record<string, unknown>
            sources: Record<string, string[]>
          }
        }
      }
      const projection = entry.defineEvidenceProjection({
        count: (e: { finding: { findings: unknown[] } }) => e.finding.findings.length,
      })
      const result = projection.project({ schemaVersion: 1, finding: { findings: [] } })
      expect(result.value["count"]).toBe(0)
      expect(result.sources["count"]).toContain("finding.findings")
    })
  },
)
