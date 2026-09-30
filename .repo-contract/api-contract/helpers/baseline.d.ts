/** Passes when the date value is strictly after `date`. */
declare function after(date: Date): Validator<Date>;

/** Passes only when every wrapped validator passes; returns the first failing message. */
declare function all<T>(...validators: Validator<T>[]): Validator<T>;

/** Passes when at least one wrapped validator passes. */
declare function any<T>(...validators: Validator<T>[]): Validator<T>;

/** Decodes a base64 string into a `Buffer`. */
declare function base64(): Processor<Buffer>;

/** Passes when the date value is strictly before `date`. */
declare function before(date: Date): Validator<Date>;

/** Identity wrapper for a hand-written `Validator<T>` -- no behavior change, just a fluent entry point alongside the other helpers. */
declare function custom<T>(validator: Validator<T>): Validator<T>;

/** Passes for a plausibly-shaped email address (`local@domain`). */
declare function email(): Validator<string>;

/** Passes when the string ends with `suffix`. */
declare function endsWith(suffix: string): Validator<string>;

/** Passes when the number is finite (rejects `Infinity`/`-Infinity`/`NaN`). */
declare function finite(): Validator<number>;

/** Passes when the date is strictly after the current time. */
declare function future(): Validator<Date>;

/** Passes when the string contains `text` as a substring. */
declare function includes(text: string): Validator<string>;

/** Passes when the number is an integer. */
declare function integer(): Validator<number>;

/** Passes when the string's length is exactly `expected`. */
declare function length_2(expected: number): Validator<string>;

/** Passes when the string matches `pattern`; `message` overrides the default failure text. */
declare function matches(pattern: RegExp, message?: string): Validator<string>;

/** Passes when the number is less than or equal to `maximum`. */
declare function max(maximum: number): Validator<number>;

/** Passes when the array has at most `maximum` items. */
declare function maxItems<T>(maximum: number): Validator<T[]>;

/** Passes when the string's length is at most `length`. */
declare function maxLength(length: number): Validator<string>;

/** Passes when the number is greater than or equal to `minimum`. */
declare function min(minimum: number): Validator<number>;

/** Passes when the array has at least `minimum` items. */
declare function minItems<T>(minimum: number): Validator<T[]>;

/** Passes when the string's length is at least `length`. */
declare function minLength(length: number): Validator<string>;

/** Passes when the number is strictly negative. */
declare function negative(): Validator<number>;

/** Inverts a validator: passes when the wrapped validator fails, and vice versa. */
declare function not<T>(validator: Validator<T>): Validator<T>;

/** Passes when the value is one of the `allowed` values. */
declare function oneOf<T>(allowed: readonly T[]): Validator<T>;

/** Passes when the value is undefined, otherwise delegates to the provided validator. */
declare function optional<T>(validator: Validator<T>): Validator<T | undefined>;

/** Parses a JSON string; passes non-string values through unchanged. */
declare function parseJSON<T = unknown>(): Processor<T>;

/** Passes when the date is strictly before the current time. */
declare function past(): Validator<Date>;

/** Passes when the number is strictly positive. */
declare function positive(): Validator<number>;

/** Processes a raw value into a typed, ready-to-use application value. Must not read any other key. */
declare type Processor<T> = (value: unknown) => T;

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
export declare const processors: {
    /** Decodes a base64 string into a `Buffer`. */
    base64: typeof base64;
    /** Parses a JSON string; passes non-string values through unchanged. */
    parseJSON: typeof parseJSON;
    /** Splits a string on `separator` into a trimmed string array; returns `[]` for non-string input. */
    split: typeof split;
    /** Splits a delimited string (or passes through an array) into items, running each through `processors` in order. */
    toArray: typeof toArray;
    /** Coerces a value to a `bigint`. */
    toBigInt: typeof toBigInt;
    /** Coerces common boolean-like strings (`true`/`1`/`yes`/`on`, and their opposites) into a real boolean. */
    toBoolean: typeof toBoolean;
    /** Parses a value into a `Date`. */
    toDate: typeof toDate;
    /** Coerces a value to a number and requires it to be an integer. */
    toInteger: typeof toInteger;
    /** Lowercases a string (coercing nullish values to `""` first). */
    toLowerCase: typeof toLowerCase;
    /** Coerces a value to a number, rejecting empty/whitespace-only strings instead of silently resolving to `0`. */
    toNumber: typeof toNumber;
    /** Compiles a value into a `RegExp`. */
    toRegExp: typeof toRegExp;
    /** Coerces a value to a string, treating nullish values as `""`. */
    toString: typeof toString_2;
    /** Parses a value into a `URL`, treating nullish values as `""` first. */
    toURL: typeof toURL;
    /** Uppercases a string (coercing nullish values to `""` first). */
    toUpperCase: typeof toUpperCase;
    /** Trims surrounding whitespace from a string (coercing nullish values to `""` first). */
    trim: typeof trim;
};

/** Passes when the number is within `[minimum, maximum]` inclusive. */
declare function range(minimum: number, maximum: number): Validator<number>;

/**
 * Core contract types for env-cap.
 *
 * These types are intentionally minimal: an `EnvDefinition` describes how to
 * turn one raw environment value into one typed, validated application
 * value. There is no `optional`/`required` flag anywhere in this file --
 * requiredness is just a validator that rejects `undefined`/empty values.
 *
 * Documentation fields (description, owner, expiresAt, category, ...) live
 * entirely in {@link documentEnv} (see `document.ts`), not here -- this file is
 * the runtime's whole vocabulary, and every field in it is read by
 * `validate.ts`/`create.ts`/`errors.ts` at runtime. If a field is only ever
 * read by the generator, it belongs in `document.ts`, not here. `context` is
 * the one exception worth calling out: it's also read by the build package
 * for documentation display (see ADR 0022), but it belongs here rather than
 * in `documentEnv()` because `validate.ts` reads it too, to decide pipeline
 * participation -- the same bar `default`/`processor`/`validator` already
 * clear.
 */
/** The raw, unprocessed source of environment values (e.g. `process.env`, a resolved secrets bag). */
declare type RawEnv = Readonly<Record<string, unknown>>;

/** Runs the wrapped validator but replaces its failure message with `message`. */
declare function refine<T>(validator: Validator<T>, message: string): Validator<T>;

/** Passes when the value is defined and, unless `allowEmptyString` is set, non-empty. */
declare function required(allowEmptyString?: boolean): Validator<unknown>;

/** Passes when the number is a safe integer (`Number.isSafeInteger`). */
declare function safeInteger(): Validator<number>;

/** Splits a string on `separator` into a trimmed string array; returns `[]` for non-string input. */
declare function split(separator?: string): Processor<string[]>;

/** Splits a delimited string (or passes through an array) into items, running each through `processors` in order. */
declare function toArray<T>(separator?: string | RegExp, processors?: Processor<unknown>[]): Processor<T[]>;

/** Coerces a value to a `bigint`. */
declare function toBigInt(): Processor<bigint>;

/** Coerces common boolean-like strings (`true`/`1`/`yes`/`on`, and their opposites) into a real boolean. */
declare function toBoolean(): Processor<boolean>;

/** Parses a value into a `Date`. */
declare function toDate(): Processor<Date>;

/** Coerces a value to a number and requires it to be an integer. */
declare function toInteger(): Processor<number>;

/** Lowercases a string (coercing nullish values to `""` first). */
declare function toLowerCase(): Processor<string>;

/** Coerces a value to a number, rejecting empty/whitespace-only strings instead of silently resolving to `0`. */
declare function toNumber(): Processor<number>;

/** Compiles a value into a `RegExp`. */
declare function toRegExp(): Processor<RegExp>;

/** Coerces a value to a string, treating nullish values as `""`. */
declare function toString_2(): Processor<string>;

/** Uppercases a string (coercing nullish values to `""` first). */
declare function toUpperCase(): Processor<string>;

/** Parses a value into a `URL`, treating nullish values as `""` first. */
declare function toURL(): Processor<URL>;

/** Trims surrounding whitespace from a string (coercing nullish values to `""` first). */
declare function trim(): Processor<string>;

/** Passes when every item in the array is unique. */
declare function unique<T>(): Validator<T[]>;

/** Passes when the string is a valid absolute URL. */
declare function url(): Validator<string>;

/** Passes when the string is a valid UUID of one of the given `versions` (default: any of 1-8). */
declare function uuid(versions?: readonly number[]): Validator<string>;

/** Shorthand for `uuid([version])` -- passes only for that exact UUID version. */
declare function uuidVersion(number: number): Validator<string>;

/**
 * Validates an already-processed value; return `true` when valid, or a human-readable error
 * string when invalid.
 *
 * @remarks
 * Receives the full raw env for conditional validation (e.g. "required only if X").
 */
declare type Validator<T> = (value: T, rawEnv: RawEnv) => true | string;

/** Convenience {@link runtime.Validator} implementations for common validation patterns (e.g. `validators.range(1, 65535)`). */
export declare const validators: {
    /** Passes when the date value is strictly after `date`. */
    after: typeof after;
    /** Passes only when every wrapped validator passes; returns the first failing message. */
    all: typeof all;
    /** Passes when at least one wrapped validator passes. */
    any: typeof any;
    /** Passes when the date value is strictly before `date`. */
    before: typeof before;
    /** Identity wrapper for a hand-written `Validator<T>` -- no behavior change, just a fluent entry point alongside the other helpers. */
    custom: typeof custom;
    /** Passes for a plausibly-shaped email address (`local@domain`). */
    email: typeof email;
    /** Passes when the string ends with `suffix`. */
    endsWith: typeof endsWith;
    /** Alias for `oneOf` -- passes when the value is one of the `allowed` values. */
    enum: typeof oneOf;
    /** Passes when the number is finite (rejects `Infinity`/`-Infinity`/`NaN`). */
    finite: typeof finite;
    /** Passes when the date is strictly after the current time. */
    future: typeof future;
    /** Passes when the string contains `text` as a substring. */
    includes: typeof includes;
    /** Passes when the number is an integer. */
    integer: typeof integer;
    /** Passes when the string's length is exactly `expected`. */
    length: typeof length_2;
    /** Passes when the string matches `pattern`; `message` overrides the default failure text. */
    matches: typeof matches;
    /** Passes when the number is less than or equal to `maximum`. */
    max: typeof max;
    /** Passes when the array has at most `maximum` items. */
    maxItems: typeof maxItems;
    /** Passes when the string's length is at most `length`. */
    maxLength: typeof maxLength;
    /** Passes when the number is greater than or equal to `minimum`. */
    min: typeof min;
    /** Passes when the array has at least `minimum` items. */
    minItems: typeof minItems;
    /** Passes when the string's length is at least `length`. */
    minLength: typeof minLength;
    /** Passes when the number is strictly negative. */
    negative: typeof negative;
    /** Inverts a validator: passes when the wrapped validator fails, and vice versa. */
    not: typeof not;
    /** Passes when the value is one of the `allowed` values. */
    oneOf: typeof oneOf;
    /** Passes when the value is undefined, otherwise delegates to the provided validator. */
    optional: typeof optional;
    /** Passes when the date is strictly before the current time. */
    past: typeof past;
    /** Passes when the number is strictly positive. */
    positive: typeof positive;
    /** Passes when the number is within `[minimum, maximum]` inclusive. */
    range: typeof range;
    /** Runs the wrapped validator but replaces its failure message with `message`. */
    refine: typeof refine;
    /** Alias for `matches` -- passes when the string matches `pattern`. */
    regex: typeof matches;
    /** Passes when the value is defined and, unless `allowEmptyString` is set, non-empty. */
    required: typeof required;
    /** Passes when the number is a safe integer (`Number.isSafeInteger`). */
    safeInteger: typeof safeInteger;
    /** Passes when every item in the array is unique. */
    unique: typeof unique;
    /** Passes when the string is a valid absolute URL. */
    url: typeof url;
    /** Passes when the string is a valid UUID of one of the given `versions` (default: any of 1-8). */
    uuid: typeof uuid;
    /** Shorthand for `uuid([version])` -- passes only for that exact UUID version. */
    uuidVersion: typeof uuidVersion;
};

export { }
