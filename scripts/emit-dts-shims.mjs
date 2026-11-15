#!/usr/bin/env node
// Writes thin re-export shims for the .d.ts/.d.cts files of the bundled
// entry points, because tsup does not generate them here. The tsup dts pipeline
// (rollup-plugin-dts) hardcodes declarationMap: false, so it cannot produce
// declaration maps. See tsup.config.ts's `dts: false` comment and
// tsconfig.build.json. `tsc -p tsconfig.build.json` emits per-file
// declarations with working maps into dist/.dts/, mirroring src/. This
// script points each package.json #exports entry point at its file there.

import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

// Each entry: the dist/ basename tsup produces, and the dist/.dts/ subpath
// (mirroring rootDir "src") that tsc's declaration-only pass emits for it.
const ENTRIES = [
  { name: "index", dtsPath: "./.dts/runtime/index.js" },
  { name: "build", dtsPath: "./.dts/build/index.js" },
  { name: "node", dtsPath: "./.dts/node/index.js" },
  { name: "helpers", dtsPath: "./.dts/helpers/index.js" },
  { name: "evidence", dtsPath: "./.dts/evidence/index.js" },
  { name: "eslint-plugin/index", dtsPath: "../.dts/eslint-plugin/index.js" },
]

for (const { name, dtsPath } of ENTRIES) {
  const shim = `export * from "${dtsPath}";\n`
  const targetPath = path.join(root, "dist", name)
  mkdirSync(path.dirname(targetPath), { recursive: true })
  writeFileSync(`${targetPath}.d.ts`, shim, "utf8")
  writeFileSync(`${targetPath}.d.cts`, shim, "utf8")
  console.log(`[dts-shims] wrote dist/${name}.d.ts and dist/${name}.d.cts -> ${dtsPath}`)
}

// A second declaration tree for TypeScript 7 consumers (package.json's `types@>=7` export
// conditions). The build and evidence declarations name compiler-API types from `typescript`.
// TypeScript 7's package ships no compiler-API declarations. So under 7 those imports cannot be
// read without `skipLibCheck`. This copy points them at the bundled `@typescript/typescript6`,
// which every install carries. Only TypeScript 7 is served this copy. A TypeScript 5 or 6 consumer
// keeps the primary declarations, typed from its `typescript`. Two copies of `SyntaxKind` are
// distinct enums, and such a consumer passes its nodes into these entry points (ADR 0049,
// "Consequences"). Under 7 there is no second copy to clash with.
const ts7Root = path.join(root, "dist", ".dts7")
rmSync(ts7Root, { recursive: true, force: true })
cpSync(path.join(root, "dist", ".dts"), ts7Root, { recursive: true })
let rewritten = 0
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(file)
    else if (entry.name.endsWith(".d.ts")) {
      const text = readFileSync(file, "utf8")
      const next = text.replace(/from "typescript"/g, 'from "@typescript/typescript6"')
      if (next !== text) {
        writeFileSync(file, next, "utf8")
        rewritten += 1
      }
    }
  }
}
walk(ts7Root)
for (const { name, dtsPath } of ENTRIES) {
  const shim = `export * from "${dtsPath.replace("/.dts/", "/.dts7/")}";\n`
  const targetPath = path.join(root, "dist", name)
  writeFileSync(`${targetPath}.ts7.d.ts`, shim, "utf8")
  writeFileSync(`${targetPath}.ts7.d.cts`, shim, "utf8")
}
console.log(
  `[dts-shims] wrote dist/.dts7 for TypeScript 7 consumers (${String(rewritten)} declaration(s) retyped to @typescript/typescript6)`,
)
