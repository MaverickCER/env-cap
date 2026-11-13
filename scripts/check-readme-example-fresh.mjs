#!/usr/bin/env node
// Fails when README.md's "See it run" block no longer matches real output. The
// README says the block comes from examples/application's `npm run docs` and
// `npm run docs:reports`. `scripts/update-example-goldens.mjs` never reads
// README.md, so without this check the block's day counts could go stale.
//
// It re-runs examples/application's two doc-generation steps in a temp copy.
// First the packaged `env-cap` CLI writes the manifest and evidence. Then
// `scripts/generate-docs/run.ts` writes the docs, the ownership report and
// `.env.example` through `@maverickcer/env-cap/build` (ADR 0046 removed the
// `--docs` and `--ownership` CLI flags). The copy symlinks node_modules, as
// check-api-report.mjs does, so the real examples/application tree stays
// untouched. It then reads two date-sensitive lists from the combined stdout:
// "expiring soon or already expired" and "unconsumed owned variable(s)". It
// fails with a diff when the README's block differs.
//
// It compares only those two lists. The README shows the "Wrote ..." lines
// with relative paths for readability, while real stdout prints absolute,
// checkout-dependent paths. Comparing those lines would fail on every machine.
//
// examples/application is its own npm project. CI's `examples` job installs
// it; the root `npm ci` does not (test/examples/support.ts explains why). When
// it is not installed, this script skips instead of failing. So it is safe in
// `npm run verify` and `precommit` on a checkout without the examples. In CI's
// `examples` job, where they are installed, it still fails on drift.
//
// Node builtins only: dev and CI tooling, never shipped.

import { execFileSync } from "node:child_process"
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const exampleDir = path.join(root, "examples/application")
const readmePath = path.join(root, "README.md")

if (!existsSync(path.join(exampleDir, "node_modules"))) {
  process.stdout.write(
    "[skip] examples/application: node_modules not installed (run `npm install` in examples/application first, or rely on CI's `examples` job, which does).\n",
  )
  process.exit(0)
}

// The exact two invocations README.md's "See it run" fenced block shows:
// kept as a single source of truth here so a future change to either shown
// command or its flags can't quietly drift the two apart.
//
// Split in two, matching examples/application's own `docs`/`docs:reports`
// npm scripts. The CLI has no `--docs`/`--ownership` flags (ADR 0046). So
// the manifest/evidence step goes through the packaged binary. The
// docs/ownership step calls `@maverickcer/env-cap/build` directly via
// `scripts/generate-docs/run.ts`, which is copied into the temp dir below
// like every other file.
const CLI_ARGS = [
  "--include",
  "src/env.ts",
  "--location",
  "src/generated/env.manifest.ts",
  "--evidence",
  "docs/env.evidence.json",
]
const GENERATE_DOCS_SCRIPT = "scripts/generate-docs/run.ts"

const SECTION_HEADERS = [
  /^\d+ variable\(s\)\/contract\(s\) expiring soon or already expired:$/,
  /^\d+ unconsumed owned variable\(s\):$/,
]

/**
 * Pulls out each `SECTION_HEADERS` block (its header line plus every
 * following non-blank "  - ..." bullet, stopping at the first blank line or
 * non-bullet line) from a block of CLI-style text. Blank-line placement
 * differs between real stdout (single newlines) and README's fenced block
 * (a blank line between every line, for Markdown-source readability):
 * this normalizes both to the same shape so only the actual content is
 * compared.
 */
function extractSections(text) {
  const lines = text.split("\n").map((l) => l.trim())
  const sections = []
  for (const headerRe of SECTION_HEADERS) {
    const headerIdx = lines.findIndex((l) => headerRe.test(l))
    if (headerIdx === -1) {
      sections.push({ header: null, items: [] })
      continue
    }
    const items = []
    for (let i = headerIdx + 1; i < lines.length; i++) {
      const line = lines[i]
      if (line === "") continue
      if (!line.startsWith("-")) break
      items.push(line)
    }
    sections.push({ header: lines[headerIdx], items })
  }
  return sections
}

function renderSections(sections) {
  return sections
    .map(({ header, items }) => [header ?? "(missing)", ...items.map((i) => `  ${i}`)].join("\n"))
    .join("\n\n")
}

// The "expiring soon or already expired" day count grows every day with no
// source change: `STRIPE_KEY`'s `expiresAt` in examples/application/src/env.ts
// is a fixed past date, so "expired Nd ago" keeps rising. Masking the digits
// matches the golden comparisons (src/build/evidence-snapshot.ts's
// `EXPIRY_DAY_COUNT`, test/support/example-runner.ts's
// `normalizeExpiryCountdowns`). The check verifies the variable, expired or
// remaining, and the `expiresAt` date, not the calendar. Without the mask it
// could pass only on the day the README was last regenerated.
function normalizeExpiryDayCount(text) {
  return text.replace(/\d+d (ago|remaining)/g, "Nd $1")
}

function fail(message) {
  process.stderr.write(`\nREADME example drift: ${message}\n`)
  process.stderr.write(
    "The 'See it run' fenced block in README.md no longer matches a fresh run of\n" +
      "examples/application's own doc-generation command. Re-run it yourself\n" +
      "(`cd examples/application && npm run docs:reports`), splice the current\n" +
      "'expiring soon' / 'unconsumed owned variable(s)' output into README.md's\n" +
      "fenced block, and commit both.\n",
  )
  process.exitCode = 1
}

let fresh
try {
  fresh = mkdtempSync(path.join(tmpdir(), "env-cap-readme-example-"))

  // Copy everything except node_modules (symlinked in below, so the example
  // resolves the real, just-installed `env-cap` package.json`.dependencies`
  // reference) and the generated artifacts (regenerated fresh below).
  const EXCLUDED_TOP_LEVEL = new Set(["node_modules", "docs", ".env.example"])
  cpSync(exampleDir, fresh, {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(exampleDir, src)
      if (rel === "") return true
      const [top] = rel.split(path.sep)
      return !EXCLUDED_TOP_LEVEL.has(top)
    },
  })
  // node_modules is excluded above and symlinked back in below (so the copy
  // resolves the real, already-installed `env-cap` package). docs/ and
  // .env.example are excluded since the run below regenerates them fresh
  // anyway (src/generated/ is copied but gets overwritten the same way).
  symlinkSync(path.join(exampleDir, "node_modules"), path.join(fresh, "node_modules"))
  mkdirSync(path.join(fresh, "docs"), { recursive: true })
  mkdirSync(path.join(fresh, "src/generated"), { recursive: true })

  const cliStdout = execFileSync("npx", ["env-cap", ...CLI_ARGS], {
    cwd: fresh,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
  // The second, application-level step README.md's fenced block now shows
  // too (ADR 0046): same temp dir, same `tsx` resolved off the symlinked
  // node_modules, writing docs/ENVIRONMENT.md/docs/OWNERSHIP.md/.env.example
  // and printing the "expiring soon"/"unconsumed owned variable(s)"
  // sections this check actually compares.
  const docsStdout = execFileSync("npx", ["tsx", GENERATE_DOCS_SCRIPT], {
    cwd: fresh,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
  const stdout = `${cliStdout}\n${docsStdout}`

  const readme = readFileSync(readmePath, "utf8")
  const fenceMatch = readme.match(/```text\n\$ npx env-cap[\s\S]*?\n```/)
  if (!fenceMatch) {
    fail("could not find the '$ npx env-cap ...' fenced block in README.md at all")
  } else {
    const freshSections = extractSections(stdout)
    const readmeSections = extractSections(fenceMatch[0])
    const freshRendered = normalizeExpiryDayCount(renderSections(freshSections))
    const readmeRendered = normalizeExpiryDayCount(renderSections(readmeSections))

    if (freshRendered !== readmeRendered) {
      fail(
        `the README's fenced block does not match a fresh run.\n\n` +
          `--- README.md (current) ---\n${readmeRendered}\n\n` +
          `--- fresh run (real) ---\n${freshRendered}\n`,
      )
    } else {
      process.stdout.write(
        "README.md's 'See it run' block matches a fresh examples/application run.\n",
      )
    }
  }
} finally {
  if (fresh) rmSync(fresh, { recursive: true, force: true })
}
