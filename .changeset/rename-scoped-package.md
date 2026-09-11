---
"@maverickcer/env-cap": patch
---

Publish as the scoped package `@maverickcer/env-cap` instead of `env-cap` -- npm rejected the unscoped name as "too similar to existing packages" (`env-cmd`, `env-var`). The `env-cap` CLI binary name, `npx env-cap` invocation, and all subpath exports (`/build`, `/node`, `/helpers`, `/evidence`, `/eslint-plugin`, `/schema`) are unchanged; only the install/import specifier changes, e.g. `npm install @maverickcer/env-cap` and `import { createEnv } from "@maverickcer/env-cap"`.
