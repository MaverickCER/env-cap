---
"@maverickcer/env-cap": minor
---

Add an `onExisting` option to `.env.example` generation (`envExample.onExisting` on `generateDocumentation()`/`generateEnvArtifacts()`, `--env-example-on-existing` on the CLI): `"keep-sibling"` (default, unchanged behavior — never overwrites, writes a timestamped sibling instead), `"overwrite"` (replace the existing file directly), or `"skip"` (write nothing when a file already exists).
