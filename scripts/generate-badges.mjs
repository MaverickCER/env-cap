#!/usr/bin/env node
// Lightweight, dependency-free (Node builtins only) badge-data generator --
// reads coverage/coverage-summary.json (vitest.config.ts's "json-summary"
// reporter) and coverage/size-summary.json (`npm run size -- --json ...`),
// writes shields.io "endpoint badge" JSON into docs/, which item B's ci.yml
// `badges` job then deploys alongside the rest of the GitHub Pages site.
// Never run against stale/missing inputs silently -- both sections fail
// loudly (non-zero exit) rather than writing a badge from nothing.

import { readFileSync, writeFileSync, existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function coverageColor(pct) {
  return pct >= 85 ? "brightgreen" : pct >= 70 ? "yellow" : "red"
}
function sizeColor(gz, max) {
  return gz <= max ? "brightgreen" : gz <= max * 1.1 ? "yellow" : "red"
}

const summaryPath = path.join(root, "coverage/coverage-summary.json")
if (!existsSync(summaryPath)) {
  console.error(
    "[badges] coverage/coverage-summary.json missing -- run `npm run test:coverage` first.",
  )
  process.exitCode = 1
} else {
  const { total } = JSON.parse(readFileSync(summaryPath, "utf8"))
  // Headline number is the MINIMUM of the four metrics, matching
  // vitest.config.ts's own "floor, not average" philosophy -- one low
  // number should never be masked by three higher ones.
  const pct = Math.min(
    total.lines.pct,
    total.statements.pct,
    total.functions.pct,
    total.branches.pct,
  )
  writeFileSync(
    path.join(root, "docs/coverage-badge.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        label: "coverage",
        message: `${pct.toFixed(1)}%`,
        color: coverageColor(pct),
      },
      null,
      2,
    ),
  )
  console.log(`[badges] wrote docs/coverage-badge.json (${pct.toFixed(1)}%)`)
}

const sizeSummaryPath = path.join(root, "coverage/size-summary.json")
if (!existsSync(sizeSummaryPath)) {
  console.error(
    "[badges] size summary missing -- run `npm run size -- --json coverage/size-summary.json` first.",
  )
  process.exitCode = 1
} else {
  const { entries } = JSON.parse(readFileSync(sizeSummaryPath, "utf8"))
  const runtime = entries.find((e) => e.label === "runtime")
  if (runtime?.gzipBytes != null) {
    const kb = (runtime.gzipBytes / 1024).toFixed(2)
    writeFileSync(
      path.join(root, "docs/size-badge.json"),
      JSON.stringify(
        {
          schemaVersion: 1,
          label: "gzip size",
          message: `${kb} KB`,
          color: sizeColor(runtime.gzipBytes, runtime.maxGzipBytes),
        },
        null,
        2,
      ),
    )
    console.log(`[badges] wrote docs/size-badge.json (${kb} KB)`)
  } else {
    console.error("[badges] runtime entry missing gzipBytes in size-summary.json.")
    process.exitCode = 1
  }
}
