// CI's `typescript-compat` job runs this after `npm run build`: it packs the package exactly as
// `npm publish` would, then, for each TypeScript major a consumer might have installed as their root
// `typescript`, installs the tarball into a scratch project and proves two things:
//
//   1. The build-time scanner (`@maverickcer/env-cap/build`) runs from BOTH its ESM and CJS entry
//      points. TypeScript 7 ships no programmatic compiler API, so under a 7 root the scanner has to
//      fall back to the bundled `@typescript/typescript6` (src/build/typescript.ts) -- the case no
//      unit test can reach, because it needs a real TypeScript 7 root in `node_modules`.
//   2. The shipped `.d.ts` files type-check in a consumer under `moduleResolution: nodenext`,
//      `strict` and full library checking (no `skipLibCheck`), every entry point but `./eslint-plugin`
//      (its declarations type themselves from the `@typescript-eslint/utils` peer, whose TypeScript
//      support applies) included. Under a 7
//      root the `types@>=7` export conditions serve `dist/.dts7`, whose compiler-API types come from
//      the bundled `@typescript/typescript6` (TypeScript 7's own package ships none); under 5 and 6 the
//      primary declarations typed from the consumer's `typescript` are served (ADR 0049).
//
// Under a 7 root it also removes the bundled compiler and asserts the readable failure, so the
// "no usable compiler" message cannot rot unseen.
//
// Usage: node scripts/typescript-compat.mjs [version ...]   (default: 5 6 7)

import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const versions = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ["5", "6", "7"]
const PACKAGE = "@maverickcer/env-cap"
const repoRoot = path.resolve(import.meta.dirname, "..")

function run(command, args, cwd, { allowFailure = false } = {}) {
  // --traceResolution under TypeScript 7 prints several MB; the 1 MiB default kills the child (exit null).
  const result = spawnSync(command, args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 })
  if (result.status !== 0 && !allowFailure) {
    process.stderr.write(result.stdout + result.stderr)
    console.error(`${command} ${args.join(" ")} failed (exit ${String(result.status)}) in ${cwd}`)
    process.exit(result.status ?? 1)
  }
  return result
}

const packDir = mkdtempSync(path.join(tmpdir(), "env-cap-pack-"))
run("npm", ["pack", "--ignore-scripts", "--pack-destination", packDir], repoRoot)
const tarball = path.join(
  packDir,
  readdirSync(packDir).find((f) => f.endsWith(".tgz")),
)

// The scanner, run from both entry formats over every committed `env.schema.ts` fixture (the example
// applications and the integration fixtures -- 23 files, from one-liners to multi-call schemas with
// documentation metadata). Each TypeScript root writes what it found, and the three outputs must be
// byte-identical: TypeScript 5, 6 and the bundled 6 under a 7 root parse the same corpus the same way.
const scanScript = `import { createRequire } from "node:module"
import { readFileSync, writeFileSync } from "node:fs"
const require = createRequire(import.meta.url)
const fixtures = JSON.parse(readFileSync("fixtures.json", "utf8"))
const esm = await import("${PACKAGE}/build")
const cjs = require("${PACKAGE}/build")
const seen = {}
for (const [label, build] of [["esm", esm], ["cjs", cjs]]) {
  const out = {}
  for (const file of Object.keys(fixtures).sort()) {
    const result = build.parseSchemaFile("/repo/" + file, fixtures[file])
    if (result.createEnvCalls.length === 0) throw new Error(label + ": no createEnv call found in " + file)
    // The raw result carries AST nodes (circular, with parents): an inline schema literal is kept as its
    // source text, an identifier reference as the plain record it already is.
    const call = (c) => ({
      schema: c.schemaRef.kind === "literal" ? { kind: "literal", text: c.schemaRef.node.getText() } : c.schemaRef,
      call: c.node.getText(),
    })
    out[file] = {
      createEnvCalls: result.createEnvCalls.map(call),
      documentEnvCalls: result.documentEnvCalls.map(call),
      localConsts: [...result.localConsts.keys()].sort(),
      exportedConstNames: [...result.exportedConstNames].sort(),
      imports: [...result.imports.entries()].sort(),
      warnings: result.warnings,
    }
  }
  seen[label] = JSON.stringify(out, null, 2)
}
if (seen.esm !== seen.cjs) throw new Error("esm and cjs scans disagree")
writeFileSync("scan-output.json", seen.esm)
console.log("scanner ok (esm + cjs) over " + Object.keys(fixtures).length + " schema files")
`

/** Every committed schema file the scanner is meant to read, outside node_modules, generated output and reference-only files. */
function schemaFixtures() {
  const out = {}
  const walk = (dir) => {
    for (const entry of readdirSync(path.join(repoRoot, dir), { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "expected" || entry.name.startsWith("."))
        continue
      const rel = path.posix.join(dir, entry.name)
      if (entry.isDirectory()) walk(rel)
      else if (entry.name === "env.schema.ts") {
        const source = readFileSync(path.join(repoRoot, rel), "utf8")
        // examples/application keeps two schema files as commented-out reference material (their
        // header says so); it declares nothing, so the scanner is right to find no call in it.
        if (!source.startsWith("// REFERENCE ONLY")) out[rel] = source
      }
    }
  }
  walk("examples")
  walk("test/integration")
  return out
}
const fixtures = schemaFixtures()
if (Object.keys(fixtures).length !== 23) {
  throw new Error(
    `expected the committed schema corpus (23 files), found ${Object.keys(fixtures).length}`,
  )
}
const scanOutputs = new Map()

// Every entry point, with the compiler-API-typed result read back so the build declarations are
// really resolved, not only imported.
const strictConsumer = `import { createEnv } from "${PACKAGE}"
import * as helpers from "${PACKAGE}/helpers"
import * as node from "${PACKAGE}/node"
import { parseSchemaFile } from "${PACKAGE}/build"
import * as evidence from "${PACKAGE}/evidence"
const result = parseSchemaFile("a.ts", "export const e = 1")
const kind: number = result.sourceFile.kind
console.log(typeof createEnv, typeof helpers, typeof node, result.createEnvCalls.length, kind, typeof evidence)
`

function tsconfig(file) {
  return JSON.stringify({
    compilerOptions: {
      module: "nodenext",
      moduleResolution: "nodenext",
      strict: true,
      noEmit: true,
      types: ["node"],
      skipLibCheck: false,
    },
    files: [file],
  })
}

try {
  for (const version of versions) {
    const dir = mkdtempSync(path.join(tmpdir(), `env-cap-tscompat-${version}-`))
    try {
      console.log(`\n== typescript@${version} as the consumer's root compiler`)
      writeFileSync(
        path.join(dir, "package.json"),
        JSON.stringify({ name: "tscompat", version: "0.0.0", type: "module" }),
      )
      // A plain install (no --legacy-peer-deps): proves the widened peer range resolves for this root.
      run(
        "npm",
        ["install", "--no-audit", "--no-fund", tarball, `typescript@${version}`, "@types/node"],
        dir,
      )

      // The consumer's ROOT compiler, by path.
      const tsc = path.join("node_modules", "typescript", "bin", "tsc")
      const rootVersion = JSON.parse(
        readFileSync(path.join(dir, "node_modules", "typescript", "package.json"), "utf8"),
      ).version
      console.log(`root typescript ${rootVersion}`)
      // Installing this package must not replace the consumer's `tsc`. The bundled TypeScript 6 ships a
      // `tsc` bin of its own; hoisted as an ordinary dependency, npm links it into `.bin` and every
      // consumer's `npx tsc` silently becomes TypeScript 6. Bundling keeps it nested and unlinked.
      const linked = run(
        "node",
        [path.join("node_modules", ".bin", "tsc"), "--version"],
        dir,
      ).stdout.trim()
      if (!linked.endsWith(rootVersion)) {
        console.error(
          `node_modules/.bin/tsc runs "${linked}", not the root typescript ${rootVersion}`,
        )
        process.exit(1)
      }
      console.log(`tsc bin is still the root compiler (${linked})`)
      mkdirSync(path.join(dir, "src"))
      writeFileSync(path.join(dir, "strict.ts"), strictConsumer)
      writeFileSync(path.join(dir, "tsconfig.strict.json"), tsconfig("strict.ts"))
      writeFileSync(path.join(dir, "scan.mjs"), scanScript)
      writeFileSync(path.join(dir, "fixtures.json"), JSON.stringify(fixtures))

      run("node", [tsc, "-p", "tsconfig.strict.json"], dir)
      console.log(
        "types ok: every entry point but ./eslint-plugin, full library check, no skipLibCheck",
      )
      // Which declaration set answered: the primary one under 5 and 6, the `types@>=7` one under 7.
      const trace = run(
        "node",
        [tsc, "-p", "tsconfig.strict.json", "--traceResolution"],
        dir,
      ).stdout
      const expected = version === "7" ? "types@>=7" : "types"
      if (!trace.includes(`Resolved under condition '${expected}'`)) {
        console.error(
          `expected the '${expected}' export condition to resolve the declarations under typescript@${version}`,
        )
        process.exit(1)
      }
      console.log(`declarations served under the '${expected}' export condition`)
      console.log(run("node", ["scan.mjs"], dir).stdout.trim())
      scanOutputs.set(version, readFileSync(path.join(dir, "scan-output.json"), "utf8"))

      if (version === "7") {
        // Bundled inside the package (bundleDependencies), not hoisted into the consumer's node_modules.
        const bundled = path.join(
          dir,
          "node_modules",
          PACKAGE,
          "node_modules",
          "@typescript",
          "typescript6",
        )
        rmSync(bundled, { recursive: true, force: true })
        const failed = run("node", ["scan.mjs"], dir, { allowFailure: true })
        if (
          failed.status === 0 ||
          !/bundled @typescript\/typescript6 could not be loaded/.test(failed.stderr)
        ) {
          process.stderr.write(failed.stdout + failed.stderr)
          console.error(
            "expected the readable 'no usable compiler' error with the bundled compiler removed",
          )
          process.exit(1)
        }
        console.log("stripped bundled compiler fails with the documented message")
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
  // The same corpus, the same result, whichever TypeScript parsed it.
  const [first, ...rest] = [...scanOutputs.entries()]
  for (const [version, output] of rest) {
    if (output !== first[1]) {
      console.error(
        `scanner output under typescript@${version} differs from typescript@${first[0]}`,
      )
      process.exit(1)
    }
  }
  console.log(
    `scanner output identical across typescript ${[...scanOutputs.keys()].join(", ")} for ${Object.keys(fixtures).length} schema files`,
  )
  console.log(`\nTypeScript compat check passed for typescript ${versions.join(", ")}.`)
} finally {
  rmSync(packDir, { recursive: true, force: true })
}
