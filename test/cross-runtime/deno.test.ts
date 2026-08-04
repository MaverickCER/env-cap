// Cross-runtime conformance -- see bun.test.ts's header comment for why this
// file exists and what gap it closes. Deliberately dependency-free (no
// `@std/assert` from JSR) so this smoke test never depends on network access
// in CI -- its only job is proving dist/index.js's actual behavior under
// Deno's engine, not showcasing Deno test idioms.
//
// Run via `deno test --no-check --allow-read test/cross-runtime/deno.test.ts`
// after `npm run build` (see .github/workflows/ci.yml's `cross-runtime` job).
// `--allow-read` is required only because Deno's permission model defaults
// to denying filesystem access even for `import`ing a local file.
//
// `--no-check` is required for a reason worth recording: Deno's type-checker
// does not resolve the sibling dist/index.d.ts for this bare relative-path
// `.js` import the way tsc/vitest do -- it instead infers a type from
// dist/index.js's own static JS shape (picking up the two
// `Object.defineProperty(contract, "toString"/"toJSON", ...)` calls in
// create.ts, but not the dynamically-generated per-key getters), producing
// a spurious "Property 'PORT' does not exist" error. This is a Deno
// import-resolution nuance specific to raw relative-disk-path imports, not a
// defect in the shipped declarations -- confirmed by isolating the exact
// same type structure in a standalone repro, which `deno check` accepts
// without complaint. Type-declaration correctness is already verified by
// `npm run typecheck` against source; this file's job is execution
// conformance, which `--no-check` still fully exercises.
import {
  createEnv,
  EnvNotReadyError,
  EnvValidationError,
  resetEnvCache,
  validateEnv,
} from "../../dist/index.js"

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected)
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`)
}

function assertThrows(
  fn: () => void,
  expectedConstructor: new (...args: never[]) => Error,
  message: string,
): void {
  try {
    fn()
  } catch (error) {
    if (error instanceof expectedConstructor) return
    throw new Error(`${message}: threw the wrong type (${String(error)})`)
  }
  throw new Error(`${message}: did not throw`)
}

async function assertRejects(
  promise: Promise<unknown>,
  expectedConstructor: new (...args: never[]) => Error,
  message: string,
): Promise<void> {
  try {
    await promise
  } catch (error) {
    if (error instanceof expectedConstructor) return
    throw new Error(`${message}: rejected with the wrong type (${String(error)})`)
  }
  throw new Error(`${message}: did not reject`)
}

Deno.test("createEnv + validateEnv resolve a typed, validated value under Deno", async () => {
  resetEnvCache()
  const env = createEnv(
    { PORT: { default: 3000, processor: (v: unknown) => Number(v) } },
    { name: "deno-conformance" },
  )
  await validateEnv({ values: { PORT: "8080" }, manifest: [env] })
  assertEqual(env.PORT, 8080, "PORT should resolve to the processed number")
})

Deno.test("EnvNotReadyError is thrown when a value is read before validateEnv() runs", () => {
  resetEnvCache()
  const env = createEnv({ NAME: {} }, { name: "deno-not-ready" })
  assertThrows(() => env.NAME, EnvNotReadyError, "reading before validateEnv()")
})

Deno.test("EnvValidationError aggregates a validator failure under Deno", async () => {
  resetEnvCache()
  const env = createEnv(
    { REQUIRED_KEY: { validator: (v: string) => v.length > 0 || "must not be empty" } },
    { name: "deno-validation-failure" },
  )
  await assertRejects(
    validateEnv({ values: { REQUIRED_KEY: "" }, manifest: [env] }),
    EnvValidationError,
    "empty required key",
  )
})

Deno.test("contract self-redacts on String() -- ADR 0006 holds under Deno too", async () => {
  resetEnvCache()
  const env = createEnv({ SECRET: {} }, { name: "deno-redaction" })
  await validateEnv({ values: { SECRET: "shh-do-not-print-me" }, manifest: [env] })
  const stringified = String(env)
  if (stringified.includes("shh-do-not-print-me"))
    throw new Error("contract leaked its secret value via String()")
  if (!stringified.includes("deno-redaction"))
    throw new Error("contract's redacted form should still name the contract")
})
