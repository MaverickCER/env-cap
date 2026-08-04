import type { Validator } from "../runtime/index.js"

/** Passes when the date value is strictly after `date`. */
export function after(date: Date): Validator<Date> {
  return (value, _rawEnv) => value > date || "Expected date to be after required date."
}

/** Passes only when every wrapped validator passes; returns the first failing message. */
export function all<T>(...validators: Validator<T>[]): Validator<T> {
  return (value, rawEnv) => {
    for (const validator of validators) {
      const result = validator(value, rawEnv)
      if (result !== true) return result
    }

    return true
  }
}

/** Passes when at least one wrapped validator passes. */
export function any<T>(...validators: Validator<T>[]): Validator<T> {
  return (value, rawEnv) => {
    for (const validator of validators) {
      if (validator(value, rawEnv) === true) return true
    }

    return "Value did not satisfy any validation."
  }
}

/** Passes when the date value is strictly before `date`. */
export function before(date: Date): Validator<Date> {
  return (value, _rawEnv) => value < date || "Expected date to be before required date."
}

/** Identity wrapper for a hand-written `Validator<T>` -- no behavior change, just a fluent entry point alongside the other helpers. */
export function custom<T>(validator: Validator<T>): Validator<T> {
  return validator
}

/** Passes for a plausibly-shaped email address (`local@domain`). */
export function email(): Validator<string> {
  return matches(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Expected a valid email address.")
}

/** Passes when the string ends with `suffix`. */
export function endsWith(suffix: string): Validator<string> {
  return (value, _rawEnv) => value.endsWith(suffix) || "Expected value to end with required suffix."
}

/** Passes when the number is finite (rejects `Infinity`/`-Infinity`/`NaN`). */
export function finite(): Validator<number> {
  return (value, _rawEnv) => Number.isFinite(value) || "Expected a finite number."
}

/** Passes when the date is strictly after the current time. */
export function future(): Validator<Date> {
  return (value, _rawEnv) => value > new Date() || "Expected a future date."
}

/** Passes when the string contains `text` as a substring. */
export function includes(text: string): Validator<string> {
  return (value, _rawEnv) => value.includes(text) || "Expected value to include required text."
}

/** Passes when the number is an integer. */
export function integer(): Validator<number> {
  return (value, _rawEnv) => Number.isInteger(value) || "Expected an integer value."
}

/** Passes when the string's length is exactly `expected`. */
export function length(expected: number): Validator<string> {
  return (value, _rawEnv) => value.length === expected || `Expected length ${expected}.`
}

/** Passes when the string matches `pattern`; `message` overrides the default failure text. */
export function matches(pattern: RegExp, message?: string): Validator<string> {
  return (value, _rawEnv) =>
    pattern.test(value) || (message ?? "Expected value to match required pattern.")
}

/** Passes when the number is less than or equal to `maximum`. */
export function max(maximum: number): Validator<number> {
  return (value, _rawEnv) =>
    value <= maximum || `Expected a value less than or equal to ${maximum}.`
}

/** Passes when the array has at most `maximum` items. */
export function maxItems<T>(maximum: number): Validator<T[]> {
  return (value, _rawEnv) => value.length <= maximum || `Expected no more than ${maximum} items.`
}

/** Passes when the string's length is at most `length`. */
export function maxLength(length: number): Validator<string> {
  return (value, _rawEnv) => value.length <= length || `Expected a maximum length of ${length}.`
}

/** Passes when the number is greater than or equal to `minimum`. */
export function min(minimum: number): Validator<number> {
  return (value, _rawEnv) =>
    value >= minimum || `Expected a value greater than or equal to ${minimum}.`
}

/** Passes when the array has at least `minimum` items. */
export function minItems<T>(minimum: number): Validator<T[]> {
  return (value, _rawEnv) => value.length >= minimum || `Expected at least ${minimum} items.`
}

/** Passes when the string's length is at least `length`. */
export function minLength(length: number): Validator<string> {
  return (value, _rawEnv) => value.length >= length || `Expected a minimum length of ${length}.`
}

/** Passes when the number is strictly negative. */
export function negative(): Validator<number> {
  return (value, _rawEnv) => value < 0 || "Expected a negative value."
}

/** Inverts a validator: passes when the wrapped validator fails, and vice versa. */
export function not<T>(validator: Validator<T>): Validator<T> {
  return (value, rawEnv) =>
    validator(value, rawEnv) === true ? "Value must not satisfy this validation." : true
}

/** Passes unless the value matches one of the given placeholder default values. */
export function notDefault(...values: (string | number | Date)[]): Validator<string> {
  return (value, _rawEnv) => !values.includes(value) || "Value cannot use a default placeholder."
}

/** Passes unless the value is one of the `blocked` values. */
export function notOneOf<T>(blocked: readonly T[]): Validator<T> {
  return (value, _rawEnv) => !blocked.includes(value) || "Value is not allowed."
}

/** Passes when the value is one of the `allowed` values. */
export function oneOf<T>(allowed: readonly T[]): Validator<T> {
  return (value, _rawEnv) => allowed.includes(value) || `Expected one of: ${allowed.join(", ")}.`
}

/** Passes when the date is strictly before the current time. */
export function past(): Validator<Date> {
  return (value, _rawEnv) => value < new Date() || "Expected a past date."
}

/** Passes when the number is strictly positive. */
export function positive(): Validator<number> {
  return (value, _rawEnv) => value > 0 || "Expected a positive value."
}

/** Passes when the number is within `[minimum, maximum]` inclusive. */
export function range(minimum: number, maximum: number): Validator<number> {
  return (value, _rawEnv) =>
    (value >= minimum && value <= maximum) ||
    `Expected a value greater than or equal to ${minimum} and less than or equal to ${maximum}.`
}

/** Runs the wrapped validator but replaces its failure message with `message`. */
export function refine<T>(validator: Validator<T>, message: string): Validator<T> {
  return (value, rawEnv) => (validator(value, rawEnv) === true ? true : message)
}

/** Passes when the value is defined and, unless `allowEmptyString` is set, non-empty. */
export function required(allowEmptyString = false): Validator<unknown> {
  return (value, _rawEnv) => {
    if (value === undefined || value === null) {
      return "This variable is required."
    }

    if (!allowEmptyString && typeof value === "string" && value.length === 0) {
      return "This variable is required."
    }

    return true
  }
}

/** Passes when the number is a safe integer (`Number.isSafeInteger`). */
export function safeInteger(): Validator<number> {
  return (value, _rawEnv) => Number.isSafeInteger(value) || "Expected a safe integer."
}

/** Passes when every item in the array is unique. */
export function unique<T>(): Validator<T[]> {
  return (value, _rawEnv) =>
    new Set(value).size === value.length || "Expected all items to be unique."
}

/** Passes when the string is a valid absolute URL. */
export function url(): Validator<string> {
  return (value, _rawEnv) => {
    try {
      new URL(value)
      return true
    } catch {
      return "Expected a valid absolute URL."
    }
  }
}

/** Passes when the string is a valid UUID of one of the given `versions` (default: any of 1-8). */
export function uuid(versions: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8]): Validator<string> {
  return (value, _rawEnv) => {
    const match =
      /^([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f])[0-9a-f]{3}-([89ab])[0-9a-f]{3}-([0-9a-f]{12})$/i.exec(
        value,
      )

    if (!match) {
      return "Expected a valid UUID ."
    }

    const version = Number.parseInt(match[3], 16)

    if (!versions.includes(version)) {
      return `Expected UUID version ${versions.join(", ")}.`
    }

    return true
  }
}

/** Shorthand for `uuid([version])` -- passes only for that exact UUID version. */
export function uuidVersion(number: number): Validator<string> {
  return uuid([number])
}
