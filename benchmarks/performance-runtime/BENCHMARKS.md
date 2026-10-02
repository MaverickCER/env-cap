# env-cap: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 variables** per operation, routing the work through `env-cap` adds **187 µs** per operation compared with a bare-minimum baseline (250%), about **$0.00039 – $0.0082 per million operations** of compute. Overall, it grows O(n) with workload size (measured exponent 0.73).

> Dollar figures are **estimates** from published list prices (see _Cost model_ below) and are for comparing orders of magnitude, not for budgeting to the cent.

| Cost | Typical (640 variables) | Largest (10240 variables) |
| --- | --- | --- |
| Added latency per operation | 187 µs | 545 µs |
| Added latency, relative to baseline | 250% | 39% |
| Added CPU time per operation | 726 µs | 1.00 µs |
| Added memory per operation (heap delta) | 330.4 KiB | 359.2 KiB |
| Estimated compute cost per 1M operations | $0.00039 – $0.0082 | $0.000011 – $0.0011 |
| Single-core throughput ceiling of the overhead alone | 5,346 ops/s | 1,833 ops/s |
| Shipped code parsed at every cold start (gzip) | 5.6 KiB | 5.6 KiB |

## 1. End-to-end: the package's total impact

Shows what a service pays at startup, per validation, for declaring its environment through env-cap instead of reading values by hand. Both sides handle the same n values from an in-memory source and finish knowing every value is present and usable; the only difference is env-cap's contract machinery (schema walk, processor and validator dispatch, error collection). This is the floor: real variables add their own processors and validators on top (measured per helper below), and real startup is dominated by the platform, not by this.

- **Baseline (no package):** A loop reads each of n values from a plain object and stores it in a result object -- no env-cap.
- **With the package:** `validateEnv` checks the same n values against a contract of n variables with identity processors.

Both sides use empty or minimal functions on purpose, so the difference is the package's own cost -- not the cost of the work an application would plug into it. Real applications add their own work on top; this is the floor the package imposes.

**Variables that could change this result**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| variables | swept | The tier axis: how many environment variables are declared and validated. |
| variable declaration | fixed at "identity processor, no validator" | Variables use the cheapest possible processor so the measurement is env-cap's own machinery; processor and validator cost is measured per helper below. |
| value source | fixed at "an in-memory object of short strings" | Real environments read process.env, which behaves like an object of strings; reading it is not env-cap's cost. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |
| contract count | fixed at 1 | All variables live in one contract; splitting them across contracts adds a small constant per contract. |
| validity | fixed at "every value valid" | The success path; failures add error-object construction and are cheaper to reach but costlier to report. |

The baseline is an empty or minimal function, so it costs almost nothing and the _relative_ overhead can look enormous (shown as a multiple of the baseline). Read the absolute columns -- time, CPU and dollars added -- they are what a bill and a latency budget are made of.

| variables | Baseline | With package | Added | Added vs baseline | Added CPU | Est. $ / 1M ops |
| --- | --- | --- | --- | --- | --- | --- |
| 20 | 0.789 µs | 19.8 µs | 19.0 µs | 25× baseline | 22.1 µs | $0.00004 – $0.00025 |
| 40 | 1.64 µs | 25.9 µs | 24.3 µs | 16× baseline | 23.7 µs | $0.000051 – $0.00027 |
| 80 | 3.34 µs | 38.8 µs | 35.4 µs | 12× baseline | 30.2 µs | $0.000074 – $0.00034 |
| 160 | 7.58 µs | 67.0 µs | 59.4 µs | 784% | 46.4 µs | $0.00012 – $0.00052 |
| 320 | 23.1 µs | 132 µs | 109 µs | 470% | 73.8 µs | $0.00023 – $0.00083 |
| 640 | 74.8 µs | 262 µs | 187 µs | 250% | 726 µs | $0.00039 – $0.0082 |
| 1280 | 85.0 µs | 264 µs | 179 µs | 210% | 712 µs | $0.00037 – $0.008 |
| 2560 | 255 µs | 452 µs | 197 µs | 77% | 643 µs | $0.00041 – $0.0072 |
| 5120 | 623 µs | 965 µs | 342 µs | 55% | 836 µs | $0.00071 – $0.0094 |
| 10240 | 1.38 ms | 1.93 ms | 545 µs | 39% | 1.00 µs | $0.000011 – $0.0011 |

**How the total grows:** O(n) (linear), exponent 0.73 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- |
| `process start with n variables declared (cold start)` | O(n) | O(log n) | 🟡 close (neighbouring class) | 45.2 ms | 232 ms |
| `createEnv (declare a contract)` | O(n) | O(n log n) | 🟡 close (neighbouring class) | 185 µs | 4.32 ms |
| `validateEnv (validate n values)` | O(n) | O(n) | ✅ matches | 281 µs | 2.07 ms |
| `processors.base64()` | O(n) | O(log n) | 🟡 close (neighbouring class) | 0.468 µs | 1.34 µs |
| `processors.parseJSON()` | O(n) | O(n log n) | 🟡 close (neighbouring class) | 80.1 µs | 1.65 ms |
| `processors.split(",")` | O(n) | O(n) | ✅ matches | 12.2 µs | 202 µs |
| `processors.toArray(",", [trim()])` | O(n) | O(n) | ✅ matches | 60.2 µs | 693 µs |
| `processors.toBigInt()` | O(n) | O(n log n) | 🟡 close (neighbouring class) | 1.86 µs | 146 µs |
| `processors.toBoolean()` | O(1) | O(1) | ✅ matches | 0.102 µs | 0.102 µs |
| `processors.toDate()` | O(1) | O(1) | ✅ matches | 0.319 µs | 0.312 µs |
| `processors.toInteger()` | O(1) | O(1) | ✅ matches | 0.0869 µs | 0.0827 µs |
| `processors.toLowerCase()` | O(n) | O(log n) | 🟡 close (neighbouring class) | 0.177 µs | 1.20 µs |
| `processors.toNumber()` | O(1) | O(1) | ✅ matches | 0.0817 µs | 0.0818 µs |
| `processors.toRegExp()` | O(n) | O(log n) | 🟡 close (neighbouring class) | 0.998 µs | 8.50 µs |
| `processors.toString()` | O(1) | O(1) | ✅ matches | 0.0862 µs | 0.0813 µs |
| `processors.toURL()` | O(n) | O(log n) | 🟡 close (neighbouring class) | 0.794 µs | 4.26 µs |
| `processors.toUpperCase()` | O(n) | O(log n) | 🟡 close (neighbouring class) | 0.182 µs | 1.38 µs |
| `processors.trim()` | O(n) | O(n) | ✅ matches | 1.04 µs | 12.5 µs |
| `validators.after(date)` | O(1) | O(1) | ✅ matches | 0.186 µs | 0.182 µs |
| `validators.all(...validators)` | O(n) | O(n) | ✅ matches | 1.39 µs | 20.9 µs |
| `validators.any(...validators)` | O(n) | O(n) | ✅ matches | 8.81 µs | 138 µs |
| `validators.before(date)` | O(1) | O(1) | ✅ matches | 0.181 µs | 0.189 µs |
| `validators.custom(fn)` | O(1) | O(1) | ✅ matches | 0.0655 µs | 0.0660 µs |
| `validators.email()` | O(n) | O(log n) | 🟡 close (neighbouring class) | 0.941 µs | 6.24 µs |
| `validators.endsWith(suffix)` | O(1) | O(1) | ✅ matches | 0.0886 µs | 0.0951 µs |
| `validators.finite()` | O(1) | O(1) | ✅ matches | 0.0694 µs | 0.0710 µs |
| `validators.future()` | O(1) | O(1) | ✅ matches | 0.272 µs | 0.272 µs |
| `validators.includes(text)` | O(n) | O(1) | ⚠️ differs | 0.0951 µs | 0.146 µs |
| `validators.integer()` | O(1) | O(1) | ✅ matches | 0.0698 µs | 0.0720 µs |
| `validators.length(n)` | O(1) | O(1) | ✅ matches | 0.0702 µs | 0.0706 µs |
| `validators.matches(regex)` | O(n) | O(log n) | 🟡 close (neighbouring class) | 0.498 µs | 3.76 µs |
| `validators.max(limit)` | O(1) | O(1) | ✅ matches | 0.0703 µs | 0.0707 µs |
| `validators.maxItems(limit)` | O(1) | O(1) | ✅ matches | 0.0709 µs | 0.0699 µs |
| `validators.maxLength(limit)` | O(1) | O(1) | ✅ matches | 0.0699 µs | 0.0702 µs |
| `validators.min(limit)` | O(1) | O(1) | ✅ matches | 0.0701 µs | 0.0699 µs |
| `validators.minItems(limit)` | O(1) | O(1) | ✅ matches | 0.0709 µs | 0.0695 µs |
| `validators.minLength(limit)` | O(1) | O(1) | ✅ matches | 0.0698 µs | 0.0715 µs |
| `validators.negative()` | O(1) | O(1) | ✅ matches | 0.0705 µs | 0.0702 µs |
| `validators.not(validator)` | O(1) | O(1) | ✅ matches | 0.0850 µs | 0.0707 µs |
| `validators.oneOf(options)` | O(n) | O(n) | ✅ matches | 1.45 µs | 10.2 µs |
| `validators.optional(validator)` | O(1) | O(1) | ✅ matches | 0.0705 µs | 0.0709 µs |
| `validators.past()` | O(1) | O(1) | ✅ matches | 0.274 µs | 0.275 µs |
| `validators.positive()` | O(1) | O(1) | ✅ matches | 0.0708 µs | 0.0722 µs |
| `validators.range(min, max)` | O(1) | O(1) | ✅ matches | 0.0706 µs | 0.0707 µs |
| `validators.refine(validator, message)` | O(1) | O(1) | ✅ matches | 0.0722 µs | 0.0706 µs |
| `validators.required()` | O(1) | O(1) | ✅ matches | 0.0712 µs | 0.0719 µs |
| `validators.safeInteger()` | O(1) | O(1) | ✅ matches | 0.0707 µs | 0.0702 µs |
| `validators.unique()` | O(n) | O(n) | ✅ matches | 11.0 µs | 396 µs |
| `validators.url()` | O(n) | O(log n) | 🟡 close (neighbouring class) | 0.733 µs | 3.91 µs |
| `validators.uuid()` | O(1) | O(1) | ✅ matches | 0.243 µs | 0.247 µs |
| `validators.uuidVersion(v)` | O(1) | O(1) | ✅ matches | 0.243 µs | 0.242 µs |

> **Needs attention.** These functions grow at a different rate than documented. Either the code regressed or the documentation is wrong -- decide which, then fix it:
>
> - `validator-includes`: documented O(n), measured O(1) (exponent 0.07)

### `process start with n variables declared (cold start)`

**Why we benchmark it.** Every process that imports its environment contracts pays this before serving its first request: each deploy, each serverless cold start, each CLI run and each test worker. It is where env-cap's cost is most visible to an operator.

**What poor performance would mean.** Slower deploys and a longer first request on every new instance; on serverless platforms the delay is billed on every scale-from-zero. A super-linear regression would make large configurations noticeably slow to boot.

**Expected growth: O(n).** Importing the contracts evaluates one `createEnv` per contract, and `validateEnv` then walks every variable once, so after Node's own start-up floor the time grows in proportion to the number of variables.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| variables | swept | The tier axis: how many environment variables are declared and validated. |
| process start-up floor | fixed at "one fresh Node process per sample" | Node's own start-up time is included and sets the flat floor of the curve. |
| variables per contract | fixed at 10 | Contracts of ten variables, so the contract count grows with n; a few large contracts versus many small ones is not swept. |
| variable declaration | fixed at "identity processor, no validator" | Variables use the cheapest possible processor so the measurement is env-cap's own machinery; processor and validator cost is measured per helper below. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**Deliberately not covered**

- **warm module cache** -- A fresh process has no warm cache by definition.
- **bundled loading** -- Measured through Node's native ESM loader; bundlers change module-evaluation cost and are application-specific.

**Measured: O(log n)** (exponent 0.30, 10 sizes) -- 🟡 close (neighbouring class).

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 30.5 ms | 30.7 ms | 1.93 ms | 156.3 KiB | 33 |
| 40 | 31.7 ms | 34.4 ms | 2.03 ms | 155.5 KiB | 32 |
| 80 | 35.5 ms | 36.7 ms | 2.04 ms | 153.1 KiB | 28 |
| 160 | 34.6 ms | 35.7 ms | 1.95 ms | 153.1 KiB | 29 |
| 320 | 39.6 ms | 41.1 ms | 2.03 ms | 153.0 KiB | 25 |
| 640 | 45.2 ms | 46.6 ms | 2.06 ms | 153.1 KiB | 22 |
| 1280 | 59.3 ms | 62.6 ms | 2.15 ms | 152.7 KiB | 17 |
| 2560 | 91.0 ms | 97.0 ms | 2.31 ms | 152.8 KiB | 11 |
| 5120 | 131 ms | 136 ms | 2.26 ms | 152.7 KiB | 8 |
| 10240 | 232 ms | 234 ms | 2.17 ms | 152.7 KiB | 4 |

### `createEnv (declare a contract)`

**Why we benchmark it.** Runs once per contract when its module is imported, so it is the per-contract part of cold start and the cost of every contract an application declares.

**What poor performance would mean.** Slower boot in proportion to the size of the configuration; for an application with hundreds of variables the cost lands on every process start.

**Expected growth: O(n).** It walks the schema once to freeze and register each variable definition, so cost is proportional to the number of variables.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| variables | swept | The tier axis: how many environment variables are declared and validated. |
| variable declaration | fixed at "identity processor, no validator" | Variables use the cheapest possible processor so the measurement is env-cap's own machinery; processor and validator cost is measured per helper below. |
| contract naming | fixed at "unique name per call" | Each call registers a new contract name; reusing a name takes a different (error) path. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**Measured: O(n log n)** (exponent 1.24, 10 sizes) -- 🟡 close (neighbouring class).

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 5.55 µs | 6.00 µs | 21.7 µs | 7.7 KiB | 180,047 |
| 40 | 9.06 µs | 10.0 µs | 34.6 µs | 11.3 KiB | 110,424 |
| 80 | 13.3 µs | 13.8 µs | 36.1 µs | 21.4 KiB | 75,269 |
| 160 | 25.7 µs | 26.9 µs | 62.8 µs | 42.0 KiB | 38,873 |
| 320 | 58.9 µs | 60.5 µs | 125 µs | 84.4 KiB | 16,964 |
| 640 | 185 µs | 188 µs | 293 µs | 173.1 KiB | 5,417 |
| 1280 | 2.32 ms | 2.40 ms | 3.17 ms | 482.1 KiB | 431 |
| 2560 | 2.52 ms | 2.63 ms | 3.42 ms | 901.0 KiB | 397 |
| 5120 | 3.25 ms | 3.54 ms | 4.11 ms | 1.5 MiB | 308 |
| 10240 | 4.32 ms | 4.64 ms | 5.32 ms | 2.7 MiB | 231 |

### `validateEnv (validate n values)`

**Why we benchmark it.** The startup check itself: every variable's value is processed and validated, once per process. It is the dominant steady-state cost env-cap adds.

**What poor performance would mean.** Every process start pays the slowdown, and so does every test run that validates configuration; a quadratic regression would make large configurations unusable.

**Expected growth: O(n).** It visits each declared variable once, runs its processor and validator and records the outcome, so cost is proportional to the number of variables.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| variables | swept | The tier axis: how many environment variables are declared and validated. |
| variable declaration | fixed at "identity processor, no validator" | Variables use the cheapest possible processor so the measurement is env-cap's own machinery; processor and validator cost is measured per helper below. |
| value source | fixed at "an in-memory object of short strings" | Real environments read process.env, which behaves like an object of strings; reading it is not env-cap's cost. |
| validation cache | fixed at "reset before every sample" | `validateEnv` is idempotent for the life of a process, so a repeat call is a free cache hit; each sample starts from an empty cache to measure the real validation. |
| validity | fixed at "every value valid" | The success path. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**In the end-to-end run:** This is the end-to-end operation itself.

**Measured: O(n)** (exponent 0.74, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 20.8 µs | 27.1 µs | 23.0 µs | 5.4 KiB | 48,075 |
| 40 | 27.5 µs | 44.2 µs | 29.0 µs | 8.2 KiB | 36,376 |
| 80 | 40.5 µs | 57.2 µs | 43.0 µs | 17.7 KiB | 24,703 |
| 160 | 69.7 µs | 83.8 µs | 72.0 µs | 47.8 KiB | 14,344 |
| 320 | 137 µs | 151 µs | 140 µs | 160.5 KiB | 7,312 |
| 640 | 281 µs | 311 µs | 959 µs | 584.8 KiB | 3,556 |
| 1280 | 281 µs | 321 µs | 977 µs | 174.8 KiB | 3,558 |
| 2560 | 475 µs | 637 µs | 1.18 ms | 398.7 KiB | 2,105 |
| 5120 | 1.06 ms | 1.42 ms | 1.96 ms | 691.3 KiB | 944 |
| 10240 | 2.07 ms | 3.01 ms | 2.85 ms | 1.3 MiB | 483 |

### `processors.base64()`

**Why we benchmark it.** Decodes a base64-encoded secret or certificate into its original text. It runs once for every variable that declares it, at startup, on every process and every deploy, so its per-value cost is multiplied by the number of variables using it.

**What poor performance would mean.** Startup and cold-start time grow with every variable that uses processors.base64(), and with the size of the values it handles (a large secret, certificate or list). On serverless platforms that delay is billed on every scale-from-zero event, and a regression here is paid by every service that adopts the helper.

**Expected growth: O(n).** Decoding reads each encoded character once and writes the decoded bytes, so the work is proportional to the length of the encoded value.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| input size | swept | Length of the base64 text, in characters. |
| input content | fixed at "a valid base64 string" | A valid value of the expected kind; the failure path (an invalid value) is cheaper because it exits early and is not what startup normally does. |
| composition | fixed at "used alone" | Wrapping in `all`, `any`, `optional` or `not` adds a constant per wrapper and is measured in the combinator entries. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**Deliberately not covered**

- **locale and timezone** -- The helper's cost does not depend on the process locale or timezone for the inputs measured.

**Measured: O(log n)** (exponent 0.17, 10 sizes) -- 🟡 close (neighbouring class).

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.794 µs | 1.47 µs | 0.831 µs | 477 B | 1,258,746 |
| 40 | 0.380 µs | 0.644 µs | 0.389 µs | 348 B | 2,630,954 |
| 80 | 0.409 µs | 0.704 µs | 0.424 µs | 349 B | 2,444,812 |
| 160 | 0.364 µs | 0.577 µs | 0.372 µs | 351 B | 2,746,305 |
| 320 | 0.543 µs | 0.678 µs | 0.563 µs | 486 B | 1,842,011 |
| 640 | 0.468 µs | 0.811 µs | 0.475 µs | 373 B | 2,136,294 |
| 1280 | 1.05 µs | 1.64 µs | 1.09 µs | 516 B | 952,212 |
| 2560 | 0.783 µs | 1.45 µs | 0.798 µs | 421 B | 1,276,825 |
| 5120 | 1.29 µs | 1.81 µs | 1.32 µs | 436 B | 773,694 |
| 10240 | 1.34 µs | 2.23 µs | 1.36 µs | 436 B | 747,670 |

### `processors.parseJSON()`

**Why we benchmark it.** Parses a JSON-valued variable (a feature-flag map, a credential blob) into an object. It runs once for every variable that declares it, at startup, on every process and every deploy, so its per-value cost is multiplied by the number of variables using it.

**What poor performance would mean.** Startup and cold-start time grow with every variable that uses processors.parseJSON(), and with the size of the values it handles (a large secret, certificate or list). On serverless platforms that delay is billed on every scale-from-zero event, and a regression here is paid by every service that adopts the helper.

**Expected growth: O(n).** JSON parsing visits every character and builds one node per key and value, so cost is proportional to the size of the document.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| input size | swept | Number of keys in the JSON object. |
| input content | fixed at "a flat JSON object of short strings" | A valid value of the expected kind; the failure path (an invalid value) is cheaper because it exits early and is not what startup normally does. |
| composition | fixed at "used alone" | Wrapping in `all`, `any`, `optional` or `not` adds a constant per wrapper and is measured in the combinator entries. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**Deliberately not covered**

- **locale and timezone** -- The helper's cost does not depend on the process locale or timezone for the inputs measured.

**Measured: O(n log n)** (exponent 1.11, 10 sizes) -- 🟡 close (neighbouring class).

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.79 µs | 2.09 µs | 1.80 µs | 435 B | 558,705 |
| 40 | 3.32 µs | 3.77 µs | 13.4 µs | 596 B | 300,986 |
| 80 | 5.75 µs | 6.86 µs | 17.1 µs | 917 B | 173,999 |
| 160 | 23.5 µs | 25.9 µs | 83.7 µs | 6.5 KiB | 42,577 |
| 320 | 39.1 µs | 41.2 µs | 90.7 µs | 12.5 KiB | 25,547 |
| 640 | 80.1 µs | 85.7 µs | 174 µs | 24.5 KiB | 12,488 |
| 1280 | 171 µs | 180 µs | 383 µs | 48.5 KiB | 5,840 |
| 2560 | 351 µs | 357 µs | 639 µs | 116.0 KiB | 2,846 |
| 5120 | 800 µs | 831 µs | 1.26 ms | 192.6 KiB | 1,249 |
| 10240 | 1.65 ms | 1.74 ms | 2.64 ms | 392.3 KiB | 607 |

### `processors.split(",")`

**Why we benchmark it.** Splits a delimited variable (a host list) into an array of strings. It runs once for every variable that declares it, at startup, on every process and every deploy, so its per-value cost is multiplied by the number of variables using it.

**What poor performance would mean.** Startup and cold-start time grow with every variable that uses processors.split(","), and with the size of the values it handles (a large secret, certificate or list). On serverless platforms that delay is billed on every scale-from-zero event, and a regression here is paid by every service that adopts the helper.

**Expected growth: O(n).** Splitting scans the string once and allocates one substring per field, so cost follows the length of the text.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| input size | swept | Number of comma-separated fields. |
| input content | fixed at "short fields separated by commas" | A valid value of the expected kind; the failure path (an invalid value) is cheaper because it exits early and is not what startup normally does. |
| composition | fixed at "used alone" | Wrapping in `all`, `any`, `optional` or `not` adds a constant per wrapper and is measured in the combinator entries. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**Deliberately not covered**

- **locale and timezone** -- The helper's cost does not depend on the process locale or timezone for the inputs measured.

**Measured: O(n)** (exponent 0.93, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.602 µs | 1.41 µs | 0.615 µs | 723 B | 1,661,899 |
| 40 | 1.02 µs | 1.98 µs | 1.03 µs | 1.0 KiB | 980,939 |
| 80 | 1.75 µs | 2.46 µs | 1.78 µs | 1.6 KiB | 570,353 |
| 160 | 2.94 µs | 5.26 µs | 10.4 µs | 2.9 KiB | 340,186 |
| 320 | 5.47 µs | 9.11 µs | 17.7 µs | 5.4 KiB | 182,687 |
| 640 | 12.2 µs | 22.6 µs | 48.8 µs | 10.5 KiB | 81,664 |
| 1280 | 29.8 µs | 35.1 µs | 82.7 µs | 20.8 KiB | 33,543 |
| 2560 | 39.5 µs | 51.0 µs | 115 µs | 41.3 KiB | 25,325 |
| 5120 | 77.4 µs | 125 µs | 217 µs | 82.2 KiB | 12,914 |
| 10240 | 202 µs | 215 µs | 418 µs | 167.2 KiB | 4,950 |

### `processors.toArray(",", [trim()])`

**Why we benchmark it.** Splits a delimited variable and post-processes every element (here, trimming). It runs once for every variable that declares it, at startup, on every process and every deploy, so its per-value cost is multiplied by the number of variables using it.

**What poor performance would mean.** Startup and cold-start time grow with every variable that uses processors.toArray(",", [trim()]), and with the size of the values it handles (a large secret, certificate or list). On serverless platforms that delay is billed on every scale-from-zero event, and a regression here is paid by every service that adopts the helper.

**Expected growth: O(n).** It splits once and then applies the element processor to each field, so cost is proportional to the number of elements.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| input size | swept | Number of comma-separated elements. |
| input content | fixed at "short, space-padded fields" | A valid value of the expected kind; the failure path (an invalid value) is cheaper because it exits early and is not what startup normally does. |
| composition | fixed at "used alone" | Wrapping in `all`, `any`, `optional` or `not` adds a constant per wrapper and is measured in the combinator entries. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**Deliberately not covered**

- **locale and timezone** -- The helper's cost does not depend on the process locale or timezone for the inputs measured.

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.80 µs | 3.95 µs | 2.94 µs | 2.7 KiB | 357,591 |
| 40 | 2.37 µs | 3.93 µs | 4.90 µs | 4.6 KiB | 422,760 |
| 80 | 4.36 µs | 9.71 µs | 17.7 µs | 8.7 KiB | 229,605 |
| 160 | 7.86 µs | 18.8 µs | 29.2 µs | 16.8 KiB | 127,294 |
| 320 | 33.7 µs | 76.4 µs | 86.1 µs | 33.3 KiB | 29,695 |
| 640 | 60.2 µs | 101 µs | 180 µs | 66.0 KiB | 16,604 |
| 1280 | 140 µs | 215 µs | 387 µs | 131.2 KiB | 7,168 |
| 2560 | 235 µs | 290 µs | 680 µs | 261.4 KiB | 4,262 |
| 5120 | 400 µs | 701 µs | 1.10 ms | 539.7 KiB | 2,499 |
| 10240 | 693 µs | 828 µs | 1.78 ms | 1.1 MiB | 1,442 |

### `processors.toBigInt()`

**Why we benchmark it.** Parses a very large integer (a numeric identifier, a counter) without losing precision. It runs once for every variable that declares it, at startup, on every process and every deploy, so its per-value cost is multiplied by the number of variables using it.

**What poor performance would mean.** Startup and cold-start time grow with every variable that uses processors.toBigInt(), and with the size of the values it handles (a large secret, certificate or list). On serverless platforms that delay is billed on every scale-from-zero event, and a regression here is paid by every service that adopts the helper.

**Expected growth: O(n).** Parsing reads each decimal digit once to build the integer, so cost follows the number of digits.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| input size | swept | Number of decimal digits. |
| input content | fixed at "a string of the digit 1" | A valid value of the expected kind; the failure path (an invalid value) is cheaper because it exits early and is not what startup normally does. |
| composition | fixed at "used alone" | Wrapping in `all`, `any`, `optional` or `not` adds a constant per wrapper and is measured in the combinator entries. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**Deliberately not covered**

- **locale and timezone** -- The helper's cost does not depend on the process locale or timezone for the inputs measured.

**Measured: O(n log n)** (exponent 1.11, 10 sizes) -- 🟡 close (neighbouring class).

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.176 µs | 0.301 µs | 0.184 µs | 282 B | 5,691,955 |
| 40 | 0.170 µs | 0.196 µs | 0.173 µs | 289 B | 5,887,083 |
| 80 | 0.224 µs | 0.264 µs | 0.229 µs | 305 B | 4,455,161 |
| 160 | 0.484 µs | 0.514 µs | 0.488 µs | 337 B | 2,065,137 |
| 320 | 0.894 µs | 0.938 µs | 0.901 µs | 401 B | 1,118,126 |
| 640 | 1.86 µs | 1.97 µs | 6.95 µs | 538 B | 536,515 |
| 1280 | 4.30 µs | 4.60 µs | 12.2 µs | 811 B | 232,667 |
| 2560 | 13.3 µs | 14.1 µs | 32.2 µs | 1.3 KiB | 74,957 |
| 5120 | 45.4 µs | 46.7 µs | 98.3 µs | 2.4 KiB | 22,009 |
| 10240 | 146 µs | 150 µs | 313 µs | 4.5 KiB | 6,830 |

### `processors.toBoolean()`

**Why we benchmark it.** Interprets a flag variable ("true", "1", "yes") as a boolean. It runs once for every variable that declares it, at startup, on every process and every deploy, so its per-value cost is multiplied by the number of variables using it.

**What poor performance would mean.** Startup and cold-start time grow with every variable that uses processors.toBoolean(). On serverless platforms that delay is billed on every scale-from-zero event, and a regression here is paid by every service that adopts the helper.

**Expected growth: O(1).** It compares the value against a short fixed list of accepted spellings, independent of anything else.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| input size | swept | Varied only to show the helper ignores it; the input is always the short flag "true". |
| input content | fixed at "the string \"true\"" | A valid value of the expected kind; the failure path (an invalid value) is cheaper because it exits early and is not what startup normally does. |
| composition | fixed at "used alone" | Wrapping in `all`, `any`, `optional` or `not` adds a constant per wrapper and is measured in the combinator entries. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**Deliberately not covered**

- **locale and timezone** -- The helper's cost does not depend on the process locale or timezone for the inputs measured.

**Measured: O(1)** (exponent -0.04, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.183 µs | 0.329 µs | 0.191 µs | 322 B | 5,461,781 |
| 40 | 0.0971 µs | 0.182 µs | 0.103 µs | 273 B | 10,294,972 |
| 80 | 0.0936 µs | 0.164 µs | 0.0974 µs | 273 B | 10,685,263 |
| 160 | 0.110 µs | 0.147 µs | 0.117 µs | 273 B | 9,084,446 |
| 320 | 0.104 µs | 0.159 µs | 0.109 µs | 273 B | 9,604,976 |
| 640 | 0.102 µs | 0.155 µs | 0.107 µs | 273 B | 9,826,392 |
| 1280 | 0.109 µs | 0.153 µs | 0.116 µs | 273 B | 9,155,511 |
| 2560 | 0.105 µs | 0.157 µs | 0.109 µs | 273 B | 9,536,401 |
| 5120 | 0.102 µs | 0.131 µs | 0.106 µs | 273 B | 9,768,979 |
| 10240 | 0.102 µs | 0.146 µs | 0.108 µs | 273 B | 9,777,039 |

### `processors.toDate()`

**Why we benchmark it.** Parses a date variable (a license expiry) into a Date. It runs once for every variable that declares it, at startup, on every process and every deploy, so its per-value cost is multiplied by the number of variables using it.

**What poor performance would mean.** Startup and cold-start time grow with every variable that uses processors.toDate(). On serverless platforms that delay is billed on every scale-from-zero event, and a regression here is paid by every service that adopts the helper.

**Expected growth: O(1).** A date string has a fixed maximum length and the parser does a fixed amount of work for it.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| input size | swept | Varied only to show the helper ignores it; the input is always one ISO date. |
| input content | fixed at "an ISO 8601 timestamp" | A valid value of the expected kind; the failure path (an invalid value) is cheaper because it exits early and is not what startup normally does. |
| composition | fixed at "used alone" | Wrapping in `all`, `any`, `optional` or `not` adds a constant per wrapper and is measured in the combinator entries. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**Deliberately not covered**

- **locale and timezone** -- The helper's cost does not depend on the process locale or timezone for the inputs measured.

**Measured: O(1)** (exponent -0.00, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.325 µs | 0.486 µs | 0.338 µs | 362 B | 3,075,732 |
| 40 | 0.318 µs | 0.393 µs | 0.322 µs | 361 B | 3,147,503 |
| 80 | 0.322 µs | 0.407 µs | 0.328 µs | 362 B | 3,101,765 |
| 160 | 0.317 µs | 0.363 µs | 0.323 µs | 361 B | 3,152,436 |
| 320 | 0.335 µs | 0.394 µs | 0.342 µs | 361 B | 2,988,407 |
| 640 | 0.319 µs | 0.371 µs | 0.325 µs | 362 B | 3,134,948 |
| 1280 | 0.316 µs | 0.368 µs | 0.322 µs | 361 B | 3,165,958 |
| 2560 | 0.325 µs | 0.400 µs | 0.330 µs | 361 B | 3,081,647 |
| 5120 | 0.319 µs | 0.385 µs | 0.324 µs | 361 B | 3,137,842 |
| 10240 | 0.312 µs | 0.368 µs | 0.319 µs | 362 B | 3,200,703 |

### `processors.toInteger()`

**Why we benchmark it.** Parses a whole-number variable (a port, a pool size). It runs once for every variable that declares it, at startup, on every process and every deploy, so its per-value cost is multiplied by the number of variables using it.

**What poor performance would mean.** Startup and cold-start time grow with every variable that uses processors.toInteger(). On serverless platforms that delay is billed on every scale-from-zero event, and a regression here is paid by every service that adopts the helper.

**Expected growth: O(1).** Port-sized numbers have a fixed small length, so parsing and validating one is a fixed amount of work.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| input size | swept | Varied only to show the helper ignores it; the input is always a short integer. |
| input content | fixed at "the string \"17\"" | A valid value of the expected kind; the failure path (an invalid value) is cheaper because it exits early and is not what startup normally does. |
| composition | fixed at "used alone" | Wrapping in `all`, `any`, `optional` or `not` adds a constant per wrapper and is measured in the combinator entries. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**Deliberately not covered**

- **locale and timezone** -- The helper's cost does not depend on the process locale or timezone for the inputs measured.

**Measured: O(1)** (exponent -0.01, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.0852 µs | 0.226 µs | 0.0897 µs | 305 B | 11,735,206 |
| 40 | 0.0838 µs | 0.207 µs | 0.0890 µs | 305 B | 11,932,160 |
| 80 | 0.0871 µs | 0.157 µs | 0.0917 µs | 305 B | 11,476,503 |
| 160 | 0.0877 µs | 0.116 µs | 0.0915 µs | 305 B | 11,401,586 |
| 320 | 0.0889 µs | 0.161 µs | 0.0917 µs | 305 B | 11,251,589 |
| 640 | 0.0869 µs | 0.182 µs | 0.0897 µs | 305 B | 11,511,896 |
| 1280 | 0.0852 µs | 0.161 µs | 0.0899 µs | 305 B | 11,741,084 |
| 2560 | 0.0828 µs | 0.182 µs | 0.0870 µs | 305 B | 12,070,112 |
| 5120 | 0.0818 µs | 0.154 µs | 0.0877 µs | 305 B | 12,226,512 |
| 10240 | 0.0827 µs | 0.156 µs | 0.0855 µs | 305 B | 12,097,337 |

### `processors.toLowerCase()`

**Why we benchmark it.** Normalizes a variable (an environment name, a hostname) to lower case. It runs once for every variable that declares it, at startup, on every process and every deploy, so its per-value cost is multiplied by the number of variables using it.

**What poor performance would mean.** Startup and cold-start time grow with every variable that uses processors.toLowerCase(), and with the size of the values it handles (a large secret, certificate or list). On serverless platforms that delay is billed on every scale-from-zero event, and a regression here is paid by every service that adopts the helper.

**Expected growth: O(n).** Case conversion visits every character once.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| input size | swept | Length of the string, in characters. |
| input content | fixed at "mixed-case ASCII" | A valid value of the expected kind; the failure path (an invalid value) is cheaper because it exits early and is not what startup normally does. |
| composition | fixed at "used alone" | Wrapping in `all`, `any`, `optional` or `not` adds a constant per wrapper and is measured in the combinator entries. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**Deliberately not covered**

- **locale and timezone** -- The helper's cost does not depend on the process locale or timezone for the inputs measured.

**Measured: O(log n)** (exponent 0.40, 10 sizes) -- 🟡 close (neighbouring class).

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.103 µs | 0.146 µs | 0.109 µs | 289 B | 9,746,883 |
| 40 | 0.0960 µs | 0.121 µs | 0.0998 µs | 305 B | 10,413,509 |
| 80 | 0.104 µs | 0.147 µs | 0.109 µs | 345 B | 9,575,189 |
| 160 | 0.110 µs | 0.136 µs | 0.115 µs | 425 B | 9,065,625 |
| 320 | 0.133 µs | 0.172 µs | 0.136 µs | 585 B | 7,528,108 |
| 640 | 0.177 µs | 0.230 µs | 0.183 µs | 905 B | 5,651,794 |
| 1280 | 0.264 µs | 0.301 µs | 0.269 µs | 1.5 KiB | 3,783,762 |
| 2560 | 0.402 µs | 0.503 µs | 0.407 µs | 2.8 KiB | 2,486,455 |
| 5120 | 0.685 µs | 0.752 µs | 2.81 µs | 5.4 KiB | 1,458,977 |
| 10240 | 1.20 µs | 1.27 µs | 4.49 µs | 10.5 KiB | 835,357 |

### `processors.toNumber()`

**Why we benchmark it.** Parses a numeric variable (a timeout, a ratio). It runs once for every variable that declares it, at startup, on every process and every deploy, so its per-value cost is multiplied by the number of variables using it.

**What poor performance would mean.** Startup and cold-start time grow with every variable that uses processors.toNumber(). On serverless platforms that delay is billed on every scale-from-zero event, and a regression here is paid by every service that adopts the helper.

**Expected growth: O(1).** A number literal has a fixed small length and is parsed in one pass.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| input size | swept | Varied only to show the helper ignores it; the input is always a short number. |
| input content | fixed at "the string \"42\"" | A valid value of the expected kind; the failure path (an invalid value) is cheaper because it exits early and is not what startup normally does. |
| composition | fixed at "used alone" | Wrapping in `all`, `any`, `optional` or `not` adds a constant per wrapper and is measured in the combinator entries. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**Deliberately not covered**

- **locale and timezone** -- The helper's cost does not depend on the process locale or timezone for the inputs measured.

**Measured: O(1)** (exponent 0.00, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.0808 µs | 0.121 µs | 0.0833 µs | 249 B | 12,371,966 |
| 40 | 0.0806 µs | 0.119 µs | 0.0857 µs | 249 B | 12,412,548 |
| 80 | 0.0816 µs | 0.141 µs | 0.0851 µs | 249 B | 12,249,153 |
| 160 | 0.0795 µs | 0.115 µs | 0.0815 µs | 248 B | 12,583,893 |
| 320 | 0.0800 µs | 0.117 µs | 0.0835 µs | 249 B | 12,505,464 |
| 640 | 0.0817 µs | 0.119 µs | 0.0853 µs | 249 B | 12,246,070 |
| 1280 | 0.0823 µs | 0.136 µs | 0.0884 µs | 249 B | 12,150,267 |
| 2560 | 0.0814 µs | 0.117 µs | 0.0836 µs | 248 B | 12,287,582 |
| 5120 | 0.0830 µs | 0.123 µs | 0.0866 µs | 249 B | 12,049,390 |
| 10240 | 0.0818 µs | 0.121 µs | 0.0841 µs | 248 B | 12,224,221 |

### `processors.toRegExp()`

**Why we benchmark it.** Compiles a pattern variable (an allow-list) into a RegExp. It runs once for every variable that declares it, at startup, on every process and every deploy, so its per-value cost is multiplied by the number of variables using it.

**What poor performance would mean.** Startup and cold-start time grow with every variable that uses processors.toRegExp(), and with the size of the values it handles (a large secret, certificate or list). On serverless platforms that delay is billed on every scale-from-zero event, and a regression here is paid by every service that adopts the helper.

**Expected growth: O(n).** Compiling a pattern parses it once, so cost follows the length of the pattern.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| input size | swept | Length of the pattern, in characters. |
| input content | fixed at "an anchored run of the letter a" | A valid value of the expected kind; the failure path (an invalid value) is cheaper because it exits early and is not what startup normally does. |
| composition | fixed at "used alone" | Wrapping in `all`, `any`, `optional` or `not` adds a constant per wrapper and is measured in the combinator entries. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**Deliberately not covered**

- **locale and timezone** -- The helper's cost does not depend on the process locale or timezone for the inputs measured.

**Measured: O(log n)** (exponent 0.61, 10 sizes) -- 🟡 close (neighbouring class).

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.207 µs | 0.278 µs | 0.216 µs | 318 B | 4,839,843 |
| 40 | 0.226 µs | 0.260 µs | 0.231 µs | 314 B | 4,420,679 |
| 80 | 0.291 µs | 0.355 µs | 0.299 µs | 321 B | 3,441,876 |
| 160 | 0.390 µs | 0.459 µs | 0.396 µs | 316 B | 2,563,123 |
| 320 | 0.595 µs | 0.631 µs | 0.601 µs | 315 B | 1,679,529 |
| 640 | 0.998 µs | 1.07 µs | 2.08 µs | 318 B | 1,002,087 |
| 1280 | 1.57 µs | 1.73 µs | 5.87 µs | 321 B | 637,182 |
| 2560 | 2.55 µs | 2.72 µs | 7.58 µs | 323 B | 391,618 |
| 5120 | 4.50 µs | 4.98 µs | 12.7 µs | 335 B | 222,440 |
| 10240 | 8.50 µs | 9.49 µs | 21.8 µs | 354 B | 117,682 |

### `processors.toString()`

**Why we benchmark it.** Coerces a value to a string (the explicit no-op for variables that are already text). It runs once for every variable that declares it, at startup, on every process and every deploy, so its per-value cost is multiplied by the number of variables using it.

**What poor performance would mean.** Startup and cold-start time grow with every variable that uses processors.toString(). On serverless platforms that delay is billed on every scale-from-zero event, and a regression here is paid by every service that adopts the helper.

**Expected growth: O(1).** Converting a small number to its string form is a fixed amount of work.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| input size | swept | Varied only to show the helper ignores it; the input is always the number 42. |
| input content | fixed at "the number 42" | A valid value of the expected kind; the failure path (an invalid value) is cheaper because it exits early and is not what startup normally does. |
| composition | fixed at "used alone" | Wrapping in `all`, `any`, `optional` or `not` adds a constant per wrapper and is measured in the combinator entries. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**Deliberately not covered**

- **locale and timezone** -- The helper's cost does not depend on the process locale or timezone for the inputs measured.

**Measured: O(1)** (exponent -0.00, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.0864 µs | 0.109 µs | 0.0907 µs | 249 B | 11,573,866 |
| 40 | 0.0819 µs | 0.0970 µs | 0.0836 µs | 248 B | 12,212,720 |
| 80 | 0.0818 µs | 0.0982 µs | 0.0843 µs | 249 B | 12,223,344 |
| 160 | 0.0830 µs | 0.0886 µs | 0.0856 µs | 249 B | 12,049,021 |
| 320 | 0.0847 µs | 0.0976 µs | 0.0868 µs | 249 B | 11,808,221 |
| 640 | 0.0862 µs | 0.109 µs | 0.0907 µs | 249 B | 11,598,196 |
| 1280 | 0.0864 µs | 0.110 µs | 0.0890 µs | 249 B | 11,579,337 |
| 2560 | 0.0846 µs | 0.100 µs | 0.0873 µs | 249 B | 11,818,363 |
| 5120 | 0.0847 µs | 0.0930 µs | 0.0870 µs | 249 B | 11,802,783 |
| 10240 | 0.0813 µs | 0.0947 µs | 0.0830 µs | 248 B | 12,305,374 |

### `processors.toURL()`

**Why we benchmark it.** Parses an endpoint variable (an API base URL) into a URL object. It runs once for every variable that declares it, at startup, on every process and every deploy, so its per-value cost is multiplied by the number of variables using it.

**What poor performance would mean.** Startup and cold-start time grow with every variable that uses processors.toURL(), and with the size of the values it handles (a large secret, certificate or list). On serverless platforms that delay is billed on every scale-from-zero event, and a regression here is paid by every service that adopts the helper.

**Expected growth: O(n).** URL parsing scans the string once to split it into components, so cost follows its length.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| input size | swept | Length of the URL path, in characters. |
| input content | fixed at "an https URL with a long path" | A valid value of the expected kind; the failure path (an invalid value) is cheaper because it exits early and is not what startup normally does. |
| composition | fixed at "used alone" | Wrapping in `all`, `any`, `optional` or `not` adds a constant per wrapper and is measured in the combinator entries. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**Deliberately not covered**

- **locale and timezone** -- The helper's cost does not depend on the process locale or timezone for the inputs measured.

**Measured: O(log n)** (exponent 0.32, 10 sizes) -- 🟡 close (neighbouring class).

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.614 µs | 1.21 µs | 0.808 µs | 523 B | 1,628,771 |
| 40 | 0.484 µs | 0.593 µs | 0.494 µs | 546 B | 2,065,936 |
| 80 | 0.505 µs | 0.569 µs | 0.514 µs | 586 B | 1,979,903 |
| 160 | 0.552 µs | 0.608 µs | 0.560 µs | 665 B | 1,811,213 |
| 320 | 0.656 µs | 0.736 µs | 0.665 µs | 826 B | 1,523,812 |
| 640 | 0.794 µs | 0.916 µs | 0.804 µs | 1.1 KiB | 1,259,087 |
| 1280 | 1.07 µs | 1.16 µs | 1.09 µs | 1.7 KiB | 930,250 |
| 2560 | 1.59 µs | 1.75 µs | 3.36 µs | 3.0 KiB | 627,243 |
| 5120 | 2.48 µs | 2.59 µs | 9.45 µs | 5.6 KiB | 403,570 |
| 10240 | 4.26 µs | 4.44 µs | 15.0 µs | 10.6 KiB | 234,736 |

### `processors.toUpperCase()`

**Why we benchmark it.** Normalizes a variable to upper case. It runs once for every variable that declares it, at startup, on every process and every deploy, so its per-value cost is multiplied by the number of variables using it.

**What poor performance would mean.** Startup and cold-start time grow with every variable that uses processors.toUpperCase(), and with the size of the values it handles (a large secret, certificate or list). On serverless platforms that delay is billed on every scale-from-zero event, and a regression here is paid by every service that adopts the helper.

**Expected growth: O(n).** Case conversion visits every character once.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| input size | swept | Length of the string, in characters. |
| input content | fixed at "mixed-case ASCII" | A valid value of the expected kind; the failure path (an invalid value) is cheaper because it exits early and is not what startup normally does. |
| composition | fixed at "used alone" | Wrapping in `all`, `any`, `optional` or `not` adds a constant per wrapper and is measured in the combinator entries. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**Deliberately not covered**

- **locale and timezone** -- The helper's cost does not depend on the process locale or timezone for the inputs measured.

**Measured: O(log n)** (exponent 0.42, 10 sizes) -- 🟡 close (neighbouring class).

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.108 µs | 0.146 µs | 0.111 µs | 289 B | 9,276,032 |
| 40 | 0.106 µs | 0.143 µs | 0.112 µs | 305 B | 9,413,006 |
| 80 | 0.106 µs | 0.139 µs | 0.109 µs | 345 B | 9,452,992 |
| 160 | 0.118 µs | 0.156 µs | 0.123 µs | 425 B | 8,449,004 |
| 320 | 0.140 µs | 0.188 µs | 0.143 µs | 585 B | 7,151,021 |
| 640 | 0.182 µs | 0.228 µs | 0.186 µs | 905 B | 5,506,347 |
| 1280 | 0.266 µs | 0.334 µs | 0.271 µs | 1.5 KiB | 3,762,001 |
| 2560 | 0.485 µs | 0.895 µs | 0.501 µs | 2.8 KiB | 2,061,111 |
| 5120 | 0.814 µs | 1.33 µs | 0.830 µs | 5.4 KiB | 1,228,486 |
| 10240 | 1.38 µs | 1.92 µs | 4.79 µs | 10.5 KiB | 725,884 |

### `processors.trim()`

**Why we benchmark it.** Strips accidental whitespace around a value copied from a dashboard or a file. It runs once for every variable that declares it, at startup, on every process and every deploy, so its per-value cost is multiplied by the number of variables using it.

**What poor performance would mean.** Startup and cold-start time grow with every variable that uses processors.trim(), and with the size of the values it handles (a large secret, certificate or list). On serverless platforms that delay is billed on every scale-from-zero event, and a regression here is paid by every service that adopts the helper.

**Expected growth: O(n).** Trimming scans in from both ends and copies the remaining text, so cost follows the length of the string.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| input size | swept | Number of padding characters on each side. |
| input content | fixed at "a short word padded with spaces" | A valid value of the expected kind; the failure path (an invalid value) is cheaper because it exits early and is not what startup normally does. |
| composition | fixed at "used alone" | Wrapping in `all`, `any`, `optional` or `not` adds a constant per wrapper and is measured in the combinator entries. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**Deliberately not covered**

- **locale and timezone** -- The helper's cost does not depend on the process locale or timezone for the inputs measured.

**Measured: O(n)** (exponent 0.72, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.137 µs | 0.156 µs | 0.139 µs | 273 B | 7,325,203 |
| 40 | 0.183 µs | 0.238 µs | 0.189 µs | 273 B | 5,470,754 |
| 80 | 0.280 µs | 0.392 µs | 0.283 µs | 273 B | 3,573,634 |
| 160 | 0.432 µs | 0.560 µs | 0.436 µs | 273 B | 2,312,164 |
| 320 | 0.717 µs | 0.793 µs | 0.725 µs | 273 B | 1,395,328 |
| 640 | 1.04 µs | 1.12 µs | 3.47 µs | 273 B | 960,414 |
| 1280 | 1.89 µs | 2.01 µs | 5.89 µs | 273 B | 528,711 |
| 2560 | 3.49 µs | 3.72 µs | 10.2 µs | 274 B | 286,604 |
| 5120 | 6.18 µs | 6.53 µs | 15.8 µs | 276 B | 161,819 |
| 10240 | 12.5 µs | 13.0 µs | 31.9 µs | 279 B | 80,016 |

### `validators.after(date)`

**Why we benchmark it.** Requires a date to be later than a fixed instant (a license start). It runs once for every variable that declares it, at startup, on every process and every deploy, so its per-value cost is multiplied by the number of variables using it.

**What poor performance would mean.** Startup and cold-start time grow with every variable that uses validators.after(date). On serverless platforms that delay is billed on every scale-from-zero event, and a regression here is paid by every service that adopts the helper.

**Expected growth: O(1).** It compares two timestamps.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| input size | swept | Varied only to show the helper ignores it; the input is always one date. |
| input content | fixed at "a date after the threshold" | A valid value of the expected kind; the failure path (an invalid value) is cheaper because it exits early and is not what startup normally does. |
| composition | fixed at "used alone" | Wrapping in `all`, `any`, `optional` or `not` adds a constant per wrapper and is measured in the combinator entries. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**Deliberately not covered**

- **locale and timezone** -- The helper's cost does not depend on the process locale or timezone for the inputs measured.

**Measured: O(1)** (exponent -0.04, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.291 µs | 0.417 µs | 0.325 µs | 356 B | 3,437,877 |
| 40 | 0.197 µs | 0.316 µs | 0.204 µs | 306 B | 5,080,023 |
| 80 | 0.190 µs | 0.297 µs | 0.194 µs | 305 B | 5,270,225 |
| 160 | 0.183 µs | 0.357 µs | 0.190 µs | 249 B | 5,460,942 |
| 320 | 0.186 µs | 0.225 µs | 0.192 µs | 249 B | 5,362,698 |
| 640 | 0.186 µs | 0.301 µs | 0.191 µs | 249 B | 5,376,043 |
| 1280 | 0.195 µs | 0.326 µs | 0.202 µs | 250 B | 5,123,482 |
| 2560 | 0.190 µs | 0.341 µs | 0.197 µs | 249 B | 5,267,232 |
| 5120 | 0.186 µs | 0.314 µs | 0.191 µs | 249 B | 5,387,594 |
| 10240 | 0.182 µs | 0.356 µs | 0.191 µs | 249 B | 5,486,233 |

### `validators.all(...validators)`

**Why we benchmark it.** Combines several validators that must all pass (a number that must be positive and below a cap). It runs once for every variable that declares it, at startup, on every process and every deploy, so its per-value cost is multiplied by the number of variables using it.

**What poor performance would mean.** Startup and cold-start time grow with every variable that uses validators.all(...validators), and with the size of the values it handles (a large secret, certificate or list). On serverless platforms that delay is billed on every scale-from-zero event, and a regression here is paid by every service that adopts the helper.

**Expected growth: O(n).** It runs each inner validator in turn until one fails, so with every inner validator passing, cost is proportional to how many were combined.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| input size | swept | Number of inner validators combined. |
| input content | fixed at "an in-range number that every inner validator accepts" | A valid value of the expected kind; the failure path (an invalid value) is cheaper because it exits early and is not what startup normally does. |
| composition | fixed at "used alone" | Wrapping in `all`, `any`, `optional` or `not` adds a constant per wrapper and is measured in the combinator entries. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**Deliberately not covered**

- **locale and timezone** -- The helper's cost does not depend on the process locale or timezone for the inputs measured.

**Measured: O(n)** (exponent 0.85, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.124 µs | 1.25 µs | 0.146 µs | 252 B | 8,078,424 |
| 40 | 0.154 µs | 0.764 µs | 0.161 µs | 250 B | 6,495,626 |
| 80 | 0.236 µs | 2.18 µs | 0.243 µs | 250 B | 4,240,333 |
| 160 | 0.394 µs | 0.821 µs | 0.409 µs | 250 B | 2,536,520 |
| 320 | 0.715 µs | 2.46 µs | 0.741 µs | 252 B | 1,399,278 |
| 640 | 1.39 µs | 1.63 µs | 1.43 µs | 256 B | 718,468 |
| 1280 | 2.77 µs | 4.89 µs | 2.86 µs | 455 B | 361,300 |
| 2560 | 5.28 µs | 6.28 µs | 5.40 µs | 464 B | 189,322 |
| 5120 | 10.5 µs | 12.9 µs | 10.7 µs | 301 B | 95,488 |
| 10240 | 20.9 µs | 24.1 µs | 21.7 µs | 539 B | 47,821 |

### `validators.any(...validators)`

**Why we benchmark it.** Combines alternatives where one passing is enough (an IPv4 or IPv6 address). It runs once for every variable that declares it, at startup, on every process and every deploy, so its per-value cost is multiplied by the number of variables using it.

**What poor performance would mean.** Startup and cold-start time grow with every variable that uses validators.any(...validators), and with the size of the values it handles (a large secret, certificate or list). On serverless platforms that delay is billed on every scale-from-zero event, and a regression here is paid by every service that adopts the helper.

**Expected growth: O(n).** It tries each inner validator until one passes; with the passing one last, cost is proportional to how many were combined.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| input size | swept | Number of alternatives, the last of which is the one that passes. |
| input content | fixed at "a value only the final alternative accepts" | A valid value of the expected kind; the failure path (an invalid value) is cheaper because it exits early and is not what startup normally does. |
| composition | fixed at "used alone" | Wrapping in `all`, `any`, `optional` or `not` adds a constant per wrapper and is measured in the combinator entries. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**Deliberately not covered**

- **locale and timezone** -- The helper's cost does not depend on the process locale or timezone for the inputs measured.

**Measured: O(n)** (exponent 0.96, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.356 µs | 1.74 µs | 0.375 µs | 1.5 KiB | 2,806,722 |
| 40 | 0.598 µs | 0.813 µs | 0.602 µs | 2.7 KiB | 1,672,553 |
| 80 | 1.20 µs | 1.35 µs | 1.22 µs | 5.2 KiB | 833,718 |
| 160 | 2.31 µs | 2.71 µs | 2.34 µs | 10.4 KiB | 433,361 |
| 320 | 4.43 µs | 4.89 µs | 9.33 µs | 20.2 KiB | 225,778 |
| 640 | 8.81 µs | 9.91 µs | 8.87 µs | 40.2 KiB | 113,510 |
| 1280 | 17.5 µs | 19.5 µs | 54.6 µs | 80.4 KiB | 57,024 |
| 2560 | 33.5 µs | 35.7 µs | 69.6 µs | 160.4 KiB | 29,831 |
| 5120 | 67.5 µs | 75.1 µs | 140 µs | 320.5 KiB | 14,818 |
| 10240 | 138 µs | 147 µs | 291 µs | 640.5 KiB | 7,228 |

### `validators.before(date)`

**Why we benchmark it.** Requires a date to be earlier than a fixed instant (a migration cut-off). It runs once for every variable that declares it, at startup, on every process and every deploy, so its per-value cost is multiplied by the number of variables using it.

**What poor performance would mean.** Startup and cold-start time grow with every variable that uses validators.before(date). On serverless platforms that delay is billed on every scale-from-zero event, and a regression here is paid by every service that adopts the helper.

**Expected growth: O(1).** It compares two timestamps.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| input size | swept | Varied only to show the helper ignores it; the input is always one date. |
| input content | fixed at "a date before the threshold" | A valid value of the expected kind; the failure path (an invalid value) is cheaper because it exits early and is not what startup normally does. |
| composition | fixed at "used alone" | Wrapping in `all`, `any`, `optional` or `not` adds a constant per wrapper and is measured in the combinator entries. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**Deliberately not covered**

- **locale and timezone** -- The helper's cost does not depend on the process locale or timezone for the inputs measured.

**Measured: O(1)** (exponent -0.00, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.190 µs | 0.309 µs | 0.194 µs | 249 B | 5,269,456 |
| 40 | 0.189 µs | 0.343 µs | 0.196 µs | 249 B | 5,299,093 |
| 80 | 0.191 µs | 0.348 µs | 0.195 µs | 249 B | 5,243,759 |
| 160 | 0.186 µs | 0.330 µs | 0.191 µs | 249 B | 5,374,628 |
| 320 | 0.186 µs | 0.303 µs | 0.191 µs | 249 B | 5,369,054 |
| 640 | 0.181 µs | 0.285 µs | 0.187 µs | 249 B | 5,529,298 |
| 1280 | 0.183 µs | 0.214 µs | 0.188 µs | 249 B | 5,456,648 |
| 2560 | 0.187 µs | 0.307 µs | 0.192 µs | 249 B | 5,356,596 |
| 5120 | 0.182 µs | 0.354 µs | 0.188 µs | 249 B | 5,481,388 |
| 10240 | 0.189 µs | 0.342 µs | 0.199 µs | 250 B | 5,286,439 |

### `validators.custom(fn)`

**Why we benchmark it.** Wraps an application-supplied check as a validator. It runs once for every variable that declares it, at startup, on every process and every deploy, so its per-value cost is multiplied by the number of variables using it.

**What poor performance would mean.** Startup and cold-start time grow with every variable that uses validators.custom(fn). On serverless platforms that delay is billed on every scale-from-zero event, and a regression here is paid by every service that adopts the helper.

**Expected growth: O(1).** It forwards to the supplied function; the wrapper itself adds a fixed cost (the supplied function's own cost belongs to the application).

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| input size | swept | Varied only to show the wrapper ignores it; the supplied check is a single comparison. |
| input content | fixed at "a positive number" | A valid value of the expected kind; the failure path (an invalid value) is cheaper because it exits early and is not what startup normally does. |
| composition | fixed at "used alone" | Wrapping in `all`, `any`, `optional` or `not` adds a constant per wrapper and is measured in the combinator entries. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**Deliberately not covered**

- **locale and timezone** -- The helper's cost does not depend on the process locale or timezone for the inputs measured.

**Measured: O(1)** (exponent 0.00, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.0676 µs | 0.171 µs | 0.0723 µs | 249 B | 14,792,372 |
| 40 | 0.0664 µs | 0.181 µs | 0.0711 µs | 249 B | 15,053,687 |
| 80 | 0.0661 µs | 0.190 µs | 0.0697 µs | 249 B | 15,120,569 |
| 160 | 0.0662 µs | 0.167 µs | 0.0693 µs | 249 B | 15,107,274 |
| 320 | 0.0661 µs | 0.201 µs | 0.0704 µs | 249 B | 15,122,155 |
| 640 | 0.0655 µs | 0.175 µs | 0.0687 µs | 249 B | 15,264,115 |
| 1280 | 0.0675 µs | 0.177 µs | 0.0710 µs | 249 B | 14,814,579 |
| 2560 | 0.0698 µs | 0.182 µs | 0.0762 µs | 249 B | 14,335,776 |
| 5120 | 0.0667 µs | 0.0717 µs | 0.0692 µs | 249 B | 14,985,784 |
| 10240 | 0.0660 µs | 0.0851 µs | 0.0690 µs | 249 B | 15,143,369 |

### `validators.email()`

**Why we benchmark it.** Checks that a contact variable looks like an email address. It runs once for every variable that declares it, at startup, on every process and every deploy, so its per-value cost is multiplied by the number of variables using it.

**What poor performance would mean.** Startup and cold-start time grow with every variable that uses validators.email(), and with the size of the values it handles (a large secret, certificate or list). On serverless platforms that delay is billed on every scale-from-zero event, and a regression here is paid by every service that adopts the helper.

**Expected growth: O(n).** Matching scans the local part and domain once with a bounded pattern, so cost follows the length of the address.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| input size | swept | Length of the part before the @, in characters. |
| input content | fixed at "a long local part at example.com" | A valid value of the expected kind; the failure path (an invalid value) is cheaper because it exits early and is not what startup normally does. |
| composition | fixed at "used alone" | Wrapping in `all`, `any`, `optional` or `not` adds a constant per wrapper and is measured in the combinator entries. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**Deliberately not covered**

- **locale and timezone** -- The helper's cost does not depend on the process locale or timezone for the inputs measured.

**Measured: O(log n)** (exponent 0.46, 10 sizes) -- 🟡 close (neighbouring class).

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.400 µs | 0.434 µs | 0.474 µs | 449 B | 2,499,671 |
| 40 | 0.407 µs | 0.434 µs | 0.500 µs | 448 B | 2,456,097 |
| 80 | 0.265 µs | 0.471 µs | 0.350 µs | 264 B | 3,767,898 |
| 160 | 0.555 µs | 1.20 µs | 0.692 µs | 457 B | 1,800,305 |
| 320 | 0.636 µs | 0.660 µs | 0.750 µs | 452 B | 1,572,327 |
| 640 | 0.941 µs | 1.34 µs | 1.00 µs | 448 B | 1,062,191 |
| 1280 | 1.32 µs | 1.45 µs | 2.74 µs | 250 B | 759,340 |
| 2560 | 1.87 µs | 1.95 µs | 5.80 µs | 249 B | 534,210 |
| 5120 | 3.28 µs | 3.49 µs | 8.75 µs | 250 B | 304,997 |
| 10240 | 6.24 µs | 6.43 µs | 15.8 µs | 252 B | 160,326 |

### `validators.endsWith(suffix)`

**Why we benchmark it.** Requires a value to end with a fixed suffix (a required domain). It runs once for every variable that declares it, at startup, on every process and every deploy, so its per-value cost is multiplied by the number of variables using it.

**What poor performance would mean.** Startup and cold-start time grow with every variable that uses validators.endsWith(suffix). On serverless platforms that delay is billed on every scale-from-zero event, and a regression here is paid by every service that adopts the helper.

**Expected growth: O(1).** Checking a suffix compares only the last few characters, regardless of how long the string is.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| input size | swept | Length of the string; the comparison only touches the suffix. |
| input content | fixed at "a long string ending in .com" | A valid value of the expected kind; the failure path (an invalid value) is cheaper because it exits early and is not what startup normally does. |
| composition | fixed at "used alone" | Wrapping in `all`, `any`, `optional` or `not` adds a constant per wrapper and is measured in the combinator entries. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**Deliberately not covered**

- **locale and timezone** -- The helper's cost does not depend on the process locale or timezone for the inputs measured.

**Measured: O(1)** (exponent 0.01, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.0884 µs | 0.204 µs | 0.0982 µs | 305 B | 11,313,131 |
| 40 | 0.0886 µs | 0.106 µs | 0.0911 µs | 305 B | 11,286,310 |
| 80 | 0.0886 µs | 0.112 µs | 0.0916 µs | 305 B | 11,288,654 |
| 160 | 0.0922 µs | 0.114 µs | 0.0949 µs | 305 B | 10,850,742 |
| 320 | 0.0879 µs | 0.108 µs | 0.0898 µs | 304 B | 11,379,999 |
| 640 | 0.0886 µs | 0.101 µs | 0.0909 µs | 304 B | 11,280,422 |
| 1280 | 0.0904 µs | 0.113 µs | 0.0939 µs | 305 B | 11,067,614 |
| 2560 | 0.0891 µs | 0.106 µs | 0.0918 µs | 305 B | 11,220,609 |
| 5120 | 0.0894 µs | 0.105 µs | 0.0912 µs | 304 B | 11,187,523 |
| 10240 | 0.0951 µs | 0.124 µs | 0.0979 µs | 305 B | 10,512,336 |

### `validators.finite()`

**Why we benchmark it.** Rejects NaN and infinity in a numeric variable. It runs once for every variable that declares it, at startup, on every process and every deploy, so its per-value cost is multiplied by the number of variables using it.

**What poor performance would mean.** Startup and cold-start time grow with every variable that uses validators.finite(). On serverless platforms that delay is billed on every scale-from-zero event, and a regression here is paid by every service that adopts the helper.

**Expected growth: O(1).** It checks one number.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| input size | swept | Varied only to show the helper ignores it; the input is always one number. |
| input content | fixed at "a finite decimal" | A valid value of the expected kind; the failure path (an invalid value) is cheaper because it exits early and is not what startup normally does. |
| composition | fixed at "used alone" | Wrapping in `all`, `any`, `optional` or `not` adds a constant per wrapper and is measured in the combinator entries. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**Deliberately not covered**

- **locale and timezone** -- The helper's cost does not depend on the process locale or timezone for the inputs measured.

**Measured: O(1)** (exponent -0.01, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.0745 µs | 0.103 µs | 0.0799 µs | 305 B | 13,424,418 |
| 40 | 0.0722 µs | 0.0870 µs | 0.0747 µs | 305 B | 13,848,504 |
| 80 | 0.0691 µs | 0.0846 µs | 0.0717 µs | 304 B | 14,467,786 |
| 160 | 0.0697 µs | 0.0950 µs | 0.0731 µs | 305 B | 14,345,630 |
| 320 | 0.0711 µs | 0.0966 µs | 0.0741 µs | 304 B | 14,058,692 |
| 640 | 0.0694 µs | 0.0966 µs | 0.0715 µs | 304 B | 14,408,417 |
| 1280 | 0.0697 µs | 0.0809 µs | 0.0715 µs | 304 B | 14,349,424 |
| 2560 | 0.0692 µs | 0.102 µs | 0.0714 µs | 304 B | 14,452,256 |
| 5120 | 0.0693 µs | 0.0982 µs | 0.0710 µs | 304 B | 14,439,978 |
| 10240 | 0.0710 µs | 0.0987 µs | 0.0739 µs | 305 B | 14,090,620 |

### `validators.future()`

**Why we benchmark it.** Requires a date to still lie ahead (a certificate that must not already have expired). It runs once for every variable that declares it, at startup, on every process and every deploy, so its per-value cost is multiplied by the number of variables using it.

**What poor performance would mean.** Startup and cold-start time grow with every variable that uses validators.future(). On serverless platforms that delay is billed on every scale-from-zero event, and a regression here is paid by every service that adopts the helper.

**Expected growth: O(1).** It compares one timestamp with the current time.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| input size | swept | Varied only to show the helper ignores it; the input is always one date. |
| input content | fixed at "a date far in the future" | A valid value of the expected kind; the failure path (an invalid value) is cheaper because it exits early and is not what startup normally does. |
| composition | fixed at "used alone" | Wrapping in `all`, `any`, `optional` or `not` adds a constant per wrapper and is measured in the combinator entries. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**Deliberately not covered**

- **locale and timezone** -- The helper's cost does not depend on the process locale or timezone for the inputs measured.

**Measured: O(1)** (exponent -0.00, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.271 µs | 0.303 µs | 0.276 µs | 417 B | 3,695,583 |
| 40 | 0.273 µs | 0.302 µs | 0.279 µs | 417 B | 3,658,922 |
| 80 | 0.273 µs | 0.304 µs | 0.278 µs | 417 B | 3,660,731 |
| 160 | 0.271 µs | 0.311 µs | 0.276 µs | 417 B | 3,694,132 |
| 320 | 0.274 µs | 0.310 µs | 0.279 µs | 417 B | 3,655,978 |
| 640 | 0.272 µs | 0.298 µs | 0.278 µs | 417 B | 3,671,708 |
| 1280 | 0.270 µs | 0.310 µs | 0.277 µs | 417 B | 3,706,840 |
| 2560 | 0.274 µs | 0.297 µs | 0.277 µs | 417 B | 3,655,711 |
| 5120 | 0.271 µs | 0.297 µs | 0.274 µs | 417 B | 3,689,290 |
| 10240 | 0.272 µs | 0.310 µs | 0.276 µs | 417 B | 3,679,519 |

### `validators.includes(text)`

**Why we benchmark it.** Requires a value to contain a fixed substring. It runs once for every variable that declares it, at startup, on every process and every deploy, so its per-value cost is multiplied by the number of variables using it.

**What poor performance would mean.** Startup and cold-start time grow with every variable that uses validators.includes(text), and with the size of the values it handles (a large secret, certificate or list). On serverless platforms that delay is billed on every scale-from-zero event, and a regression here is paid by every service that adopts the helper.

**Expected growth: O(n).** A substring search scans the string, so cost follows its length.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| input size | swept | Length of the string, in characters. |
| input content | fixed at "a long string that contains the substring at the end" | A valid value of the expected kind; the failure path (an invalid value) is cheaper because it exits early and is not what startup normally does. |
| composition | fixed at "used alone" | Wrapping in `all`, `any`, `optional` or `not` adds a constant per wrapper and is measured in the combinator entries. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**Deliberately not covered**

- **locale and timezone** -- The helper's cost does not depend on the process locale or timezone for the inputs measured.

**Measured: O(1)** (exponent 0.07, 10 sizes) -- ⚠️ differs.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.0889 µs | 0.123 µs | 0.0932 µs | 305 B | 11,251,869 |
| 40 | 0.0894 µs | 0.124 µs | 0.0932 µs | 305 B | 11,186,425 |
| 80 | 0.0890 µs | 0.106 µs | 0.0913 µs | 305 B | 11,240,408 |
| 160 | 0.0909 µs | 0.125 µs | 0.0938 µs | 305 B | 11,005,493 |
| 320 | 0.0923 µs | 0.128 µs | 0.0958 µs | 305 B | 10,833,503 |
| 640 | 0.0951 µs | 0.129 µs | 0.0990 µs | 305 B | 10,511,417 |
| 1280 | 0.103 µs | 0.140 µs | 0.106 µs | 305 B | 9,693,958 |
| 2560 | 0.109 µs | 0.147 µs | 0.113 µs | 305 B | 9,200,700 |
| 5120 | 0.121 µs | 0.166 µs | 0.125 µs | 305 B | 8,239,114 |
| 10240 | 0.146 µs | 0.196 µs | 0.151 µs | 305 B | 6,857,225 |

### `validators.integer()`

**Why we benchmark it.** Requires a number to be a whole number. It runs once for every variable that declares it, at startup, on every process and every deploy, so its per-value cost is multiplied by the number of variables using it.

**What poor performance would mean.** Startup and cold-start time grow with every variable that uses validators.integer(). On serverless platforms that delay is billed on every scale-from-zero event, and a regression here is paid by every service that adopts the helper.

**Expected growth: O(1).** It checks one number.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| input size | swept | Varied only to show the helper ignores it; the input is always one number. |
| input content | fixed at "the number 42" | A valid value of the expected kind; the failure path (an invalid value) is cheaper because it exits early and is not what startup normally does. |
| composition | fixed at "used alone" | Wrapping in `all`, `any`, `optional` or `not` adds a constant per wrapper and is measured in the combinator entries. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**Deliberately not covered**

- **locale and timezone** -- The helper's cost does not depend on the process locale or timezone for the inputs measured.

**Measured: O(1)** (exponent -0.00, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.0715 µs | 0.0966 µs | 0.0738 µs | 305 B | 13,986,014 |
| 40 | 0.0707 µs | 0.101 µs | 0.0734 µs | 305 B | 14,135,824 |
| 80 | 0.0696 µs | 0.0835 µs | 0.0719 µs | 304 B | 14,365,604 |
| 160 | 0.0708 µs | 0.0741 µs | 0.0744 µs | 305 B | 14,118,115 |
| 320 | 0.0694 µs | 0.0950 µs | 0.0712 µs | 304 B | 14,410,752 |
| 640 | 0.0698 µs | 0.0848 µs | 0.0719 µs | 304 B | 14,329,600 |
| 1280 | 0.0713 µs | 0.0873 µs | 0.0756 µs | 305 B | 14,030,728 |
| 2560 | 0.0700 µs | 0.0844 µs | 0.0726 µs | 304 B | 14,294,185 |
| 5120 | 0.0692 µs | 0.0849 µs | 0.0713 µs | 304 B | 14,445,067 |
| 10240 | 0.0720 µs | 0.0884 µs | 0.0751 µs | 304 B | 13,894,257 |

### `validators.length(n)`

**Why we benchmark it.** Requires a string to have an exact length (a fixed-width token). It runs once for every variable that declares it, at startup, on every process and every deploy, so its per-value cost is multiplied by the number of variables using it.

**What poor performance would mean.** Startup and cold-start time grow with every variable that uses validators.length(n). On serverless platforms that delay is billed on every scale-from-zero event, and a regression here is paid by every service that adopts the helper.

**Expected growth: O(1).** A string's length is stored, so reading it costs the same for any string.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| input size | swept | Varied only to show the helper ignores it; the input is always a five-character string. |
| input content | fixed at "a five-character string" | A valid value of the expected kind; the failure path (an invalid value) is cheaper because it exits early and is not what startup normally does. |
| composition | fixed at "used alone" | Wrapping in `all`, `any`, `optional` or `not` adds a constant per wrapper and is measured in the combinator entries. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**Deliberately not covered**

- **locale and timezone** -- The helper's cost does not depend on the process locale or timezone for the inputs measured.

**Measured: O(1)** (exponent 0.00, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.0715 µs | 0.0903 µs | 0.0738 µs | 305 B | 13,993,003 |
| 40 | 0.0697 µs | 0.0868 µs | 0.0723 µs | 304 B | 14,338,419 |
| 80 | 0.0704 µs | 0.0884 µs | 0.0739 µs | 305 B | 14,213,028 |
| 160 | 0.0711 µs | 0.0915 µs | 0.0756 µs | 305 B | 14,056,286 |
| 320 | 0.0695 µs | 0.0932 µs | 0.0715 µs | 304 B | 14,379,488 |
| 640 | 0.0702 µs | 0.0865 µs | 0.0729 µs | 305 B | 14,247,448 |
| 1280 | 0.0740 µs | 0.0904 µs | 0.0772 µs | 304 B | 13,521,807 |
| 2560 | 0.0701 µs | 0.0874 µs | 0.0724 µs | 304 B | 14,270,077 |
| 5120 | 0.0701 µs | 0.0816 µs | 0.0720 µs | 304 B | 14,271,270 |
| 10240 | 0.0706 µs | 0.0916 µs | 0.0733 µs | 305 B | 14,156,365 |

### `validators.matches(regex)`

**Why we benchmark it.** Requires a value to match a pattern (a naming convention). It runs once for every variable that declares it, at startup, on every process and every deploy, so its per-value cost is multiplied by the number of variables using it.

**What poor performance would mean.** Startup and cold-start time grow with every variable that uses validators.matches(regex), and with the size of the values it handles (a large secret, certificate or list). On serverless platforms that delay is billed on every scale-from-zero event, and a regression here is paid by every service that adopts the helper.

**Expected growth: O(n).** A simple anchored character-class pattern examines each character once, so cost follows the length of the input.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| input size | swept | Length of the string, in characters. |
| input content | fixed at "a long run of lower-case letters" | A valid value of the expected kind; the failure path (an invalid value) is cheaper because it exits early and is not what startup normally does. |
| composition | fixed at "used alone" | Wrapping in `all`, `any`, `optional` or `not` adds a constant per wrapper and is measured in the combinator entries. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**Deliberately not covered**

- **locale and timezone** -- The helper's cost does not depend on the process locale or timezone for the inputs measured.

**Measured: O(log n)** (exponent 0.50, 10 sizes) -- 🟡 close (neighbouring class).

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.177 µs | 0.229 µs | 0.250 µs | 317 B | 5,637,773 |
| 40 | 0.184 µs | 0.217 µs | 0.240 µs | 317 B | 5,426,525 |
| 80 | 0.214 µs | 0.578 µs | 0.280 µs | 317 B | 4,665,920 |
| 160 | 0.264 µs | 0.290 µs | 0.308 µs | 316 B | 3,784,571 |
| 320 | 0.378 µs | 0.456 µs | 0.450 µs | 320 B | 2,644,803 |
| 640 | 0.498 µs | 0.647 µs | 0.541 µs | 313 B | 2,009,996 |
| 1280 | 0.845 µs | 1.02 µs | 1.78 µs | 305 B | 1,183,167 |
| 2560 | 1.29 µs | 1.61 µs | 4.68 µs | 305 B | 775,777 |
| 5120 | 2.00 µs | 2.12 µs | 6.08 µs | 305 B | 499,542 |
| 10240 | 3.76 µs | 4.08 µs | 10.9 µs | 307 B | 266,125 |

### `validators.max(limit)`

**Why we benchmark it.** Caps a number (a pool size). It runs once for every variable that declares it, at startup, on every process and every deploy, so its per-value cost is multiplied by the number of variables using it.

**What poor performance would mean.** Startup and cold-start time grow with every variable that uses validators.max(limit). On serverless platforms that delay is billed on every scale-from-zero event, and a regression here is paid by every service that adopts the helper.

**Expected growth: O(1).** It compares two numbers.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| input size | swept | Varied only to show the helper ignores it; the input is always one number. |
| input content | fixed at "a number under the cap" | A valid value of the expected kind; the failure path (an invalid value) is cheaper because it exits early and is not what startup normally does. |
| composition | fixed at "used alone" | Wrapping in `all`, `any`, `optional` or `not` adds a constant per wrapper and is measured in the combinator entries. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**Deliberately not covered**

- **locale and timezone** -- The helper's cost does not depend on the process locale or timezone for the inputs measured.

**Measured: O(1)** (exponent 0.00, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.0700 µs | 0.0806 µs | 0.0724 µs | 304 B | 14,290,124 |
| 40 | 0.0698 µs | 0.0808 µs | 0.0721 µs | 304 B | 14,331,117 |
| 80 | 0.0702 µs | 0.0816 µs | 0.0716 µs | 304 B | 14,250,961 |
| 160 | 0.0695 µs | 0.0829 µs | 0.0726 µs | 304 B | 14,395,393 |
| 320 | 0.0700 µs | 0.0803 µs | 0.0713 µs | 304 B | 14,295,197 |
| 640 | 0.0703 µs | 0.0761 µs | 0.0736 µs | 305 B | 14,221,315 |
| 1280 | 0.0707 µs | 0.0844 µs | 0.0730 µs | 304 B | 14,148,366 |
| 2560 | 0.0699 µs | 0.0803 µs | 0.0712 µs | 304 B | 14,308,497 |
| 5120 | 0.0714 µs | 0.0806 µs | 0.0737 µs | 304 B | 14,007,547 |
| 10240 | 0.0707 µs | 0.0796 µs | 0.0734 µs | 305 B | 14,135,626 |

### `validators.maxItems(limit)`

**Why we benchmark it.** Caps the length of a list variable. It runs once for every variable that declares it, at startup, on every process and every deploy, so its per-value cost is multiplied by the number of variables using it.

**What poor performance would mean.** Startup and cold-start time grow with every variable that uses validators.maxItems(limit). On serverless platforms that delay is billed on every scale-from-zero event, and a regression here is paid by every service that adopts the helper.

**Expected growth: O(1).** An array's length is stored, so checking it costs the same for any array.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| input size | swept | Length of the array; the check only reads the stored length. |
| input content | fixed at "a short array" | A valid value of the expected kind; the failure path (an invalid value) is cheaper because it exits early and is not what startup normally does. |
| composition | fixed at "used alone" | Wrapping in `all`, `any`, `optional` or `not` adds a constant per wrapper and is measured in the combinator entries. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**Deliberately not covered**

- **locale and timezone** -- The helper's cost does not depend on the process locale or timezone for the inputs measured.

**Measured: O(1)** (exponent 0.00, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.0694 µs | 0.0866 µs | 0.0722 µs | 304 B | 14,415,830 |
| 40 | 0.0698 µs | 0.0856 µs | 0.0716 µs | 304 B | 14,327,008 |
| 80 | 0.0695 µs | 0.0898 µs | 0.0720 µs | 304 B | 14,397,215 |
| 160 | 0.0713 µs | 0.0905 µs | 0.0752 µs | 305 B | 14,034,347 |
| 320 | 0.0713 µs | 0.0907 µs | 0.0735 µs | 304 B | 14,021,618 |
| 640 | 0.0709 µs | 0.0932 µs | 0.0746 µs | 305 B | 14,113,699 |
| 1280 | 0.0700 µs | 0.0867 µs | 0.0730 µs | 305 B | 14,288,130 |
| 2560 | 0.0696 µs | 0.0866 µs | 0.0720 µs | 304 B | 14,364,664 |
| 5120 | 0.0697 µs | 0.0867 µs | 0.0716 µs | 304 B | 14,348,045 |
| 10240 | 0.0699 µs | 0.0769 µs | 0.0713 µs | 304 B | 14,301,908 |

### `validators.maxLength(limit)`

**Why we benchmark it.** Caps the length of a string. It runs once for every variable that declares it, at startup, on every process and every deploy, so its per-value cost is multiplied by the number of variables using it.

**What poor performance would mean.** Startup and cold-start time grow with every variable that uses validators.maxLength(limit). On serverless platforms that delay is billed on every scale-from-zero event, and a regression here is paid by every service that adopts the helper.

**Expected growth: O(1).** A string's length is stored, so checking it costs the same for any string.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| input size | swept | Length of the string; the check only reads the stored length. |
| input content | fixed at "a string within the cap" | A valid value of the expected kind; the failure path (an invalid value) is cheaper because it exits early and is not what startup normally does. |
| composition | fixed at "used alone" | Wrapping in `all`, `any`, `optional` or `not` adds a constant per wrapper and is measured in the combinator entries. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**Deliberately not covered**

- **locale and timezone** -- The helper's cost does not depend on the process locale or timezone for the inputs measured.

**Measured: O(1)** (exponent -0.00, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.0703 µs | 0.0929 µs | 0.0737 µs | 305 B | 14,232,162 |
| 40 | 0.0712 µs | 0.0896 µs | 0.0739 µs | 305 B | 14,039,970 |
| 80 | 0.0698 µs | 0.0861 µs | 0.0718 µs | 304 B | 14,323,586 |
| 160 | 0.0703 µs | 0.0888 µs | 0.0735 µs | 305 B | 14,223,099 |
| 320 | 0.0700 µs | 0.0867 µs | 0.0717 µs | 304 B | 14,279,968 |
| 640 | 0.0699 µs | 0.0877 µs | 0.0728 µs | 304 B | 14,309,764 |
| 1280 | 0.0697 µs | 0.0869 µs | 0.0708 µs | 304 B | 14,341,750 |
| 2560 | 0.0698 µs | 0.0871 µs | 0.0714 µs | 304 B | 14,326,455 |
| 5120 | 0.0706 µs | 0.0893 µs | 0.0726 µs | 305 B | 14,158,276 |
| 10240 | 0.0702 µs | 0.0866 µs | 0.0731 µs | 305 B | 14,254,256 |

### `validators.min(limit)`

**Why we benchmark it.** Sets a floor for a number. It runs once for every variable that declares it, at startup, on every process and every deploy, so its per-value cost is multiplied by the number of variables using it.

**What poor performance would mean.** Startup and cold-start time grow with every variable that uses validators.min(limit). On serverless platforms that delay is billed on every scale-from-zero event, and a regression here is paid by every service that adopts the helper.

**Expected growth: O(1).** It compares two numbers.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| input size | swept | Varied only to show the helper ignores it; the input is always one number. |
| input content | fixed at "a number above the floor" | A valid value of the expected kind; the failure path (an invalid value) is cheaper because it exits early and is not what startup normally does. |
| composition | fixed at "used alone" | Wrapping in `all`, `any`, `optional` or `not` adds a constant per wrapper and is measured in the combinator entries. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**Deliberately not covered**

- **locale and timezone** -- The helper's cost does not depend on the process locale or timezone for the inputs measured.

**Measured: O(1)** (exponent 0.00, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.0695 µs | 0.0801 µs | 0.0710 µs | 304 B | 14,378,271 |
| 40 | 0.0697 µs | 0.0797 µs | 0.0715 µs | 304 B | 14,354,207 |
| 80 | 0.0696 µs | 0.0848 µs | 0.0727 µs | 305 B | 14,359,892 |
| 160 | 0.0698 µs | 0.0780 µs | 0.0713 µs | 304 B | 14,328,961 |
| 320 | 0.0695 µs | 0.0836 µs | 0.0713 µs | 304 B | 14,379,833 |
| 640 | 0.0701 µs | 0.0871 µs | 0.0722 µs | 305 B | 14,274,943 |
| 1280 | 0.0697 µs | 0.0844 µs | 0.0715 µs | 304 B | 14,349,424 |
| 2560 | 0.0703 µs | 0.0811 µs | 0.0718 µs | 304 B | 14,222,778 |
| 5120 | 0.0697 µs | 0.0765 µs | 0.0719 µs | 305 B | 14,342,935 |
| 10240 | 0.0699 µs | 0.0804 µs | 0.0720 µs | 304 B | 14,299,713 |

### `validators.minItems(limit)`

**Why we benchmark it.** Requires a list variable to have at least some entries. It runs once for every variable that declares it, at startup, on every process and every deploy, so its per-value cost is multiplied by the number of variables using it.

**What poor performance would mean.** Startup and cold-start time grow with every variable that uses validators.minItems(limit). On serverless platforms that delay is billed on every scale-from-zero event, and a regression here is paid by every service that adopts the helper.

**Expected growth: O(1).** An array's length is stored, so checking it costs the same for any array.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| input size | swept | Length of the array; the check only reads the stored length. |
| input content | fixed at "an array above the floor" | A valid value of the expected kind; the failure path (an invalid value) is cheaper because it exits early and is not what startup normally does. |
| composition | fixed at "used alone" | Wrapping in `all`, `any`, `optional` or `not` adds a constant per wrapper and is measured in the combinator entries. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**Deliberately not covered**

- **locale and timezone** -- The helper's cost does not depend on the process locale or timezone for the inputs measured.

**Measured: O(1)** (exponent -0.00, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.0702 µs | 0.0871 µs | 0.0729 µs | 304 B | 14,254,774 |
| 40 | 0.0692 µs | 0.0863 µs | 0.0714 µs | 304 B | 14,441,974 |
| 80 | 0.0703 µs | 0.0887 µs | 0.0729 µs | 305 B | 14,219,851 |
| 160 | 0.0715 µs | 0.0908 µs | 0.0738 µs | 305 B | 13,990,142 |
| 320 | 0.0712 µs | 0.0914 µs | 0.0756 µs | 305 B | 14,041,000 |
| 640 | 0.0709 µs | 0.0905 µs | 0.0727 µs | 305 B | 14,097,635 |
| 1280 | 0.0732 µs | 0.0863 µs | 0.0756 µs | 304 B | 13,657,056 |
| 2560 | 0.0703 µs | 0.0885 µs | 0.0727 µs | 305 B | 14,222,091 |
| 5120 | 0.0690 µs | 0.0840 µs | 0.0721 µs | 304 B | 14,495,534 |
| 10240 | 0.0695 µs | 0.0818 µs | 0.0716 µs | 304 B | 14,387,581 |

### `validators.minLength(limit)`

**Why we benchmark it.** Requires a string to be at least some length (a minimum secret length). It runs once for every variable that declares it, at startup, on every process and every deploy, so its per-value cost is multiplied by the number of variables using it.

**What poor performance would mean.** Startup and cold-start time grow with every variable that uses validators.minLength(limit). On serverless platforms that delay is billed on every scale-from-zero event, and a regression here is paid by every service that adopts the helper.

**Expected growth: O(1).** A string's length is stored, so checking it costs the same for any string.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| input size | swept | Length of the string; the check only reads the stored length. |
| input content | fixed at "a string above the floor" | A valid value of the expected kind; the failure path (an invalid value) is cheaper because it exits early and is not what startup normally does. |
| composition | fixed at "used alone" | Wrapping in `all`, `any`, `optional` or `not` adds a constant per wrapper and is measured in the combinator entries. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**Deliberately not covered**

- **locale and timezone** -- The helper's cost does not depend on the process locale or timezone for the inputs measured.

**Measured: O(1)** (exponent 0.01, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.0715 µs | 0.0921 µs | 0.0756 µs | 305 B | 13,976,955 |
| 40 | 0.0733 µs | 0.0916 µs | 0.0772 µs | 305 B | 13,639,064 |
| 80 | 0.0709 µs | 0.0888 µs | 0.0732 µs | 304 B | 14,108,385 |
| 160 | 0.0709 µs | 0.0896 µs | 0.0732 µs | 305 B | 14,100,249 |
| 320 | 0.0707 µs | 0.0932 µs | 0.0733 µs | 305 B | 14,135,027 |
| 640 | 0.0698 µs | 0.0831 µs | 0.0715 µs | 304 B | 14,336,049 |
| 1280 | 0.119 µs | 0.132 µs | 0.150 µs | 312 B | 8,406,894 |
| 2560 | 0.0696 µs | 0.0831 µs | 0.0710 µs | 304 B | 14,374,350 |
| 5120 | 0.0711 µs | 0.0887 µs | 0.0734 µs | 305 B | 14,069,970 |
| 10240 | 0.0715 µs | 0.0885 µs | 0.0736 µs | 304 B | 13,982,982 |

### `validators.negative()`

**Why we benchmark it.** Requires a number to be below zero. It runs once for every variable that declares it, at startup, on every process and every deploy, so its per-value cost is multiplied by the number of variables using it.

**What poor performance would mean.** Startup and cold-start time grow with every variable that uses validators.negative(). On serverless platforms that delay is billed on every scale-from-zero event, and a regression here is paid by every service that adopts the helper.

**Expected growth: O(1).** It compares one number with zero.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| input size | swept | Varied only to show the helper ignores it; the input is always one number. |
| input content | fixed at "a negative number" | A valid value of the expected kind; the failure path (an invalid value) is cheaper because it exits early and is not what startup normally does. |
| composition | fixed at "used alone" | Wrapping in `all`, `any`, `optional` or `not` adds a constant per wrapper and is measured in the combinator entries. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**Deliberately not covered**

- **locale and timezone** -- The helper's cost does not depend on the process locale or timezone for the inputs measured.

**Measured: O(1)** (exponent 0.00, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.0699 µs | 0.0862 µs | 0.0726 µs | 305 B | 14,297,848 |
| 40 | 0.0691 µs | 0.0831 µs | 0.0713 µs | 304 B | 14,466,166 |
| 80 | 0.0703 µs | 0.0833 µs | 0.0720 µs | 304 B | 14,225,970 |
| 160 | 0.0707 µs | 0.0851 µs | 0.0739 µs | 305 B | 14,143,391 |
| 320 | 0.0703 µs | 0.0840 µs | 0.0727 µs | 304 B | 14,216,900 |
| 640 | 0.0705 µs | 0.0830 µs | 0.0724 µs | 304 B | 14,189,384 |
| 1280 | 0.0711 µs | 0.0830 µs | 0.0737 µs | 304 B | 14,062,205 |
| 2560 | 0.0709 µs | 0.0878 µs | 0.0738 µs | 305 B | 14,107,656 |
| 5120 | 0.0706 µs | 0.0994 µs | 0.0739 µs | 305 B | 14,154,913 |
| 10240 | 0.0702 µs | 0.0840 µs | 0.0730 µs | 304 B | 14,239,258 |

### `validators.not(validator)`

**Why we benchmark it.** Inverts another validator (forbid a reserved value). It runs once for every variable that declares it, at startup, on every process and every deploy, so its per-value cost is multiplied by the number of variables using it.

**What poor performance would mean.** Startup and cold-start time grow with every variable that uses validators.not(validator). On serverless platforms that delay is billed on every scale-from-zero event, and a regression here is paid by every service that adopts the helper.

**Expected growth: O(1).** It runs the one inner validator and flips its result.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| input size | swept | Varied only to show the wrapper ignores it; the inner check is a single comparison. |
| input content | fixed at "a value the inner validator rejects" | A valid value of the expected kind; the failure path (an invalid value) is cheaper because it exits early and is not what startup normally does. |
| composition | fixed at "used alone" | Wrapping in `all`, `any`, `optional` or `not` adds a constant per wrapper and is measured in the combinator entries. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**Deliberately not covered**

- **locale and timezone** -- The helper's cost does not depend on the process locale or timezone for the inputs measured.

**Measured: O(1)** (exponent 0.00, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.0705 µs | 0.117 µs | 0.0726 µs | 305 B | 14,174,611 |
| 40 | 0.0725 µs | 0.142 µs | 0.0771 µs | 305 B | 13,785,086 |
| 80 | 0.0705 µs | 0.0863 µs | 0.0726 µs | 305 B | 14,178,168 |
| 160 | 0.0709 µs | 0.109 µs | 0.0746 µs | 305 B | 14,096,698 |
| 320 | 0.0715 µs | 0.118 µs | 0.0753 µs | 305 B | 13,979,707 |
| 640 | 0.0850 µs | 0.0933 µs | 0.105 µs | 308 B | 11,766,527 |
| 1280 | 0.0715 µs | 0.0964 µs | 0.0757 µs | 305 B | 13,978,088 |
| 2560 | 0.0706 µs | 0.0865 µs | 0.0728 µs | 305 B | 14,161,455 |
| 5120 | 0.0710 µs | 0.116 µs | 0.0739 µs | 305 B | 14,083,077 |
| 10240 | 0.0707 µs | 0.111 µs | 0.0728 µs | 305 B | 14,145,981 |

### `validators.oneOf(options)`

**Why we benchmark it.** Restricts a variable to a fixed set of allowed values (an environment name). It runs once for every variable that declares it, at startup, on every process and every deploy, so its per-value cost is multiplied by the number of variables using it.

**What poor performance would mean.** Startup and cold-start time grow with every variable that uses validators.oneOf(options), and with the size of the values it handles (a large secret, certificate or list). On serverless platforms that delay is billed on every scale-from-zero event, and a regression here is paid by every service that adopts the helper.

**Expected growth: O(n).** It searches the allowed values for a match, so with the matching option last, cost is proportional to how many options there are.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| input size | swept | Number of allowed options; the input matches the last one. |
| input content | fixed at "the final option of the list" | A valid value of the expected kind; the failure path (an invalid value) is cheaper because it exits early and is not what startup normally does. |
| composition | fixed at "used alone" | Wrapping in `all`, `any`, `optional` or `not` adds a constant per wrapper and is measured in the combinator entries. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**Deliberately not covered**

- **locale and timezone** -- The helper's cost does not depend on the process locale or timezone for the inputs measured.

**Measured: O(n)** (exponent 0.76, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.114 µs | 0.144 µs | 0.118 µs | 305 B | 8,743,806 |
| 40 | 0.174 µs | 0.212 µs | 0.178 µs | 305 B | 5,745,548 |
| 80 | 0.301 µs | 0.325 µs | 0.305 µs | 305 B | 3,320,873 |
| 160 | 0.357 µs | 0.398 µs | 0.361 µs | 305 B | 2,800,162 |
| 320 | 0.781 µs | 0.825 µs | 2.94 µs | 305 B | 1,280,882 |
| 640 | 1.45 µs | 1.74 µs | 4.50 µs | 305 B | 687,644 |
| 1280 | 1.69 µs | 1.74 µs | 5.12 µs | 305 B | 592,690 |
| 2560 | 4.27 µs | 4.52 µs | 11.0 µs | 306 B | 234,264 |
| 5120 | 9.88 µs | 10.1 µs | 24.9 µs | 309 B | 101,215 |
| 10240 | 10.2 µs | 10.5 µs | 23.4 µs | 308 B | 98,314 |

### `validators.optional(validator)`

**Why we benchmark it.** Allows a variable to be absent while still validating it when present. It runs once for every variable that declares it, at startup, on every process and every deploy, so its per-value cost is multiplied by the number of variables using it.

**What poor performance would mean.** Startup and cold-start time grow with every variable that uses validators.optional(validator). On serverless platforms that delay is billed on every scale-from-zero event, and a regression here is paid by every service that adopts the helper.

**Expected growth: O(1).** It checks for absence and otherwise forwards to the one inner validator.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| input size | swept | Varied only to show the wrapper ignores it; the inner check is a single comparison. |
| input content | fixed at "a present value the inner validator accepts" | A valid value of the expected kind; the failure path (an invalid value) is cheaper because it exits early and is not what startup normally does. |
| composition | fixed at "used alone" | Wrapping in `all`, `any`, `optional` or `not` adds a constant per wrapper and is measured in the combinator entries. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**Deliberately not covered**

- **locale and timezone** -- The helper's cost does not depend on the process locale or timezone for the inputs measured.

**Measured: O(1)** (exponent 0.00, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.0715 µs | 0.103 µs | 0.0745 µs | 305 B | 13,981,462 |
| 40 | 0.0704 µs | 0.0839 µs | 0.0728 µs | 304 B | 14,211,528 |
| 80 | 0.0708 µs | 0.0980 µs | 0.0732 µs | 305 B | 14,129,053 |
| 160 | 0.0707 µs | 0.0963 µs | 0.0724 µs | 304 B | 14,145,130 |
| 320 | 0.0708 µs | 0.0946 µs | 0.0735 µs | 304 B | 14,124,022 |
| 640 | 0.0705 µs | 0.0900 µs | 0.0719 µs | 304 B | 14,185,871 |
| 1280 | 0.0728 µs | 0.0996 µs | 0.0771 µs | 305 B | 13,734,486 |
| 2560 | 0.0704 µs | 0.0965 µs | 0.0718 µs | 304 B | 14,202,483 |
| 5120 | 0.0709 µs | 0.0960 µs | 0.0735 µs | 304 B | 14,113,174 |
| 10240 | 0.0709 µs | 0.100 µs | 0.0737 µs | 305 B | 14,109,347 |

### `validators.past()`

**Why we benchmark it.** Requires a date to already have happened. It runs once for every variable that declares it, at startup, on every process and every deploy, so its per-value cost is multiplied by the number of variables using it.

**What poor performance would mean.** Startup and cold-start time grow with every variable that uses validators.past(). On serverless platforms that delay is billed on every scale-from-zero event, and a regression here is paid by every service that adopts the helper.

**Expected growth: O(1).** It compares one timestamp with the current time.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| input size | swept | Varied only to show the helper ignores it; the input is always one date. |
| input content | fixed at "a date in the past" | A valid value of the expected kind; the failure path (an invalid value) is cheaper because it exits early and is not what startup normally does. |
| composition | fixed at "used alone" | Wrapping in `all`, `any`, `optional` or `not` adds a constant per wrapper and is measured in the combinator entries. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**Deliberately not covered**

- **locale and timezone** -- The helper's cost does not depend on the process locale or timezone for the inputs measured.

**Measured: O(1)** (exponent -0.00, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.277 µs | 0.323 µs | 0.284 µs | 418 B | 3,611,578 |
| 40 | 0.275 µs | 0.306 µs | 0.279 µs | 417 B | 3,633,686 |
| 80 | 0.280 µs | 0.308 µs | 0.284 µs | 417 B | 3,574,530 |
| 160 | 0.279 µs | 0.316 µs | 0.282 µs | 417 B | 3,586,006 |
| 320 | 0.273 µs | 0.293 µs | 0.278 µs | 417 B | 3,660,503 |
| 640 | 0.274 µs | 0.296 µs | 0.278 µs | 417 B | 3,645,479 |
| 1280 | 0.273 µs | 0.310 µs | 0.278 µs | 417 B | 3,659,560 |
| 2560 | 0.279 µs | 0.315 µs | 0.285 µs | 417 B | 3,584,271 |
| 5120 | 0.276 µs | 0.299 µs | 0.281 µs | 417 B | 3,628,384 |
| 10240 | 0.275 µs | 0.299 µs | 0.280 µs | 417 B | 3,642,050 |

### `validators.positive()`

**Why we benchmark it.** Requires a number to be above zero. It runs once for every variable that declares it, at startup, on every process and every deploy, so its per-value cost is multiplied by the number of variables using it.

**What poor performance would mean.** Startup and cold-start time grow with every variable that uses validators.positive(). On serverless platforms that delay is billed on every scale-from-zero event, and a regression here is paid by every service that adopts the helper.

**Expected growth: O(1).** It compares one number with zero.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| input size | swept | Varied only to show the helper ignores it; the input is always one number. |
| input content | fixed at "a positive number" | A valid value of the expected kind; the failure path (an invalid value) is cheaper because it exits early and is not what startup normally does. |
| composition | fixed at "used alone" | Wrapping in `all`, `any`, `optional` or `not` adds a constant per wrapper and is measured in the combinator entries. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**Deliberately not covered**

- **locale and timezone** -- The helper's cost does not depend on the process locale or timezone for the inputs measured.

**Measured: O(1)** (exponent 0.00, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.0709 µs | 0.0855 µs | 0.0726 µs | 304 B | 14,103,306 |
| 40 | 0.0705 µs | 0.0811 µs | 0.0724 µs | 304 B | 14,193,051 |
| 80 | 0.0704 µs | 0.0868 µs | 0.0725 µs | 305 B | 14,194,610 |
| 160 | 0.0704 µs | 0.0834 µs | 0.0730 µs | 304 B | 14,200,379 |
| 320 | 0.0715 µs | 0.0880 µs | 0.0731 µs | 305 B | 13,978,699 |
| 640 | 0.0708 µs | 0.0863 µs | 0.0730 µs | 304 B | 14,125,103 |
| 1280 | 0.0706 µs | 0.0892 µs | 0.0740 µs | 305 B | 14,155,083 |
| 2560 | 0.0717 µs | 0.0850 µs | 0.0730 µs | 304 B | 13,947,923 |
| 5120 | 0.0706 µs | 0.0867 µs | 0.0726 µs | 304 B | 14,163,723 |
| 10240 | 0.0722 µs | 0.0838 µs | 0.0737 µs | 304 B | 13,844,422 |

### `validators.range(min, max)`

**Why we benchmark it.** Requires a number to fall between two bounds (a port range). It runs once for every variable that declares it, at startup, on every process and every deploy, so its per-value cost is multiplied by the number of variables using it.

**What poor performance would mean.** Startup and cold-start time grow with every variable that uses validators.range(min, max). On serverless platforms that delay is billed on every scale-from-zero event, and a regression here is paid by every service that adopts the helper.

**Expected growth: O(1).** It compares one number with two bounds.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| input size | swept | Varied only to show the helper ignores it; the input is always one number. |
| input content | fixed at "a number inside the range" | A valid value of the expected kind; the failure path (an invalid value) is cheaper because it exits early and is not what startup normally does. |
| composition | fixed at "used alone" | Wrapping in `all`, `any`, `optional` or `not` adds a constant per wrapper and is measured in the combinator entries. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**Deliberately not covered**

- **locale and timezone** -- The helper's cost does not depend on the process locale or timezone for the inputs measured.

**Measured: O(1)** (exponent -0.00, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.0734 µs | 0.0895 µs | 0.0779 µs | 305 B | 13,625,956 |
| 40 | 0.0709 µs | 0.0826 µs | 0.0732 µs | 304 B | 14,109,612 |
| 80 | 0.0703 µs | 0.0817 µs | 0.0724 µs | 304 B | 14,215,270 |
| 160 | 0.0707 µs | 0.0881 µs | 0.0729 µs | 305 B | 14,147,997 |
| 320 | 0.0730 µs | 0.0851 µs | 0.0757 µs | 304 B | 13,707,716 |
| 640 | 0.0706 µs | 0.0841 µs | 0.0728 µs | 304 B | 14,166,759 |
| 1280 | 0.0706 µs | 0.0826 µs | 0.0727 µs | 304 B | 14,167,750 |
| 2560 | 0.0710 µs | 0.0869 µs | 0.0733 µs | 305 B | 14,076,156 |
| 5120 | 0.0706 µs | 0.0801 µs | 0.0722 µs | 304 B | 14,155,831 |
| 10240 | 0.0707 µs | 0.0833 µs | 0.0739 µs | 305 B | 14,144,091 |

### `validators.refine(validator, message)`

**Why we benchmark it.** Attaches a custom failure message to another validator. It runs once for every variable that declares it, at startup, on every process and every deploy, so its per-value cost is multiplied by the number of variables using it.

**What poor performance would mean.** Startup and cold-start time grow with every variable that uses validators.refine(validator, message). On serverless platforms that delay is billed on every scale-from-zero event, and a regression here is paid by every service that adopts the helper.

**Expected growth: O(1).** It runs the one inner validator and substitutes the message on failure.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| input size | swept | Varied only to show the wrapper ignores it; the inner check is a single comparison. |
| input content | fixed at "a value the inner validator accepts" | A valid value of the expected kind; the failure path (an invalid value) is cheaper because it exits early and is not what startup normally does. |
| composition | fixed at "used alone" | Wrapping in `all`, `any`, `optional` or `not` adds a constant per wrapper and is measured in the combinator entries. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**Deliberately not covered**

- **locale and timezone** -- The helper's cost does not depend on the process locale or timezone for the inputs measured.

**Measured: O(1)** (exponent -0.00, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.0701 µs | 0.115 µs | 0.0717 µs | 305 B | 14,267,539 |
| 40 | 0.0713 µs | 0.0868 µs | 0.0730 µs | 304 B | 14,028,266 |
| 80 | 0.0726 µs | 0.101 µs | 0.0767 µs | 305 B | 13,783,382 |
| 160 | 0.0709 µs | 0.0998 µs | 0.0739 µs | 305 B | 14,101,865 |
| 320 | 0.0714 µs | 0.0861 µs | 0.0735 µs | 304 B | 14,013,973 |
| 640 | 0.0722 µs | 0.102 µs | 0.0750 µs | 305 B | 13,859,141 |
| 1280 | 0.0713 µs | 0.101 µs | 0.0735 µs | 305 B | 14,017,684 |
| 2560 | 0.0710 µs | 0.0987 µs | 0.0739 µs | 305 B | 14,085,810 |
| 5120 | 0.0714 µs | 0.0914 µs | 0.0738 µs | 305 B | 13,998,405 |
| 10240 | 0.0706 µs | 0.0880 µs | 0.0728 µs | 305 B | 14,171,357 |

### `validators.required()`

**Why we benchmark it.** Requires a variable to be present and non-empty. It runs once for every variable that declares it, at startup, on every process and every deploy, so its per-value cost is multiplied by the number of variables using it.

**What poor performance would mean.** Startup and cold-start time grow with every variable that uses validators.required(). On serverless platforms that delay is billed on every scale-from-zero event, and a regression here is paid by every service that adopts the helper.

**Expected growth: O(1).** It checks one value for presence.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| input size | swept | Varied only to show the helper ignores it; the input is always a short value. |
| input content | fixed at "a non-empty string" | A valid value of the expected kind; the failure path (an invalid value) is cheaper because it exits early and is not what startup normally does. |
| composition | fixed at "used alone" | Wrapping in `all`, `any`, `optional` or `not` adds a constant per wrapper and is measured in the combinator entries. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**Deliberately not covered**

- **locale and timezone** -- The helper's cost does not depend on the process locale or timezone for the inputs measured.

**Measured: O(1)** (exponent 0.00, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.0715 µs | 0.0967 µs | 0.0766 µs | 305 B | 13,989,539 |
| 40 | 0.0715 µs | 0.0919 µs | 0.0749 µs | 305 B | 13,989,994 |
| 80 | 0.0718 µs | 0.0892 µs | 0.0751 µs | 305 B | 13,918,275 |
| 160 | 0.0712 µs | 0.0878 µs | 0.0743 µs | 305 B | 14,039,152 |
| 320 | 0.0714 µs | 0.0834 µs | 0.0732 µs | 304 B | 14,008,377 |
| 640 | 0.0712 µs | 0.0839 µs | 0.0732 µs | 304 B | 14,037,383 |
| 1280 | 0.0717 µs | 0.0872 µs | 0.0741 µs | 304 B | 13,940,504 |
| 2560 | 0.0712 µs | 0.0842 µs | 0.0731 µs | 304 B | 14,044,098 |
| 5120 | 0.0716 µs | 0.0856 µs | 0.0743 µs | 304 B | 13,975,449 |
| 10240 | 0.0719 µs | 0.0898 µs | 0.0741 µs | 305 B | 13,915,638 |

### `validators.safeInteger()`

**Why we benchmark it.** Requires an integer that a double can represent exactly. It runs once for every variable that declares it, at startup, on every process and every deploy, so its per-value cost is multiplied by the number of variables using it.

**What poor performance would mean.** Startup and cold-start time grow with every variable that uses validators.safeInteger(). On serverless platforms that delay is billed on every scale-from-zero event, and a regression here is paid by every service that adopts the helper.

**Expected growth: O(1).** It checks one number against fixed bounds.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| input size | swept | Varied only to show the helper ignores it; the input is always one number. |
| input content | fixed at "a small integer" | A valid value of the expected kind; the failure path (an invalid value) is cheaper because it exits early and is not what startup normally does. |
| composition | fixed at "used alone" | Wrapping in `all`, `any`, `optional` or `not` adds a constant per wrapper and is measured in the combinator entries. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**Deliberately not covered**

- **locale and timezone** -- The helper's cost does not depend on the process locale or timezone for the inputs measured.

**Measured: O(1)** (exponent -0.01, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.0711 µs | 0.0982 µs | 0.0749 µs | 305 B | 14,065,438 |
| 40 | 0.0791 µs | 0.0882 µs | 0.0942 µs | 306 B | 12,640,835 |
| 80 | 0.0730 µs | 0.0951 µs | 0.0804 µs | 305 B | 13,703,225 |
| 160 | 0.0704 µs | 0.0877 µs | 0.0729 µs | 305 B | 14,196,253 |
| 320 | 0.0704 µs | 0.0961 µs | 0.0729 µs | 304 B | 14,197,979 |
| 640 | 0.0707 µs | 0.125 µs | 0.0730 µs | 305 B | 14,144,627 |
| 1280 | 0.0707 µs | 0.0971 µs | 0.0731 µs | 305 B | 14,147,069 |
| 2560 | 0.0713 µs | 0.0999 µs | 0.0744 µs | 305 B | 14,022,515 |
| 5120 | 0.0709 µs | 0.101 µs | 0.0734 µs | 305 B | 14,104,833 |
| 10240 | 0.0702 µs | 0.0962 µs | 0.0726 µs | 305 B | 14,247,633 |

### `validators.unique()`

**Why we benchmark it.** Requires every entry of a list variable to be distinct (no duplicate hosts). It runs once for every variable that declares it, at startup, on every process and every deploy, so its per-value cost is multiplied by the number of variables using it.

**What poor performance would mean.** Startup and cold-start time grow with every variable that uses validators.unique(), and with the size of the values it handles (a large secret, certificate or list). On serverless platforms that delay is billed on every scale-from-zero event, and a regression here is paid by every service that adopts the helper.

**Expected growth: O(n).** It adds each entry to a set and compares the set's size with the list's, so cost is proportional to the number of entries.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| input size | swept | Number of entries in the list. |
| input content | fixed at "a list of distinct integers" | A valid value of the expected kind; the failure path (an invalid value) is cheaper because it exits early and is not what startup normally does. |
| composition | fixed at "used alone" | Wrapping in `all`, `any`, `optional` or `not` adds a constant per wrapper and is measured in the combinator entries. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**Deliberately not covered**

- **locale and timezone** -- The helper's cost does not depend on the process locale or timezone for the inputs measured.

**Measured: O(n)** (exponent 1.02, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.547 µs | 0.637 µs | 0.555 µs | 1.5 KiB | 1,826,772 |
| 40 | 1.06 µs | 1.13 µs | 2.20 µs | 2.8 KiB | 942,385 |
| 80 | 1.84 µs | 1.99 µs | 6.68 µs | 5.4 KiB | 543,433 |
| 160 | 3.22 µs | 3.39 µs | 9.82 µs | 10.5 KiB | 310,456 |
| 320 | 6.01 µs | 6.39 µs | 17.9 µs | 20.8 KiB | 166,327 |
| 640 | 11.0 µs | 11.8 µs | 29.2 µs | 41.7 KiB | 91,239 |
| 1280 | 22.3 µs | 23.6 µs | 61.0 µs | 82.6 KiB | 44,885 |
| 2560 | 45.9 µs | 48.8 µs | 117 µs | 166.5 KiB | 21,776 |
| 5120 | 164 µs | 167 µs | 354 µs | 327.1 KiB | 6,092 |
| 10240 | 396 µs | 404 µs | 712 µs | 644.3 KiB | 2,524 |

### `validators.url()`

**Why we benchmark it.** Checks that an endpoint variable is a well-formed URL. It runs once for every variable that declares it, at startup, on every process and every deploy, so its per-value cost is multiplied by the number of variables using it.

**What poor performance would mean.** Startup and cold-start time grow with every variable that uses validators.url(), and with the size of the values it handles (a large secret, certificate or list). On serverless platforms that delay is billed on every scale-from-zero event, and a regression here is paid by every service that adopts the helper.

**Expected growth: O(n).** URL parsing scans the string once, so cost follows its length.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| input size | swept | Length of the URL path, in characters. |
| input content | fixed at "an https URL with a long path" | A valid value of the expected kind; the failure path (an invalid value) is cheaper because it exits early and is not what startup normally does. |
| composition | fixed at "used alone" | Wrapping in `all`, `any`, `optional` or `not` adds a constant per wrapper and is measured in the combinator entries. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**Deliberately not covered**

- **locale and timezone** -- The helper's cost does not depend on the process locale or timezone for the inputs measured.

**Measured: O(log n)** (exponent 0.36, 10 sizes) -- 🟡 close (neighbouring class).

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.434 µs | 0.482 µs | 0.441 µs | 578 B | 2,306,009 |
| 40 | 0.432 µs | 0.472 µs | 0.438 µs | 601 B | 2,316,937 |
| 80 | 0.443 µs | 0.490 µs | 0.451 µs | 641 B | 2,259,709 |
| 160 | 0.480 µs | 0.519 µs | 0.483 µs | 721 B | 2,085,131 |
| 320 | 0.576 µs | 0.620 µs | 0.582 µs | 881 B | 1,737,209 |
| 640 | 0.733 µs | 0.808 µs | 0.743 µs | 1.2 KiB | 1,364,213 |
| 1280 | 1.01 µs | 1.10 µs | 1.02 µs | 1.8 KiB | 986,851 |
| 2560 | 1.51 µs | 1.71 µs | 1.53 µs | 3.1 KiB | 660,770 |
| 5120 | 2.53 µs | 3.74 µs | 9.57 µs | 5.6 KiB | 394,662 |
| 10240 | 3.91 µs | 4.10 µs | 12.3 µs | 10.9 KiB | 255,726 |

### `validators.uuid()`

**Why we benchmark it.** Checks that an identifier variable is a UUID. It runs once for every variable that declares it, at startup, on every process and every deploy, so its per-value cost is multiplied by the number of variables using it.

**What poor performance would mean.** Startup and cold-start time grow with every variable that uses validators.uuid(). On serverless platforms that delay is billed on every scale-from-zero event, and a regression here is paid by every service that adopts the helper.

**Expected growth: O(1).** A UUID has a fixed length and a fixed pattern.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| input size | swept | Varied only to show the helper ignores it; the input is always one UUID. |
| input content | fixed at "a version-4 UUID" | A valid value of the expected kind; the failure path (an invalid value) is cheaper because it exits early and is not what startup normally does. |
| composition | fixed at "used alone" | Wrapping in `all`, `any`, `optional` or `not` adds a constant per wrapper and is measured in the combinator entries. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**Deliberately not covered**

- **locale and timezone** -- The helper's cost does not depend on the process locale or timezone for the inputs measured.

**Measured: O(1)** (exponent -0.04, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.504 µs | 0.533 µs | 0.600 µs | 605 B | 1,983,602 |
| 40 | 0.243 µs | 0.355 µs | 0.248 µs | 585 B | 4,109,888 |
| 80 | 0.246 µs | 0.299 µs | 0.251 µs | 585 B | 4,058,767 |
| 160 | 0.244 µs | 0.297 µs | 0.250 µs | 585 B | 4,103,190 |
| 320 | 0.245 µs | 0.303 µs | 0.248 µs | 585 B | 4,079,402 |
| 640 | 0.243 µs | 0.303 µs | 0.248 µs | 585 B | 4,114,760 |
| 1280 | 0.245 µs | 0.303 µs | 0.248 µs | 585 B | 4,085,640 |
| 2560 | 0.243 µs | 0.318 µs | 0.247 µs | 585 B | 4,112,765 |
| 5120 | 0.307 µs | 0.333 µs | 0.325 µs | 588 B | 3,255,157 |
| 10240 | 0.247 µs | 0.312 µs | 0.252 µs | 585 B | 4,054,071 |

### `validators.uuidVersion(v)`

**Why we benchmark it.** Checks that an identifier is a UUID of a specific version. It runs once for every variable that declares it, at startup, on every process and every deploy, so its per-value cost is multiplied by the number of variables using it.

**What poor performance would mean.** Startup and cold-start time grow with every variable that uses validators.uuidVersion(v). On serverless platforms that delay is billed on every scale-from-zero event, and a regression here is paid by every service that adopts the helper.

**Expected growth: O(1).** A UUID has a fixed length and a fixed pattern.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| input size | swept | Varied only to show the helper ignores it; the input is always one UUID. |
| input content | fixed at "a version-4 UUID" | A valid value of the expected kind; the failure path (an invalid value) is cheaper because it exits early and is not what startup normally does. |
| composition | fixed at "used alone" | Wrapping in `all`, `any`, `optional` or `not` adds a constant per wrapper and is measured in the combinator entries. |
| runtime | fixed at "Node (V8)" | Measured on Node only; Bun, Deno and edge runtimes are not covered. |

**Deliberately not covered**

- **locale and timezone** -- The helper's cost does not depend on the process locale or timezone for the inputs measured.

**Measured: O(1)** (exponent -0.00, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.243 µs | 0.297 µs | 0.251 µs | 585 B | 4,122,012 |
| 40 | 0.247 µs | 0.302 µs | 0.253 µs | 585 B | 4,043,748 |
| 80 | 0.246 µs | 0.318 µs | 0.252 µs | 585 B | 4,057,935 |
| 160 | 0.248 µs | 0.414 µs | 0.251 µs | 585 B | 4,032,427 |
| 320 | 0.243 µs | 0.327 µs | 0.249 µs | 585 B | 4,107,114 |
| 640 | 0.243 µs | 0.288 µs | 0.250 µs | 585 B | 4,111,274 |
| 1280 | 0.243 µs | 0.281 µs | 0.247 µs | 585 B | 4,107,862 |
| 2560 | 0.248 µs | 0.332 µs | 0.257 µs | 586 B | 4,033,650 |
| 5120 | 0.244 µs | 0.272 µs | 0.247 µs | 585 B | 4,104,449 |
| 10240 | 0.242 µs | 0.298 µs | 0.247 µs | 585 B | 4,137,732 |

## 3. What makes up the end-to-end overhead

Each function's measured cost is multiplied by how many times one end-to-end operation calls it, then compared with the total overhead from section 1. This shows where the cost actually lives, so effort goes to the function that matters. Shares are estimates: they can sum to slightly more or less than 100% because the two measurements were taken separately (the remainder is shown as _unattributed_).

**At 640 variables** (total added: 187 µs)

| Function | Calls / operation | Estimated time | Share of added time | Share of operation |
| --- | --- | --- | --- | --- |
| `validate-env` | 1 | 281 µs | 150% | 107% |
| _unattributed_ |  | 0 | 0.0% |  |

**At 10240 variables** (total added: 545 µs)

| Function | Calls / operation | Estimated time | Share of added time | Share of operation |
| --- | --- | --- | --- | --- |
| `validate-env` | 1 | 2.07 ms | 379% | 107% |
| _unattributed_ |  | 0 | 0.0% |  |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-02T00:44:24.130Z` → `2026-10-02T00:45:43.444Z` (79 s), ci
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v22.23.3, GitHub Actions
- Git: `77acd16d0d0b13e9c162061da6d6f7d739436547` on `chore/no-minify-no-dist-urls` (uncommitted changes)
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 variables -- One environment variable declared in a contract and validated at startup. 640 is a large but realistic service: a few dozen contracts of around ten variables each.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

