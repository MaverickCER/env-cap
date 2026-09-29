#!/usr/bin/env node
// Turns an `env-cap --json` report into GitHub PR annotations, a job-summary
// table, and a sticky PR comment. Plain Node, no dependencies -- matches
// `scripts/check-size.mjs`'s dependency-free convention, and every GitHub
// interaction goes through the preinstalled `gh` CLI rather than octokit.
//
// Split into one small collector per section of the `env-cap --json` payload
// (manifest/evidence/error), composed by `classifyFindings()`, so a future
// field added to that payload means adding one line to the relevant
// collector rather than touching a shared switch statement.
//
// Documentation/ownership/rotation-alert reporting reads `result.evidence`
// (the persisted EvidenceModel's Finding/Lifecycle/Contract/Ownership/
// Dependency models -- ADR 0038), not `result.docs`/`result.usage`.
// `--docs`/`--ownership` were removed from the `env-cap` CLI (ADR 0046);
// `result.docs`/`result.usage` can never be populated by a CLI invocation
// again, so reading them here would make this reporting permanently silent
// regardless of `args` -- exactly the regression this file used to have
// (caught only by review, since the old tests fed synthetic `docs`/`usage`
// objects no real CLI run could ever produce; see
// test/scripts/github-action-report.test.ts's own real-CLI test for the fix
// to that gap). `result.evidence` requires `--evidence` in `args` (see
// action.yml's own description) -- Finding/Lifecycle Model are always
// computed regardless of CLI flags (ADR 0038), but only *included* in the
// `--json` envelope when `--evidence` was requested.

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

// Finding Model codes this Action deliberately reports LOUDER or QUIETER
// than `Finding.severity` alone would suggest -- both distinctions predate
// the move to Finding Model and are preserved here verbatim:
//  - EXPIRED: Finding Model itself keeps this "warning" (ADR 0038:
//    documentation gaps never block generation), but a secret that has
//    ALREADY expired earns a red "error" annotation in a human's PR view --
//    a UX choice about urgency, not a change to what blocks a build.
//  - UNRESOLVED_CONSUMER / INDETERMINATE_OWNERSHIP: "we don't know" states
//    (an ambiguous barrel re-export, a dynamic property access) -- never
//    escalated, even by `--strict-ownership` (see generate-env-artifacts.ts),
//    so this Action doesn't escalate them either; downgraded to "notice"
//    rather than left at Finding Model's own "warning".
const ERROR_CODES = new Set(["EXPIRED"])
const NOTICE_CODES = new Set(["UNRESOLVED_CONSUMER", "INDETERMINATE_OWNERSHIP"])

/** @param {{ code: string, severity: string }} finding @returns {"error" | "warning" | "notice"} */
function annotationLevel(finding) {
  if (ERROR_CODES.has(finding.code)) return "error"
  if (NOTICE_CODES.has(finding.code) || finding.severity === "info") return "notice"
  return "warning"
}

/**
 * A `Finding.location`'s file, whichever of the three `EvidenceReference`
 * variants it is -- `"contract"`/`"ownership"` carry `file` (possibly
 * undefined -- a finding can be genuinely fileless, e.g. an unconsumed
 * owned variable, identified by contract+key alone); `"change"` (drift
 * findings, only ever present from a `--check` run) carries `path` instead.
 * @param {{ model: string, file?: string, path?: string }} [location]
 * @returns {string | undefined}
 */
function locationFile(location) {
  if (!location) return undefined
  return location.model === "change" ? location.path : location.file
}

/**
 * @param {unknown} evidence
 * @param {"documentation" | "ownership"} family
 * @returns {Finding[]}
 */
function collectFindingsByFamily(evidence, family) {
  const findings = evidence?.finding?.findings ?? []
  return findings
    .filter((f) => f.family === family)
    .map((f) => ({ level: annotationLevel(f), file: locationFile(f.location), message: f.message }))
}

/** @param {unknown} evidence @returns {Finding[]} */
export function collectDocumentationFindings(evidence) {
  return collectFindingsByFamily(evidence, "documentation")
}

/** @param {unknown} evidence @returns {Finding[]} */
export function collectOwnershipFindings(evidence) {
  return collectFindingsByFamily(evidence, "ownership")
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
    ...collectDocumentationFindings(result?.evidence),
    ...collectOwnershipFindings(result?.evidence),
    ...collectErrorFindings(result?.error),
  ]
}

/**
 * Looks up a variable's `metadata` bag (the Contract Model's open extension
 * point, ADR 0037 -- e.g. a `compliance` tag) so the summary can enrich a
 * row without re-deriving anything -- a rendering nicety, not required for
 * correctness.
 * @param {unknown} evidence
 * @param {string | undefined} file
 * @param {string} exportName
 * @param {string | undefined} key
 */
function findMetadata(evidence, file, exportName, key) {
  if (!key) return undefined
  const contract = evidence?.contract?.contracts?.find(
    (c) => c.file === file && c.exportName === exportName,
  )
  return contract?.variables?.find((v) => v.key === key)?.metadata
}

/**
 * Joins the Ownership Model (per-contract `owner`) with the Dependency
 * Model (per-contract `consumingFiles`, this Action's "blast radius") by
 * contract identity (`file`+`exportName`) -- the same join
 * `usage-report.ts`'s now-CLI-unreachable `dependencyOwnership` field used
 * to do internally.
 * @param {unknown} evidence
 * @returns {{ contractName: string, owner: string | undefined, consumers: number }[]}
 */
function buildOwnershipBlastRadius(evidence) {
  const ownerByIdentity = new Map(
    (evidence?.ownership?.contracts ?? []).map((c) => [`${c.file}#${c.exportName}`, c.owner]),
  )
  return (evidence?.dependency?.contracts ?? []).map((c) => ({
    contractName: c.contractName,
    owner: ownerByIdentity.get(`${c.file}#${c.exportName}`),
    consumers: c.consumingFiles?.length ?? 0,
  }))
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

  const evidence = result?.evidence
  const undocumentedVariables = (evidence?.finding?.findings ?? []).filter(
    (f) => f.code === "UNDOCUMENTED_VARIABLE",
  )
  if (undocumentedVariables.length > 0) {
    lines.push("## Undocumented variables", "", "| Variable | Contract | File |", "|---|---|---|")
    for (const f of undocumentedVariables)
      lines.push(`| \`${f.location.variable}\` | ${f.location.exportName} | ${f.location.file} |`)
    lines.push("")
  }

  const expiring = evidence?.lifecycle?.expiring ?? []
  if (expiring.length > 0) {
    lines.push(
      "## Expiring / expired secrets",
      "",
      "| Variable | Expires | Status | Compliance |",
      "|---|---|---|---|",
    )
    for (const e of expiring) {
      const status =
        e.daysRemaining < 0
          ? `**expired ${Math.abs(e.daysRemaining)}d ago**`
          : `${e.daysRemaining}d remaining`
      const metadata = findMetadata(evidence, e.file, e.exportName, e.key)
      const compliance = metadata?.compliance ?? "--"
      lines.push(
        `| ${e.key ? `\`${e.key}\`` : `(contract) ${e.exportName}`} | ${e.expiresAt} | ${status} | ${compliance} |`,
      )
    }
    lines.push("")
  }

  const ownershipBlastRadius = buildOwnershipBlastRadius(evidence)
  if (ownershipBlastRadius.length > 0) {
    const sorted = [...ownershipBlastRadius].sort((a, b) => b.consumers - a.consumers)
    lines.push(
      "## Ownership & Blast Radius",
      "",
      "| Contract | Owner | Blast radius (consumers) |",
      "|---|---|---|",
    )
    for (const entry of sorted)
      lines.push(`| ${entry.contractName} | ${entry.owner ?? "--"} | ${entry.consumers} |`)
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
 * Decides what a rotation-alert GitHub issue should say, from the Lifecycle
 * Model's `expiring` list (`result.evidence.lifecycle.expiring` -- same
 * shape, same field names, as the CLI's own former `docs.documentation
 * .expiringSoon`) -- no network access, so this is directly unit-testable
 * (unlike upsertRotationIssue/closeRotationIssueIfOpen below, which call
 * `gh` and follow report.mjs's existing convention of leaving gh-invoking
 * functions unexported/untested, same as upsertComment()/listComments() today).
 * @param {unknown} result
 * @returns {{ action: "close" } | { action: "open", title: string, body: string }}
 */
export function buildRotationAlert(result) {
  const expiring = result?.evidence?.lifecycle?.expiring ?? []
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
