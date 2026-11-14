# node

The Node file system adapter for the build entry (`@maverickcer/env-cap/node`).

`@maverickcer/env-cap/build` never imports `node:fs` (ADR 0040), so every generator takes the file
system as a required `fs` option. A Node build script passes `nodeBuildFileSystem`:

```ts
import { generateEnvArtifacts } from "@maverickcer/env-cap/build"
import { nodeBuildFileSystem } from "@maverickcer/env-cap/node"

await generateEnvArtifacts({ fs: nodeBuildFileSystem, root, manifest: { ... } })
```

Like `bin` and `./eslint-plugin`, this entry runs only in Node, and it is the one place the build
path loads `node:fs/promises`. In another runtime, implement the `BuildFileSystem` type that
`./build` exports instead.

## Variables

### nodeBuildFileSystem

```ts
const nodeBuildFileSystem: BuildFileSystem;
```

The Node-backed `BuildFileSystem`: the filesystem capability the build-time generators require.
