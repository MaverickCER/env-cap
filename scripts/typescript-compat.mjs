// CI's `typescript-compat` job runs this after `npm run build`. It packs the package exactly as
// `npm publish` would. The TypeScript releases come from the `typescript` peer range in package.json
// (`peerRangeBoundaries` in scripts/peer-range-versions.mjs): the lowest release of each major the range
// admits, and the newest. For each one as a consumer's root `typescript`, it installs the tarball into a
// scratch project and proves two things:
//
//   1. The build-time scanner (`@maverickcer/env-cap/build`) runs from BOTH its ESM and CJS entry
//      points. TypeScript 7 ships no programmatic compiler API. So under a 7 root the scanner falls
//      back to the bundled `@typescript/typescript6` (src/build/typescript.ts). No unit test can
//      reach that case, because it needs a real TypeScript 7 root in `node_modules`.
//   2. The shipped declarations type-check in an ES module consumer and in a CommonJS consumer, under
//      `moduleResolution: nodenext`, `strict` and full library checking (no `skipLibCheck`). That covers
//      every entry point but `./eslint-plugin`, whose declarations take their types from the
//      `@typescript-eslint/utils` peer. Under a 7 root the `types@>=7` export conditions serve `dist/.dts7`.
//      Its compiler-API types come from the bundled `@typescript/typescript6`, since TypeScript 7's package
//      ships none. Under 5 and 6 the primary declarations, typed from the consumer's `typescript`, are
//      served (ADR 0049).
//
// The CommonJS consumer sets the floor at 5.8. Each `dist/*.d.cts` re-exports ES module declarations. Under
// 5.0 to 5.7 that fails with TS1479; 5.8 is the first release to allow it under `nodenext`.
//
// Under a 7 root it also removes the bundled compiler and asserts the readable failure, so the
// "no usable compiler" message cannot rot unseen.
//
// Usage: node scripts/typescript-compat.mjs [version ...]   (default: derived from package.json)
// A full version installs the lowest release at or above it in its major; a bare major, the newest.

import { spawnSync } from "node:child_process"
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { nodeTypesFor, peerRangeBoundaries, sortReleases } from "./peer-range-versions.mjs"

const repoRoot = path.resolve(import.meta.dirname, "..")
const manifest = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"))
const PACKAGE = manifest.name
const specs =
  process.argv.slice(2).length > 0
    ? process.argv.slice(2)
    : peerRangeBoundaries(manifest.peerDependencies.typescript)

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

/**
 * The exact release one specifier stands for. TypeScript never publishes `X.Y.0`, so a floor such as
 * `5.8.0` installs the lowest release at or above it in that major (5.8.2).
 */
function release(spec) {
  const range = spec.includes(".") ? `^${spec}` : spec
  const found = sortReleases(
    JSON.parse(run("npm", ["view", `typescript@${range}`, "version", "--json"], repoRoot).stdout),
  )
  return spec.includes(".") ? found[0] : found.at(-1)
}

// Each release once, with the @types/node its specifier calls for. A floor and a newest release can coincide.
const targets = [
  ...new Map(
    specs.map((spec) => [
      release(spec),
      { spec, nodeTypes: nodeTypesFor(spec, manifest.engines.node) },
    ]),
  ),
]
console.log(
  `typescript releases: ${targets.map(([version, { spec }]) => `${version} (from ${spec})`).join(", ")}`,
)

// realpathSync: on macOS the temp directory is a symlink (/var -> /private/var).
const packDir = realpathSync(mkdtempSync(path.join(tmpdir(), "env-cap-pack-")))
run("npm", ["pack", "--ignore-scripts", "--pack-destination", packDir], repoRoot)
const tarball = path.join(
  packDir,
  readdirSync(packDir).find((f) => f.endsWith(".tgz")),
)

// The scanner, run from both entry formats over every committed `env.schema.ts` fixture. The
// fixtures are the example applications and the integration fixtures: 23 files, from one-liners to
// multi-call schemas with documentation metadata. Each TypeScript root writes what it found. Every
// output must be byte-identical, so each tested 5 and 6 and the bundled 6 parse the corpus alike.
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
    // The raw result holds AST nodes, which are circular through their parents. So an inline schema literal
    // is kept as its source text, and an identifier reference as the plain record it already is.
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
        // examples/application keeps two schema files as commented-out reference material, as their
        // header says. They declare nothing, so the scanner is right to find no call in them.
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

// The same entry points from a CommonJS file, which resolves the `require` conditions and `dist/*.d.cts`.
const commonJsConsumer = `import envCap = require("${PACKAGE}")
import helpers = require("${PACKAGE}/helpers")
import node = require("${PACKAGE}/node")
import build = require("${PACKAGE}/build")
import evidence = require("${PACKAGE}/evidence")
const result = build.parseSchemaFile("a.ts", "export const e = 1")
const kind: number = result.sourceFile.kind
console.log(typeof envCap.createEnv, typeof helpers, typeof node, result.createEnvCalls.length, kind, typeof evidence)
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
  for (const [version, { nodeTypes }] of targets) {
    const major = version.split(".")[0]
    const dir = realpathSync(mkdtempSync(path.join(tmpdir(), `env-cap-tscompat-${version}-`)))
    try {
      console.log(`\n== typescript@${version} as the consumer's root compiler`)
      writeFileSync(
        path.join(dir, "package.json"),
        JSON.stringify({ name: "tscompat", version: "0.0.0", type: "module" }),
      )
      // A plain install (no --legacy-peer-deps): proves the widened peer range resolves for this root.
      run(
        "npm",
        [
          "install",
          "--no-audit",
          "--no-fund",
          tarball,
          `typescript@${version}`,
          `@types/node@${nodeTypes}`,
        ],
        dir,
      )

      // The consumer's ROOT compiler, by path.
      const tsc = path.join("node_modules", "typescript", "bin", "tsc")
      const rootVersion = JSON.parse(
        readFileSync(path.join(dir, "node_modules", "typescript", "package.json"), "utf8"),
      ).version
      console.log(`root typescript ${rootVersion}`)
      // Installing this package must not replace the consumer's `tsc`. The bundled TypeScript 6 ships a
      // `tsc` bin. Hoisted as an ordinary dependency, npm would link it into `.bin`, and every
      // consumer's `npx tsc` would silently become TypeScript 6. Bundling keeps it nested and unlinked.
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
      writeFileSync(path.join(dir, "strict.cts"), commonJsConsumer)
      writeFileSync(path.join(dir, "tsconfig.cjs.json"), tsconfig("strict.cts"))
      writeFileSync(path.join(dir, "scan.mjs"), scanScript)
      writeFileSync(path.join(dir, "fixtures.json"), JSON.stringify(fixtures))

      const nodeTypesVersion = JSON.parse(
        readFileSync(path.join(dir, "node_modules", "@types", "node", "package.json"), "utf8"),
      ).version
      // Which declaration set answered: the primary one under 5 and 6, the `types@>=7` one under 7.
      const expected = major === "7" ? "types@>=7" : "types"
      for (const [format, config] of [
        ["ES module", "tsconfig.strict.json"],
        ["CommonJS", "tsconfig.cjs.json"],
      ]) {
        run("node", [tsc, "-p", config], dir)
        const trace = run("node", [tsc, "-p", config, "--traceResolution"], dir).stdout
        if (!trace.includes(`Resolved under condition '${expected}'`)) {
          console.error(
            `expected the '${expected}' export condition to resolve the ${format} declarations under typescript@${version}`,
          )
          process.exit(1)
        }
        console.log(
          `${format} types ok with @types/node ${nodeTypesVersion}: every entry point but ./eslint-plugin, ` +
            `full library check, served under the '${expected}' export condition`,
        )
      }
      console.log(run("node", ["scan.mjs"], dir).stdout.trim())
      scanOutputs.set(version, readFileSync(path.join(dir, "scan-output.json"), "utf8"))

      if (major === "7") {
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
  console.log(
    `\nTypeScript compat check passed for typescript ${[...scanOutputs.keys()].join(", ")}.`,
  )
} finally {
  rmSync(packDir, { recursive: true, force: true })
}
