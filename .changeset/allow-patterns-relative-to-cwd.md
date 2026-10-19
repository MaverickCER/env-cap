---
"@maverickcer/env-cap": patch
---

fix(eslint-plugin): an `allow` pattern written relative to the working directory, such as `scripts/**`, now matches the absolute path ESLint passes a rule (on Windows too), in `no-raw-process-env` and `no-node-fs`; a `**/`-prefixed pattern matched before and still does. `no-node-fs` also reports `node:fs` reached through a re-export or TypeScript's `import x = require()`. Each rule's documentation link now opens the guide's ESLint plugin section; the README anchor it pointed at did not exist.
