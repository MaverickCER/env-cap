import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { readToolVersion } from "../../src/build/tool-version.js"

// Since ADR 0040, `readToolVersion()` returns the build-time constant
// `__PACKAGE_VERSION__` -- `tsup`/vitest substitute it from `package.json`
// at bundle/test time, so `./build` never reads its own manifest from disk.
describe("readToolVersion", () => {
  const declaredVersion: string = (
    JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
      version: string
    }
  ).version

  it("returns the package's own declared version, substituted at build time", () => {
    expect(readToolVersion()).toBe(declaredVersion)
  })

  it("returns a non-empty semver-shaped string", () => {
    expect(readToolVersion()).toMatch(/^\d+\.\d+\.\d+/)
  })

  it("is a pure constant -- every call returns the same value, no I/O", () => {
    expect(readToolVersion()).toBe(readToolVersion())
  })
})
