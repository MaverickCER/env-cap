# 0004: No `env-cap/client` or `/server` package

## Status

Accepted. Reflected in `package.json`'s `exports` map (only `.`, `./build`,
and `./helpers`) and documented in the README's ["Runtime and build-time are
intentionally separate"](../../GUIDE.md#runtime-and-build-time-are-intentionally-separate)
section.

## Context

Many environment-management libraries provide separate `/client` and
`/server` entry points to reduce the risk of exposing server-only
configuration to browser bundles. These packages typically enforce the
distinction by creating separate APIs or schema types that prevent server
variables from being referenced in client code.

`env-cap` needs to support the same goal: allowing applications to
maintain clear boundaries between server-only configuration and
client-safe configuration without introducing unnecessary runtime
complexity.

## Decision

`env-cap` does not provide separate `/client` or `/server` subpath
exports.

The runtime API (`createEnv` and `validateEnv`) is intentionally identical
for all environments. A variable's classification as server-only or
client-safe does not change how it is processed, validated, or accessed at
runtime. There is no different runtime behavior that would justify separate
packages.

The separation happens at build time through generated contract. Projects
should generate separate contract for separate execution environments using
disjoint discovery rules:

```js
await generateEnvManifest({
  location: "src/generated/server.contract.ts",
  include: ["server/**/env.schema.ts"],
})

await generateEnvManifest({
  location: "src/generated/client.contract.ts",
  include: ["web/**/env.schema.ts"],
})
```

The application architecture is responsible for ensuring that
server-generated contract are only imported by server-side code and
client-generated contract are only imported by browser-bound code. This
follows the same dependency-boundary rules used throughout an application:
server-only modules should not be imported into client code.

## Consequences

- **The package does not pretend to provide enforcement it cannot guarantee.**
  Separate `/client` and `/server` packages would not fully prevent
  accidental exposure. A developer could still misconfigure discovery
  patterns or import a server contract directly into client code. The actual
  security boundary remains the application's module graph and build
  configuration.

- **The public API remains smaller and more accurate.**
  Separate entry points would suggest different runtime capabilities or
  behaviors that do not exist. Maintaining two nearly identical APIs would
  add maintenance cost while providing little additional protection.

- **Environment separation remains explicit and project-owned.**
  Different applications have different definitions of what is client-safe,
  server-only, internal, or public. `env-cap` does not impose a
  universal classification system. Teams define those boundaries through
  their schema organization, generated contract, and documentation.

- **Build-time metadata remains separate from runtime behavior.**
  Whether a variable is categorized as server-only or client-safe is a
  build and deployment concern, not something the runtime needs to process.
  This keeps the runtime contract minimal and avoids carrying metadata that
  has no effect during validation.

## Alternatives considered

- **Parallel `/client` and `/server` packages with identical APIs.**
  Rejected. This would imply a runtime distinction that does not exist,
  double the public API surface, and require every future runtime change to
  be maintained across multiple entry points. It would also not prevent
  incorrect imports or incorrectly generated contract.

- **A `runtime: "server" | "client"` option on `createEnv`.**
  Rejected. This would add classification data to the runtime schema even
  though the runtime does not use it. It would blur the boundary between
  runtime configuration processing and build-time concerns. Environment
  classification belongs with build tooling and documentation, not the
  runtime contract itself.

- **Automatic detection of client/server usage at runtime.**
  Rejected. Runtime detection would be framework-dependent, unreliable
  across different deployment targets, and would introduce complexity into
  the smallest and most security-sensitive part of the package. The package
  should remain environment-agnostic and allow the application's build
  system to define the correct boundary.

## Update (see ADR 0022)

[ADR 0022](0022-validation-contexts.md) later added a generic
`context`/`activeContexts` mechanism to `createEnv()`/`validateEnv()`.
This is _not_ the `runtime: "server" | "client"` option rejected above:
that alternative was a closed, client/server-specific enum that implied a
bundling boundary the runtime can't actually enforce. `context` is an
open, application-defined string (never interpreted by env-cap, never
limited to client/server) that only gates whether `validateEnv()`
processes a variable in a given run -- it makes no claim about, and is not
a substitute for, the module-boundary decision made above. Separate
discovery/manifests remain the only real mechanism for keeping
server-only source out of client-bound code.
