# env-cap Guide

Find your entry point in the table below; its section starts with the problem it solves and states each limit next to its promise. Snippets name the CI-run file they come from, or say they are illustrative.

For the overview and quick start, read [README.md](README.md). For the reasons behind the design, read [specs/architecture.md](specs/architecture.md) and the [ADRs](specs/decisions/).

## Find your part

| You are                                                  | Entry point                                              | Start at                                                         |
| -------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------- |
| An application developer bitten by an undefined variable | `@maverickcer/env-cap`                                   | [The runtime](#application-developers-the-runtime)               |
| The same developer writing processors and validators     | `@maverickcer/env-cap/helpers`                           | [Helpers](#application-developers-helpers)                       |
| A platform engineer who owns the CI pipeline             | `@maverickcer/env-cap/build`, the CLI, the GitHub Action | [Generating artifacts](#platform-engineers-generating-artifacts) |
| A reviewer who needs an inventory of secrets and owners  | `@maverickcer/env-cap/evidence`                          | [Evidence](#reviewers-evidence)                                  |
| A build-script author on Node                            | `@maverickcer/env-cap/node`                              | [The Node adapter](#build-script-authors-the-node-adapter)       |
| A lint owner                                             | `@maverickcer/env-cap/eslint-plugin`                     | [ESLint plugin](#eslint-plugin)                                  |

## Application developers: the runtime

**What it solves:** your application fails at startup with every bad variable's name, never its value, instead of crashing later in a request.

### Capability-owned contracts

Each feature declares the variables it owns, next to the validation it needs. This contract is illustrative. The contract CI runs is [`examples/application/src/env.ts`](https://github.com/MaverickCER/env-cap/blob/main/examples/application/src/env.ts).

```ts
// features/payments/env.schema.ts

import { createEnv, documentEnv } from "@maverickcer/env-cap"

const paymentsSchema = {
  STRIPE_KEY: {
    validator(value: string) {
      return value.startsWith("sk_") || 'Expected a Stripe secret key starting with "sk_".'
    },
  },
}

export const paymentsEnv = createEnv(paymentsSchema, { name: "payments" })

documentEnv(paymentsSchema, {
  category: "Payments",
  owner: "payments-team",
  variables: {
    STRIPE_KEY: {
      description: "Stripe secret key used to create charges and process refunds.",
      owner: "payments-team",
      expiresAt: "2027-01-01",
      refreshInstructions: "Rotate in AWS Secrets Manager, then redeploy.",
      sensitivity: "secret",
    },
  },
})
```

`createEnv()` takes what validation needs: `default`, `processor`, `validator` and `context`. `documentEnv()` takes what people need: owners, descriptions and expiry dates. `documentEnv()` has no runtime effect (`test/runtime/document.test.ts`), but its literals ship in any bundle that imports the file.

There is no global `env` object. Code reads a value through the contract that owns it:

```ts
paymentsEnv.STRIPE_KEY
```

Validation stays application-wide. One `validateEnv()` call checks every contract in the generated manifest and reports every failure in one `EnvValidationError` (`test/runtime/validate.test.ts`).

### Core workflow

#### 1. Define your environment contract

Start with one central contract if that is what you have. This snippet is illustrative; [`examples/application/src/env.ts`](https://github.com/MaverickCER/env-cap/blob/main/examples/application/src/env.ts) is the central contract CI runs.

```ts
// src/env.ts
import { createEnv } from "@maverickcer/env-cap"

export const env = createEnv(
  {
    DATABASE_URL: {
      validator(value: string) {
        return value.startsWith("postgres://") || "Expected a PostgreSQL connection string."
      },
    },
    PORT: { default: 3000, processor: (value: string) => Number(value) },
  },
  { name: "application" },
)
```

Move contracts next to the features that consume them when ownership starts to matter. The runtime model does not change:

```text
src/features/payments/env.schema.ts
src/features/database/env.schema.ts
packages/paypal-addon/src/env.schema.ts
```

[`examples/application`](https://github.com/MaverickCER/env-cap/tree/main/examples/application) keeps one contract; [`examples/team-service`](https://github.com/MaverickCER/env-cap/tree/main/examples/team-service) splits it per feature.

#### 2. Generate the project view

A build step, run in development or CI, writes the manifest your startup code imports. The platform engineer's section covers the options; the short form is the CLI:

```sh
npx env-cap --location src/generated/env.manifest.ts --evidence docs/env.evidence.json
```

Schema files are parsed, never imported or run (`test/build/parse.test.ts`). A schema built by a function, or a spread at the top of a schema object, produces a parse warning. A spread nested inside a variable's definition or its `documentEnv()` entry is skipped without one. Nothing is guessed.

#### 3. Validate once during startup

```ts
import { validateEnv } from "@maverickcer/env-cap"
import { manifest } from "./generated/env.manifest"

await validateEnv({ manifest, values: process.env })
```

What happens, and where each rule is tested:

| Situation                                      | Result                                                                | Test                            |
| ---------------------------------------------- | --------------------------------------------------------------------- | ------------------------------- |
| A contract is read before `validateEnv()` ends | Throws `EnvNotReadyError`                                             | `test/runtime/create.test.ts`   |
| Several variables fail                         | One `EnvValidationError` lists every failure                          | `test/runtime/validate.test.ts` |
| A failure message                              | Carries variable and contract names and your message, never the value | `test/runtime/validate.test.ts` |
| `validateEnv()` is called again                | Returns or rethrows the first outcome without re-running validators   | `test/runtime/validate.test.ts` |
| A test needs a fresh run                       | `resetEnvCache()` clears the cached outcome                           | `test/runtime/reset.test.ts`    |

The record of validated values is frozen. The freeze is shallow: an object, array or `URL` that a processor returns stays mutable.

A test suite that validates several scenarios in one process resets between them:

```ts
import { resetEnvCache, validateEnv } from "@maverickcer/env-cap"

await validateEnv({ manifest, values: scenarioA })
resetEnvCache()
await validateEnv({ manifest, values: scenarioB })
```

Without `resetEnvCache()`, the second call returns the first call's result.

### Validation contexts

A variable can belong to one validation context, a plain string your application chooses. These snippets are illustrative; the CI-run fixture is [`validation-contexts`](https://github.com/MaverickCER/env-cap/tree/main/test/integration/positive/team/validation-contexts).

```ts
DATABASE_URL: { context: "server", validator: validators.required() }
STRIPE_LIVE_KEY: { context: "production", validator: validators.required() }
QUEUE_CONCURRENCY: { context: "worker", default: 4 }
```

Pass the contexts that apply to this process:

```ts
await validateEnv({
  manifest,
  values: process.env,
  activeContexts: [
    typeof window === "undefined" ? "server" : "client",
    process.env.NODE_ENV === "production" ? "production" : "development",
  ],
})
```

A variable takes part in a run by these rules:

1. A variable with no `context` takes part in every run.
2. A variable with a `context` takes part only when `activeContexts` contains that exact string.
3. A skipped variable runs no default, processor or validator, and reading it throws `EnvNotReadyError`.
4. env-cap never inspects `window` or `NODE_ENV`; your code computes `activeContexts`.

When any variable declares a context, the generated manifest also exports `activeContexts`, listing every context it found. Treat it as a starting point and narrow it per process, as [`validation-contexts`](https://github.com/MaverickCER/env-cap/tree/main/test/integration/positive/team/validation-contexts) does.

**Contexts are not a security or bundling boundary.** They decide whether a run validates a variable, nothing else. A `context: "server"` variable in a schema that a client bundle imports still ships its definition and any literal `default`. Keep server-only variables in a separate schema and manifest ([ADR 0004](specs/decisions/0004-no-client-server-package-split.md), [ADR 0022](specs/decisions/0022-validation-contexts.md)).

### Security model

What the runtime refuses to do, and what enforces each refusal:

| The runtime does not           | Enforced by                                                                                   | Limit                                                                |
| ------------------------------ | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Touch the filesystem           | A lint ban on `node:fs` in `src/` outside the CLI, and the `AmbientCapabilities` tarball scan | The scan is textual                                                  |
| Read `process.env`             | The `AmbientCapabilities` scan and the browser-bundle test                                    | `globalThis["process"]` would evade both                             |
| Open a network connection      | The `ipc/no-network` lint rule on env-cap's own `src/`                                        | Source lint only; the bundled TypeScript compiler is not covered     |
| Show values when logged        | `test/runtime/create.test.ts`: `console.log`, `String()`, `JSON.stringify`, templates         | Spreading a contract or calling `Object.entries()` reads every value |
| Put values in errors           | `test/runtime/validate.test.ts`                                                               | Your own validator or processor message is passed through verbatim   |
| Fetch, store or rotate secrets | No such code exists; `documentEnv()` fields are documentation only                            | Not a check; read the source                                         |

Logged, a contract prints a marker instead of its values:

```txt
EnvContract("payments") { 1 variable(s) }
```

The full model, including what stays your responsibility, is in [SECURITY.md](SECURITY.md).

### Troubleshooting

env-cap defines these error classes. A contract from the other module format throws a `TypeError` ([dual-package hazard](SECURITY.md#dual-package-hazard)), and a processor called outside `validateEnv()` throws a plain `Error`.

| Error                             | Thrown by                 | Common cause                                                                             | Fix                                                                        |
| --------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `EnvNotReadyError`                | Reading `someEnv.KEY`     | The contract was read before `validateEnv()` finished, or its context was not active     | Await `validateEnv()` at startup, before application code reads values     |
| `EnvValidationError`              | `validateEnv()`           | A processor or validator rejected one or more variables                                  | Read `error.failures`: one entry per variable, with names and your message |
| `EnvManifestGenerationError`      | `generateEnvManifest()`   | Conflicting explicit processor types for one variable, or `location` outside `root`      | Read `error.issues`; fix the definitions or the output path                |
| `EnvDocumentationGenerationError` | `generateDocumentation()` | `location` or `envExample.location` outside `root`                                       | Correct the output path                                                    |
| `EnvUsageAnalysisError`           | `generateUsageReport()`   | `report.location` outside `root`                                                         | Correct the output path                                                    |
| `EnvProjectGenerationError`       | `generateEnvArtifacts()`  | Any of the above, collected across the requested passes, or an exclusive-group violation | Fix the underlying error; every failure is listed in one result            |

Documentation and ownership findings never throw. They are reported as findings in the evidence file, and fail a run only under a `--strict*` flag.

**A schema's variable is missing from the manifest.** Discovery reads an inline object literal or a resolvable `const`. A spread or a factory produces a parse warning; read `result.parseWarnings` or the CLI output ([ADR 0002](specs/decisions/0002-static-analysis-never-execution.md)).

**A contract imported through a path alias shows as abandoned.** Check that `tsconfig.json` sits at `root` and declares `paths` or `baseUrl`. Otherwise, point `tsconfig` at the right file. Discovery does not search upward ([path aliases](#typescript-path-aliases-pathsbaseurl)).

**A listed package's contract is not discovered.** Look for a `(package) <name>` entry in `result.parseWarnings`. The package must declare `envCap.schema` pointing at a `.ts` or `.tsx` file inside itself ([reusable packages](#reusable-packages)).

**A second `validateEnv()` call returned the first result.** That is the cache ([step 3](#3-validate-once-during-startup)). Call `resetEnvCache()` between scenarios.

**Discovery fails with a "sanity limit" error.** `discoverSchemaFiles` refuses to return more files than `MAX_DISCOVERED_SCHEMA_FILES`. The usual cause is a `root` or `include` far broader than intended, such as an unset `root` falling back to a large working directory. Narrow `root`, `include` or `exclude`.

## Application developers: helpers

**What it solves:** small, composable processors and validators for when a validation library is more than a variable needs. This snippet is illustrative; [`examples/application/src/env.ts`](https://github.com/MaverickCER/env-cap/blob/main/examples/application/src/env.ts) uses `processors` and `validators` in CI.

```ts
import { createEnv } from "@maverickcer/env-cap"
import { processors, validators } from "@maverickcer/env-cap/helpers"

export const databaseEnv = createEnv(
  {
    DATABASE_URL: { processor: processors.toURL(), validator: validators.required() },
    PORT: {
      default: 5432,
      processor: processors.toNumber(),
      validator: validators.range(1, 65535),
    },
  },
  { name: "database" },
)
```

- **The `Buffer` caveat:** `processors.base64()` returns a Node `Buffer`. Use it only where `Buffer` exists, or decode with your own processor. Every other helper uses Web globals only (`test/runtime/browser-bundle.test.ts`).
- **Cost:** `./helpers` stays under 4 KB gzip, enforced by the `Size` check. Unused helpers are dropped by esbuild (`test/helpers/tree-shaking.test.ts`); other bundlers are not tested.
- **Messages:** a processor that receives `undefined` or `null` names the type, not the value (`test/helpers/processors.test.ts`).
- **Optional:** keep Zod, envalid or your own functions if you have them. Any function returning `true` or a message works as a validator.

The full list is in the [API reference](https://maverickcer.github.io/env-cap/api/) and [src/helpers/index.ts](https://github.com/MaverickCER/env-cap/blob/main/src/helpers/index.ts).

## Platform engineers: generating artifacts

**What it solves:** generated manifests, documentation that cannot go stale, and drift that fails a pull request instead of reaching production.

The build entry discovers every `env.schema.ts`, parses it, and writes the artifacts you ask for. It needs a filesystem from its caller; on Node, pass `nodeBuildFileSystem`. This is the script `env-cap init` scaffolds, pinned by `test/cli/init.test.ts`:

```ts
import { generateEnvArtifacts } from "@maverickcer/env-cap/build"
import { nodeBuildFileSystem } from "@maverickcer/env-cap/node"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const result = await generateEnvArtifacts({
  fs: nodeBuildFileSystem,
  root,
  manifest: { location: "src/generated/env.manifest.ts" },
  docs: {
    location: "docs/ENVIRONMENT.md",
    envExample: { location: ".env.example", onExisting: "keep-sibling" },
  },
  usage: { report: { location: "docs/ENV-OWNERSHIP.md" } },
})
```

What the build step promises, and where it stops:

| Promise                                                                                       | Test                                                                     | Limit                                                                      |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Schema files are parsed, never imported or run                                                | `test/build/parse.test.ts` (a throwing top-level statement never runs)   | Lint does not ban `import()` or `vm` in `src/build`; reviewers check that  |
| Only literal values are resolved; anything dynamic is reported as unresolved                  | `test/build/parse.test.ts`, `test/build/literal-eval.test.ts`            | None found                                                                 |
| An output path that is absolute outside `root`, or climbs out with `..`, fails before writing | `test/build/manifest-generate.test.ts`, `documentation-generate.test.ts` | The check is lexical; a symlinked directory inside `root` can lead outside |
| An existing `.env.example` is never overwritten by default                                    | `test/build/env-example.test.ts`                                         | `onExisting: "overwrite"` opts out                                         |
| Discovery never enters `node_modules` or `.git`                                               | `test/build/discover.test.ts`                                            | None found                                                                 |

Every artifact separates **declared** facts from **proven** ones. Declared facts come from `documentEnv()`: owner, sensitivity, expiry. env-cap checks they are present, never that they are true. Proven facts come from the syntax tree: which variables are consumed, and the dependency graph. [`specs/generated-artifacts.md`](specs/generated-artifacts.md) lists each artifact and the models it reads.

### Change tracking via the evidence file

Pass `evidence` to also write the full Evidence Model, with a change report against the previous file:

```ts
const result = await generateEnvArtifacts({
  fs: nodeBuildFileSystem,
  root,
  manifest: { location: "src/generated/env.manifest.ts" },
  evidence: { location: "docs/env.evidence.json" },
})

result.evidence.change.manifest.addedVariables
result.evidence.change.manifest.updatedVariables
result.evidence.change.manifest.removedVariables
```

Writing it also writes `docs/env.evidence.json.fingerprint`, a content hash `getEvidenceModel()` uses to skip a rebuild when nothing changed.

Commit both files, as you commit the manifest. The diff then means "since the last commit on this branch", which a reviewer can read ([ADR 0038](specs/decisions/0038-always-computed-evidence-model-backs-generate-check-docs.md)).

1. A diff is expected when a `documentEnv()` field or a contract's `active`, `category` or `exclusiveGroup` changes.
2. Every run with `--evidence` rewrites both files; there is no separate update step.
3. A diff worth a second look is one nobody meant to make, such as an `updatedVariables` entry in an unrelated change.

Two active contracts that document the same variable differently produce a `DUPLICATE_VARIABLE_DOCUMENTATION` warning, which only `--strict` turns into an error.

### Reusable packages

A package can ship its own contract, and a consuming application can discover it. Discovery is opt-in, by exact package name:

```ts
await generateEnvArtifacts({
  fs: nodeBuildFileSystem,
  packages: ["@acme/payments-sdk"],
  manifest: { location: "src/env.manifest.ts" },
})
```

The publishing package does two things:

1. Declare `"envCap": { "schema": "./src/env.schema.ts" }` in its `package.json`, and ship that `.ts` file in `files`.
2. Re-export the `createEnv()` contract under the same name from its main entry.

Resolution reads one `package.json` and one declared file per listed package, and never calls `readdir`. It rejects a symlink escaping the package and a file over the size cap (`test/build/resolution/resolve-package-schema.test.ts`). The runnable pair is [`paypal-addon`](https://github.com/MaverickCER/env-cap/tree/main/test/integration/positive/enterprise/paypal-addon) and [`paypal-consumer`](https://github.com/MaverickCER/env-cap/tree/main/test/integration/positive/enterprise/paypal-consumer); their CI job does not yet block a merge.

An application can document a package's variable again with only its own fields, such as `expiresAt` and `owner`. Fields it leaves unset come from the package's declaration. A field both set differently is reported as `DUPLICATE_VARIABLE_DOCUMENTATION` ([ADR 0050](specs/decisions/0050-a-variable-declared-twice-is-documented-once.md)).

### TypeScript path aliases (paths/baseUrl)

A contract imported through an alias such as `@/features/payments/env.schema.js` is resolved with no configuration. Without it, that contract would be reported as abandoned.

- `tsconfig.json` is read from `root` exactly; there is no upward search.
- Pass `tsconfig: "tsconfig.build.json"` to use another file, or `tsconfig: false` to turn resolution off.
- Matching uses TypeScript's own `ts.resolveModuleName()`. A result inside `node_modules` is discarded, so only `packages` can reach installed code ([ADR 0023](specs/decisions/0023-tsconfig-path-alias-resolution.md)).

### Requirements

| Need                      | Detail                                                                                                                            |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Node.js                   | `>=22`. CI tests 22 and 24; 26 runs as an informational job                                                                       |
| TypeScript (optional)     | The build entry uses yours when it is 5 or 6, and otherwise the bundled TypeScript 6 (`test/build/typescript-bundled.test.ts`)    |
| TypeScript versions in CI | The newest 5.x, 6.x and 7.x, in a job that does not yet block a merge; the `^5.0.0` floor is not tested                           |
| `moduleResolution`        | `node16`, `nodenext` or `bundler`, checked by the `TypeResolution` check; `node10` cannot resolve subpath exports                 |
| `./eslint-plugin`         | Also needs `eslint` and `@typescript-eslint/utils`; versions in [ADOPTION's dependency table](ADOPTION.md#security--threat-model) |

The bundled TypeScript 6 compiler is the package's one dependency. Only the build entry loads it, and `compiler-isolation` fails the build if a runtime entry can reach it ([ADR 0049](specs/decisions/0049-typescript-7-scanner-uses-a-bundled-typescript-6.md)). It is the price of scanning TypeScript 7 projects, whose compiler has no classic API.

### Package managers

npm is the supported package manager, and every CI job installs with it. The `package-managers` job checks pnpm, Yarn 1 and Yarn Berry with the `node-modules` linker. It checks one thing: the tarball installs and every entry imports as ESM and CommonJS. That job does not yet block a merge. Yarn Plug'n'Play and non-hoisted pnpm are unsupported.

## CLI

**What it solves:** the same artifacts and drift check in any CI system, from one command.

```sh
npx env-cap --location src/generated/env.manifest.ts --evidence docs/env.evidence.json --strict
```

The CLI writes only the manifest and the evidence file ([ADR 0046](specs/decisions/0046-cli-restricted-to-runtime-and-evidence-output.md)). The documentation catalog, the ownership report and `.env.example` come from your own script calling `@maverickcer/env-cap/build`. This one is from [`examples/application/scripts/generate-docs/run.ts`](https://github.com/MaverickCER/env-cap/blob/main/examples/application/scripts/generate-docs/run.ts):

```ts
import { generateDocumentation, generateUsageReport } from "@maverickcer/env-cap/build"
import { nodeBuildFileSystem } from "@maverickcer/env-cap/node"

const docs = await generateDocumentation({
  fs: nodeBuildFileSystem,
  root,
  include,
  location: "docs/ENVIRONMENT.md",
  envExample: { location: ".env.example", onExisting: "overwrite" },
})

const usage = await generateUsageReport({
  fs: nodeBuildFileSystem,
  root,
  include,
  report: { location: "docs/OWNERSHIP.md" },
})
```

`checkEnvArtifacts()` is the drift check `--check` uses, with the same `docs` and `usage` options. Each example's `scripts/generate-docs/check.ts` shows it wired up.

### Options

At least one of `--location` or `--evidence` is required. `npx env-cap --help` prints the same list, and `test/docs-cli-flags.test.ts` fails if a flag has no row here.

| Flag                 | Meaning                                                                                                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--root <path>`      | Directory that globs resolve from (default: the current directory).                                                                                                           |
| `--location <path>`  | Output path for the generated manifest.                                                                                                                                       |
| `--include <glob>`   | Schema-discovery glob. Repeatable. Default: `**/env.schema.ts`.                                                                                                               |
| `--exclude <glob>`   | Glob to exclude from discovery. Repeatable.                                                                                                                                   |
| `--package <name>`   | Installed package to also discover a schema from, through its `envCap.schema` field. Repeatable.                                                                              |
| `--tsconfig <path>`  | `tsconfig.json` (relative to root) whose `paths` and `baseUrl` resolve aliased imports. Default: `tsconfig.json` at the root.                                                 |
| `--no-tsconfig`      | Turn path-alias resolution off.                                                                                                                                               |
| `--evidence <path>`  | Also write the evidence file and its `.fingerprint` sidecar, for example `docs/env.evidence.json`.                                                                            |
| `--strict`           | Escalate every warning to an error: compatibility, documentation and ownership. Nothing is written when one fires.                                                            |
| `--strict-docs`      | Escalate only documentation warnings: undocumented or stale entries, expiring or expired entries, and unresolvable `documentEnv()` links.                                     |
| `--strict-ownership` | Escalate only ownership warnings: abandoned contracts, unresolved consumers, unconsumed owned variables, indeterminate ownership, stale or missing `dynamicAccess` citations. |
| `--json`             | Print a machine-readable report instead of text.                                                                                                                              |
| `--check`            | Write nothing; exit `1` if any generated artifact is stale or missing.                                                                                                        |
| `--help`, `-h`       | Show the help text.                                                                                                                                                           |

The CLI exits `0` on success. It exits `1` on any error, a warning escalated by `--strict*`, or a bad argument.

Info findings never escalate. Without a `--strict*` flag, documentation and ownership findings never fail a run. Exclusive-group violations and conflicting explicit processor types always fail (`test/cli/main.test.ts`, `test/build/exclusive-group.test.ts`).

### `--json`

`--json` prints a versioned report instead of text. It changes the format only; the exit code is the same. An abbreviated example:

```jsonc
{
  "schemaVersion": 1,
  "kind": "env-cap-report",
  "toolVersion": "<installed env-cap version>",
  "ok": true,
  "manifest": { "outputPath": "...", "contracts": [] },
  // "evidence" appears when --evidence is passed.
}
```

New fields may appear without a `schemaVersion` change, so ignore properties you do not recognize ([ADR 0013](specs/decisions/0013-json-output-is-a-versioned-mirror.md)).

#### Published JSON Schema

The report's schema is [`schemas/env-cap-report.schema.json`](schemas/env-cap-report.schema.json), importable as `@maverickcer/env-cap/schema`. It is generated from `src/cli/json.ts`, and the `Schema` check fails if the committed file differs ([ADR 0019](specs/decisions/0019-published-json-schema-generated-from-types.md)).

- Real success, failure and `--check` payloads validate against it (`test/build/json-schema.test.ts`).
- The committed evidence files of two examples validate against its `EvidenceModel` definition, in the same test file.
- A changed or removed field is meant to bump `schemaVersion`. No check enforces that yet; the `SurfaceContract` check enforces the changeset level.

### `--check`

`--check` recomputes every requested artifact in memory and compares it with the committed file. It never writes ([ADR 0016](specs/decisions/0016-check-mode-compute-before-compare-never-partial-write.md)).

```sh
npx env-cap --location src/generated/env.manifest.ts --evidence docs/env.evidence.json --check
```

| Exit code | Meaning                         | Line of output                            |
| --------- | ------------------------------- | ----------------------------------------- |
| `0`       | Every artifact matches          | `All generated artifacts are up to date.` |
| `1`       | An artifact is stale or missing | `<n> artifact(s) are stale or missing.`   |

With `--json`, the report carries a `checkResult` field: `ok` is the verdict and `stale` names each stale artifact (`test/build/check-artifacts.test.ts`).

### Using the CLI outside GitHub Actions

GitLab, Jenkins or Buildkite get the same gate from the CLI alone.

1. Install the package as a devDependency and run:

   ```sh
   npx env-cap --location src/generated/env.manifest.ts --evidence docs/env.evidence.json --check --json > env-cap.json
   ```

2. Fail the job on the exit code: `0` when every artifact is current, `1` when one is stale or missing or the run failed.
3. Read `checkResult` in `env-cap.json` for the verdict. For per-finding severity, file and line, read `finding.findings` in the evidence file.
4. For a SARIF upload, pass the persisted Finding Model to `buildSarifLog` from `@maverickcer/env-cap/build` ([evidence](#reviewers-evidence)).

The CLI reads no `GITHUB_` variable today. No check enforces that, so read it as a description of the current code.

## GitHub Action

**What it solves:** drift and findings show up on the pull request, as annotations and one summary comment.

```yaml
# .github/workflows/env-cap.yml
name: env-cap

on:
  pull_request:

permissions:
  contents: read
  pull-requests: write

jobs:
  report:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci # the Action runs the env-cap your project installs
      - uses: maverickcer/env-cap@v0
        with:
          args: "--location src/generated/env.manifest.ts --evidence docs/env.evidence.json"
```

How the Action behaves, and what tests it:

1. It runs the env-cap your project installs. It looks for `node_modules/.bin/env-cap` inside `working-directory`; in a hoisted monorepo, set `version` or run from the root. With none found, it needs a `version` input and exits `2` without one (`test/scripts/github-action-run-cli.test.ts`).
2. A `version` must be a plain version or a dist-tag. `latest` is a dist-tag and is accepted, so pin a version instead.
3. Inputs reach the CLI as environment variables, never as shell text. `args` is split into words, so a forwarded value can add CLI flags.
4. Its pass or fail is the CLI's exit code. It adds no policy of its own; a finding family fails only under its `--strict*` flag in `args`.
5. Annotations and the summary comment are computed from the CLI report and the evidence file. Pass `--evidence` to get documentation, ownership and expiry reporting.

The report functions are unit-tested with a real CLI payload (`test/scripts/github-action-report.test.ts`). The `gh` calls that post comments and issues are not run in CI.

| Input               | Default                 | Purpose                                                                                  |
| ------------------- | ----------------------- | ---------------------------------------------------------------------------------------- |
| `args`              | _(required)_            | Arguments passed to `env-cap --json`, such as `--location`, `--evidence` and `--strict*` |
| `working-directory` | `.`                     | Directory where `env-cap` runs                                                           |
| `version`           | _(none; required then)_ | Version to run through `npx` when env-cap is not installed; pin one rather than `latest` |
| `comment`           | `true`                  | Create or update one sticky summary comment on the pull request                          |
| `annotations`       | `true`                  | Emit inline workflow annotations                                                         |
| `rotation-alert`    | `true`                  | On runs with no pull request, report expiring variables in an issue                      |
| `report-key`        | _(working-directory)_   | Identifies this report when several jobs comment on one pull request                     |
| `github-token`      | `${{ github.token }}`   | Token for the `gh` calls that post comments and issues                                   |

### Monorepos

Give each parallel invocation its own `report-key`, so jobs do not overwrite each other's comments. For one combined report, upload each job's `--json` output and merge them in a final step.

The Action looks for `node_modules/.bin/env-cap` inside `working-directory`; in a hoisted monorepo, set `version` or run from the root.

### Reusable packages and external contracts

Contracts discovered through `packages` appear in the same annotations and comment. Their files sit in `node_modules`, outside the diff, so their findings appear only in the summary comment.

### Scheduled rotation alerts

The same Action can run on a schedule and report expiring variables in an issue:

```yaml
# .github/workflows/env-cap-rotation.yml
name: env-cap rotation check

on:
  schedule:
    - cron: "0 9 * * 1"
  workflow_dispatch:

permissions:
  contents: read
  issues: write

jobs:
  check-rotation:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - uses: maverickcer/env-cap@v0
        with:
          args: "--location src/generated/env.manifest.ts --evidence docs/env.evidence.json"
```

1. The list comes from the evidence file's Lifecycle Model, so `--evidence` is required.
2. The window is the library's default (`DEFAULT_EXPIRING_WITHIN_DAYS`); the CLI has no flag to change it.
3. With no pull request, the Action opens or updates an issue listing expiring or expired variables.
4. When nothing is expiring, it decides to close that issue. The decision is unit-tested; the `gh` call is not run in CI.

Set `rotation-alert: "false"` to turn issues off ([ADR 0018](specs/decisions/0018-rotation-alert-issue-on-non-pr-runs.md)).

## Reviewers: evidence

**What it solves:** an inventory of every variable, its owner and its expiry, with findings you can trace to a file and line. The outputs support a review, nothing more.

The evidence file is a serialized `EvidenceModel` with these members:

| Member          | What it holds                                                                                                  |
| --------------- | -------------------------------------------------------------------------------------------------------------- |
| `schemaVersion` | The evidence format's version                                                                                  |
| `provenance`    | When it was generated, by which env-cap version, at which commit                                               |
| `contract`      | Every contract and variable, with declared documentation                                                       |
| `dependency`    | Which code consumes which variable, computed from the syntax tree; dynamic access is reported as indeterminate |
| `ownership`     | Owners, abandoned contracts and unconsumed owned variables                                                     |
| `lifecycle`     | Expiry, rotation fields and the computed `rotationStatus`                                                      |
| `finding`       | Every finding, with family, severity and position where one is known                                           |
| `change`        | What changed since the previous evidence file                                                                  |

`rotationStatus` is a judgement over declared dates and periods. It never states that a rotation happened or that a control is met. Its values are `compliant`, `overdue`, `expired` and `undeclared`. `compliant` means only that the declared dates fall within the declared period; 1.0 renames it `withinPolicy`.

### Findings and SARIF

`buildSarifLog` from `@maverickcer/env-cap/build` turns the Finding Model into SARIF 2.1.0. Its output validates against the official OASIS schema, with and without positions (`test/build/sarif.test.ts`). It is a library export; the CLI does not write SARIF.

### Projections

`defineEvidenceProjection()` from `@maverickcer/env-cap/evidence` turns the model into any shape you need. It also records which model paths each output field read (`test/evidence/define-projection.test.ts`). This one is trimmed from [`inventory.mjs`](https://github.com/MaverickCER/env-cap/blob/main/test/integration/positive/enterprise/evidence-projections/projections/inventory.mjs):

```ts
import { defineEvidenceProjection } from "@maverickcer/env-cap/evidence"

export const inventoryProjection = defineEvidenceProjection({
  inventory: (evidence) =>
    evidence.contract.contracts.map((contract) => ({
      contractName: contract.contractName,
      variables: contract.variables.map((variable) => variable.key),
    })),
})
```

- `./evidence` imports no Node module and runs under Web globals only (`test/runtime/browser-bundle.test.ts`).
- It stays under 3 KB gzip, enforced by the `Size` check.
- `./evidence` and the `EvidenceModel` shape are Stable, and the `ApiContract` check diffs them. Before 1.0, a breaking change needs only a minor release.

[`examples/enterprise-platform`](https://github.com/MaverickCER/env-cap/tree/main/examples/enterprise-platform) builds a configuration-governance report this way.

## Build-script authors: the Node adapter

**What it solves:** `./build` never acquires a filesystem on its own, so your script hands it one.

```ts
import { generateEnvArtifacts } from "@maverickcer/env-cap/build"
import { nodeBuildFileSystem } from "@maverickcer/env-cap/node"
```

`./node` re-exports the CLI's `node:fs` adapter; only `src/cli` imports `node:fs`. `./node` does not read `process.env`. The `AmbientCapabilities` check enforces both. A non-Node runtime passes its own `BuildFileSystem` instead ([ADR 0040](specs/decisions/0040-library-surfaces-do-not-acquire-node-fs.md)).

## ESLint plugin

**What it solves:** direct `process.env` reads outside your contracts become lint errors, so ownership is enforced by tooling.

```js
// eslint.config.js
import envCapPlugin from "@maverickcer/env-cap/eslint-plugin"

export default [
  {
    files: ["**/*.ts"],
    plugins: { "env-cap": envCapPlugin },
    rules: { "env-cap/no-raw-process-env": "error" },
  },
]
```

The plugin needs `eslint` and `@typescript-eslint/utils`; [ADOPTION's dependency table](ADOPTION.md#security--threat-model) lists the ranges. Its tests run on ESLint 10 only; the declared ESLint 8.57 and 9 support is untested.

### `no-raw-process-env`

The rule reports `process.env` outside `env.schema.ts` and `env.schema.tsx` files (`test/eslint-plugin/no-raw-process-env.test.ts`). Nothing else is exempt unless you list it:

```js
rules: {
  "env-cap/no-raw-process-env": ["error", { allow: ["scripts/bootstrap-secrets.ts"] }],
}
```

A one-off exception can use `// eslint-disable-next-line env-cap/no-raw-process-env` ([ADR 0017](specs/decisions/0017-eslint-plugin-entry-point.md)).

### `no-node-fs`

The rule reports `import`, `require` and `import()` of `fs`, `node:fs` and their `/promises` subpaths (`test/eslint-plugin/no-node-fs.test.ts`). Nothing is exempt unless you list it:

```js
rules: {
  "env-cap/no-node-fs": ["error", { allow: ["src/cli/**", "scripts/**"] }],
}
```

It applies the rule env-cap follows itself: a library accepts a filesystem from its caller ([ADR 0040](specs/decisions/0040-library-surfaces-do-not-acquire-node-fs.md)).

## Architecture

### Runtime and build-time are intentionally separate

The runtime and the build tooling share one contract file and nothing else.

| Path       | Entry points                     | What it does                                                         | Where it runs                |
| ---------- | -------------------------------- | -------------------------------------------------------------------- | ---------------------------- |
| Runtime    | `.`, `./helpers`, `./evidence`   | Validates values, exposes typed access, projects evidence            | Your application, at startup |
| Build-time | `./build`, CLI, `./node`, Action | Discovers contracts, analyzes source, writes manifests and documents | Development and CI only      |

A run goes through four steps, in order:

1. Each capability declares a contract with `createEnv()` and `documentEnv()`.
2. The build step parses every contract file and writes the manifest, documents and evidence.
3. The application imports the manifest and calls `validateEnv()` once at startup.
4. Code reads typed values through the contract that owns them.

A project can start with one central contract and split it later; the runtime model stays the same. [specs/architecture.md](specs/architecture.md) has the full treatment.

### Runtime support matrix

| Environment                        | `.` (runtime)    | `./helpers`        | `./evidence`     | `./build`, CLI, `./node`, `./eslint-plugin` |
| ---------------------------------- | ---------------- | ------------------ | ---------------- | ------------------------------------------- |
| Node.js 22 and 24 (ESM and CJS)    | Tested, blocking | Tested, blocking   | Tested, blocking | Tested, blocking ⁴                          |
| Web-globals bundle ¹               | Tested, blocking | Tested ², blocking | Tested, blocking | Not applicable                              |
| Bun and Deno                       | Executed in CI ³ | Executed in CI ³   | Executed in CI ³ | Not tested                                  |
| Real browsers, edge and serverless | Not tested       | Not tested         | Not tested       | Not applicable                              |

¹ Bundled with esbuild for the browser and run in a `node:vm` context with no `process`, `Buffer`, `require` or timers (`test/runtime/browser-bundle.test.ts`).

² Except `processors.base64()`, which returns a Node `Buffer`.

³ `bun-version: latest` and Deno `v2.x`, in a job that does not yet block a merge.

⁴ `./eslint-plugin`: unit tests block; its ESM and CJS import from the tarball runs only in the non-blocking `package-managers` job.

ESM and CommonJS builds ship for every entry point, and the `PackedConsumer` check imports each one from the packed tarball except `./eslint-plugin`. A dual-package split fails fast with a `TypeError` instead of validating against the wrong schema ([SECURITY.md](SECURITY.md#dual-package-hazard)).

## Migration

Adopt env-cap one contract at a time, and keep what you have:

| Coming from          | What changes                                                                                                                |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `dotenv`             | Keep loading with it; add a contract over the variables it loads                                                            |
| Raw `process.env`    | Replace `process.env.STRIPE_KEY` with `env.STRIPE_KEY`, then move contracts next to their features                          |
| Zod, envalid, t3-env | Keep your schemas; call them from a validator: `validator: (value) => schema.safeParse(value).success \|\| "Invalid value"` |

[`specs/migrations/`](specs/migrations/) has a guide per tool, each with a section on when to keep what you have.

## Performance

Validation runs once, at startup. After it, reading a value is a property lookup on the frozen record of validated values.

The [benchmark suite](./benchmarks/README.md) measures runtime and build-time cost as the number of variables grows. Pull requests from this repository are benchmarked, and a regression fails the `benchmark-pr` job. That job does not yet block a merge, and fork and bot pull requests are not measured. The growth class of `createEnv` is not yet determined on CI, so this guide states no complexity bound.

## Documentation index

| Doc                                                                                         | For                                                    |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| This guide and the [docs site](https://maverickcer.github.io/env-cap/)                      | Using env-cap                                          |
| [API reference](https://maverickcer.github.io/env-cap/api/)                                 | Every exported symbol, generated from source           |
| [`specs/architecture.md`](specs/architecture.md) and [`specs/decisions/`](specs/decisions/) | Why the package is shaped this way                     |
| [`specs/migrations/`](specs/migrations/)                                                    | Adopting env-cap beside dotenv, Zod, envalid or t3-env |
| [`ADOPTION.md`](ADOPTION.md)                                                                | What adopting costs, needs and refuses to do           |
| [`SECURITY.md`](SECURITY.md)                                                                | What is enforced, where, and what is not               |
| [`VERSIONING.md`](VERSIONING.md)                                                            | What semver covers; the tier of each entry point       |
| [`CONTRIBUTING.md`](CONTRIBUTING.md)                                                        | Making a change                                        |
| [`CODE_REVIEW.md`](CODE_REVIEW.md)                                                          | What a reviewer checks before merging                  |
| [`RELEASING.md`](RELEASING.md)                                                              | The release process                                    |
| [`SUPPORT.md`](SUPPORT.md)                                                                  | Where to ask questions and file bugs                   |
