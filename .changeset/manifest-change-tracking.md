---
"@maverickcer/env-cap": minor
---

`generateEnvManifest()`/`generateEnvArtifacts()` now track `documentEnv()` metadata changes across runs: a new `changes` field on the manifest result (also in `--json`/CLI output) reports contracts and variables added, removed, or updated since the last run, with field-level before/after values. Backed by a new committed sidecar snapshot file next to the manifest (`<location>.snapshot.json` — see [ADR 0021](specs/decisions/0021-manifest-change-report-persisted-snapshot.md)).

Also adds a new `duplicate-variable-documentation` warning: two active contracts documenting the same variable key with different `description`/`owner`/`expiresAt`/`refreshInstructions`/`required`/`extra` now produce a warning (never a hard error) naming exactly which fields diverge, alongside the existing processor/validator compatibility checks. `CompatibilityIssue` gains an optional `code` field, populated for this new check.
