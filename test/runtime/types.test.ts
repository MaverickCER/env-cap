import { describe, expectTypeOf, it } from "vitest"
import { createEnv } from "../../src/runtime/create.js"
import type { InferEnvValue } from "../../src/runtime/types.js"

/**
 * Type-level pins for the generic inference rules described in the README:
 * processor return type wins, else the default's type, else `string`.
 * These never run any code -- `expectTypeOf` assertions are checked by `tsc`.
 */
describe("InferEnvValue / EnvContract generic inference", () => {
  it("infers the processor's return type when a processor is present", () => {
    interface Def {
      processor: (value: unknown) => number
    }
    expectTypeOf<InferEnvValue<Def>>().toEqualTypeOf<number>()
  })

  it("infers a literal default's type when there is no processor", () => {
    interface Def {
      default: 3000
    }
    expectTypeOf<InferEnvValue<Def>>().toEqualTypeOf<3000>()
  })

  it("infers a thunk default's return type when there is no processor", () => {
    interface Def {
      default: () => string
    }
    expectTypeOf<InferEnvValue<Def>>().toEqualTypeOf<string>()
  })

  it("falls back to string when neither a processor nor a default is present", () => {
    type Def = Record<string, never>
    expectTypeOf<InferEnvValue<Def>>().toEqualTypeOf<string>()
  })

  it("propagates through createEnv's return type end-to-end", () => {
    // `typeof contract.PORT` is a type query -- erased at compile time, so this
    // never actually invokes the property getter (which would throw before
    // validateEnv() has run). `contract` itself is intentionally only ever
    // used in type position below, to verify createEnv()'s inference
    // end-to-end from a real call, not its resolved runtime value.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const contract = createEnv({
      PORT: { default: 3000, processor: (value): number => Number(value) },
      NAME: { processor: (value): string => String(value) },
      RAW: {},
    })

    expectTypeOf<typeof contract.PORT>().toEqualTypeOf<number>()
    expectTypeOf<typeof contract.NAME>().toEqualTypeOf<string>()
    expectTypeOf<typeof contract.RAW>().toEqualTypeOf<string>()
  })

  it("never surfaces `any` in a resolved contract's per-key type under strict mode, despite EnvSchema's generic bound being EnvDefinition<any>", () => {
    // `EnvSchema`/`InferEnvValue`'s `EnvDefinition<any>` bound (src/runtime/types.ts) is a
    // documented zod/trpc-style variance workaround that should never leak into what a
    // consumer's `strict: true` project actually sees. `toEqualTypeOf` alone doesn't fully
    // pin this down -- `any` is bidirectionally assignable with everything, so an
    // accidental `any` could still pass a naive equality check. `.not.toBeAny()` is the
    // explicit assertion that closes that gap.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const contract = createEnv({
      STRIPE_KEY: { validator: (value: string) => value.length > 0 || "required" },
    })

    expectTypeOf<typeof contract.STRIPE_KEY>().not.toBeAny()
    expectTypeOf<typeof contract.STRIPE_KEY>().toEqualTypeOf<string>()
  })
})
