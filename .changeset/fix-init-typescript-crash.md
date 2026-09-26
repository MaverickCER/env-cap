---
"@maverickcer/env-cap": patch
---

Fixes `env-cap init` and `env-cap --help` throwing
`ERR_MODULE_NOT_FOUND: Cannot find package 'typescript'` on a fresh install
with no `typescript` present. `typescript` is an optional peer dependency
(only required for build-time manifest generation), but a static top-level
import of `../build/index.js` was evaluated eagerly for every CLI
invocation, including the two commands that never touch it. `../build/index.js`
is now loaded with a dynamic `import()` inside `runCheckMode`/`runGenerateMode`
only.
