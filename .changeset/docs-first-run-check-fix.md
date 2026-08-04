---
"@maverickcer/env-cap": patch
---

Fix `--check` (and `checkEnvArtifacts()`) always reporting the `docs` artifact as stale on the very first check immediately following a project's very first-ever documentation generation, with no real drift involved. `renderDocs()`'s "Changes since last report" section now renders "No changes." on a true first run too, instead of being omitted — the omission broke the fixed-point property `--check`'s comparison depends on (regenerating using a file's own content as `previousContent` must reproduce that file exactly). See [ADR 0016](specs/decisions/0016-check-mode-compute-before-compare-never-partial-write.md).
