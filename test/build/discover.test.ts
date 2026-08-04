import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { discoverSchemaFiles } from "../../src/build/discover.js"

let root: string

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "env-cap-discover-test-"))
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

async function touch(relativePath: string): Promise<void> {
  const filePath = path.join(root, relativePath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, "// fixture\n", "utf8")
}

describe("discoverSchemaFiles", () => {
  it("finds nested files matching the default include pattern", async () => {
    await touch("features/payments/env.schema.ts")
    await touch("packages/database/env.schema.ts")
    await touch("features/payments/index.ts") // not a schema file, should be ignored

    const files = await discoverSchemaFiles({ root, include: ["**/env.schema.ts"], exclude: [] })

    expect(files).toHaveLength(2)
    expect(files.every((f) => f.endsWith("env.schema.ts"))).toBe(true)
  })

  it("matches a root-level file with a leading ** pattern (zero path segments)", async () => {
    await touch("env.schema.ts")

    const files = await discoverSchemaFiles({ root, include: ["**/env.schema.ts"], exclude: [] })

    expect(files).toHaveLength(1)
  })

  it("returns results in deterministic, sorted order regardless of creation order", async () => {
    await touch("z-feature/env.schema.ts")
    await touch("a-feature/env.schema.ts")
    await touch("m-feature/env.schema.ts")

    const files = await discoverSchemaFiles({ root, include: ["**/env.schema.ts"], exclude: [] })
    const sorted = [...files].sort()

    expect(files).toEqual(sorted)
  })

  it("sorts a larger, non-monotonic set of names correctly in both directions", async () => {
    // A wider, scrambled spread than the 3-entry test above, so the
    // comparator's a<b and a>b branches are both exercised regardless of
    // however few pairwise comparisons the sort implementation happens to
    // make for a small array.
    for (const name of ["mango", "zebra", "apple", "kiwi", "banana", "fig", "date"]) {
      await touch(`${name}/env.schema.ts`)
    }

    const files = await discoverSchemaFiles({ root, include: ["**/env.schema.ts"], exclude: [] })

    expect(files).toEqual([...files].sort())
    expect(files.map((f) => path.basename(path.dirname(f)))).toEqual([
      "apple",
      "banana",
      "date",
      "fig",
      "kiwi",
      "mango",
      "zebra",
    ])
  })

  it("always prunes node_modules and .git during the walk, even without an explicit exclude", async () => {
    await touch("features/payments/env.schema.ts")
    await touch("node_modules/some-package/env.schema.ts")
    await touch(".git/env.schema.ts")

    const files = await discoverSchemaFiles({ root, include: ["**/env.schema.ts"], exclude: [] })

    expect(files).toHaveLength(1)
    expect(files[0]).toContain("payments")
  })

  it("honors a root-level node_modules exclude pattern (the common real-world case)", async () => {
    await touch("features/payments/env.schema.ts")
    await touch("node_modules/some-package/nested/env.schema.ts")

    const files = await discoverSchemaFiles({
      root,
      include: ["**/env.schema.ts"],
      exclude: ["**/node_modules/**"],
    })

    expect(files).toHaveLength(1)
  })

  it("respects custom exclude patterns", async () => {
    await touch("features/payments/env.schema.ts")
    await touch("features/experimental/env.schema.ts")

    const files = await discoverSchemaFiles({
      root,
      include: ["**/env.schema.ts"],
      exclude: ["**/experimental/**"],
    })

    expect(files).toHaveLength(1)
    expect(files[0]).toContain("payments")
  })

  it("sorts by full relative path, not just directory-walk order -- a '-' sibling can sort before a directory whose name it's a prefix of", async () => {
    // readdir returns entries already alphabetized by bare name on this
    // filesystem ("database" < "database-legacy"), so the walk visits
    // "database/" before "database-legacy/" and would append their contents
    // in that same order -- but "-" (0x2D) sorts *before* "/" (0x2F), so as
    // full relative paths "database-legacy/env.schema.ts" actually precedes
    // "database/env.schema.ts". Only a real string sort on the final list
    // (not walk order) gets this right.
    await touch("database/env.schema.ts")
    await touch("database-legacy/env.schema.ts")

    const files = await discoverSchemaFiles({ root, include: ["**/env.schema.ts"], exclude: [] })

    expect(files.map((f) => path.basename(path.dirname(f)))).toEqual([
      "database-legacy",
      "database",
    ])
  })

  it("returns an empty array when nothing matches", async () => {
    await touch("features/payments/index.ts")
    const files = await discoverSchemaFiles({ root, include: ["**/env.schema.ts"], exclude: [] })
    expect(files).toEqual([])
  })

  it("does not recurse into (or hang on) a directory symlink, including a self-referential cycle", async () => {
    await touch("features/payments/env.schema.ts")
    await fs.mkdir(path.join(root, "cyclic"))
    await fs.symlink(path.join(root, "cyclic"), path.join(root, "cyclic/self"), "dir")

    const files = await discoverSchemaFiles({ root, include: ["**/env.schema.ts"], exclude: [] })

    expect(files).toHaveLength(1)
    expect(files[0]).toContain("payments")
  }, 5000)
})
