#!/usr/bin/env node
// Turns an `env-cap --json` report into GitHub PR annotations, a job-summary
// table, and a sticky PR comment. Plain Node, no dependencies -- matches
// `scripts/check-size.mjs`'s dependency-free convention, and every GitHub
// interaction goes through the preinstalled `gh` CLI rather than octokit.
//
// Split into one small collector per section of the `env-cap --json` payload
// (manifest/docs/usage/error), composed by `classifyFindings()`, so a future
// field added to that payload means adding one line to the relevant
// collector rather than touching a shared switch statement.

import { execFileSync } from "node:child_process"
import { appendFileSync, readFileSync } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

/** @typedef {{ level: "error" | "warning" | "notice", file: string | undefined, message: string }} Finding */

/** @param {unknown} manifest @returns {Finding[]} */
export function collectManifestFindings(manifest) {
  if (!manifest) return []
  const findings = []
  for (const warning of manifest.warnings ?? []) {
    for (const file of warning.files ?? []) {
      findings.push({ level: "warning", file, message: `${warning.variable}: ${warning.reason}` })
    }
  }
  return findings
}

/** @param {unknown} docs @returns {Finding[]} */
export function collectDocumentationFindings(docs) {
  if (!docs) return []
  const findings = []
  const doc = docs.documentation ?? {}

  for (const c of doc.undocumentedContracts ?? []) {
    findings.push({
      level: "warning",
      file: c.file,
      message: `"${c.exportName}" has no documentEnv() call linked to it.`,
    })
  }
  for (const v of doc.undocumentedVariables ?? []) {
    findings.push({
      level: "warning",
      file: v.file,
      message: `"${v.key}" (declared by "${v.exportName}") has no matching documentEnv() entry.`,
    })
  }
  for (const s of doc.staleDocEntries ?? []) {
    findings.push({
      level: "warning",
      file: s.file,
      message: `"${s.key}" is documented in "${s.exportName}" but no longer declared by its schema.`,
    })
  }
  for (const u of doc.unresolvedLinks ?? []) {
    findings.push({
      level: "warning",
      file: u.file,
      message: `documentEnv() call could not be statically linked: ${u.reason}`,
    })
  }
  for (const e of doc.expiringSoon ?? []) {
    const label = e.key ? `"${e.key}" in "${e.exportName}"` : `"${e.exportName}"`
    const status =
      e.daysRemaining < 0
        ? `expired ${Math.abs(e.daysRemaining)}d ago`
        : `expires in ${e.daysRemaining}d`
    findings.push({
      level: e.daysRemaining < 0 ? "error" : "warning",
      file: e.file,
      message: `${label}: ${status} (${e.expiresAt}).`,
    })
  }

  return findings
}

/** @param {unknown} usage @returns {Finding[]} */
export function collectOwnershipFindings(usage) {
  if (!usage) return []
  const findings = []

  for (const a of usage.abandonedContracts ?? []) {
    findings.push({
      level: "warning",
      file: a.file,
      message: `"${a.contractName}" is never imported anywhere in the scanned repository.`,
    })
  }
  for (const u of usage.unconsumedOwnedVariables ?? []) {
    findings.push({
      level: "warning",
      file: undefined,
      message: `"${u.key}" (owned by "${u.contractName}") has no consumer found in the scanned repository.`,
    })
  }
  // "We don't know" states (ambiguous barrel re-exports, dynamic access) --
  // never escalated, even by --strict-ownership, so the Action doesn't
  // escalate them either.
  for (const r of usage.unresolvedConsumers ?? []) {
    findings.push({ level: "notice", file: r.file, message: `"${r.contractName}": ${r.reason}` })
  }
  for (const i of usage.indeterminate ?? []) {
    findings.push({
      level: "notice",
      file: undefined,
      message: `"${i.key}" in "${i.contractName}": ${i.reason}`,
    })
  }

  return findings
}

/** @param {unknown} error @returns {Finding[]} */
export function collectErrorFindings(error) {
  if (!error?.issues) return []
  const findings = []
  for (const issue of error.issues) {
    for (const file of issue.files ?? []) {
      findings.push({ level: "error", file, message: `${issue.variable}: ${issue.reason}` })
    }
  }
  return findings
}

/** @param {unknown} result @returns {Finding[]} */
export function classifyFindings(result) {
  return [
    ...collectManifestFindings(result?.manifest),
    ...collectDocumentationFindings(result?.docs),
    ...collectOwnershipFindings(result?.usage),
    ...collectErrorFindings(result?.error),
  ]
}

/** Looks up a variable's catalog entry (Part 1's `docs.catalog`) so the
 *  summary can enrich a row (e.g. an expiring secret's `compliance` tag)
 *  without re-deriving anything -- a rendering nicety, not required for
 *  correctness. */
function findCatalogVariable(docs, file, exportName, key) {
  if (!key) return undefined
  const contract = docs?.catalog?.find((c) => c.file === file && c.exportName === exportName)
  return contract?.variables?.[key]
}

/** @param {unknown} result @returns {string} */
export function renderMarkdownSummary(result) {
  const lines = ["# env-cap report", ""]

  if (result?.ok === false) {
    lines.push(`**Generation failed:** \`${result.error?.name ?? "Error"}\``, "")
  }

  const findings = classifyFindings(result)
  const counts = { error: 0, warning: 0, notice: 0 }
  for (const finding of findings) counts[finding.level] += 1
  lines.push(
    `- Errors: ${counts.error}`,
    `- Warnings: ${counts.warning}`,
    `- Notices: ${counts.notice}`,
    "",
  )

  if (result?.error?.issues?.length > 0) {
    lines.push("## Blocking issues", "", "| Variable | Reason | Files |", "|---|---|---|")
    for (const issue of result.error.issues) {
      lines.push(`| ${issue.variable} | ${issue.reason} | ${issue.files.join(", ")} |`)
    }
    lines.push("")
  }

  const doc = result?.docs?.documentation
  if (doc?.undocumentedVariables?.length > 0) {
    lines.push("## Undocumented variables", "", "| Variable | Contract | File |", "|---|---|---|")
    for (const v of doc.undocumentedVariables)
      lines.push(`| \`${v.key}\` | ${v.exportName} | ${v.file} |`)
    lines.push("")
  }

  if (doc?.expiringSoon?.length > 0) {
    lines.push(
      "## Expiring / expired secrets",
      "",
      "| Variable | Expires | Status | Compliance |",
      "|---|---|---|---|",
    )
    for (const e of doc.expiringSoon) {
      const status =
        e.daysRemaining < 0
          ? `**expired ${Math.abs(e.daysRemaining)}d ago**`
          : `${e.daysRemaining}d remaining`
      const catalogVariable = findCatalogVariable(result.docs, e.file, e.exportName, e.key)
      const compliance = catalogVariable?.extra?.compliance ?? "--"
      lines.push(
        `| ${e.key ? `\`${e.key}\`` : `(contract) ${e.exportName}`} | ${e.expiresAt} | ${status} | ${compliance} |`,
      )
    }
    lines.push("")
  }

  if (result?.usage?.dependencyOwnership?.length > 0) {
    const sorted = [...result.usage.dependencyOwnership].sort(
      (a, b) => b.consumers.length - a.consumers.length,
    )
    lines.push(
      "## Ownership & Blast Radius",
      "",
      "| Contract | Owner | Blast radius (consumers) |",
      "|---|---|---|",
    )
    for (const entry of sorted)
      lines.push(`| ${entry.contractName} | ${entry.owner ?? "--"} | ${entry.consumers.length} |`)
    lines.push("")
  }

  return lines.join("\n")
}

/**
 * `file` values coming out of the CLI are relative to *its own* `--root`
 * (`cliRoot`, i.e. `working-directory`), not necessarily the Action's
 * checkout root (`workspaceRoot`) -- the two only coincide when
 * `working-directory: .`. `path.resolve(cliRoot, file)` is correct whether
 * `file` was already absolute or root-relative to `cliRoot` (see the CLI's
 * documented file-path inconsistency, ADR 0013).
 */
export function renderAnnotations(findings, cliRoot, workspaceRoot) {
  return findings.map((finding) => {
    const command = finding.level
    if (!finding.file) return `::${command}::${finding.message}`
    const absolute = path.resolve(cliRoot, finding.file)
    const annotationPath = path.relative(workspaceRoot, absolute)
    return `::${command} file=${annotationPath}::${finding.message}`
  })
}

/**
 * Decides what a rotation-alert GitHub issue should say, purely from the
 * same `expiringSoon` data renderMarkdownSummary() already renders -- no
 * network access, so this is directly unit-testable (unlike upsertRotationIssue/
 * closeRotationIssueIfOpen below, which call `gh` and follow report.mjs's
 * existing convention of leaving gh-invoking functions unexported/untested,
 * same as upsertComment()/listComments() today).
 * @param {unknown} result
 * @returns {{ action: "close" } | { action: "open", title: string, body: string }}
 */
export function buildRotationAlert(result) {
  const expiring = result?.docs?.documentation?.expiringSoon ?? []
  if (expiring.length === 0) return { action: "close" }
  const expiredCount = expiring.filter((e) => e.daysRemaining < 0).length
  const title =
    expiredCount > 0
      ? `env-cap: ${expiredCount} environment variable(s) expired, ${expiring.length - expiredCount} expiring soon`
      : `env-cap: ${expiring.length} environment variable(s) expiring soon`
  return { action: "open", title, body: renderMarkdownSummary(result) }
}

function listOpenRotationIssues(marker) {
  const output = gh(["api", "repos/{owner}/{repo}/issues", "-f", "state=open", "--paginate"])
  return JSON.parse(output).filter(
    (i) => !i.pull_request && typeof i.body === "string" && i.body.includes(marker),
  )
}

function upsertRotationIssue(marker, title, body) {
  const fullBody = `${marker}\n${body}`
  const existing = listOpenRotationIssues(marker)
  if (existing.length > 0) {
    gh(
      [
        "api",
        "--method",
        "PATCH",
        `repos/{owner}/{repo}/issues/${existing[0].number}`,
        "--input",
        "-",
      ],
      JSON.stringify({ title, body: fullBody }),
    )
  } else {
    gh(
      ["api", "--method", "POST", "repos/{owner}/{repo}/issues", "--input", "-"],
      JSON.stringify({ title, body: fullBody }),
    )
  }
}

function closeRotationIssueIfOpen(marker) {
  for (const issue of listOpenRotationIssues(marker)) {
    gh(
      ["api", "--method", "PATCH", `repos/{owner}/{repo}/issues/${issue.number}`, "--input", "-"],
      JSON.stringify({ state: "closed" }),
    )
    gh(
      [
        "api",
        `repos/{owner}/{repo}/issues/${issue.number}/comments`,
        "--method",
        "POST",
        "--input",
        "-",
      ],
      JSON.stringify({
        body: "No environment variables are currently expiring or expired. Closing this alert.",
      }),
    )
  }
}

function readEvent() {
  const eventPath = process.env.GITHUB_EVENT_PATH
  if (!eventPath) return undefined
  try {
    return JSON.parse(readFileSync(eventPath, "utf8"))
  } catch {
    return undefined
  }
}

function gh(args, input) {
  return execFileSync("gh", args, { encoding: "utf8", input })
}

function listComments(prNumber) {
  const output = gh(["api", `repos/{owner}/{repo}/issues/${prNumber}/comments`, "--paginate"])
  return JSON.parse(output)
}

function upsertComment(prNumber, marker, body) {
  const fullBody = `${marker}\n${body}`
  const existing = listComments(prNumber).find(
    (c) => typeof c.body === "string" && c.body.includes(marker),
  )
  if (existing) {
    gh(
      [
        "api",
        "--method",
        "PATCH",
        `repos/{owner}/{repo}/issues/comments/${existing.id}`,
        "--input",
        "-",
      ],
      JSON.stringify({ body: fullBody }),
    )
  } else {
    gh(
      [
        "api",
        "--method",
        "POST",
        `repos/{owner}/{repo}/issues/${prNumber}/comments`,
        "--input",
        "-",
      ],
      JSON.stringify({ body: fullBody }),
    )
  }
}

function main() {
  const resultPath = process.env.RESULT_PATH
  if (!resultPath) throw new Error("RESULT_PATH is required.")

  const workspaceRoot = process.env.GITHUB_WORKSPACE ?? process.cwd()
  const workingDirectory = process.env.WORKING_DIRECTORY ?? "."
  const cliRoot = path.resolve(workspaceRoot, workingDirectory)
  const doComment = process.env.DO_COMMENT === "true"
  const doAnnotations = process.env.DO_ANNOTATIONS === "true"
  const reportKey =
    process.env.REPORT_KEY && process.env.REPORT_KEY.length > 0
      ? process.env.REPORT_KEY
      : workingDirectory

  let result
  try {
    result = JSON.parse(readFileSync(resultPath, "utf8"))
  } catch (error) {
    // A malformed/missing result file means the `npx env-cap --json` step
    // itself failed to produce valid output (package resolution failure,
    // network error, ...) -- surface that plainly instead of letting a raw
    // SyntaxError/ENOENT stack trace be this Action's only diagnostic.
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(
      `Failed to read or parse the env-cap result file at "${resultPath}": ${message}\n`,
    )
    process.exitCode = 1
    return
  }
  const findings = classifyFindings(result)

  if (doAnnotations) {
    for (const line of renderAnnotations(findings, cliRoot, workspaceRoot))
      process.stdout.write(`${line}\n`)
  }

  const summary = renderMarkdownSummary(result)
  const summaryPath = process.env.GITHUB_STEP_SUMMARY
  if (summaryPath) appendFileSync(summaryPath, `${summary}\n`)

  const event = readEvent()
  const prNumber = event?.pull_request?.number
  if (doComment && process.env.GITHUB_EVENT_NAME === "pull_request" && prNumber) {
    upsertComment(prNumber, `<!-- env-cap-report:${reportKey} -->`, summary)
  } else if (process.env.DO_ROTATION_ALERT === "true") {
    const alert = buildRotationAlert(result)
    const marker = `<!-- env-cap-rotation-alert:${reportKey} -->`
    if (alert.action === "open") {
      upsertRotationIssue(marker, alert.title, alert.body)
    } else {
      closeRotationIssueIfOpen(marker)
    }
  }
}

// Same direct-run guard as src/cli/index.ts -- importing this module from a
// test must never have the side effect of running main().
const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (isDirectRun) {
  main()
}
