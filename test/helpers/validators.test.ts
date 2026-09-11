import { describe, it, expect, vi } from "vitest"
import type { Validator } from "../../src/runtime/types.js"
import { validators } from "../../src/helpers/index.js"

describe("validators.required", () => {
  it("rejects undefined, null, and empty string", () => {
    const v = validators.required()
    expect(v(undefined, {})).not.toBe(true)
    expect(v(null, {})).not.toBe(true)
    expect(v("", {})).not.toBe(true)
  })

  it("accepts any non-empty value", () => {
    expect(validators.required()("value", {})).toBe(true)
    expect(validators.required()(0, {})).toBe(true)
  })

  it("uses the exact same message for undefined/null and for an empty string", () => {
    const v = validators.required()
    expect(v(undefined, {})).toBe("This variable is required.")
    expect(v(null, {})).toBe("This variable is required.")
    expect(v("", {})).toBe("This variable is required.")
  })

  it("allows an empty string when allowEmptyString is true", () => {
    expect(validators.required(true)("", {})).toBe(true)
  })

  it("never rejects a non-string value whose OWN length happens to be 0 -- the empty-string check is string-typed only", () => {
    expect(validators.required()([], {})).toBe(true)
  })
})

describe("validators.email", () => {
  it("accepts valid emails and rejects invalid ones", () => {
    expect(validators.email()("a@b.com", {})).toBe(true)
    expect(validators.email()("not-an-email", {})).not.toBe(true)
  })

  it("requires the WHOLE string to match (anchored at both ends), and accepts multi-character local/domain segments", () => {
    const v = validators.email()
    expect(v("abc@example.com", {})).toBe(true)
    // Multi-char local/domain segments -- a single-character-only pattern
    // would already fail to consume the whole (anchored) string.
    expect(v("prefix abc@example.com", {})).not.toBe(true)
    expect(v("abc@example.com suffix", {})).not.toBe(true)
  })
})

describe("validators.url", () => {
  it("accepts valid absolute URLs and rejects invalid ones", () => {
    expect(validators.url()("https://example.com", {})).toBe(true)
    expect(validators.url()("not a url", {})).not.toBe(true)
  })

  it("rejects an invalid URL with the exact failure message", () => {
    expect(validators.url()("not a url", {})).toBe("Expected a valid absolute URL.")
  })
})

describe("validators.enum", () => {
  it("accepts allowed values and rejects others", () => {
    const v = validators.enum<string>(["stripe", "paypal"] as const)
    expect(v("stripe", {})).toBe(true)
    expect(v("square", {})).not.toBe(true)
  })

  it("lists every allowed value in the failure message, comma-separated", () => {
    const v = validators.enum<string>(["stripe", "paypal", "square"] as const)
    expect(v("adyen", {})).toBe("Expected one of: stripe, paypal, square.")
  })
})

describe("validators.range", () => {
  it("accepts values within range and rejects those outside it", () => {
    const v = validators.range(1, 65535)
    expect(v(3000, {})).toBe(true)
    expect(v(0, {})).not.toBe(true)
    expect(v(70000, {})).not.toBe(true)
  })

  it("treats both endpoints as inclusive -- the boundary, not just clearly-inside/-outside", () => {
    const v = validators.range(1, 65535)
    expect(v(1, {})).toBe(true)
    expect(v(65535, {})).toBe(true)
  })

  it("renders the exact failure message with both bounds", () => {
    const v = validators.range(1, 65535)
    expect(v(0, {})).toBe(
      "Expected a value greater than or equal to 1 and less than or equal to 65535.",
    )
  })
})

describe("validators.regex", () => {
  it("accepts matches and rejects non-matches, with an optional custom message", () => {
    const v = validators.regex(/^sk_/, "Must start with sk_.")
    expect(v("sk_live_123", {})).toBe(true)
    expect(v("pk_live_123", {})).toBe("Must start with sk_.")
  })

  it("falls back to the default failure message when no custom message is given", () => {
    const v = validators.regex(/^sk_/)
    expect(v("pk_live_123", {})).toBe("Expected value to match required pattern.")
  })
})

describe("validators.all", () => {
  it("passes when every validator passes", () => {
    const v = validators.all<number>(validators.min(1), validators.max(10))
    expect(v(5, {})).toBe(true)
  })

  it("returns the first failing validator's message and short-circuits the rest", () => {
    const second = vi.fn(() => "second failure")
    const v = validators.all<number>(() => "first failure", second)
    expect(v(5, {})).toBe("first failure")
    expect(second).not.toHaveBeenCalled()
  })

  it("keeps checking after a validator passes -- a passing first validator must not short-circuit a failing second one", () => {
    const v = validators.all<number>(
      () => true,
      () => "second validator failed",
    )
    expect(v(5, {})).toBe("second validator failed")
  })
})

describe("validators.any", () => {
  it("passes when at least one validator passes", () => {
    const v = validators.any<number>(
      () => "always fails",
      () => true,
    )
    expect(v(5, {})).toBe(true)
  })

  it("returns its own generic message when every validator fails", () => {
    const v = validators.any<number>(
      () => "fail 1",
      () => "fail 2",
    )
    expect(v(5, {})).toBe("Value did not satisfy any validation.")
  })
})

describe("validators.not", () => {
  it("passes when the wrapped validator fails", () => {
    const v = validators.not<string>(validators.email())
    expect(v("not-an-email", {})).toBe(true)
  })

  it("fails with its own message when the wrapped validator passes", () => {
    const v = validators.not<string>(validators.email())
    expect(v("a@b.com", {})).toBe("Value must not satisfy this validation.")
  })
})

describe("validators.refine", () => {
  it("passes through true when the wrapped validator passes", () => {
    const v = validators.refine<string>(validators.email(), "Custom message.")
    expect(v("a@b.com", {})).toBe(true)
  })

  it("replaces the wrapped validator's own failure message with the supplied message", () => {
    const v = validators.refine<string>(validators.email(), "Custom message.")
    expect(v("not-an-email", {})).toBe("Custom message.")
  })
})

describe("validators.optional", () => {
  it("passes automatically when the value is undefined, without invoking the wrapped validator", () => {
    const inner = vi.fn(() => "should not run")
    const v = validators.optional<string>(inner)
    expect(v(undefined, {})).toBe(true)
    expect(inner).not.toHaveBeenCalled()
  })

  it("delegates to the wrapped validator when the value is defined", () => {
    const v = validators.optional<string>(validators.email())
    expect(v("a@b.com", {})).toBe(true)
    expect(v("not-an-email", {})).toBe("Expected a valid email address.")
  })
})

describe("validators: numeric range/shape checks", () => {
  it.each<[string, Validator<number>, number, true | string]>([
    ["min(5)", validators.min(5), 5, true],
    ["min(5)", validators.min(5), 4, "Expected a value greater than or equal to 5."],
    ["max(5)", validators.max(5), 5, true],
    ["max(5)", validators.max(5), 6, "Expected a value less than or equal to 5."],
    ["positive()", validators.positive(), 1, true],
    ["positive()", validators.positive(), 0, "Expected a positive value."],
    ["negative()", validators.negative(), -1, true],
    ["negative()", validators.negative(), 0, "Expected a negative value."],
    ["integer()", validators.integer(), 3, true],
    ["integer()", validators.integer(), 3.5, "Expected an integer value."],
    ["finite()", validators.finite(), 3, true],
    ["finite()", validators.finite(), Infinity, "Expected a finite number."],
    ["safeInteger()", validators.safeInteger(), 3, true],
    [
      "safeInteger()",
      validators.safeInteger(),
      Number.MAX_SAFE_INTEGER + 1,
      "Expected a safe integer.",
    ],
  ])("%s against %j -> %j", (_label, validator, input, expected) => {
    expect(validator(input, {})).toBe(expected)
  })
})

describe("validators: string content/length checks", () => {
  it.each<[string, Validator<string>, string, true | string]>([
    ["endsWith('.com')", validators.endsWith(".com"), "example.com", true],
    [
      "endsWith('.com')",
      validators.endsWith(".com"),
      "example.org",
      "Expected value to end with required suffix.",
    ],
    ["includes('@')", validators.includes("@"), "a@b.com", true],
    [
      "includes('@')",
      validators.includes("@"),
      "ab.com",
      "Expected value to include required text.",
    ],
    ["length(3)", validators.length(3), "abc", true],
    ["length(3)", validators.length(3), "ab", "Expected length 3."],
    ["minLength(3)", validators.minLength(3), "abc", true],
    ["minLength(3)", validators.minLength(3), "ab", "Expected a minimum length of 3."],
    ["maxLength(3)", validators.maxLength(3), "abc", true],
    ["maxLength(3)", validators.maxLength(3), "abcd", "Expected a maximum length of 3."],
  ])("%s against %j -> %j", (_label, validator, input, expected) => {
    expect(validator(input, {})).toBe(expected)
  })
})

describe("validators: array shape checks", () => {
  it.each<[string, Validator<number[]>, number[], true | string]>([
    ["minItems(2)", validators.minItems<number>(2), [1, 2], true],
    ["minItems(2)", validators.minItems<number>(2), [1], "Expected at least 2 items."],
    ["maxItems(2)", validators.maxItems<number>(2), [1, 2], true],
    ["maxItems(2)", validators.maxItems<number>(2), [1, 2, 3], "Expected no more than 2 items."],
    ["unique()", validators.unique<number>(), [1, 2, 3], true],
    ["unique()", validators.unique<number>(), [1, 1, 2], "Expected all items to be unique."],
  ])("%s against %j -> %j", (_label, validator, input, expected) => {
    expect(validator(input, {})).toBe(expected)
  })
})

describe("validators: date comparisons", () => {
  const pastDate = new Date("2000-01-01")
  const futureDate = new Date("2999-01-01")

  it.each<[string, Validator<Date>, Date, true | string]>([
    ["after(2000-01-01)", validators.after(pastDate), futureDate, true],
    [
      "after(2000-01-01)",
      validators.after(pastDate),
      pastDate,
      "Expected date to be after required date.",
    ],
    ["before(2999-01-01)", validators.before(futureDate), pastDate, true],
    [
      "before(2999-01-01)",
      validators.before(futureDate),
      futureDate,
      "Expected date to be before required date.",
    ],
    ["future()", validators.future(), futureDate, true],
    ["future()", validators.future(), pastDate, "Expected a future date."],
    ["past()", validators.past(), pastDate, true],
    ["past()", validators.past(), futureDate, "Expected a past date."],
  ])("%s against %j -> %j", (_label, validator, input, expected) => {
    expect(validator(input, {})).toBe(expected)
  })

  it("treats a date exactly equal to 'now' as neither future nor past -- the boundary, not just clearly-before/-after", () => {
    vi.useFakeTimers()
    try {
      const now = new Date()
      expect(validators.future()(now, {})).toBe("Expected a future date.")
      expect(validators.past()(now, {})).toBe("Expected a past date.")
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("validators.uuid", () => {
  it("accepts a valid v4 UUID by default", () => {
    expect(validators.uuid()("110ec58a-a0f2-4ac4-8393-c866d813b8d1", {})).toBe(true)
  })

  it("rejects a malformed UUID", () => {
    expect(validators.uuid()("not-a-uuid", {})).toBe("Expected a valid UUID .")
  })

  it("rejects a UUID whose version isn't in the allowed list", () => {
    const v1 = "6ba7b810-9dad-11d1-80b4-00c04fd430c8" // RFC 4122 example, version 1
    expect(validators.uuid([4])(v1, {})).toBe("Expected UUID version 4.")
  })

  it("lists every allowed version in the failure message, comma-separated", () => {
    const v1 = "6ba7b810-9dad-11d1-80b4-00c04fd430c8" // version 1
    expect(validators.uuid([4, 5])(v1, {})).toBe("Expected UUID version 4, 5.")
  })

  it("requires the WHOLE string to match (anchored at both ends) -- a valid UUID with extra leading or trailing text is not accepted", () => {
    const v = validators.uuid()
    const valid = "110ec58a-a0f2-4ac4-8393-c866d813b8d1"
    expect(v(valid, {})).toBe(true)
    expect(v(`prefix-${valid}`, {})).not.toBe(true)
    expect(v(`${valid}-suffix`, {})).not.toBe(true)
  })
})

describe("validators.uuidVersion", () => {
  it("is shorthand for uuid([version]) -- accepts only the exact requested version", () => {
    const v4 = "110ec58a-a0f2-4ac4-8393-c866d813b8d1"
    const v1 = "6ba7b810-9dad-11d1-80b4-00c04fd430c8"
    expect(validators.uuidVersion(4)(v4, {})).toBe(true)
    expect(validators.uuidVersion(4)(v1, {})).toBe("Expected UUID version 4.")
  })
})

describe("validators.custom", () => {
  it("returns the wrapped validator unchanged, invoked exactly as passed", () => {
    const inner = vi.fn((value: number) => value > 0 || "must be positive")
    const wrapped = validators.custom<number>(inner)
    expect(wrapped(5, {})).toBe(true)
    expect(wrapped(-1, {})).toBe("must be positive")
    expect(inner).toHaveBeenCalledTimes(2)
  })
})
