# helpers

## Variables

### processors

```ts
const processors: {
  base64: () => Processor<Buffer>;
  parseJSON: <T>() => Processor<T>;
  split: (separator) => Processor<string[]>;
  toArray: <T>(separator, processors) => Processor<T[]>;
  toBigInt: () => Processor<bigint>;
  toBoolean: () => Processor<boolean>;
  toDate: () => Processor<Date>;
  toInteger: () => Processor<number>;
  toLowerCase: () => Processor<string>;
  toNumber: () => Processor<number>;
  toRegExp: () => Processor<RegExp>;
  toString: () => Processor<string>;
  toUpperCase: () => Processor<string>;
  toURL: () => Processor<URL>;
  trim: () => Processor<string>;
};
```

Convenience [runtime.Processor](runtime.md#processor-1) implementations for common coercion
patterns (e.g. `processors.toNumber()`).

#### Type Declaration

##### base64

```ts
base64: () => Processor<Buffer>;
```

Decodes a base64 string into a `Buffer`.

Decodes a base64 string into a `Buffer`.

###### Returns

[`Processor`](runtime.md#processor-1)\<`Buffer`\>

##### parseJSON

```ts
parseJSON: <T>() => Processor<T>;
```

Parses a JSON string; passes non-string values through unchanged.

Parses a JSON string; passes non-string values through unchanged.

###### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `T` | `unknown` |

###### Returns

[`Processor`](runtime.md#processor-1)\<`T`\>

##### split

```ts
split: (separator) => Processor<string[]>;
```

Splits a string on `separator` into a trimmed string array; returns `[]` for non-string input.

Splits a string on `separator` into a trimmed string array; returns `[]` for non-string input.

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `separator` | `string` | `","` |

###### Returns

[`Processor`](runtime.md#processor-1)\<`string`[]\>

##### toArray

```ts
toArray: <T>(separator, processors) => Processor<T[]>;
```

Splits a delimited string (or passes through an array) into items, running each through `processors` in order.

Splits a delimited string (or passes through an array) into items, running each through `processors` in order.

###### Type Parameters

| Type Parameter |
| ------ |
| `T` |

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `separator` | `string` \| `RegExp` | `","` |
| `processors` | [`Processor`](runtime.md#processor-1)\<`unknown`\>[] | `[]` |

###### Returns

[`Processor`](runtime.md#processor-1)\<`T`[]\>

##### toBigInt

```ts
toBigInt: () => Processor<bigint>;
```

Coerces a value to a `bigint`.

Coerces a value to a `bigint`.

###### Returns

[`Processor`](runtime.md#processor-1)\<`bigint`\>

##### toBoolean

```ts
toBoolean: () => Processor<boolean>;
```

Coerces common boolean-like strings (`true`/`1`/`yes`/`on`, and their opposites) into a real boolean.

Coerces common boolean-like strings (`true`/`1`/`yes`/`on`, and their opposites) into a real boolean.

###### Returns

[`Processor`](runtime.md#processor-1)\<`boolean`\>

##### toDate

```ts
toDate: () => Processor<Date>;
```

Parses a value into a `Date`.

Parses a value into a `Date`.

###### Returns

[`Processor`](runtime.md#processor-1)\<`Date`\>

##### toInteger

```ts
toInteger: () => Processor<number>;
```

Coerces a value to a number and requires it to be an integer.

Coerces a value to a number and requires it to be an integer.

###### Returns

[`Processor`](runtime.md#processor-1)\<`number`\>

##### toLowerCase

```ts
toLowerCase: () => Processor<string>;
```

Lowercases a string (coercing nullish values to `""` first).

Lowercases a string (coercing nullish values to `""` first).

###### Returns

[`Processor`](runtime.md#processor-1)\<`string`\>

##### toNumber

```ts
toNumber: () => Processor<number>;
```

Coerces a value to a number, rejecting empty/whitespace-only strings instead of silently resolving to `0`.

Coerces a value to a number, rejecting empty/whitespace-only strings instead of silently resolving to `0`.

###### Returns

[`Processor`](runtime.md#processor-1)\<`number`\>

##### toRegExp

```ts
toRegExp: () => Processor<RegExp>;
```

Compiles a value into a `RegExp`.

Compiles a value into a `RegExp`.

###### Returns

[`Processor`](runtime.md#processor-1)\<`RegExp`\>

##### toString

```ts
toString: () => Processor<string>;
```

Coerces a value to a string, treating nullish values as `""`.

Coerces a value to a string, treating nullish values as `""`.

###### Returns

[`Processor`](runtime.md#processor-1)\<`string`\>

##### toUpperCase

```ts
toUpperCase: () => Processor<string>;
```

Uppercases a string (coercing nullish values to `""` first).

Uppercases a string (coercing nullish values to `""` first).

###### Returns

[`Processor`](runtime.md#processor-1)\<`string`\>

##### toURL

```ts
toURL: () => Processor<URL>;
```

Parses a value into a `URL`, treating nullish values as `""` first.

Parses a value into a `URL`, treating nullish values as `""` first.

###### Returns

[`Processor`](runtime.md#processor-1)\<`URL`\>

##### trim

```ts
trim: () => Processor<string>;
```

Trims surrounding whitespace from a string (coercing nullish values to `""` first).

Trims surrounding whitespace from a string (coercing nullish values to `""` first).

###### Returns

[`Processor`](runtime.md#processor-1)\<`string`\>

#### Remarks

Naming matches `@maverickcer/data-cap`'s `helpers.processors` -- but these
throw with a formatted `Error` message on invalid input, where data-cap's
silently return `undefined`. Do not assume the same failure mode when
moving between packages.

***

### validators

```ts
const validators: {
  after: (date) => Validator<Date>;
  all: <T>(...validators) => Validator<T>;
  any: <T>(...validators) => Validator<T>;
  before: (date) => Validator<Date>;
  custom: <T>(validator) => Validator<T>;
  email: () => Validator<string>;
  endsWith: (suffix) => Validator<string>;
  enum: <T>(allowed) => Validator<T>;
  finite: () => Validator<number>;
  future: () => Validator<Date>;
  includes: (text) => Validator<string>;
  integer: () => Validator<number>;
  length: (expected) => Validator<string>;
  matches: (pattern, message?) => Validator<string>;
  max: (maximum) => Validator<number>;
  maxItems: <T>(maximum) => Validator<T[]>;
  maxLength: (length) => Validator<string>;
  min: (minimum) => Validator<number>;
  minItems: <T>(minimum) => Validator<T[]>;
  minLength: (length) => Validator<string>;
  negative: () => Validator<number>;
  not: <T>(validator) => Validator<T>;
  oneOf: <T>(allowed) => Validator<T>;
  optional: <T>(validator) => Validator<T | undefined>;
  past: () => Validator<Date>;
  positive: () => Validator<number>;
  range: (minimum, maximum) => Validator<number>;
  refine: <T>(validator, message) => Validator<T>;
  regex: (pattern, message?) => Validator<string>;
  required: (allowEmptyString) => Validator<unknown>;
  safeInteger: () => Validator<number>;
  unique: <T>() => Validator<T[]>;
  url: () => Validator<string>;
  uuid: (versions) => Validator<string>;
  uuidVersion: (number) => Validator<string>;
};
```

Convenience [runtime.Validator](runtime.md#validator-1) implementations for common validation patterns (e.g. `validators.range(1, 65535)`).

#### Type Declaration

##### after

```ts
after: (date) => Validator<Date>;
```

Passes when the date value is strictly after `date`.

Passes when the date value is strictly after `date`.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `date` | `Date` |

###### Returns

[`Validator`](runtime.md#validator-1)\<`Date`\>

##### all

```ts
all: <T>(...validators) => Validator<T>;
```

Passes only when every wrapped validator passes; returns the first failing message.

Passes only when every wrapped validator passes; returns the first failing message.

###### Type Parameters

| Type Parameter |
| ------ |
| `T` |

###### Parameters

| Parameter | Type |
| ------ | ------ |
| ...`validators` | [`Validator`](runtime.md#validator-1)\<`T`\>[] |

###### Returns

[`Validator`](runtime.md#validator-1)\<`T`\>

##### any

```ts
any: <T>(...validators) => Validator<T>;
```

Passes when at least one wrapped validator passes.

Passes when at least one wrapped validator passes.

###### Type Parameters

| Type Parameter |
| ------ |
| `T` |

###### Parameters

| Parameter | Type |
| ------ | ------ |
| ...`validators` | [`Validator`](runtime.md#validator-1)\<`T`\>[] |

###### Returns

[`Validator`](runtime.md#validator-1)\<`T`\>

##### before

```ts
before: (date) => Validator<Date>;
```

Passes when the date value is strictly before `date`.

Passes when the date value is strictly before `date`.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `date` | `Date` |

###### Returns

[`Validator`](runtime.md#validator-1)\<`Date`\>

##### custom

```ts
custom: <T>(validator) => Validator<T>;
```

Identity wrapper for a hand-written `Validator<T>` -- no behavior change, just a fluent entry point alongside the other helpers.

Identity wrapper for a hand-written `Validator<T>` -- no behavior change, just a fluent entry point alongside the other helpers.

###### Type Parameters

| Type Parameter |
| ------ |
| `T` |

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `validator` | [`Validator`](runtime.md#validator-1)\<`T`\> |

###### Returns

[`Validator`](runtime.md#validator-1)\<`T`\>

##### email

```ts
email: () => Validator<string>;
```

Passes for a plausibly-shaped email address (`local@domain`).

Passes for a plausibly-shaped email address (`local@domain`).

###### Returns

[`Validator`](runtime.md#validator-1)\<`string`\>

##### endsWith

```ts
endsWith: (suffix) => Validator<string>;
```

Passes when the string ends with `suffix`.

Passes when the string ends with `suffix`.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `suffix` | `string` |

###### Returns

[`Validator`](runtime.md#validator-1)\<`string`\>

##### enum

```ts
enum: <T>(allowed) => Validator<T> = oneOf;
```

Alias for `oneOf` -- passes when the value is one of the `allowed` values.

Passes when the value is one of the `allowed` values.

###### Type Parameters

| Type Parameter |
| ------ |
| `T` |

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `allowed` | readonly `T`[] |

###### Returns

[`Validator`](runtime.md#validator-1)\<`T`\>

##### finite

```ts
finite: () => Validator<number>;
```

Passes when the number is finite (rejects `Infinity`/`-Infinity`/`NaN`).

Passes when the number is finite (rejects `Infinity`/`-Infinity`/`NaN`).

###### Returns

[`Validator`](runtime.md#validator-1)\<`number`\>

##### future

```ts
future: () => Validator<Date>;
```

Passes when the date is strictly after the current time.

Passes when the date is strictly after the current time.

###### Returns

[`Validator`](runtime.md#validator-1)\<`Date`\>

##### includes

```ts
includes: (text) => Validator<string>;
```

Passes when the string contains `text` as a substring.

Passes when the string contains `text` as a substring.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |

###### Returns

[`Validator`](runtime.md#validator-1)\<`string`\>

##### integer

```ts
integer: () => Validator<number> = integerValidator;
```

Passes when the number is an integer.

Passes when the number is an integer.

###### Returns

[`Validator`](runtime.md#validator-1)\<`number`\>

##### length

```ts
length: (expected) => Validator<string>;
```

Passes when the string's length is exactly `expected`.

Passes when the string's length is exactly `expected`.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `expected` | `number` |

###### Returns

[`Validator`](runtime.md#validator-1)\<`string`\>

##### matches

```ts
matches: (pattern, message?) => Validator<string>;
```

Passes when the string matches `pattern`; `message` overrides the default failure text.

Passes when the string matches `pattern`; `message` overrides the default failure text.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `pattern` | `RegExp` |
| `message?` | `string` |

###### Returns

[`Validator`](runtime.md#validator-1)\<`string`\>

##### max

```ts
max: (maximum) => Validator<number>;
```

Passes when the number is less than or equal to `maximum`.

Passes when the number is less than or equal to `maximum`.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `maximum` | `number` |

###### Returns

[`Validator`](runtime.md#validator-1)\<`number`\>

##### maxItems

```ts
maxItems: <T>(maximum) => Validator<T[]>;
```

Passes when the array has at most `maximum` items.

Passes when the array has at most `maximum` items.

###### Type Parameters

| Type Parameter |
| ------ |
| `T` |

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `maximum` | `number` |

###### Returns

[`Validator`](runtime.md#validator-1)\<`T`[]\>

##### maxLength

```ts
maxLength: (length) => Validator<string>;
```

Passes when the string's length is at most `length`.

Passes when the string's length is at most `length`.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `length` | `number` |

###### Returns

[`Validator`](runtime.md#validator-1)\<`string`\>

##### min

```ts
min: (minimum) => Validator<number>;
```

Passes when the number is greater than or equal to `minimum`.

Passes when the number is greater than or equal to `minimum`.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `minimum` | `number` |

###### Returns

[`Validator`](runtime.md#validator-1)\<`number`\>

##### minItems

```ts
minItems: <T>(minimum) => Validator<T[]>;
```

Passes when the array has at least `minimum` items.

Passes when the array has at least `minimum` items.

###### Type Parameters

| Type Parameter |
| ------ |
| `T` |

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `minimum` | `number` |

###### Returns

[`Validator`](runtime.md#validator-1)\<`T`[]\>

##### minLength

```ts
minLength: (length) => Validator<string>;
```

Passes when the string's length is at least `length`.

Passes when the string's length is at least `length`.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `length` | `number` |

###### Returns

[`Validator`](runtime.md#validator-1)\<`string`\>

##### negative

```ts
negative: () => Validator<number>;
```

Passes when the number is strictly negative.

Passes when the number is strictly negative.

###### Returns

[`Validator`](runtime.md#validator-1)\<`number`\>

##### not

```ts
not: <T>(validator) => Validator<T>;
```

Inverts a validator: passes when the wrapped validator fails, and vice versa.

Inverts a validator: passes when the wrapped validator fails, and vice versa.

###### Type Parameters

| Type Parameter |
| ------ |
| `T` |

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `validator` | [`Validator`](runtime.md#validator-1)\<`T`\> |

###### Returns

[`Validator`](runtime.md#validator-1)\<`T`\>

##### oneOf

```ts
oneOf: <T>(allowed) => Validator<T>;
```

Passes when the value is one of the `allowed` values.

Passes when the value is one of the `allowed` values.

###### Type Parameters

| Type Parameter |
| ------ |
| `T` |

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `allowed` | readonly `T`[] |

###### Returns

[`Validator`](runtime.md#validator-1)\<`T`\>

##### optional

```ts
optional: <T>(validator) => Validator<T | undefined>;
```

Passes when the value is undefined, otherwise delegates to the provided validator.

Passes when the value is undefined, otherwise delegates to the provided validator.

###### Type Parameters

| Type Parameter |
| ------ |
| `T` |

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `validator` | [`Validator`](runtime.md#validator-1)\<`T`\> |

###### Returns

[`Validator`](runtime.md#validator-1)\<`T` \| `undefined`\>

##### past

```ts
past: () => Validator<Date>;
```

Passes when the date is strictly before the current time.

Passes when the date is strictly before the current time.

###### Returns

[`Validator`](runtime.md#validator-1)\<`Date`\>

##### positive

```ts
positive: () => Validator<number>;
```

Passes when the number is strictly positive.

Passes when the number is strictly positive.

###### Returns

[`Validator`](runtime.md#validator-1)\<`number`\>

##### range

```ts
range: (minimum, maximum) => Validator<number>;
```

Passes when the number is within `[minimum, maximum]` inclusive.

Passes when the number is within `[minimum, maximum]` inclusive.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `minimum` | `number` |
| `maximum` | `number` |

###### Returns

[`Validator`](runtime.md#validator-1)\<`number`\>

##### refine

```ts
refine: <T>(validator, message) => Validator<T>;
```

Runs the wrapped validator but replaces its failure message with `message`.

Runs the wrapped validator but replaces its failure message with `message`.

###### Type Parameters

| Type Parameter |
| ------ |
| `T` |

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `validator` | [`Validator`](runtime.md#validator-1)\<`T`\> |
| `message` | `string` |

###### Returns

[`Validator`](runtime.md#validator-1)\<`T`\>

##### regex

```ts
regex: (pattern, message?) => Validator<string> = matches;
```

Alias for `matches` -- passes when the string matches `pattern`.

Passes when the string matches `pattern`; `message` overrides the default failure text.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `pattern` | `RegExp` |
| `message?` | `string` |

###### Returns

[`Validator`](runtime.md#validator-1)\<`string`\>

##### required

```ts
required: (allowEmptyString) => Validator<unknown>;
```

Passes when the value is defined and, unless `allowEmptyString` is set, non-empty.

Passes when the value is defined and, unless `allowEmptyString` is set, non-empty.

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `allowEmptyString` | `boolean` | `false` |

###### Returns

[`Validator`](runtime.md#validator-1)\<`unknown`\>

##### safeInteger

```ts
safeInteger: () => Validator<number>;
```

Passes when the number is a safe integer (`Number.isSafeInteger`).

Passes when the number is a safe integer (`Number.isSafeInteger`).

###### Returns

[`Validator`](runtime.md#validator-1)\<`number`\>

##### unique

```ts
unique: <T>() => Validator<T[]>;
```

Passes when every item in the array is unique.

Passes when every item in the array is unique.

###### Type Parameters

| Type Parameter |
| ------ |
| `T` |

###### Returns

[`Validator`](runtime.md#validator-1)\<`T`[]\>

##### url

```ts
url: () => Validator<string> = urlValidator;
```

Passes when the string is a valid absolute URL.

Passes when the string is a valid absolute URL.

###### Returns

[`Validator`](runtime.md#validator-1)\<`string`\>

##### uuid

```ts
uuid: (versions) => Validator<string>;
```

Passes when the string is a valid UUID of one of the given `versions` (default: any of 1-8).

Passes when the string is a valid UUID of one of the given `versions` (default: any of 1-8).

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `versions` | readonly `number`[] |

###### Returns

[`Validator`](runtime.md#validator-1)\<`string`\>

##### uuidVersion

```ts
uuidVersion: (number) => Validator<string>;
```

Shorthand for `uuid([version])` -- passes only for that exact UUID version.

Shorthand for `uuid([version])` -- passes only for that exact UUID version.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `number` | `number` |

###### Returns

[`Validator`](runtime.md#validator-1)\<`string`\>
