# 0002: Build Tooling Parses Schema Files as AST; It Never Imports or Executes Them

## Status

Accepted.

Implemented in:

- `src/build/discover.ts`
- `src/build/parse.ts`
- `src/build/literal-eval.ts`
- `src/build/link.ts`

## Context

`generateEnvManifest()` needs to understand the environment contracts defined throughout an application. For each discovered schema, the build process needs to determine:

- declared environment variable names
- available processors and validators
- static schema configuration such as defaults
- relationships between `createEnv()` definitions and `documentEnv()` metadata

The most straightforward approach would be to import each discovered schema file and inspect the exported objects.

For `env-cap`, that approach is intentionally avoided.

Importing discovered files creates two problems:

### 1. Discovery would become code execution

A build tool that scans a filesystem and imports every matching schema file would execute arbitrary application code during generation.

This is undesirable for a tool commonly used in:

- CI pipelines
- monorepos
- automated documentation generation
- deployment workflows

The generator should analyze application structure, not execute application behavior.

### 2. Runtime evaluation does not provide additional correctness

Environment values are not resolved during generation.

Processors and validators operate later when the application calls:

```ts
validateEnv({ manifest, values })
```

against actual environment values.

At build time, there is no meaningful resolved output from executing a processor because the real input does not exist yet.

The build tool needs to understand the declared contract, not execute the runtime contract.

## Decision

Schema files are analyzed using the TypeScript compiler API as an abstract syntax tree (AST).

The build system uses:

```ts
ts.createSourceFile()
```

for parsing.

It never uses:

- `import()`
- `require()`
- `eval()`
- transpilation followed by execution

Only statically analyzable expressions are evaluated.

`evaluateLiteral()` in `src/build/literal-eval.ts` resolves safe literal values:

Supported:

- string literals
- numeric literals
- boolean literals
- `null`
- unary negative numeric values
- arrays containing supported literals
- objects containing supported literals

Unsupported expressions are not guessed.

Examples that remain unresolved:

```ts
process.env.DEFAULT_VALUE
```

```ts
createDefault()
```

```ts
;`${prefix}_VALUE`
```

```ts
{
  ...sharedConfig
}
```

These resolve as unknown and are reported through parse warnings or unresolved links.

The same safety principle applies to file discovery and output generation:

- `discoverSchemaFiles()` prunes excluded directories such as `node_modules` and `.git` during traversal instead of scanning and filtering afterward.
- Generated output paths are validated with `resolveWithinRoot()` before writing to prevent configured locations from escaping the intended project root.

## Consequences

### Some valid JavaScript patterns are intentionally not discoverable

Schemas that are dynamically constructed cannot always be analyzed.

Examples:

```ts
createEnv(buildSchema())
```

```ts
createEnv({
  ...sharedVariables,
})
```

```ts
export { paymentsEnv } from "./shared"
```

These may produce unresolved entries or warnings instead of complete contract information.

This is an intentional limitation.

The generator prioritizes predictable analysis over attempting to execute arbitrary application logic.

### Conflict analysis is conservative

Because the build tool does not execute processors or validators, it cannot determine every possible runtime behavior.

It can identify conflicts that are statically provable.

For example:

```ts
(value): string
```

versus:

```ts
(value): boolean
```

for the same variable can be identified as incompatible.

However, two functions with unknown runtime behavior are treated as requiring developer review rather than being incorrectly classified.

This follows the principle:

> Prove what can be proven. Report uncertainty instead of inventing certainty.

### The build tool can safely analyze unfamiliar codebases

`generateEnvManifest()` can run against large repositories without executing discovered schema files.

This prevents a schema file from becoming an unexpected execution path during documentation or contract generation.

The build system analyzes source structure; it does not run application code.

### TypeScript is isolated to build tooling

AST analysis requires a TypeScript parser.

This is why `typescript` is associated only with the build functionality rather than the runtime package.

Runtime consumers do not need:

- TypeScript compiler APIs
- filesystem access
- source parsing
- code generation

The runtime remains dependency-free and environment agnostic.

## Alternatives Considered

### Import every discovered schema file

Rejected.

Although this provides direct access to exported objects, it introduces unnecessary code execution risk.

It also does not solve the full documentation problem because `documentEnv()` metadata is intentionally separate from runtime contracts.

A runtime import would still require an additional mechanism to discover and associate documentation metadata.

### Regex-based source scanning

Rejected.

Regex parsing is insufficient for understanding TypeScript semantics.

A real AST provides:

- reliable syntax analysis
- import relationship resolution
- TypeScript type information
- structural distinction between known and unknown values

It also enables more accurate cross-file linking between `createEnv()` and `documentEnv()` definitions.

## Summary

The build system intentionally behaves like a compiler analysis tool, not a runtime loader.

`env-cap` separates:

- **build time:** understand application structure safely
- **runtime:** validate and provide environment values

This keeps generation deterministic, avoids arbitrary code execution, and preserves the small runtime footprint that is central to the package design.
