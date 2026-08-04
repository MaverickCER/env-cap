import { describe, it, expect } from "vitest"
import { processors } from "../../src/helpers/index.js"

describe("processors.string", () => {
  it("coerces values to strings and treats nullish as empty string", () => {
    const p = processors.string()
    expect(p("hello")).toBe("hello")
    expect(p(42)).toBe("42")
    expect(p(undefined)).toBe("")
    expect(p(null)).toBe("")
  })
})

describe("processors.number", () => {
  it("coerces numeric strings and passes through numbers", () => {
    const p = processors.number()
    expect(p("3000")).toBe(3000)
    expect(p(3000)).toBe(3000)
  })

  it("throws without echoing the value for non-numeric input", () => {
    const p = processors.number()
    expect(() => p("not-a-number")).toThrow()
    try {
      p("not-a-number")
    } catch (error) {
      expect((error as Error).message).not.toContain("not-a-number")
    }
  })

  it("throws on an empty or whitespace-only string instead of coercing to 0", () => {
    const p = processors.number()
    expect(() => p("")).toThrow()
    expect(() => p("   ")).toThrow()
  })
})

describe("processors.boolean", () => {
  it("accepts booleans and common truthy/falsy strings", () => {
    const p = processors.boolean()
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
    expect(() => processors.boolean()("maybe")).toThrow()
  })

  it("throws without echoing the value for undefined/null, describing only its type", () => {
    expect(() => processors.boolean()(undefined)).toThrow(/received undefined/)
    expect(() => processors.boolean()(null)).toThrow(/received null/)
  })
})

describe("processors.json", () => {
  it("parses valid JSON strings", () => {
    expect(processors.json<{ a: number }>()('{"a":1}')).toEqual({ a: 1 })
  })

  it("throws for invalid JSON", () => {
    expect(() => processors.json()("{not json")).toThrow()
  })

  it("passes a non-string value straight through unchanged", () => {
    expect(processors.json<number>()(42)).toBe(42)
    const obj = { already: "parsed" }
    expect(processors.json()(obj)).toBe(obj)
  })

  it("throws for undefined rather than passing it through", () => {
    expect(() => processors.json()(undefined)).toThrow(/received undefined/)
  })
})

describe("processors.array", () => {
  it("splits and trims a delimited string", () => {
    expect(processors.array()("a, b ,c")).toEqual(["a", "b", "c"])
  })

  it("returns an empty array for empty/nullish input", () => {
    expect(processors.array()(undefined)).toEqual([])
    expect(processors.array()("")).toEqual([])
  })

  it("supports a custom separator", () => {
    expect(processors.array("|")("a|b|c")).toEqual(["a", "b", "c"])
  })

  it("passes an actual array straight through, running each item through the given processors", () => {
    expect(processors.array()(["a", "b"])).toEqual(["a", "b"])
  })

  it("returns an empty array for a non-string, non-array value", () => {
    expect(processors.array()(42)).toEqual([])
  })
})

describe("processors.url", () => {
  it("parses a valid absolute URL", () => {
    const result = processors.url()("https://example.com/path")
    expect(result).toBeInstanceOf(URL)
    expect(result.hostname).toBe("example.com")
  })

  it("throws for an invalid URL", () => {
    expect(() => processors.url()("not a url")).toThrow()
  })

  it("treats nullish input as an empty string, which is also not a valid absolute URL", () => {
    expect(() => processors.url()(undefined)).toThrow()
    expect(() => processors.url()(null)).toThrow()
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

describe("processors.bigint", () => {
  it("coerces numeric strings and numbers to bigint", () => {
    expect(processors.bigint()("42")).toBe(42n)
    expect(processors.bigint()(42)).toBe(42n)
  })

  it("throws for non-numeric input", () => {
    expect(() => processors.bigint()("not-a-bigint")).toThrow()
  })
})

describe("processors.date", () => {
  it("parses a valid date string", () => {
    const result = processors.date()("2027-01-01T00:00:00Z")
    expect(result).toBeInstanceOf(Date)
    expect(result.toISOString()).toBe("2027-01-01T00:00:00.000Z")
  })

  it("throws for an unparseable date", () => {
    expect(() => processors.date()("not-a-date")).toThrow()
  })
})

describe("processors.integer", () => {
  it("coerces numeric strings that are whole numbers", () => {
    expect(processors.integer()("42")).toBe(42)
  })

  it("throws for a non-integer numeric value", () => {
    expect(() => processors.integer()("3.5")).toThrow()
  })

  it("throws for a non-numeric value, same as processors.number", () => {
    expect(() => processors.integer()("not-a-number")).toThrow()
  })
})

describe("processors.lowercase", () => {
  it("lowercases a string and treats nullish input as an empty string", () => {
    expect(processors.lowercase()("HELLO")).toBe("hello")
    expect(processors.lowercase()(undefined)).toBe("")
    expect(processors.lowercase()(null)).toBe("")
  })
})

describe("processors.uppercase", () => {
  it("uppercases a string and treats nullish input as an empty string", () => {
    expect(processors.uppercase()("hello")).toBe("HELLO")
    expect(processors.uppercase()(undefined)).toBe("")
    expect(processors.uppercase()(null)).toBe("")
  })
})

describe("processors.trim", () => {
  it("trims surrounding whitespace and treats nullish input as an empty string", () => {
    expect(processors.trim()("  hello  ")).toBe("hello")
    expect(processors.trim()(undefined)).toBe("")
    expect(processors.trim()(null)).toBe("")
  })
})

describe("processors.regexp", () => {
  it("compiles a valid pattern into a RegExp", () => {
    const result = processors.regexp()("^sk_")
    expect(result).toBeInstanceOf(RegExp)
    expect(result.test("sk_live_123")).toBe(true)
  })

  it("throws for an invalid pattern", () => {
    expect(() => processors.regexp()("(")).toThrow()
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
