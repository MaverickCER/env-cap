---
"@maverickcer/env-cap": patch
---

Fixes the bundled GitHub Action (`action.yml`) referencing the unscoped
package name `env-cap`, which does not exist on the public npm registry --
only the published `@maverickcer/env-cap` does. Any workflow using this
Action via `npx --yes` (its documented fetch path) 404'd. Also clarifies
the `args` input's description to mention `--evidence`.
