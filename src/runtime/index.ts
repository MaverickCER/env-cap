/**
 * env-cap runtime entry point.
 *
 * Zero dependencies, isomorphic (no `fs`, no `process` other than the values
 * the developer passes in). Handles processing, validation, caching, and
 * typed access only -- discovery and manifest generation live in
 * `env-cap/build` and are never imported from here.
 *
 * `documentEnv` is exported from here, not `env-cap/build`, even though
 * it exists purely for documentation: it's meant to be called inline in the
 * same schema file as `createEnv`, which is ordinary runtime code that may
 * end up in any bundle (including a browser one). It must be exactly as
 * cheap and safe to import as `createEnv` -- see `document.ts`.
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
