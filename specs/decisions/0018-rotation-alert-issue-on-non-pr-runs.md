# 0018: The GitHub Action opens/auto-closes a rotation-alert issue when a run has no PR to comment on

## Status

Accepted. Implemented in `scripts/github-action/report.mjs`
(`buildRotationAlert()`, `upsertRotationIssue()`, `closeRotationIssueIfOpen()`)
and `action.yml`'s `rotation-alert` input.

## Context

`documentEnv()`'s `expiresAt`/`rotationCadence`/`refreshInstructions` fields
and the generated docs' "Lifecycle report" already give a project real,
checkable rotation metadata (ADR 0006-adjacent territory). The Action
(`action.yml`) already turns a `--json` report into inline PR annotations
and a sticky PR comment -- but both delivery mechanisms require a PR to
attach to. `main()`'s existing gate
(`GITHUB_EVENT_NAME === "pull_request" && prNumber`) means a run triggered
by `schedule`, `workflow_dispatch`, or a plain `push` produces annotations
that only appear in a workflow run log nobody opens, and a job summary that
populates a run page nobody visits. On a repository nobody has touched in
months -- exactly the case where a variable is most likely to quietly
expire unnoticed -- there was no alert path at all.

Every piece this needs already exists and is already tested:
`doc.expiringSoon` (from `--expiring-within-days`), `collectDocumentationFindings()`'s
existing error/warning split on `daysRemaining < 0`, and
`renderMarkdownSummary()`'s "Expiring / expired secrets" table. This is
additive glue over working infrastructure, not new plumbing.

## Decision

- **GitHub Issues, not a workflow failure or a third-party integration.**
  An issue is persistent (survives past the single workflow run that created
  it), triggers GitHub's own email notification to repository watchers, and
  works identically whether the repository is actively developed or
  dormant. A failed scheduled workflow was rejected: `process.exitCode`
  already carries a different meaning for this CLI/Action, and a "red X" on
  a scheduled workflow is easy for GitHub's own UI to bury or for a
  maintainer to mute after the first false alarm. A third-party
  notification integration (Slack webhook, email API) was rejected as a
  new, undeclared dependency that breaks the Action's dependency-free
  design (`scripts/check-size.mjs`'s header comment states this convention
  for the CLI/build tooling; the Action follows the same principle by only
  ever calling the preinstalled `gh` CLI).
- **Gated on "no PR available to comment on," not a `schedule`-specific
  event-name check.** `main()`'s existing branch already distinguishes "is
  there a PR to comment on" from every other case; the rotation-alert path
  is simply the `else` of that same condition. This is strictly more
  general than checking `GITHUB_EVENT_NAME === "schedule"` -- it also
  covers a plain `push`-triggered run with no associated PR (e.g. a direct
  push to `main`), which a schedule-specific check would miss.
- **Auto-close once nothing is left to report**, rather than leaving a
  stale alert open indefinitely. `buildRotationAlert()` returns
  `{ action: "close" }` whenever `expiringSoon` is empty; `main()` maps that
  straight to `closeRotationIssueIfOpen()`, which also leaves a closing
  comment explaining why, so the issue's own timeline stays legible.
- **Upsert by marker comment, not by title.** `` `<!-- env-cap-rotation-alert:${reportKey} -->` ``
  mirrors `upsertComment()`'s existing PR-comment pattern exactly --
  `listOpenRotationIssues()` finds the one open issue (if any) carrying that
  marker in its body and PATCHes it, rather than risking a duplicate issue
  each run or matching on a title string a maintainer might reasonably edit.
- **No default label on the created issue.** Requiring a label to already
  exist in every consuming repository (or relying on the API's
  auto-create-label behavior) is an avoidable fragility for a first
  version. An optional `label` input is a natural, backward-compatible
  future addition once real usage shows it's wanted -- not something to
  guess at now.

## Consequences

- A repository that adds the scheduled workflow example from the README
  gets a real alert path even if nobody opens the Actions tab for months --
  the email GitHub sends to issue watchers when the issue opens is the
  actual notification mechanism, not the workflow run itself.
- `rotation-alert: "true"` is the default, but the calling workflow must
  still grant `issues: write` in its own `permissions:` block for the
  `gh api` calls to succeed; the README's copy-pasteable example workflow
  states this explicitly.
- `listOpenRotationIssues()`/`upsertRotationIssue()`/`closeRotationIssueIfOpen()`
  stay unexported and untested by the unit suite, consistent with
  `upsertComment()`/`listComments()` today -- all four call the `gh` CLI
  directly, which isn't economically unit-testable without a real GitHub
  API or heavy process-mocking. `buildRotationAlert()` is the pure,
  unit-tested boundary; the `gh`-invoking functions are exercised manually
  against a real test repository (see the verification checklist).
- Running this on every push to `main` (not just scheduled runs) is
  harmless by construction: the marker-based upsert never creates a
  duplicate issue, and closing an already-closed alert is a no-op via
  `listOpenRotationIssues()`'s empty result.

## Alternatives considered

- **Fail the workflow (non-zero exit) instead of opening an issue.**
  Rejected -- conflates "the Action found something to report" with "the
  Action itself malfunctioned," and a failed scheduled workflow has no
  persistent, human-visible artifact the way an issue does.
- **A Slack/email integration.** Rejected -- a new external dependency
  (webhook URL, API credentials) the Action would need to manage, breaking
  the dependency-free design every other part of this tool follows.
- **Event-name allowlist (`schedule`, `workflow_dispatch`) instead of
  "no PR available."** Rejected as needlessly narrower for no benefit --
  it would miss a plain `push` run with no PR, and the actual constraint
  driving this feature ("nothing to comment on") is exactly what the
  broader check already expresses.
