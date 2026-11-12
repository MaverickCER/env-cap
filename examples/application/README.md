# Application example

_"How does this make my code better?"_ This is the first of the flagship [examples](../README.md), for a developer adopting env-cap in their own project.

Most applications start with one `env.ts` that every module imports. This example keeps that file. One central contract still gets startup validation, generated documentation, a generated `.env.example` and an ownership report.

```text
src/
  env.ts                      one central contract for the whole app
  startup.ts                  validateEnv() runs here, once
  server.ts                   app code imports the contract directly
  generated/env.manifest.ts   generated, do not edit
scripts/
  generate-docs/run.ts        writes ENVIRONMENT.md, OWNERSHIP.md and .env.example
  generate-docs/check.ts      the drift check for those three files
  rotation-log/run.ts         writes docs/SECRETS-ROTATION-LOG.md from the evidence file
features/
  database/env.schema.ts      reference only, commented out: the same schema split per feature
  payments/env.schema.ts
docs/
  ENVIRONMENT.md, OWNERSHIP.md, env.evidence.json (+ .fingerprint)   generated and committed
```

The two files under `features/` are never discovered; `npm run docs` includes only `src/env.ts`. They show what splitting the schema would look like. [`specs/migrations/from-centralized-schema.md`](../../specs/migrations/from-centralized-schema.md) covers that path, and [`../team-service`](../team-service) shows the result.

## Run it

Build the repository root first ([examples/README.md](../README.md#before-you-run-one)). The committed `.env` holds placeholder values.

| Step | Command                | Exit code | Line of output to look for                |
| ---- | ---------------------- | --------- | ----------------------------------------- |
| 1    | `npm install`          | `0`       | none                                      |
| 2    | `npm start`            | `0`       | `Environment validated successfully.`     |
| 3    | `npm run check`        | `0`       | `All generated artifacts are up to date.` |
| 4    | `npm run docs:reports` | `0`       | `2 unconsumed owned variable(s):`         |

`test/examples/application.test.ts` runs steps 2 and 3 in CI's `examples` job. Step 4 is the README demo, which `npm run verify:readme-example` compares with the root README.

The commands chain as follows:

1. `npm start` runs `docs:reports`, then boots `src/server.ts`. That validates the environment and prints the resolved configuration, such as `Payment provider: stripe`.
2. `docs:reports` runs `npm run docs`, the CLI, which writes the manifest and `docs/env.evidence.json` ([ADR 0046](../../specs/decisions/0046-cli-restricted-to-runtime-and-evidence-output.md)). It then runs `scripts/generate-docs/run.ts` and `scripts/rotation-log/run.ts`.
3. `npm run check` recomputes every generated file and compares it with the committed copy, without writing.

## Try a failure

Delete `STRIPE_KEY` from `.env` and run `npm start` again. Expect a non-zero exit and an `EnvValidationError` that names `STRIPE_KEY` and its contract, without its value. CI does not run this step.

`.env.example` is overwritten on every run here (`onExisting: "overwrite"`), so it always matches the schema. The library default is the opposite: it never replaces an existing file and writes a timestamped sibling instead. The [Guide's build section](../../GUIDE.md#platform-engineers-generating-artifacts) lists the modes.

## Why one contract, not several

Capability-owned contracts are an option, not a requirement. One `createEnv()` call, like `src/env.ts` here, is a complete use of the library. A team that is not ready to split its `env.ts` keeps it and still gets every generated report.
