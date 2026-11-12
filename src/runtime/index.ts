/**
 * The env-cap runtime entry point: declare contracts, validate them once at startup, and read
 * typed values through the contract that owns them.
 *
 * It imports no Node module and reads no Node global; it takes values only from the `values`
 * you pass to `validateEnv()`. `test/runtime/browser-bundle.test.ts` checks the built bundle for
 * Node imports, `process.` and `Buffer.`, but a third-party import would pass unnoticed.
 * Discovery and manifest generation live in `@maverickcer/env-cap/build`, never here.
 *
 * `documentEnv` is exported here, not from `./build`, because it is called inline in the same
 * schema file as `createEnv`, which may end up in any bundle. It must be as cheap to import as
 * `createEnv` (see `document.ts`).
 *
 * @packageDocumentation
 */

export type {
  CreateEnvOptions,
  DefaultValue,
  EnvContract,
  EnvDefinition,
  EnvSchema,
  InferEnvValue,
  Processor,
  RawEnv,
  validateEnvOptions,
  validateEnvResult,
  Validator,
} from "./types.js"

export { createEnv } from "./create.js"
export { documentEnv } from "./document.js"
export type { ContractDocs, VariableDocs, VariableEvidenceDocs } from "./document.js"
export { EnvNotReadyError, EnvValidationError } from "./errors.js"
export type { VariableFailure } from "./errors.js"
export { isEnvContract } from "./registry.js"
export { resetEnvCache } from "./reset.js"
export { validateEnv } from "./validate.js"
