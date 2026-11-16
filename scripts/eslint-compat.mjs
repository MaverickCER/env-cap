// CI's `eslint-compat` job runs this after `npm run build`. It packs the package as `npm publish` would. Then it
// installs the tarball into one scratch project per pair of `eslint` and `@typescript-eslint/utils` versions
// (`eslintCompatPairs` in scripts/peer-range-versions.mjs). Each ESLint boundary, the floor and the newest release
// of each major in the `eslint` peer range, runs with the newest `@typescript-eslint/utils`. The utils floor runs
// with the ESLint floor, the oldest pair a consumer may hold.
//
// Each project proves three things:
//
//   1. The tarball, `eslint` and `@typescript-eslint/utils` install with no peer conflict.
//   2. Both rules report and exempt the same files under flat config. That holds for the plugin loaded as ESM
//      and as CommonJS, with default options and with an `allow` list.
//   3. The ESLint CLI runs the flat config from GUIDE.md's ESLint plugin section and reports one finding.
//
// Where the installed ESLint still ships eslintrc (8.x and 9.x), the rules also run through that engine.
// The plugin is registered through the `plugins` option of its API, since eslintrc resolves plugins by package
// name.
//
// Usage: node scripts/eslint-compat.mjs [eslint version ...]   (default: derived from package.json)
// Each named ESLint version runs with the newest `@typescript-eslint/utils`.

import { spawnSync } from "node:child_process"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { eslintCompatPairs } from "./peer-range-versions.mjs"

const repoRoot = path.resolve(import.meta.dirname, "..")
const manifest = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"))
const PACKAGE = manifest.name
const derived = eslintCompatPairs(
  manifest.peerDependencies.eslint,
  manifest.peerDependencies["@typescript-eslint/utils"],
)
const pairs =
  process.argv.slice(2).length > 0
    ? process.argv.slice(2).map((eslint) => ({ eslint, utils: derived[0].utils }))
    : derived

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed (exit ${String(result.status)}) in ${cwd}\n` +
        result.stdout +
        result.stderr,
    )
  }
  return result
}

// Each case names a file, its source and the rules expected to report on it.
// The `allow` list exempts the `scripts` folder from both rules.
const probe = `import { createRequire } from "node:module"
import path from "node:path"
const require = createRequire(import.meta.url)
// require() sees every CommonJS export; import() of ESLint 8 hides those cjs-module-lexer cannot detect.
const eslint = require("eslint")
const risky = require("eslint/use-at-your-own-risk")
const { version } = require("eslint/package.json")
const plugins = {
  esm: (await import("${PACKAGE}/eslint-plugin")).default,
  cjs: require("${PACKAGE}/eslint-plugin"),
}
const reads = 'import fs from "node:fs"\\nexport const port = process.env.PORT + String(fs)\\n'
const cases = [
  { file: "src/app.js", code: reads, defaults: ["env-cap/no-node-fs", "env-cap/no-raw-process-env"], allowed: ["env-cap/no-node-fs", "env-cap/no-raw-process-env"] },
  { file: "scripts/boot.js", code: reads, defaults: ["env-cap/no-node-fs", "env-cap/no-raw-process-env"], allowed: [] },
  { file: "src/env.schema.ts", code: "export const port = process.env.PORT\\n", defaults: [], allowed: [] },
]
const rules = (allow) => {
  const options = allow === undefined ? [] : [{ allow }]
  return { "env-cap/no-raw-process-env": ["error", ...options], "env-cap/no-node-fs": ["error", ...options] }
}
const flatEngine = Number(version.split(".")[0]) >= 9 ? eslint.ESLint : risky.FlatESLint
const legacyEngine = risky.LegacyESLint ?? (flatEngine === eslint.ESLint ? undefined : eslint.ESLint)
const engines = {
  flat: (plugin, allow) => new flatEngine({
    cwd: process.cwd(),
    overrideConfigFile: true,
    overrideConfig: [{
      files: ["**/*.js", "**/*.ts"],
      languageOptions: { ecmaVersion: 2022, sourceType: "module" },
      plugins: { "env-cap": plugin },
      rules: rules(allow),
    }],
  }),
}
if (legacyEngine !== undefined) {
  engines.eslintrc = (plugin, allow) => new legacyEngine({
    cwd: process.cwd(),
    useEslintrc: false,
    plugins: { "env-cap": plugin },
    overrideConfig: {
      plugins: ["env-cap"],
      parserOptions: { ecmaVersion: 2022, sourceType: "module" },
      rules: rules(allow),
    },
  })
}
let checked = 0
for (const [engineName, create] of Object.entries(engines)) {
  for (const [format, plugin] of Object.entries(plugins)) {
    for (const [mode, allow] of [["defaults", undefined], ["allowed", ["scripts/**"]]]) {
      const linter = create(plugin, allow)
      for (const c of cases) {
        const [result] = await linter.lintText(c.code, { filePath: path.join(process.cwd(), c.file) })
        const found = result.messages.map((m) => m.ruleId ?? "fatal: " + m.message).sort()
        if (JSON.stringify(found) !== JSON.stringify(c[mode])) {
          throw new Error(engineName + " " + format + " " + mode + " " + c.file + ": expected " + JSON.stringify(c[mode]) + ", got " + JSON.stringify(found))
        }
        checked++
      }
    }
  }
}
console.log("eslint " + version + ": " + checked + " cases pass under " + Object.keys(engines).join(" and "))
`

// The flat config from GUIDE.md's ESLint plugin section, run by the ESLint CLI.
const guideConfig = `import envCapPlugin from "${PACKAGE}/eslint-plugin"

export default [
  {
    files: ["**/*.ts"],
    plugins: { "env-cap": envCapPlugin },
    rules: { "env-cap/no-raw-process-env": "error" },
  },
]
`

const packDir = mkdtempSync(path.join(tmpdir(), "env-cap-eslint-pack-"))
try {
  run("npm", ["pack", "--ignore-scripts", "--pack-destination", packDir], repoRoot)
  const tarball = path.join(
    packDir,
    readdirSync(packDir).find((file) => file.endsWith(".tgz")),
  )
  for (const { eslint: version, utils } of pairs) {
    // ESLint reports real paths. On macOS the temp directory is a symlink (/var -> /private/var).
    const dir = realpathSync(
      mkdtempSync(path.join(tmpdir(), `env-cap-eslint-${version}-utils-${utils}-`)),
    )
    try {
      console.log(`\n== eslint@${version} with @typescript-eslint/utils@${utils}`)
      writeFileSync(
        path.join(dir, "package.json"),
        JSON.stringify({ name: "eslint-compat", version: "0.0.0", type: "module" }),
      )
      // A plain install (no --legacy-peer-deps): npm fails here if the peer ranges conflict.
      run(
        "npm",
        [
          "install",
          "--no-audit",
          "--no-fund",
          tarball,
          `eslint@${version}`,
          `@typescript-eslint/utils@${utils}`,
        ],
        dir,
      )
      const installedOf = (name, asked) => {
        const found = JSON.parse(
          readFileSync(path.join(dir, "node_modules", name, "package.json"), "utf8"),
        ).version
        // A bare major resolves to its newest release; a full version installs exactly.
        const exact = asked.includes(".")
        if (exact ? found !== asked : found.split(".")[0] !== asked) {
          throw new Error(`asked for ${name}@${asked}, npm installed ${found}`)
        }
        return found
      }
      const installed = installedOf("eslint", version)
      console.log(
        `installed eslint ${installed}, @typescript-eslint/utils ${installedOf("@typescript-eslint/utils", utils)}`,
      )
      writeFileSync(path.join(dir, "probe.mjs"), probe)
      console.log(run("node", ["probe.mjs"], dir).stdout.trim())

      writeFileSync(path.join(dir, "eslint.config.js"), guideConfig)
      mkdirSync(path.join(dir, "src"))
      writeFileSync(path.join(dir, "src", "app.ts"), "export const port = process.env.PORT\n")
      writeFileSync(
        path.join(dir, "src", "env.schema.ts"),
        "export const port = process.env.PORT\n",
      )
      const cli = spawnSync(
        "node",
        [path.join("node_modules", "eslint", "bin", "eslint.js"), "--format", "json", "src"],
        { cwd: dir, encoding: "utf8" },
      )
      // ESLint exits 1 when it reports a lint error, which is the expected outcome here.
      const findings =
        cli.status === 1
          ? JSON.parse(cli.stdout).flatMap((file) =>
              file.messages.map((m) => `${path.relative(dir, file.filePath)} ${m.ruleId}`),
            )
          : []
      const expected = [`${path.join("src", "app.ts")} env-cap/no-raw-process-env`]
      if (JSON.stringify(findings) !== JSON.stringify(expected)) {
        throw new Error(
          `the GUIDE config under eslint ${installed}: expected ${expected[0]}\n` +
            cli.stdout +
            cli.stderr,
        )
      }
      console.log(`eslint ${installed}: the CLI runs the GUIDE config`)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
  const tested = pairs.map(({ eslint, utils }) => `eslint ${eslint} + utils ${utils}`)
  console.log(`\nESLint compat check passed for ${tested.join("; ")}.`)
} finally {
  rmSync(packDir, { recursive: true, force: true })
}
