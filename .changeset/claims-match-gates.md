---
"@maverickcer/env-cap": patch
---

Documentation, help text and message wording only. No flag, export, exit code, error code or behaviour changed.

- Sentences that said a CI job "does not yet block a merge" now name the job and say that the `required` check depends on it. That is because the branch ruleset requires `required`.
- A failed benchmark job now fails `contract` as well, so it can no longer pass a merge by skipping the other gate jobs.
- VERSIONING says which exit codes the surface baseline covers (`--help` of the CLI and of `init`) and which a test pins instead.
- `env-cap --help` lists the exit codes (`0` and `1` and when each applies), so the surface baseline records them. The codes themselves did not change.
- SECURITY no longer says that no release has run on the current release workflow.
- The `rotationStatus` value `"compliant"` keeps its name; its TSDoc no longer promises a rename at 1.0, only that a rename would need a major release.
- `env-cap init --help` rewords one sentence about next steps; the surface baseline is refreshed to match.
- README's entry-point table is now generated from `package.json` and `docs/surface.json`.
- Messages and generated text no longer use `--` as a dash: error and warning messages, the `.env.example` notes (`Disabled: feature ...`, `Also declared by ... See ...`), the ownership report's section text, the `init` output and starter template, and the published JSON Schema descriptions. Only the wording changed; codes, keys, file names and the `GENERATED FILE -- do not edit by hand` banner are unchanged.
- A new test fails when a published JSON Schema removes, retypes or makes optional a field while its `schemaVersion` stays the same.
- SECURITY says the release requires both `contract` and `required`.
- The package description, keywords, README opening, landing page and agent skill now say in one sentence what env-cap is, what it reports, what it works alongside and what it does not do.
- `env-cap --help` opens with what the CLI writes ("the manifest your app passes to `validateEnv()`, an evidence file, or both") and calls the `--evidence` output the evidence file. The flags and exit codes are unchanged.
- Each entry point (`./build`, `./helpers`, `./node`, `./evidence`, `./eslint-plugin`) now has a module overview in the API reference.
- A test fails when a document's list of CI-tested Node versions differs from the `verify` matrix in ci.yml.
- The npm description, README, landing page and agent skill open with one pitch: each feature declares its variables and their format, and your app validates them at startup and reports how to rotate them before they expire. A test fails when the four copies differ.
- The README's first screen shows the startup error the `init` starter contract throws for a bad value. A test runs `validateEnv()` on that contract and fails when the excerpt differs.
- `PROMPT.md` is removed from the package; the agent skill and `AGENTS.md` carry its rules.
- The `ManifestChangeReport` description in the published JSON Schema no longer points at source code the reader cannot see.
- A new test runs the README quick start (`env-cap init`, then the scaffolded `scripts/generate-env.mjs`) against the built package, so the README and landing page no longer say CI skips it.
