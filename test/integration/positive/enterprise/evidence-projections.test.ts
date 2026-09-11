import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { compareGoldenArtifacts, isInstalled, runScript } from "../../../support/example-runner.js"

/**
 * evidence-projections demonstrates env-cap's first-party reference
 * projections -- the original ten (ADR 0024/0031/0032) plus an eleventh,
 * Joined Variable View, added afterward as a copyable cross-model join
 * example -- each built entirely through the public
 * API -- generateEvidenceModel() (env-cap/build) and
 * defineEvidenceProjection() (env-cap/evidence) -- with no
 * privileged internal access, the same two entry points any consumer would
 * import. It reuses examples/application's exact schema (src/env.ts) so each
 * projection's output can be verified against the existing, already-tested
 * rendering path on the exact same input.
 *
 * Each `project:*` npm script already runs `generate:env` first as its own
 * baseline step (see package.json) -- these tests don't call it separately
 * beforehand, to avoid redundant subprocess overhead across four tests each
 * spawning real `npm run` child processes.
 *
 * Phase 15: the ".env.example Artifact" -- byte-identical to the direct
 * generateEnvArtifacts() path, by construction (see projections/env-example.mjs).
 * Phase 16-18: verified via the standard expected/ golden-file mechanism
 * instead of byte-identity, since Contract Model's canonical ordering
 * (contracts and variables alike) diverges from the direct path's
 * scan/declaration order for schemas like this one -- see each
 * projection's own doc comment.
 */
const EXAMPLE = "evidence-projections"
const EXAMPLE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), EXAMPLE)
const installed = isInstalled(EXAMPLE_DIR)

describe(EXAMPLE, () => {
  it.skipIf(!installed)(
    "projected .env.example matches its golden expected/ copy (byte-identical to the directly-generated one)",
    async () => {
      const stdout = runScript(EXAMPLE_DIR, "project:env-example")
      expect(stdout).toContain(
        "Projected .env.example is byte-identical to the directly-generated one.",
      )
      await compareGoldenArtifacts(EXAMPLE_DIR, [".env.example"])
    },
  )

  it.skipIf(!installed)(
    "projected Environment Configuration Reference matches its golden expected/ copy",
    async () => {
      runScript(EXAMPLE_DIR, "project:config-reference")
      await compareGoldenArtifacts(EXAMPLE_DIR, ["projected-config-reference.md"])
    },
  )

  it.skipIf(!installed)(
    "projected Configuration Inventory matches its golden expected/ copy",
    async () => {
      runScript(EXAMPLE_DIR, "project:inventory")
      await compareGoldenArtifacts(EXAMPLE_DIR, ["projected-inventory.json"])
    },
  )

  it.skipIf(!installed)(
    "projected Configuration Ownership matches its golden expected/ copy",
    async () => {
      runScript(EXAMPLE_DIR, "project:ownership")
      await compareGoldenArtifacts(EXAMPLE_DIR, ["projected-ownership.json"])
    },
  )

  it.skipIf(!installed)(
    "projected Configuration Lifecycle matches its golden expected/ copy",
    async () => {
      runScript(EXAMPLE_DIR, "project:lifecycle")
      await compareGoldenArtifacts(EXAMPLE_DIR, ["projected-lifecycle.json"])
    },
  )

  it.skipIf(!installed)(
    "projected Configuration Dependency (DOT/Mermaid/JSON) matches its golden expected/ copies",
    async () => {
      runScript(EXAMPLE_DIR, "project:dependency-graph")
      await compareGoldenArtifacts(EXAMPLE_DIR, [
        "projected-dependency-graph.dot",
        "projected-dependency-graph.mmd",
        "projected-dependency-graph.json",
      ])
    },
  )

  it.skipIf(!installed)(
    "projected unified filterable Finding list matches its golden expected/ copy",
    async () => {
      runScript(EXAMPLE_DIR, "project:findings")
      await compareGoldenArtifacts(EXAMPLE_DIR, ["projected-findings.json"])
    },
  )

  it.skipIf(!installed)(
    "projected Configuration Drift matches its golden expected/ copy",
    async () => {
      const stdout = runScript(EXAMPLE_DIR, "project:drift")
      expect(stdout).toContain("No drift -- every checked artifact is up to date.")
      await compareGoldenArtifacts(EXAMPLE_DIR, ["projected-drift.json"])
    },
  )

  // Correctly empty for this fixture: src/env.ts hasn't changed since the
  // committed manifest snapshot, so there's nothing to migrate. The
  // correlation logic itself (renamedFrom -> RenamedVariable) is already
  // covered by test/build/change-model.test.ts; this only exercises the
  // projection's own reshape over already-tested data.
  it.skipIf(!installed)(
    "projected Configuration Migration matches its golden expected/ copy (empty -- no changes since the snapshot)",
    async () => {
      const stdout = runScript(EXAMPLE_DIR, "project:migration")
      expect(stdout).toContain("No migration steps needed")
      await compareGoldenArtifacts(EXAMPLE_DIR, ["projected-migration.json"])
    },
  )

  it.skipIf(!installed)(
    "projected Change Impact A (audit trail) matches its golden expected/ copy",
    async () => {
      const stdout = runScript(EXAMPLE_DIR, "project:change-impact-audit-trail")
      expect(stdout).toContain("No changes since the committed manifest snapshot.")
      await compareGoldenArtifacts(EXAMPLE_DIR, ["projected-audit-trail.json"])
    },
  )

  // Correctly empty for this fixture, same reason as Migration/Audit
  // Trail's. The correlation logic itself was verified manually against a
  // fresh (no-snapshot) run during development -- every changed variable
  // and the contract correctly correlated to src/server.ts as their one
  // real consumer, with totalDistinctFilesAffected deduplicating across
  // both -- see projections/change-impact-blast-radius.mjs's own doc
  // comment.
  it.skipIf(!installed)(
    "projected Change Impact B (blast radius) matches its golden expected/ copy",
    async () => {
      const stdout = runScript(EXAMPLE_DIR, "project:change-impact-blast-radius")
      expect(stdout).toContain("nothing to correlate")
      await compareGoldenArtifacts(EXAMPLE_DIR, ["projected-blast-radius.json"])
    },
  )

  it.skipIf(!installed)(
    "projected Joined Variable View matches its golden expected/ copy",
    async () => {
      const stdout = runScript(EXAMPLE_DIR, "project:joined-variables")
      expect(stdout).toContain("joined variable row(s)")
      await compareGoldenArtifacts(EXAMPLE_DIR, ["projected-joined-variables.json"])
    },
  )
})
