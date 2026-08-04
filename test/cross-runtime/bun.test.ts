// Cross-runtime conformance (see CI's `cross-runtime` job and the audit gap
// it closes: the runtime's core claim is isomorphism -- "safe to include in
// browser, edge, serverless, and Node environments" (specs/architecture.md)
// -- but until this file existed, only Node/vitest ever actually ran it.
//
// Deliberately imports the *built* dist/index.js, not src/, and uses Bun's
// own native test runner (not vitest) so this genuinely proves zero reliance
// on Node- or vitest-specific behavior. Run via `bun test test/cross-runtime/bun.test.ts`
// after `npm run build` (see .github/workflows/ci.yml's `cross-runtime` job).
import { expect, test } from "bun:test"
import {
  createEnv,
  EnvNotReadyError,
  EnvValidationError,
  resetEnvCache,
  validateEnv,
} from "../../dist/index.js"

test("createEnv + validateEnv resolve a typed, validated value under Bun", async () => {
  resetEnvCache()
  const env = createEnv(
    { PORT: { default: 3000, processor: (v: unknown) => Number(v) } },
    { name: "bun-conformance" },
  )
  await validateEnv({ values: { PORT: "8080" }, manifest: [env] })
  expect(env.PORT).toBe(8080)
})

test("EnvNotReadyError is thrown when a value is read before validateEnv() runs", () => {
  resetEnvCache()
  const env = createEnv({ NAME: {} }, { name: "bun-not-ready" })
  expect(() => env.NAME).toThrow(EnvNotReadyError)
})

test("EnvValidationError aggregates a validator failure under Bun", async () => {
  resetEnvCache()
  const env = createEnv(
    { REQUIRED_KEY: { validator: (v: string) => v.length > 0 || "must not be empty" } },
    { name: "bun-validation-failure" },
  )
  await expect(validateEnv({ values: { REQUIRED_KEY: "" }, manifest: [env] })).rejects.toThrow(
    EnvValidationError,
  )
})

test("contract self-redacts on String() -- ADR 0006 holds under Bun too", async () => {
  resetEnvCache()
  const env = createEnv({ SECRET: {} }, { name: "bun-redaction" })
  await validateEnv({ values: { SECRET: "shh-do-not-print-me" }, manifest: [env] })
  expect(String(env)).not.toContain("shh-do-not-print-me")
  expect(String(env)).toContain("bun-redaction")
})
