---
"@maverickcer/env-cap": patch
---

`env-cap --help` is shorter and shows examples, with the options grouped by what they are for and no decision-record numbers. Shared build-tooling code (glob, path display, tsconfig path resolution, the generated-file banner, the no-node-fs rule) is now carried as managed copies of the standard's, so a fix lands once. The `/build` types change only in compatible ways: optional options also accept `undefined`, and `configurationReference`, `expiringSoonReport` and `ownershipSummary` also expose the `project` step they are built from.
