// env-cap runtime benchmark suite. How to read and write one: ../READING-BENCHMARKS.md and
// ../WRITING-BENCHMARKS.md. `defineSuite` refuses undocumented entries.
//
// Imports env-cap by its PACKAGE NAME (resolved through this directory's node_modules after a real
// `npm install`), never a monorepo-relative path: the published `exports` map is part of the cost.

import { execFileSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineSuite, timed } from "internal-package-contract/benchmark"
import { createEnv, resetEnvCache, validateEnv } from "@maverickcer/env-cap"
import { processors, validators } from "@maverickcer/env-cap/helpers"
import { generateRuntimeFixtures } from "../benchmark-fixtures/generator.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const coldStartChild = path.join(here, "scripts", "cold-start-child.mjs")
const fixturesRoot = path.join(here, "fixtures", "generated")

const identitySchema = (n) =>
  Object.fromEntries(
    Array.from({ length: n }, (_, i) => [
      `ENV_VARIABLE_${String(i)}`,
      { processor: (value) => value },
    ]),
  )
const valuesFor = (n) =>
  Object.fromEntries(
    Array.from({ length: n }, (_, i) => [`ENV_VARIABLE_${String(i)}`, `value-${String(i)}`]),
  )
let contractCounter = 0
const buildContract = (n) =>
  createEnv(identitySchema(n), {
    name: `bench-${String(contractCounter++)}`,
    source: import.meta.url,
  })

const VARIABLES = {
  name: "variables",
  how: "swept",
  description: "The tier axis: how many environment variables are declared and validated.",
}
const RUNTIME = {
  name: "runtime",
  how: "fixed",
  value: "Node (V8)",
  description: "Measured on Node only; Bun, Deno and edge runtimes are not covered.",
}
const VARIABLE_SHAPE = {
  name: "variable declaration",
  how: "fixed",
  value: "identity processor, no validator",
  description:
    "Variables use the cheapest possible processor so the measurement is env-cap's own machinery; processor and validator cost is measured per helper below.",
}
const VALUE_SOURCE = {
  name: "value source",
  how: "fixed",
  value: "an in-memory object of short strings",
  description:
    "Real environments read process.env, which behaves like an object of strings; reading it is not env-cap's cost.",
}

/**
 * One documented benchmark for a processor or validator. `build(n)` returns `[fn, value]`: the
 * ready-made helper and the input handed to it, sized by `n` where the helper's cost can depend on it.
 */
function helper(kind, spec) {
  const call = kind === "processor" ? "processors" : "validators"
  const growth =
    spec.expected === "constant" ? "does not depend on the size of its input" : spec.growth
  return {
    id: `${kind}-${spec.slug}`,
    name: `${call}.${spec.name}`,
    why: `${spec.use} It runs once for every variable that declares it, at startup, on every process and every deploy, so its per-value cost is multiplied by the number of variables using it.`,
    poorPerformanceMeans: `Startup and cold-start time grow with every variable that uses ${call}.${spec.name}${spec.expected === "constant" ? "" : ", and with the size of the values it handles (a large secret, certificate or list)"}. On serverless platforms that delay is billed on every scale-from-zero event, and a regression here is paid by every service that adopts the helper.`,
    expectedComplexity: spec.expected,
    complexityReason: spec.reason,
    variables: [
      { name: "input size", how: "swept", description: spec.sizeMeans },
      {
        name: "input content",
        how: "fixed",
        value: spec.content,
        description:
          "A valid value of the expected kind; the failure path (an invalid value) is cheaper because it exits early and is not what startup normally does.",
      },
      {
        name: "composition",
        how: "fixed",
        value: "used alone",
        description:
          "Wrapping in `all`, `any`, `optional` or `not` adds a constant per wrapper and is measured in the combinator entries.",
      },
      RUNTIME,
    ],
    notCovered: [
      {
        name: "locale and timezone",
        reason:
          "The helper's cost does not depend on the process locale or timezone for the inputs measured.",
      },
    ],
    setup: (n) => spec.build(n),
    run: ([fn, value]) => (kind === "processor" ? fn(value) : fn(value, {})),
    _growth: growth,
  }
}

const TEXT = (n) => "a".repeat(n)
const PROCESSORS = [
  {
    slug: "base64",
    name: "base64()",
    use: "Decodes a base64-encoded secret or certificate into its original text.",
    expected: "linear",
    growth: "linear",
    reason:
      "Decoding reads each encoded character once and writes the decoded bytes, so the work is proportional to the length of the encoded value.",
    sizeMeans: "Length of the base64 text, in characters.",
    content: "a valid base64 string",
    build: (n) => [processors.base64(), Buffer.from("x".repeat(n)).toString("base64")],
  },
  {
    slug: "parse-json",
    name: "parseJSON()",
    use: "Parses a JSON-valued variable (a feature-flag map, a credential blob) into an object.",
    expected: "linear",
    reason:
      "JSON parsing visits every character and builds one node per key and value, so cost is proportional to the size of the document.",
    sizeMeans: "Number of keys in the JSON object.",
    content: "a flat JSON object of short strings",
    build: (n) => [
      processors.parseJSON(),
      JSON.stringify(
        Object.fromEntries(
          Array.from({ length: n }, (_, i) => [`key${String(i)}`, `value${String(i)}`]),
        ),
      ),
    ],
  },
  {
    slug: "split",
    name: 'split(",")',
    use: "Splits a delimited variable (a host list) into an array of strings.",
    expected: "linear",
    reason:
      "Splitting scans the string once and allocates one substring per field, so cost follows the length of the text.",
    sizeMeans: "Number of comma-separated fields.",
    content: "short fields separated by commas",
    build: (n) => [processors.split(","), Array.from({ length: n }, () => "a").join(",")],
  },
  {
    slug: "to-array",
    name: 'toArray(",", [trim()])',
    use: "Splits a delimited variable and post-processes every element (here, trimming).",
    expected: "linear",
    reason:
      "It splits once and then applies the element processor to each field, so cost is proportional to the number of elements.",
    sizeMeans: "Number of comma-separated elements.",
    content: "short, space-padded fields",
    build: (n) => [
      processors.toArray(",", [processors.trim()]),
      Array.from({ length: n }, () => " a ").join(","),
    ],
  },
  {
    slug: "to-big-int",
    name: "toBigInt()",
    use: "Parses a very large integer (a numeric identifier, a counter) without losing precision.",
    expected: "linear",
    reason:
      "Parsing reads each decimal digit once to build the integer, so cost follows the number of digits.",
    sizeMeans: "Number of decimal digits.",
    content: "a string of the digit 1",
    build: (n) => [processors.toBigInt(), "1".repeat(n)],
  },
  {
    slug: "to-boolean",
    name: "toBoolean()",
    use: 'Interprets a flag variable ("true", "1", "yes") as a boolean.',
    expected: "constant",
    reason:
      "It compares the value against a short fixed list of accepted spellings, independent of anything else.",
    sizeMeans:
      'Varied only to show the helper ignores it; the input is always the short flag "true".',
    content: 'the string "true"',
    build: () => [processors.toBoolean(), "true"],
  },
  {
    slug: "to-date",
    name: "toDate()",
    use: "Parses a date variable (a license expiry) into a Date.",
    expected: "constant",
    reason:
      "A date string has a fixed maximum length and the parser does a fixed amount of work for it.",
    sizeMeans: "Varied only to show the helper ignores it; the input is always one ISO date.",
    content: "an ISO 8601 timestamp",
    build: () => [processors.toDate(), "2024-01-01T00:00:00Z"],
  },
  {
    slug: "to-integer",
    name: "toInteger()",
    use: "Parses a whole-number variable (a port, a pool size).",
    expected: "constant",
    reason:
      "Port-sized numbers have a fixed small length, so parsing and validating one is a fixed amount of work.",
    sizeMeans: "Varied only to show the helper ignores it; the input is always a short integer.",
    content: 'the string "17"',
    build: () => [processors.toInteger(), "17"],
  },
  {
    slug: "to-lower-case",
    name: "toLowerCase()",
    use: "Normalizes a variable (an environment name, a hostname) to lower case.",
    expected: "linear",
    reason: "Case conversion visits every character once.",
    sizeMeans: "Length of the string, in characters.",
    content: "mixed-case ASCII",
    build: (n) => [processors.toLowerCase(), "MiXeD".repeat(Math.ceil(n / 5)).slice(0, n)],
  },
  {
    slug: "to-number",
    name: "toNumber()",
    use: "Parses a numeric variable (a timeout, a ratio).",
    expected: "constant",
    reason: "A number literal has a fixed small length and is parsed in one pass.",
    sizeMeans: "Varied only to show the helper ignores it; the input is always a short number.",
    content: 'the string "42"',
    build: () => [processors.toNumber(), "42"],
  },
  {
    slug: "to-reg-exp",
    name: "toRegExp()",
    use: "Compiles a pattern variable (an allow-list) into a RegExp.",
    expected: "linear",
    reason: "Compiling a pattern parses it once, so cost follows the length of the pattern.",
    sizeMeans: "Length of the pattern, in characters.",
    content: "an anchored run of the letter a",
    build: (n) => [processors.toRegExp(), `^${TEXT(n)}$`],
  },
  {
    slug: "to-string",
    name: "toString()",
    use: "Coerces a value to a string (the explicit no-op for variables that are already text).",
    expected: "constant",
    reason: "Converting a small number to its string form is a fixed amount of work.",
    sizeMeans: "Varied only to show the helper ignores it; the input is always the number 42.",
    content: "the number 42",
    build: () => [processors.toString(), 42],
  },
  {
    slug: "to-url",
    name: "toURL()",
    use: "Parses an endpoint variable (an API base URL) into a URL object.",
    expected: "linear",
    reason:
      "URL parsing scans the string once to split it into components, so cost follows its length.",
    sizeMeans: "Length of the URL path, in characters.",
    content: "an https URL with a long path",
    build: (n) => [processors.toURL(), `https://example.com/${TEXT(n)}`],
  },
  {
    slug: "to-upper-case",
    name: "toUpperCase()",
    use: "Normalizes a variable to upper case.",
    expected: "linear",
    reason: "Case conversion visits every character once.",
    sizeMeans: "Length of the string, in characters.",
    content: "mixed-case ASCII",
    build: (n) => [processors.toUpperCase(), "MiXeD".repeat(Math.ceil(n / 5)).slice(0, n)],
  },
  {
    slug: "trim",
    name: "trim()",
    use: "Strips accidental whitespace around a value copied from a dashboard or a file.",
    expected: "linear",
    reason:
      "Trimming scans in from both ends and copies the remaining text, so cost follows the length of the string.",
    sizeMeans: "Number of padding characters on each side.",
    content: "a short word padded with spaces",
    build: (n) => [processors.trim(), `${" ".repeat(n)}padded${" ".repeat(n)}`],
  },
]

const DATE_PAST = new Date(2000, 0, 1)
const DATE_FUTURE = new Date(2999, 0, 1)
const NOW_MIDDLE = new Date(2025, 0, 1)
const VALIDATORS = [
  {
    slug: "after",
    name: "after(date)",
    use: "Requires a date to be later than a fixed instant (a license start).",
    expected: "constant",
    reason: "It compares two timestamps.",
    sizeMeans: "Varied only to show the helper ignores it; the input is always one date.",
    content: "a date after the threshold",
    build: () => [validators.after(new Date(2020, 0, 1)), NOW_MIDDLE],
  },
  {
    slug: "all",
    name: "all(...validators)",
    use: "Combines several validators that must all pass (a number that must be positive and below a cap).",
    expected: "linear",
    reason:
      "It runs each inner validator in turn until one fails, so with every inner validator passing, cost is proportional to how many were combined.",
    sizeMeans: "Number of inner validators combined.",
    content: "an in-range number that every inner validator accepts",
    build: (n) => [validators.all(...Array.from({ length: n }, () => validators.min(0))), 50],
  },
  {
    slug: "any",
    name: "any(...validators)",
    use: "Combines alternatives where one passing is enough (an IPv4 or IPv6 address).",
    expected: "linear",
    reason:
      "It tries each inner validator until one passes; with the passing one last, cost is proportional to how many were combined.",
    sizeMeans: "Number of alternatives, the last of which is the one that passes.",
    content: "a value only the final alternative accepts",
    build: (n) => [
      validators.any(...Array.from({ length: n - 1 }, () => validators.max(-1)), validators.min(0)),
      50,
    ],
  },
  {
    slug: "before",
    name: "before(date)",
    use: "Requires a date to be earlier than a fixed instant (a migration cut-off).",
    expected: "constant",
    reason: "It compares two timestamps.",
    sizeMeans: "Varied only to show the helper ignores it; the input is always one date.",
    content: "a date before the threshold",
    build: () => [validators.before(new Date(2030, 0, 1)), NOW_MIDDLE],
  },
  {
    slug: "custom",
    name: "custom(fn)",
    use: "Wraps an application-supplied check as a validator.",
    expected: "constant",
    reason:
      "It forwards to the supplied function; the wrapper itself adds a fixed cost (the supplied function's own cost belongs to the application).",
    sizeMeans:
      "Varied only to show the wrapper ignores it; the supplied check is a single comparison.",
    content: "a positive number",
    build: () => [validators.custom((v) => v > 0 || "must be positive"), 5],
  },
  {
    slug: "email",
    name: "email()",
    use: "Checks that a contact variable looks like an email address.",
    expected: "linear",
    reason:
      "Matching scans the local part and domain once with a bounded pattern, so cost follows the length of the address.",
    sizeMeans: "Length of the part before the @, in characters.",
    content: "a long local part at example.com",
    build: (n) => [validators.email(), `${TEXT(n)}@example.com`],
  },
  {
    slug: "ends-with",
    name: "endsWith(suffix)",
    use: "Requires a value to end with a fixed suffix (a required domain).",
    expected: "constant",
    reason:
      "Checking a suffix compares only the last few characters, regardless of how long the string is.",
    sizeMeans: "Length of the string; the comparison only touches the suffix.",
    content: "a long string ending in .com",
    build: (n) => [validators.endsWith(".com"), `${TEXT(n)}.com`],
  },
  {
    slug: "finite",
    name: "finite()",
    use: "Rejects NaN and infinity in a numeric variable.",
    expected: "constant",
    reason: "It checks one number.",
    sizeMeans: "Varied only to show the helper ignores it; the input is always one number.",
    content: "a finite decimal",
    build: () => [validators.finite(), 3.14],
  },
  {
    slug: "future",
    name: "future()",
    use: "Requires a date to still lie ahead (a certificate that must not already have expired).",
    expected: "constant",
    reason: "It compares one timestamp with the current time.",
    sizeMeans: "Varied only to show the helper ignores it; the input is always one date.",
    content: "a date far in the future",
    build: () => [validators.future(), DATE_FUTURE],
  },
  {
    slug: "includes",
    name: "includes(text)",
    use: "Requires a value to contain a fixed substring.",
    expected: "linear",
    reason: "A substring search scans the string, so cost follows its length.",
    sizeMeans: "Length of the string, in characters.",
    content:
      "a long string made of near-misses of the substring (\"exampl\" repeated) with the real match at the end, so the search cannot skip ahead",
    build: (n) => [validators.includes("example"), `${"exampl".repeat(Math.ceil(n / 6))}example`],
  },
  {
    slug: "integer",
    name: "integer()",
    use: "Requires a number to be a whole number.",
    expected: "constant",
    reason: "It checks one number.",
    sizeMeans: "Varied only to show the helper ignores it; the input is always one number.",
    content: "the number 42",
    build: () => [validators.integer(), 42],
  },
  {
    slug: "length",
    name: "length(n)",
    use: "Requires a string to have an exact length (a fixed-width token).",
    expected: "constant",
    reason: "A string's length is stored, so reading it costs the same for any string.",
    sizeMeans:
      "Varied only to show the helper ignores it; the input is always a five-character string.",
    content: "a five-character string",
    build: () => [validators.length(5), "hello"],
  },
  {
    slug: "matches",
    name: "matches(regex)",
    use: "Requires a value to match a pattern (a naming convention).",
    expected: "linear",
    reason:
      "A simple anchored character-class pattern examines each character once, so cost follows the length of the input.",
    sizeMeans: "Length of the string, in characters.",
    content: "a long run of lower-case letters",
    build: (n) => [validators.matches(/^[a-z]+$/), TEXT(n)],
  },
  {
    slug: "max",
    name: "max(limit)",
    use: "Caps a number (a pool size).",
    expected: "constant",
    reason: "It compares two numbers.",
    sizeMeans: "Varied only to show the helper ignores it; the input is always one number.",
    content: "a number under the cap",
    build: () => [validators.max(1000), 500],
  },
  {
    slug: "max-items",
    name: "maxItems(limit)",
    use: "Caps the length of a list variable.",
    expected: "constant",
    reason: "An array's length is stored, so checking it costs the same for any array.",
    sizeMeans: "Length of the array; the check only reads the stored length.",
    content: "a short array",
    build: (n) => [validators.maxItems(n + 1), Array.from({ length: n }, (_, i) => i)],
  },
  {
    slug: "max-length",
    name: "maxLength(limit)",
    use: "Caps the length of a string.",
    expected: "constant",
    reason: "A string's length is stored, so checking it costs the same for any string.",
    sizeMeans: "Length of the string; the check only reads the stored length.",
    content: "a string within the cap",
    build: (n) => [validators.maxLength(n + 1), TEXT(n)],
  },
  {
    slug: "min",
    name: "min(limit)",
    use: "Sets a floor for a number.",
    expected: "constant",
    reason: "It compares two numbers.",
    sizeMeans: "Varied only to show the helper ignores it; the input is always one number.",
    content: "a number above the floor",
    build: () => [validators.min(0), 10],
  },
  {
    slug: "min-items",
    name: "minItems(limit)",
    use: "Requires a list variable to have at least some entries.",
    expected: "constant",
    reason: "An array's length is stored, so checking it costs the same for any array.",
    sizeMeans: "Length of the array; the check only reads the stored length.",
    content: "an array above the floor",
    build: (n) => [validators.minItems(1), Array.from({ length: n + 1 }, (_, i) => i)],
  },
  {
    slug: "min-length",
    name: "minLength(limit)",
    use: "Requires a string to be at least some length (a minimum secret length).",
    expected: "constant",
    reason: "A string's length is stored, so checking it costs the same for any string.",
    sizeMeans: "Length of the string; the check only reads the stored length.",
    content: "a string above the floor",
    build: (n) => [validators.minLength(2), TEXT(n + 2)],
  },
  {
    slug: "negative",
    name: "negative()",
    use: "Requires a number to be below zero.",
    expected: "constant",
    reason: "It compares one number with zero.",
    sizeMeans: "Varied only to show the helper ignores it; the input is always one number.",
    content: "a negative number",
    build: () => [validators.negative(), -5],
  },
  {
    slug: "not",
    name: "not(validator)",
    use: "Inverts another validator (forbid a reserved value).",
    expected: "constant",
    reason: "It runs the one inner validator and flips its result.",
    sizeMeans:
      "Varied only to show the wrapper ignores it; the inner check is a single comparison.",
    content: "a value the inner validator rejects",
    build: () => [validators.not(validators.min(100)), 50],
  },
  {
    slug: "one-of",
    name: "oneOf(options)",
    use: "Restricts a variable to a fixed set of allowed values (an environment name).",
    expected: "linear",
    reason:
      "It searches the allowed values for a match, so with the matching option last, cost is proportional to how many options there are.",
    sizeMeans: "Number of allowed options; the input matches the last one.",
    content: "the final option of the list",
    build: (n) => [
      validators.oneOf(Array.from({ length: n }, (_, i) => `option-${String(i)}`)),
      `option-${String(n - 1)}`,
    ],
  },
  {
    slug: "optional",
    name: "optional(validator)",
    use: "Allows a variable to be absent while still validating it when present.",
    expected: "constant",
    reason: "It checks for absence and otherwise forwards to the one inner validator.",
    sizeMeans:
      "Varied only to show the wrapper ignores it; the inner check is a single comparison.",
    content: "a present value the inner validator accepts",
    build: () => [validators.optional(validators.min(0)), 50],
  },
  {
    slug: "past",
    name: "past()",
    use: "Requires a date to already have happened.",
    expected: "constant",
    reason: "It compares one timestamp with the current time.",
    sizeMeans: "Varied only to show the helper ignores it; the input is always one date.",
    content: "a date in the past",
    build: () => [validators.past(), DATE_PAST],
  },
  {
    slug: "positive",
    name: "positive()",
    use: "Requires a number to be above zero.",
    expected: "constant",
    reason: "It compares one number with zero.",
    sizeMeans: "Varied only to show the helper ignores it; the input is always one number.",
    content: "a positive number",
    build: () => [validators.positive(), 5],
  },
  {
    slug: "range",
    name: "range(min, max)",
    use: "Requires a number to fall between two bounds (a port range).",
    expected: "constant",
    reason: "It compares one number with two bounds.",
    sizeMeans: "Varied only to show the helper ignores it; the input is always one number.",
    content: "a number inside the range",
    build: () => [validators.range(1, 100), 50],
  },
  {
    slug: "refine",
    name: "refine(validator, message)",
    use: "Attaches a custom failure message to another validator.",
    expected: "constant",
    reason: "It runs the one inner validator and substitutes the message on failure.",
    sizeMeans:
      "Varied only to show the wrapper ignores it; the inner check is a single comparison.",
    content: "a value the inner validator accepts",
    build: () => [validators.refine(validators.min(0), "must be >= 0"), 50],
  },
  {
    slug: "required",
    name: "required()",
    use: "Requires a variable to be present and non-empty.",
    expected: "constant",
    reason: "It checks one value for presence.",
    sizeMeans: "Varied only to show the helper ignores it; the input is always a short value.",
    content: "a non-empty string",
    build: () => [validators.required(), "value"],
  },
  {
    slug: "safe-integer",
    name: "safeInteger()",
    use: "Requires an integer that a double can represent exactly.",
    expected: "constant",
    reason: "It checks one number against fixed bounds.",
    sizeMeans: "Varied only to show the helper ignores it; the input is always one number.",
    content: "a small integer",
    build: () => [validators.safeInteger(), 100],
  },
  {
    slug: "unique",
    name: "unique()",
    use: "Requires every entry of a list variable to be distinct (no duplicate hosts).",
    expected: "linear",
    reason:
      "It adds each entry to a set and compares the set's size with the list's, so cost is proportional to the number of entries.",
    sizeMeans: "Number of entries in the list.",
    content: "a list of distinct integers",
    build: (n) => [validators.unique(), Array.from({ length: n }, (_, i) => i)],
  },
  {
    slug: "url",
    name: "url()",
    use: "Checks that an endpoint variable is a well-formed URL.",
    expected: "linear",
    reason: "URL parsing scans the string once, so cost follows its length.",
    sizeMeans: "Length of the URL path, in characters.",
    content: "an https URL with a long path",
    build: (n) => [validators.url(), `https://example.com/${TEXT(n)}`],
  },
  {
    slug: "uuid",
    name: "uuid()",
    use: "Checks that an identifier variable is a UUID.",
    expected: "constant",
    reason: "A UUID has a fixed length and a fixed pattern.",
    sizeMeans: "Varied only to show the helper ignores it; the input is always one UUID.",
    content: "a version-4 UUID",
    build: () => [validators.uuid(), "123e4567-e89b-42d3-a456-426614174000"],
  },
  {
    slug: "uuid-version",
    name: "uuidVersion(v)",
    use: "Checks that an identifier is a UUID of a specific version.",
    expected: "constant",
    reason: "A UUID has a fixed length and a fixed pattern.",
    sizeMeans: "Varied only to show the helper ignores it; the input is always one UUID.",
    content: "a version-4 UUID",
    build: () => [validators.uuidVersion(4), "123e4567-e89b-42d3-a456-426614174000"],
  },
]

export default defineSuite({
  package: {
    name: "env-cap",
    bundleFiles: ["dist/index.js", "dist/helpers.js"],
  },

  workload: {
    unit: "variable",
    description:
      "One environment variable declared in a contract and validated at startup. 640 is a large but realistic service: a few dozen contracts of around ten variables each.",
    typicalN: 640,
  },

  endToEnd: {
    purpose:
      "Shows what a service pays at startup, per validation, for declaring its environment through env-cap instead of reading values by hand. Both sides handle the same n values from an in-memory source and finish knowing every value is present and usable; the only difference is env-cap's contract machinery (schema walk, processor and validator dispatch, error collection). This is the floor: real variables add their own processors and validators on top (measured per helper below), and real startup is dominated by the platform, not by this.",
    baseline: {
      description:
        "A loop reads each of n values from a plain object and stores it in a result object -- no env-cap.",
      setup: (n) => ({ values: valuesFor(n), keys: Object.keys(valuesFor(n)) }),
      run: ({ values, keys }) => {
        const result = {}
        for (const key of keys) result[key] = values[key]
        return Object.keys(result).length
      },
    },
    withPackage: {
      description:
        "`validateEnv` checks the same n values against a contract of n variables with identity processors.",
      // `validateEnv` is idempotent for the life of the process (a second call returns the cached
      // outcome), so every sample starts from a freshly reset cache -- otherwise only the first
      // sample would do any work.
      fresh: true,
      setup: (n) => {
        resetEnvCache()
        return { values: valuesFor(n), contract: buildContract(n) }
      },
      run: ({ values, contract }) => validateEnv({ values, manifest: [contract] }),
    },
    variables: [
      VARIABLES,
      VARIABLE_SHAPE,
      VALUE_SOURCE,
      RUNTIME,
      {
        name: "contract count",
        how: "fixed",
        value: 1,
        description:
          "All variables live in one contract; splitting them across contracts adds a small constant per contract.",
      },
      {
        name: "validity",
        how: "fixed",
        value: "every value valid",
        description:
          "The success path; failures add error-object construction and are cheaper to reach but costlier to report.",
      },
    ],
  },

  functions: [
    {
      id: "cold-start",
      name: "process start with n variables declared (cold start)",
      why: "Every process that imports its environment contracts pays this before serving its first request: each deploy, each serverless cold start, each CLI run and each test worker. It is where env-cap's cost is most visible to an operator.",
      poorPerformanceMeans:
        "Slower deploys and a longer first request on every new instance; on serverless platforms the delay is billed on every scale-from-zero. A super-linear regression would make large configurations noticeably slow to boot.",
      expectedComplexity: "linear",
      complexityReason:
        "Importing the contracts evaluates one `createEnv` per contract, and `validateEnv` then walks every variable once, so after Node's own start-up floor the time grows in proportion to the number of variables.",
      variables: [
        VARIABLES,
        {
          name: "process start-up floor",
          how: "fixed",
          value: "one fresh Node process per sample",
          description: "Node's own start-up time is included and sets the flat floor of the curve.",
        },
        {
          name: "variables per contract",
          how: "fixed",
          value: 10,
          description:
            "Contracts of ten variables, so the contract count grows with n; a few large contracts versus many small ones is not swept.",
        },
        VARIABLE_SHAPE,
        RUNTIME,
      ],
      notCovered: [
        { name: "warm module cache", reason: "A fresh process has no warm cache by definition." },
        {
          name: "bundled loading",
          reason:
            "Measured through Node's native ESM loader; bundlers change module-evaluation cost and are application-specific.",
        },
      ],
      sampling: { warmupIterations: 0, minIterations: 3, maxIterations: 7, targetDurationMs: 1500 },
      setup: async (n) => {
        const outputDir = path.join(fixturesRoot, `n${String(n)}`)
        const generated = await generateRuntimeFixtures({ outputDir, variables: n })
        return generated.indexPath
      },
      run: (indexPath) => {
        const start = performance.now()
        execFileSync(process.execPath, ["--expose-gc", coldStartChild, indexPath], {
          encoding: "utf8",
          cwd: here,
        })
        return timed(performance.now() - start)
      },
    },
    {
      id: "create-env",
      name: "createEnv (declare a contract)",
      why: "Runs once per contract when its module is imported, so it is the per-contract part of cold start and the cost of every contract an application declares.",
      poorPerformanceMeans:
        "Slower boot in proportion to the size of the configuration; for an application with hundreds of variables the cost lands on every process start.",
      expectedComplexity: "linear",
      complexityReason:
        "It walks the schema once to freeze and register each variable definition, so cost is proportional to the number of variables.",
      variables: [
        VARIABLES,
        VARIABLE_SHAPE,
        {
          name: "contract naming",
          how: "fixed",
          value: "unique name per call",
          description:
            "Each call registers a new contract name; reusing a name takes a different (error) path.",
        },
        RUNTIME,
      ],
      setup: (n) => identitySchema(n),
      run: (schema) =>
        createEnv(schema, { name: `bench-${String(contractCounter++)}`, source: import.meta.url }),
    },
    {
      id: "validate-env",
      name: "validateEnv (validate n values)",
      why: "The startup check itself: every variable's value is processed and validated, once per process. It is the dominant steady-state cost env-cap adds.",
      poorPerformanceMeans:
        "Every process start pays the slowdown, and so does every test run that validates configuration; a quadratic regression would make large configurations unusable.",
      expectedComplexity: "linear",
      complexityReason:
        "It visits each declared variable once, runs its processor and validator and records the outcome, so cost is proportional to the number of variables.",
      variables: [
        VARIABLES,
        VARIABLE_SHAPE,
        VALUE_SOURCE,
        {
          name: "validation cache",
          how: "fixed",
          value: "reset before every sample",
          description:
            "`validateEnv` is idempotent for the life of a process, so a repeat call is a free cache hit; each sample starts from an empty cache to measure the real validation.",
        },
        {
          name: "validity",
          how: "fixed",
          value: "every value valid",
          description: "The success path.",
        },
        RUNTIME,
      ],
      inEndToEnd: { callsPerOperation: 1, description: "This is the end-to-end operation itself." },
      fresh: true,
      setup: (n) => {
        resetEnvCache()
        return { values: valuesFor(n), contract: buildContract(n) }
      },
      run: ({ values, contract }) => validateEnv({ values, manifest: [contract] }),
    },
    ...PROCESSORS.map((spec) => {
      const { _growth, ...entry } = helper("processor", spec)
      return entry
    }),
    ...VALIDATORS.map((spec) => {
      const { _growth, ...entry } = helper("validator", spec)
      return entry
    }),
  ],
})
