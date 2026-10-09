---
"@maverickcer/env-cap": patch
---

With a `tsconfig.json` present and no usable compiler (the bundled TypeScript 6 stripped from an install), the build step now says so instead of failing with a raw "is not a function": the compiler check runs before the tsconfig is read. `tsconfig: false` is unchanged.
