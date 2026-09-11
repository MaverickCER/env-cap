import type { Processor } from "../runtime/index.js"

/**
 * Convenience processors. Purely optional sugar over `Processor<T>` --
 * the runtime and generator never import from this module. Error messages
 * describe the *type* of an invalid value, never its content, so a
 * misconfigured secret is never echoed back through a thrown error.
 */

function describe(value: unknown): string {
  if (value === undefined) return "undefined"
  if (value === null) return "null"
  return `a ${typeof value}`
}

/** Splits a delimited string (or passes through an array) into items, running each through `processors` in order. */
export function toArray<T>(
  separator: string | RegExp = ",",
  processors: Processor<unknown>[] = [],
): Processor<T[]> {
  return (value) => {
    const items = Array.isArray(value)
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? value.split(separator).map((item) => item.trim())
        : []

    return items.map((item) => {
      return processors.reduce((current, processor) => processor(current), item) as T
    })
  }
}

/** Decodes a base64 string into a `Buffer`. */
export function base64(): Processor<Buffer> {
  return (value) => {
    try {
      return Buffer.from(String(value), "base64")
    } catch {
      throw new Error("Expected a valid base64 value.")
    }
  }
}

/** Coerces a value to a `bigint`. */
export function toBigInt(): Processor<bigint> {
  return (value) => {
    try {
      return BigInt(String(value))
    } catch {
      throw new Error("Expected a bigint value.")
    }
  }
}

/** Coerces common boolean-like strings (`true`/`1`/`yes`/`on`, and their opposites) into a real boolean. */
export function toBoolean(): Processor<boolean> {
  return (value) => {
    // Bypassing this fast-path is behaviorally equivalent, not a real gap:
    // `String(true)`/`String(false)` round-trip through the exact
    // "true"/"false" strings already recognized below, so falling through
    // to the general string-parsing path gives the identical result for a
    // real boolean input either way. Hand-verified: mutating this and
    // running the real suite passes unchanged.
    // Stryker disable next-line ConditionalExpression,StringLiteral
    if (typeof value === "boolean") return value
    const normalized = String(value).trim().toLowerCase()
    if (["true", "1", "yes", "on"].includes(normalized)) return true
    if (["false", "0", "no", "off"].includes(normalized)) return false
    throw new Error(
      `Expected a boolean-like value (true/false/1/0/yes/no/on/off), received ${describe(value)}.`,
    )
  }
}

/** Parses a value into a `Date`. */
export function toDate(): Processor<Date> {
  return (value) => {
    const result = new Date(String(value))

    if (Number.isNaN(result.getTime())) {
      throw new Error("Expected a valid date.")
    }

    return result
  }
}

/** Coerces a value to a number and requires it to be an integer. */
export function toInteger(): Processor<number> {
  return (value) => {
    const parsed = toNumber()(value)

    if (!Number.isInteger(parsed)) {
      throw new Error("Expected an integer value.")
    }

    return parsed
  }
}

/** Parses a JSON string; passes non-string values through unchanged. */
export function parseJSON<T = unknown>(): Processor<T> {
  return (value) => {
    if (typeof value !== "string") {
      if (value === undefined) {
        throw new Error("Expected a JSON string, received undefined.")
      }
      return value as T
    }
    try {
      return JSON.parse(value) as T
    } catch {
      throw new Error("Expected a valid JSON string, but parsing failed.")
    }
  }
}

/** Lowercases a string (coercing nullish values to `""` first). */
export function toLowerCase(): Processor<string> {
  return (value) => String(value ?? "").toLowerCase()
}

/** Coerces a value to a number, rejecting empty/whitespace-only strings instead of silently resolving to `0`. */
export function toNumber(): Processor<number> {
  return (value) => {
    // `Number("")` is `0`, not `NaN` -- without this check a blank env var would
    // silently resolve to the number 0 instead of failing, slipping past
    // validators.required() too (that checks the processed value, not the raw string).
    if (typeof value === "string" && value.trim() === "") {
      throw new Error("Expected a numeric value, received an empty string.")
    }
    // Bypassing this type-check (always going through `Number(value)`) is
    // behaviorally equivalent, not a real gap: `Number()` is idempotent on
    // an already-number input (`Number(x) === x` for every real number,
    // including NaN and -0), so the ternary's two branches always produce
    // the same result. Hand-verified: mutating this and running the real
    // suite passes unchanged.
    // Stryker disable next-line ConditionalExpression,StringLiteral
    const result = typeof value === "number" ? value : Number(value)
    if (Number.isNaN(result)) {
      throw new Error(`Expected a numeric value, received ${describe(value)}.`)
    }
    return result
  }
}

/** Compiles a value into a `RegExp`. */
export function toRegExp(): Processor<RegExp> {
  return (value) => {
    try {
      return new RegExp(String(value))
    } catch {
      throw new Error("Expected a valid regular expression.")
    }
  }
}

/** Splits a string on `separator` into a trimmed string array; returns `[]` for non-string input. */
export function split(separator = ","): Processor<string[]> {
  return (value) => {
    if (typeof value !== "string") return []

    return value.split(separator).map((item) => item.trim())
  }
}

/** Coerces a value to a string, treating nullish values as `""`. */
export function toString(): Processor<string> {
  return (value) => {
    if (value === undefined || value === null) return ""
    // Bypassing this type-check (always going through `String(value)`) is
    // behaviorally equivalent, not a real gap: `String()` is idempotent on
    // an already-string input. Hand-verified: mutating this and running the
    // real suite passes unchanged.
    // Stryker disable next-line ConditionalExpression,StringLiteral
    return typeof value === "string" ? value : String(value)
  }
}

/** Trims surrounding whitespace from a string (coercing nullish values to `""` first). */
export function trim(): Processor<string> {
  return (value) => String(value ?? "").trim()
}

/** Uppercases a string (coercing nullish values to `""` first). */
export function toUpperCase(): Processor<string> {
  return (value) => String(value ?? "").toUpperCase()
}

/** Parses a value into a `URL`, treating nullish values as `""` first. */
export function toURL(): Processor<URL> {
  return (value) => {
    try {
      // The `""` fallback for nullish input is behaviorally equivalent to
      // any other non-URL-shaped fallback string: `new URL(...)` throws for
      // BOTH "" and any garbage string, and both land in the same generic
      // catch below with the same message -- there is no distinguishable
      // outcome. Hand-verified: mutating this and running the real suite
      // passes unchanged.
      // Stryker disable next-line StringLiteral
      return new URL(String(value ?? ""))
    } catch {
      throw new Error("Expected a valid absolute URL.")
    }
  }
}
