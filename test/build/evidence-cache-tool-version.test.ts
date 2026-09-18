import { nodeBuildFs } from "../support/build-filesystem.js"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const toolVersionState = { current: "1.0.0" }
vi.mock("../../src/build/tool-version.js", () => ({
  readToolVersion: () => toolVersionState.current,
}))

describe("computeSourceFingerprint depends on readToolVersion", () => {
  let root: string

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "env-cap-evidence-cache-tool-version-"))
    await fs.mkdir(path.join(root, "features"), { recursive: true })
    await fs.writeFile(
      path.join(root, "features/env.schema.ts"),
      `export const appEnv = createEnv({}, { name: "app" });\n`,
      "utf8",
    )
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
    toolVersionState.current = "1.0.0"
  })

  it("changes when readToolVersion() changes, for the exact same source tree", async () => {
    const { computeSourceFingerprint } = await import("../../src/build/evidence-cache.js")
    const options = {
      fs: nodeBuildFs,
      root,
      include: ["**/env.schema.ts"],
      exclude: [],
      packages: [],
    }

    toolVersionState.current = "1.0.0"
    const first = await computeSourceFingerprint(options)

    toolVersionState.current = "2.0.0"
    const second = await computeSourceFingerprint(options)

    expect(second).not.toBe(first)
  })
})
