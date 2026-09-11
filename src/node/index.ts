// The `env-cap/node` entry point: the concrete, Node-backed
// `BuildFileSystem` adapter a caller of `env-cap/build` hands to
// `generateEnvArtifacts` / `checkEnvArtifacts` (and the standalone generator
// functions) as the required `fs` capability.
//
// This is an **executable-context** entry, exactly like `bin` and
// `./eslint-plugin` -- it is the sanctioned place `node:fs/promises` is
// acquired. `./build` itself never imports `node:fs` (ADR 0040); a consumer
// running the generators from their own build script imports the adapter from
// here:
//
// ```ts
// import { generateEnvArtifacts } from "env-cap/build"
// import { nodeBuildFileSystem } from "env-cap/node"
//
// await generateEnvArtifacts({ fs: nodeBuildFileSystem, root, manifest: { ... } })
// ```
//
// A consumer in a non-Node runtime supplies their own `BuildFileSystem`
// (`env-cap/build` exports the type) instead of importing this.
export { nodeBuildFileSystem } from "../cli/filesystem.js"
