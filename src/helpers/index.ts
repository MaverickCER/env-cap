/**
 * Optional convenience helpers for common processor/validator patterns.
 * Entirely separate from the core runtime -- `defineEnv`/`validateEnv` have
 * no knowledge of this module and work identically without it.
 *
 * Usage: `processors.toNumber()`, `validators.range(1, 65535)`.
 *
 * Deliberately built from explicit named imports assembled into plain object
 * literals, not `export * as processors from "./processors.js"`. A bundler
 * (tsup/esbuild) lowers that `export * as` form into a namespace-construction
 * helper call it can't prove side-effect-free, which defeats tree-shaking in
 * a *second*, downstream bundling pass (a consumer's own bundler bundling
 * this already-bundled package): importing only `processors` would still
 * ship all of `validators`' code. A plain object literal of already-imported
 * bindings has no such call in the way, so `import { processors } from
 * "env-cap/helpers"` alone drops `validators` entirely.
 */
import {
  base64,
  parseJSON,
  split,
  toArray,
  toBigInt,
  toBoolean,
  toDate,
  toInteger,
  toLowerCase,
  toNumber,
  toRegExp,
  toString,
  toURL,
  toUpperCase,
  trim,
} from "./processors.js"
import {
  after,
  all,
  any,
  before,
  custom,
  email,
  endsWith,
  finite,
  future,
  includes,
  integer as integerValidator,
  length,
  matches,
  max,
  maxItems,
  maxLength,
  min,
  minItems,
  minLength,
  negative,
  not,
  oneOf,
  optional,
  past,
  positive,
  range,
  refine,
  required,
  safeInteger,
  unique,
  url as urlValidator,
  uuid,
  uuidVersion,
} from "./validators.js"

/**
 * Convenience {@link runtime.Processor} implementations for common coercion
 * patterns (e.g. `processors.toNumber()`).
 *
 * @remarks
 * Naming matches `@maverickcer/data-cap`'s `helpers.processors` -- but these
 * throw with a formatted `Error` message on invalid input, where data-cap's
 * silently return `undefined`. Do not assume the same failure mode when
 * moving between packages.
 */
export const processors = {
  /** Decodes a base64 string into a `Buffer`. */
  base64,
  /** Parses a JSON string; passes non-string values through unchanged. */
  parseJSON,
  /** Splits a string on `separator` into a trimmed string array; returns `[]` for non-string input. */
  split,
  /** Splits a delimited string (or passes through an array) into items, running each through `processors` in order. */
  toArray,
  /** Coerces a value to a `bigint`. */
  toBigInt,
  /** Coerces common boolean-like strings (`true`/`1`/`yes`/`on`, and their opposites) into a real boolean. */
  toBoolean,
  /** Parses a value into a `Date`. */
  toDate,
  /** Coerces a value to a number and requires it to be an integer. */
  toInteger,
  /** Lowercases a string (coercing nullish values to `""` first). */
  toLowerCase,
  /** Coerces a value to a number, rejecting empty/whitespace-only strings instead of silently resolving to `0`. */
  toNumber,
  /** Compiles a value into a `RegExp`. */
  toRegExp,
  /** Coerces a value to a string, treating nullish values as `""`. */
  toString,
  /** Parses a value into a `URL`, treating nullish values as `""` first. */
  toURL,
  /** Uppercases a string (coercing nullish values to `""` first). */
  toUpperCase,
  /** Trims surrounding whitespace from a string (coercing nullish values to `""` first). */
  trim,
}
/** Convenience {@link runtime.Validator} implementations for common validation patterns (e.g. `validators.range(1, 65535)`). */
export const validators = {
  /** Passes when the date value is strictly after `date`. */
  after,
  /** Passes only when every wrapped validator passes; returns the first failing message. */
  all,
  /** Passes when at least one wrapped validator passes. */
  any,
  /** Passes when the date value is strictly before `date`. */
  before,
  /** Identity wrapper for a hand-written `Validator<T>` -- no behavior change, just a fluent entry point alongside the other helpers. */
  custom,
  /** Passes for a plausibly-shaped email address (`local@domain`). */
  email,
  /** Passes when the string ends with `suffix`. */
  endsWith,
  /** Alias for `oneOf` -- passes when the value is one of the `allowed` values. */
  enum: oneOf,
  /** Passes when the number is finite (rejects `Infinity`/`-Infinity`/`NaN`). */
  finite,
  /** Passes when the date is strictly after the current time. */
  future,
  /** Passes when the string contains `text` as a substring. */
  includes,
  /** Passes when the number is an integer. */
  integer: integerValidator,
  /** Passes when the string's length is exactly `expected`. */
  length,
  /** Passes when the string matches `pattern`; `message` overrides the default failure text. */
  matches,
  /** Passes when the number is less than or equal to `maximum`. */
  max,
  /** Passes when the array has at most `maximum` items. */
  maxItems,
  /** Passes when the string's length is at most `length`. */
  maxLength,
  /** Passes when the number is greater than or equal to `minimum`. */
  min,
  /** Passes when the array has at least `minimum` items. */
  minItems,
  /** Passes when the string's length is at least `length`. */
  minLength,
  /** Passes when the number is strictly negative. */
  negative,
  /** Inverts a validator: passes when the wrapped validator fails, and vice versa. */
  not,
  /** Passes when the value is one of the `allowed` values. */
  oneOf,
  /** Passes when the value is undefined, otherwise delegates to the provided validator. */
  optional,
  /** Passes when the date is strictly before the current time. */
  past,
  /** Passes when the number is strictly positive. */
  positive,
  /** Passes when the number is within `[minimum, maximum]` inclusive. */
  range,
  /** Runs the wrapped validator but replaces its failure message with `message`. */
  refine,
  /** Alias for `matches` -- passes when the string matches `pattern`. */
  regex: matches,
  /** Passes when the value is defined and, unless `allowEmptyString` is set, non-empty. */
  required,
  /** Passes when the number is a safe integer (`Number.isSafeInteger`). */
  safeInteger,
  /** Passes when every item in the array is unique. */
  unique,
  /** Passes when the string is a valid absolute URL. */
  url: urlValidator,
  /** Passes when the string is a valid UUID of one of the given `versions` (default: any of 1-8). */
  uuid,
  /** Shorthand for `uuid([version])` -- passes only for that exact UUID version. */
  uuidVersion,
}
