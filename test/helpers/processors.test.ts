import { describe, it, expect } from "vitest"
import { processors } from "../../src/helpers/index.js"

describe("processors.toString", () => {
  it("coerces values to strings and treats nullish as empty string", () => {
    const p = processors.toString()
    expect(p("hello")).toBe("hello")
    expect(p(42)).toBe("42")
    expect(p(undefined)).toBe("")
    expect(p(null)).toBe("")
  })
})

describe("processors.toNumber", () => {
  it("coerces numeric strings and passes through numbers", () => {
    const p = processors.toNumber()
    expect(p("3000")).toBe(3000)
    expect(p(3000)).toBe(3000)
  })

  it("throws without echoing the value for non-numeric input", () => {
    const p = processors.toNumber()
    expect(() => p("not-a-number")).toThrow()
    try {
      p("not-a-number")
    } catch (error) {
      expect((error as Error).message).not.toContain("not-a-number")
    }
  })

  it("throws on an empty or whitespace-only string instead of coercing to 0", () => {
    const p = processors.toNumber()
    expect(() => p("")).toThrow("Expected a numeric value, received an empty string.")
    expect(() => p("   ")).toThrow("Expected a numeric value, received an empty string.")
  })

  it("describes a non-numeric, non-empty-string value by its type in the thrown message, exactly", () => {
    let error: Error | undefined
    try {
      processors.toNumber()({})
    } catch (e) {
      error = e as Error
    }
    expect(error?.message).toBe("Expected a numeric value, received a object.")
  })

  it("passes through an actual number unchanged, even NaN detection uses the real number path (not the string coercion path)", () => {
    expect(processors.toNumber()(3000)).toBe(3000)
    expect(() => processors.toNumber()(Number.NaN)).toThrow(
      "Expected a numeric value, received a number.",
    )
  })
})

describe("processors.toBoolean", () => {
  it("accepts booleans and common truthy/falsy strings", () => {
    const p = processors.toBoolean()
    expect(p(true)).toBe(true)
    expect(p("true")).toBe(true)
    expect(p("1")).toBe(true)
    expect(p("yes")).toBe(true)
    expect(p("on")).toBe(true)
    expect(p(false)).toBe(false)
    expect(p("false")).toBe(false)
    expect(p("0")).toBe(false)
    expect(p("no")).toBe(false)
    expect(p("off")).toBe(false)
  })

  it("throws for unrecognized values", () => {
    expect(() => processors.toBoolean()("maybe")).toThrow()
  })

  it("throws without echoing the value for undefined/null, describing only its type", () => {
    let error: Error | undefined
    try {
      processors.toBoolean()(undefined)
    } catch (e) {
      error = e as Error
    }
    expect(error?.message).toBe(
      "Expected a boolean-like value (true/false/1/0/yes/no/on/off), received undefined.",
    )
    expect(() => processors.toBoolean()(null)).toThrow(/received null/)
  })

  it("describes a value that's neither undefined nor null by its typeof, not as 'null'", () => {
    let error: Error | undefined
    try {
      processors.toBoolean()({})
    } catch (e) {
      error = e as Error
    }
    expect(error?.message).toBe(
      "Expected a boolean-like value (true/false/1/0/yes/no/on/off), received a object.",
    )
  })

  it("recognizes a boolean-like string regardless of case or surrounding whitespace", () => {
    const p = processors.toBoolean()
    expect(p(" TRUE ")).toBe(true)
    expect(p(" FALSE ")).toBe(false)
  })
})

describe("processors.parseJSON", () => {
  it("parses valid JSON strings", () => {
    expect(processors.parseJSON<{ a: number }>()('{"a":1}')).toEqual({ a: 1 })
  })

  it("throws for invalid JSON", () => {
    expect(() => processors.parseJSON()("{not json")).toThrow(
      "Expected a valid JSON string, but parsing failed.",
    )
  })

  it("passes a non-string value straight through unchanged", () => {
    expect(processors.parseJSON<number>()(42)).toBe(42)
    const obj = { already: "parsed" }
    expect(processors.parseJSON()(obj)).toBe(obj)
  })

  it("throws for undefined rather than passing it through", () => {
    expect(() => processors.parseJSON()(undefined)).toThrow(/received undefined/)
  })
})

describe("processors.toArray", () => {
  it("splits and trims a delimited string", () => {
    expect(processors.toArray()("a, b ,c")).toEqual(["a", "b", "c"])
  })

  it("returns an empty array for empty/nullish input", () => {
    expect(processors.toArray()(undefined)).toEqual([])
    expect(processors.toArray()("")).toEqual([])
  })

  it("returns an empty array for a whitespace-only string too, not just a literally-empty one", () => {
    expect(processors.toArray()("   ")).toEqual([])
  })

  it("supports a custom separator", () => {
    expect(processors.toArray("|")("a|b|c")).toEqual(["a", "b", "c"])
  })

  it("passes an actual array straight through, running each item through the given processors", () => {
    expect(processors.toArray()(["a", "b"])).toEqual(["a", "b"])
  })

  it("returns an empty array for a non-string, non-array value", () => {
    expect(processors.toArray()(42)).toEqual([])
  })

  it("runs each item through the given per-item processors, in order", () => {
    const upper = (value: unknown) => String(value).toUpperCase()
    const exclaim = (value: unknown) => `${String(value)}!`
    expect(processors.toArray(",", [upper, exclaim])("a, b")).toEqual(["A!", "B!"])
  })
})

describe("processors.toURL", () => {
  it("parses a valid absolute URL", () => {
    const result = processors.toURL()("https://example.com/path")
    expect(result).toBeInstanceOf(URL)
    expect(result.hostname).toBe("example.com")
  })

  it("throws for an invalid URL", () => {
    expect(() => processors.toURL()("not a url")).toThrow("Expected a valid absolute URL.")
  })

  it("treats nullish input as an empty string, which is also not a valid absolute URL", () => {
    expect(() => processors.toURL()(undefined)).toThrow()
    expect(() => processors.toURL()(null)).toThrow()
  })
})

describe("processors.base64", () => {
  it("decodes a base64 string into a Buffer", () => {
    const result = processors.base64()(Buffer.from("hello", "utf8").toString("base64"))
    expect(result).toBeInstanceOf(Buffer)
    expect(result.toString("utf8")).toBe("hello")
  })

  it("wraps a String()-conversion failure in the same generic error, without leaking the underlying cause", () => {
    // Buffer.from(str, "base64") itself never throws (invalid characters are
    // silently ignored) -- the only way to reach this processor's catch is a
    // value whose String() coercion itself throws.
    const poison = {
      toString: () => {
        throw new Error("boom")
      },
    }
    expect(() => processors.base64()(poison)).toThrow("Expected a valid base64 value.")
  })
})

describe("processors.toBigInt", () => {
  it("coerces numeric strings and numbers to bigint", () => {
    expect(processors.toBigInt()("42")).toBe(42n)
    expect(processors.toBigInt()(42)).toBe(42n)
  })

  it("throws for non-numeric input", () => {
    expect(() => processors.toBigInt()("not-a-bigint")).toThrow("Expected a bigint value.")
  })
})

describe("processors.toDate", () => {
  it("parses a valid date string", () => {
    const result = processors.toDate()("2027-01-01T00:00:00Z")
    expect(result).toBeInstanceOf(Date)
    expect(result.toISOString()).toBe("2027-01-01T00:00:00.000Z")
  })

  it("throws for an unparseable date", () => {
    expect(() => processors.toDate()("not-a-date")).toThrow("Expected a valid date.")
  })
})

describe("processors.toInteger", () => {
  it("coerces numeric strings that are whole numbers", () => {
    expect(processors.toInteger()("42")).toBe(42)
  })

  it("throws for a non-integer numeric value", () => {
    expect(() => processors.toInteger()("3.5")).toThrow("Expected an integer value.")
  })

  it("throws for a non-numeric value, same as processors.toNumber", () => {
    expect(() => processors.toInteger()("not-a-number")).toThrow()
  })
})

describe("processors.toLowerCase", () => {
  it("lowercases a string and treats nullish input as an empty string", () => {
    expect(processors.toLowerCase()("HELLO")).toBe("hello")
    expect(processors.toLowerCase()(undefined)).toBe("")
    expect(processors.toLowerCase()(null)).toBe("")
  })
})

describe("processors.toUpperCase", () => {
  it("uppercases a string and treats nullish input as an empty string", () => {
    expect(processors.toUpperCase()("hello")).toBe("HELLO")
    expect(processors.toUpperCase()(undefined)).toBe("")
    expect(processors.toUpperCase()(null)).toBe("")
  })
})

describe("processors.trim", () => {
  it("trims surrounding whitespace and treats nullish input as an empty string", () => {
    expect(processors.trim()("  hello  ")).toBe("hello")
    expect(processors.trim()(undefined)).toBe("")
    expect(processors.trim()(null)).toBe("")
  })
})

describe("processors.toRegExp", () => {
  it("compiles a valid pattern into a RegExp", () => {
    const result = processors.toRegExp()("^sk_")
    expect(result).toBeInstanceOf(RegExp)
    expect(result.test("sk_live_123")).toBe(true)
  })

  it("throws for an invalid pattern", () => {
    expect(() => processors.toRegExp()("(")).toThrow("Expected a valid regular expression.")
  })
})

describe("processors.split", () => {
  it("splits a delimited string into a trimmed array", () => {
    expect(processors.split()("a, b ,c")).toEqual(["a", "b", "c"])
  })

  it("supports a custom separator", () => {
    expect(processors.split("|")("a|b|c")).toEqual(["a", "b", "c"])
  })

  it("returns an empty array for non-string input", () => {
    expect(processors.split()(undefined)).toEqual([])
  })
})
