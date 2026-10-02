# env-cap: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 variables** per operation, routing the work through `env-cap` adds **135 µs** per operation compared with a bare-minimum baseline (296%), about **$0.00028 – $0.0079 per million operations** of compute. Overall, it grows O(n) with workload size (measured exponent 0.85).

> Dollar figures are **estimates** from published list prices (see _Cost model_ below) and are for comparing orders of magnitude, not for budgeting to the cent.

| Cost | Typical (640 variables) | Largest (10240 variables) |
| --- | --- | --- |
| Added latency per operation | 135 µs | 679 µs |
| Added latency, relative to baseline | 296% | 84% |
| Added CPU time per operation | 702 µs | 1.31 ms |
| Added memory per operation (heap delta) | 496.8 KiB | 359.7 KiB |
| Estimated compute cost per 1M operations | $0.00028 – $0.0079 | $0.0014 – $0.015 |
| Single-core throughput ceiling of the overhead alone | 7,395 ops/s | 1,472 ops/s |
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
| 20 | 0.511 µs | 6.67 µs | 6.16 µs | 13× baseline | 7.47 µs | $0.000013 – $0.000084 |
| 40 | 1.09 µs | 9.87 µs | 8.78 µs | 804% | 9.89 µs | $0.000018 – $0.00011 |
| 80 | 2.38 µs | 18.1 µs | 15.7 µs | 661% | 10.3 µs | $0.000033 – $0.00012 |
| 160 | 5.52 µs | 38.3 µs | 32.8 µs | 594% | 21.5 µs | $0.000068 – $0.00024 |
| 320 | 15.7 µs | 75.6 µs | 59.9 µs | 380% | 31.4 µs | $0.00012 – $0.00035 |
| 640 | 45.7 µs | 181 µs | 135 µs | 296% | 702 µs | $0.00028 – $0.0079 |
| 1280 | 48.3 µs | 151 µs | 103 µs | 213% | 325 µs | $0.00021 – $0.0037 |
| 2560 | 97.7 µs | 286 µs | 188 µs | 192% | 745 µs | $0.00039 – $0.0084 |
| 5120 | 276 µs | 641 µs | 365 µs | 132% | 869 µs | $0.00076 – $0.0098 |
| 10240 | 812 µs | 1.49 ms | 679 µs | 84% | 1.31 ms | $0.0014 – $0.015 |

**How the total grows:** O(n) (linear), exponent 0.85 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- |
| `process start with n variables declared (cold start)` | O(n) | O(log n) | 🟡 close (neighbouring class) | 43.9 ms | 192 ms |
| `createEnv (declare a contract)` | O(n) | O(n log n) | 🟡 close (neighbouring class) | 115 µs | 3.64 ms |
| `validateEnv (validate n values)` | O(n) | O(n) | ✅ matches | 181 µs | 1.57 ms |
| `processors.base64()` | O(n) | O(log n) | 🟡 close (neighbouring class) | 0.215 µs | 1.19 µs |
| `processors.parseJSON()` | O(n) | O(n log n) | 🟡 close (neighbouring class) | 73.0 µs | 1.33 ms |
| `processors.split(",")` | O(n) | O(n) | ✅ matches | 9.51 µs | 150 µs |
| `processors.toArray(",", [trim()])` | O(n) | O(n) | ✅ matches | 21.8 µs | 344 µs |
| `processors.toBigInt()` | O(n) | O(n log n) | 🟡 close (neighbouring class) | 1.04 µs | 67.9 µs |
| `processors.toBoolean()` | O(1) | O(1) | ✅ matches | 0.0573 µs | 0.0578 µs |
| `processors.toDate()` | O(1) | O(1) | ✅ matches | 0.180 µs | 0.179 µs |
| `processors.toInteger()` | O(1) | O(1) | ✅ matches | 0.0579 µs | 0.0578 µs |
| `processors.toLowerCase()` | O(n) | O(log n) | 🟡 close (neighbouring class) | 0.105 µs | 0.815 µs |
| `processors.toNumber()` | O(1) | O(1) | ✅ matches | 0.0543 µs | 0.0544 µs |
| `processors.toRegExp()` | O(n) | O(n) | ✅ matches | 0.554 µs | 7.00 µs |
| `processors.toString()` | O(1) | O(1) | ✅ matches | 0.0531 µs | 0.0532 µs |
| `processors.toURL()` | O(n) | O(log n) | 🟡 close (neighbouring class) | 0.485 µs | 4.59 µs |
| `processors.toUpperCase()` | O(n) | O(log n) | 🟡 close (neighbouring class) | 0.115 µs | 0.839 µs |
| `processors.trim()` | O(n) | O(n) | ✅ matches | 0.596 µs | 8.33 µs |
| `validators.after(date)` | O(1) | O(1) | ✅ matches | 0.116 µs | 0.116 µs |
| `validators.all(...validators)` | O(n) | O(n) | ✅ matches | 0.775 µs | 12.8 µs |
| `validators.any(...validators)` | O(n) | O(n) | ✅ matches | 4.86 µs | 76.0 µs |
| `validators.before(date)` | O(1) | O(1) | ✅ matches | 0.119 µs | 0.119 µs |
| `validators.custom(fn)` | O(1) | O(1) | ✅ matches | 0.0475 µs | 0.0472 µs |
| `validators.email()` | O(n) | O(log n) | 🟡 close (neighbouring class) | 0.619 µs | 6.96 µs |
| `validators.endsWith(suffix)` | O(1) | O(1) | ✅ matches | 0.0582 µs | 0.0578 µs |
| `validators.finite()` | O(1) | O(1) | ✅ matches | 0.0466 µs | 0.0474 µs |
| `validators.future()` | O(1) | O(1) | ✅ matches | 0.152 µs | 0.151 µs |
| `validators.includes(text)` | O(n) | O(log n) | 🟡 close (neighbouring class) | 0.0713 µs | 0.260 µs |
| `validators.integer()` | O(1) | O(1) | ✅ matches | 0.0468 µs | 0.0467 µs |
| `validators.length(n)` | O(1) | O(1) | ✅ matches | 0.0479 µs | 0.0478 µs |
| `validators.matches(regex)` | O(n) | O(log n) | 🟡 close (neighbouring class) | 0.330 µs | 2.86 µs |
| `validators.max(limit)` | O(1) | O(1) | ✅ matches | 0.0476 µs | 0.0477 µs |
| `validators.maxItems(limit)` | O(1) | O(1) | ✅ matches | 0.0476 µs | 0.0491 µs |
| `validators.maxLength(limit)` | O(1) | O(1) | ✅ matches | 0.0475 µs | 0.0475 µs |
| `validators.min(limit)` | O(1) | O(1) | ✅ matches | 0.0482 µs | 0.0477 µs |
| `validators.minItems(limit)` | O(1) | O(1) | ✅ matches | 0.0473 µs | 0.0475 µs |
| `validators.minLength(limit)` | O(1) | O(1) | ✅ matches | 0.0483 µs | 0.0481 µs |
| `validators.negative()` | O(1) | O(1) | ✅ matches | 0.0473 µs | 0.0474 µs |
| `validators.not(validator)` | O(1) | O(1) | ✅ matches | 0.0487 µs | 0.0482 µs |
| `validators.oneOf(options)` | O(n) | O(n) | ✅ matches | 1.16 µs | 7.39 µs |
| `validators.optional(validator)` | O(1) | O(1) | ✅ matches | 0.0474 µs | 0.0475 µs |
| `validators.past()` | O(1) | O(1) | ✅ matches | 0.154 µs | 0.153 µs |
| `validators.positive()` | O(1) | O(1) | ✅ matches | 0.0469 µs | 0.0471 µs |
| `validators.range(min, max)` | O(1) | O(1) | ✅ matches | 0.0476 µs | 0.0475 µs |
| `validators.refine(validator, message)` | O(1) | O(1) | ✅ matches | 0.0479 µs | 0.0478 µs |
| `validators.required()` | O(1) | O(1) | ✅ matches | 0.0478 µs | 0.0487 µs |
| `validators.safeInteger()` | O(1) | O(1) | ✅ matches | 0.0467 µs | 0.0471 µs |
| `validators.unique()` | O(n) | O(n) | ✅ matches | 8.68 µs | 254 µs |
| `validators.url()` | O(n) | O(log n) | 🟡 close (neighbouring class) | 0.481 µs | 4.53 µs |
| `validators.uuid()` | O(1) | O(1) | ✅ matches | 0.157 µs | 0.158 µs |
| `validators.uuidVersion(v)` | O(1) | O(1) | ✅ matches | 0.156 µs | 0.157 µs |

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

**Measured: O(log n)** (exponent 0.27, 10 sizes) -- 🟡 close (neighbouring class).

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 29.9 ms | 32.7 ms | 1.41 ms | 67.2 KiB | 33 |
| 40 | 31.6 ms | 36.6 ms | 1.45 ms | 62.0 KiB | 32 |
| 80 | 32.5 ms | 34.2 ms | 1.45 ms | 62.1 KiB | 31 |
| 160 | 35.0 ms | 35.7 ms | 1.47 ms | 62.1 KiB | 29 |
| 320 | 39.5 ms | 41.1 ms | 1.50 ms | 62.1 KiB | 25 |
| 640 | 43.9 ms | 48.1 ms | 1.53 ms | 62.1 KiB | 23 |
| 1280 | 53.2 ms | 94.9 ms | 1.50 ms | 62.1 KiB | 19 |
| 2560 | 72.8 ms | 120 ms | 1.43 ms | 62.1 KiB | 14 |
| 5120 | 112 ms | 150 ms | 1.56 ms | 62.1 KiB | 9 |
| 10240 | 192 ms | 252 ms | 1.47 ms | 62.1 KiB | 5 |

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

**Measured: O(n log n)** (exponent 1.33, 10 sizes) -- 🟡 close (neighbouring class).

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.80 µs | 3.03 µs | 2.98 µs | 7.7 KiB | 357,471 |
| 40 | 4.62 µs | 4.88 µs | 11.1 µs | 11.1 KiB | 216,591 |
| 80 | 8.67 µs | 8.92 µs | 18.4 µs | 21.1 KiB | 115,398 |
| 160 | 17.7 µs | 18.3 µs | 35.1 µs | 41.4 KiB | 56,615 |
| 320 | 39.9 µs | 40.7 µs | 71.4 µs | 82.8 KiB | 25,088 |
| 640 | 115 µs | 121 µs | 176 µs | 167.0 KiB | 8,669 |
| 1280 | 2.03 ms | 2.28 ms | 2.88 ms | 486.2 KiB | 493 |
| 2560 | 2.22 ms | 2.28 ms | 3.08 ms | 808.3 KiB | 450 |
| 5120 | 2.73 ms | 3.06 ms | 3.64 ms | 1.5 MiB | 367 |
| 10240 | 3.64 ms | 3.77 ms | 4.59 ms | 2.7 MiB | 275 |

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

**Measured: O(n)** (exponent 0.86, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 6.67 µs | 12.4 µs | 9.00 µs | 5.6 KiB | 149,993 |
| 40 | 10.4 µs | 18.9 µs | 14.0 µs | 8.4 KiB | 95,997 |
| 80 | 18.0 µs | 22.4 µs | 21.0 µs | 17.8 KiB | 55,685 |
| 160 | 35.4 µs | 48.7 µs | 38.0 µs | 47.9 KiB | 28,269 |
| 320 | 78.1 µs | 120 µs | 82.0 µs | 160.6 KiB | 12,807 |
| 640 | 181 µs | 197 µs | 839 µs | 583.8 KiB | 5,524 |
| 1280 | 158 µs | 202 µs | 482 µs | 175.0 KiB | 6,311 |
| 2560 | 304 µs | 382 µs | 1.03 ms | 403.0 KiB | 3,292 |
| 5120 | 713 µs | 833 µs | 1.41 ms | 695.1 KiB | 1,403 |
| 10240 | 1.57 ms | 1.68 ms | 2.61 ms | 1.3 MiB | 637 |

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

**Measured: O(log n)** (exponent 0.26, 10 sizes) -- 🟡 close (neighbouring class).

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.216 µs | 0.427 µs | 0.220 µs | 484 B | 4,638,415 |
| 40 | 0.164 µs | 0.274 µs | 0.173 µs | 481 B | 6,079,181 |
| 80 | 0.178 µs | 0.267 µs | 0.184 µs | 481 B | 5,623,090 |
| 160 | 0.181 µs | 0.184 µs | 0.184 µs | 354 B | 5,529,968 |
| 320 | 0.194 µs | 0.199 µs | 0.781 µs | 354 B | 5,152,408 |
| 640 | 0.215 µs | 0.225 µs | 1.02 µs | 355 B | 4,659,394 |
| 1280 | 0.276 µs | 0.283 µs | 1.31 µs | 358 B | 3,622,192 |
| 2560 | 0.392 µs | 0.416 µs | 1.45 µs | 364 B | 2,549,721 |
| 5120 | 0.636 µs | 0.654 µs | 1.88 µs | 383 B | 1,571,748 |
| 10240 | 1.19 µs | 1.51 µs | 1.21 µs | 526 B | 842,972 |

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

**Measured: O(n log n)** (exponent 1.18, 10 sizes) -- 🟡 close (neighbouring class).

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.996 µs | 1.07 µs | 3.90 µs | 562 B | 1,004,351 |
| 40 | 1.94 µs | 1.99 µs | 5.50 µs | 722 B | 514,965 |
| 80 | 3.74 µs | 3.84 µs | 9.26 µs | 915 B | 267,434 |
| 160 | 15.3 µs | 15.9 µs | 33.3 µs | 6.4 KiB | 65,387 |
| 320 | 33.8 µs | 35.6 µs | 67.1 µs | 12.7 KiB | 29,606 |
| 640 | 73.0 µs | 88.2 µs | 145 µs | 25.3 KiB | 13,690 |
| 1280 | 145 µs | 154 µs | 264 µs | 50.4 KiB | 6,895 |
| 2560 | 305 µs | 319 µs | 514 µs | 112.2 KiB | 3,281 |
| 5120 | 644 µs | 673 µs | 1.10 ms | 192.6 KiB | 1,552 |
| 10240 | 1.33 ms | 1.40 ms | 2.29 ms | 392.3 KiB | 749 |

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

**Measured: O(n)** (exponent 0.91, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.696 µs | 0.754 µs | 0.701 µs | 722 B | 1,437,756 |
| 40 | 0.724 µs | 0.785 µs | 2.97 µs | 1.0 KiB | 1,382,103 |
| 80 | 1.29 µs | 1.31 µs | 2.98 µs | 1.6 KiB | 777,366 |
| 160 | 2.45 µs | 2.53 µs | 5.20 µs | 2.9 KiB | 408,487 |
| 320 | 4.77 µs | 5.05 µs | 9.90 µs | 5.4 KiB | 209,483 |
| 640 | 9.51 µs | 9.68 µs | 19.1 µs | 10.4 KiB | 105,189 |
| 1280 | 18.8 µs | 19.0 µs | 36.4 µs | 20.5 KiB | 53,215 |
| 2560 | 37.6 µs | 38.3 µs | 72.0 µs | 42.1 KiB | 26,582 |
| 5120 | 74.9 µs | 75.7 µs | 139 µs | 85.0 KiB | 13,349 |
| 10240 | 150 µs | 155 µs | 269 µs | 169.2 KiB | 6,685 |

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

**Measured: O(n)** (exponent 0.89, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.47 µs | 1.57 µs | 6.24 µs | 2.6 KiB | 678,327 |
| 40 | 2.67 µs | 2.84 µs | 7.01 µs | 4.6 KiB | 374,040 |
| 80 | 2.88 µs | 2.93 µs | 6.67 µs | 8.7 KiB | 346,793 |
| 160 | 5.61 µs | 5.74 µs | 11.4 µs | 16.8 KiB | 178,165 |
| 320 | 11.0 µs | 11.5 µs | 21.5 µs | 33.0 KiB | 90,848 |
| 640 | 21.8 µs | 23.2 µs | 42.0 µs | 65.6 KiB | 45,799 |
| 1280 | 43.3 µs | 44.0 µs | 81.1 µs | 130.6 KiB | 23,103 |
| 2560 | 86.6 µs | 107 µs | 163 µs | 260.6 KiB | 11,547 |
| 5120 | 172 µs | 180 µs | 311 µs | 532.2 KiB | 5,801 |
| 10240 | 344 µs | 361 µs | 622 µs | 1.0 MiB | 2,906 |

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

**Measured: O(n log n)** (exponent 1.13, 10 sizes) -- 🟡 close (neighbouring class).

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.0936 µs | 0.114 µs | 0.0971 µs | 281 B | 10,682,143 |
| 40 | 0.105 µs | 0.106 µs | 0.106 µs | 288 B | 9,550,696 |
| 80 | 0.134 µs | 0.136 µs | 0.135 µs | 304 B | 7,453,840 |
| 160 | 0.266 µs | 0.305 µs | 1.10 µs | 336 B | 3,757,633 |
| 320 | 0.461 µs | 0.494 µs | 1.59 µs | 401 B | 2,166,931 |
| 640 | 1.04 µs | 1.12 µs | 2.99 µs | 537 B | 964,479 |
| 1280 | 2.79 µs | 2.87 µs | 6.83 µs | 810 B | 358,079 |
| 2560 | 9.67 µs | 10.5 µs | 20.4 µs | 1.3 KiB | 103,431 |
| 5120 | 35.9 µs | 37.6 µs | 69.4 µs | 2.4 KiB | 27,893 |
| 10240 | 67.9 µs | 69.4 µs | 132 µs | 4.5 KiB | 14,734 |

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

**Measured: O(1)** (exponent -0.01, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.0678 µs | 0.0972 µs | 0.0707 µs | 305 B | 14,757,764 |
| 40 | 0.0587 µs | 0.0635 µs | 0.0620 µs | 272 B | 17,033,454 |
| 80 | 0.0577 µs | 0.0584 µs | 0.0580 µs | 272 B | 17,337,284 |
| 160 | 0.0576 µs | 0.0586 µs | 0.0582 µs | 272 B | 17,356,337 |
| 320 | 0.0573 µs | 0.0583 µs | 0.0575 µs | 272 B | 17,452,604 |
| 640 | 0.0573 µs | 0.0581 µs | 0.0578 µs | 272 B | 17,461,055 |
| 1280 | 0.0573 µs | 0.0581 µs | 0.0580 µs | 272 B | 17,449,335 |
| 2560 | 0.0570 µs | 0.0586 µs | 0.0572 µs | 272 B | 17,530,482 |
| 5120 | 0.0573 µs | 0.0584 µs | 0.0579 µs | 272 B | 17,457,065 |
| 10240 | 0.0578 µs | 0.0588 µs | 0.0586 µs | 272 B | 17,291,658 |

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

**Measured: O(1)** (exponent -0.01, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.193 µs | 0.254 µs | 0.199 µs | 361 B | 5,168,317 |
| 40 | 0.181 µs | 0.211 µs | 0.183 µs | 345 B | 5,517,241 |
| 80 | 0.180 µs | 0.186 µs | 0.801 µs | 344 B | 5,564,129 |
| 160 | 0.181 µs | 0.183 µs | 0.182 µs | 344 B | 5,531,219 |
| 320 | 0.181 µs | 0.183 µs | 0.182 µs | 344 B | 5,533,512 |
| 640 | 0.180 µs | 0.182 µs | 0.831 µs | 344 B | 5,557,386 |
| 1280 | 0.180 µs | 0.183 µs | 0.852 µs | 344 B | 5,561,993 |
| 2560 | 0.179 µs | 0.183 µs | 0.801 µs | 344 B | 5,581,590 |
| 5120 | 0.178 µs | 0.184 µs | 0.763 µs | 344 B | 5,604,767 |
| 10240 | 0.179 µs | 0.182 µs | 0.830 µs | 344 B | 5,598,361 |

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

**Measured: O(1)** (exponent -0.05, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.104 µs | 0.134 µs | 0.103 µs | 305 B | 9,648,203 |
| 40 | 0.0591 µs | 0.0602 µs | 0.0595 µs | 304 B | 16,928,348 |
| 80 | 0.0581 µs | 0.0591 µs | 0.0585 µs | 304 B | 17,225,202 |
| 160 | 0.0576 µs | 0.0582 µs | 0.0578 µs | 304 B | 17,373,080 |
| 320 | 0.0577 µs | 0.0582 µs | 0.0582 µs | 304 B | 17,339,113 |
| 640 | 0.0579 µs | 0.0587 µs | 0.0584 µs | 304 B | 17,273,755 |
| 1280 | 0.0577 µs | 0.0581 µs | 0.0581 µs | 304 B | 17,318,182 |
| 2560 | 0.0583 µs | 0.0591 µs | 0.0586 µs | 304 B | 17,165,714 |
| 5120 | 0.0580 µs | 0.0587 µs | 0.0586 µs | 304 B | 17,236,345 |
| 10240 | 0.0578 µs | 0.0584 µs | 0.0580 µs | 304 B | 17,303,583 |

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

**Measured: O(log n)** (exponent 0.39, 10 sizes) -- 🟡 close (neighbouring class).

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.0709 µs | 0.0911 µs | 0.0756 µs | 289 B | 14,099,511 |
| 40 | 0.0622 µs | 0.0632 µs | 0.0630 µs | 304 B | 16,078,566 |
| 80 | 0.0642 µs | 0.0647 µs | 0.0646 µs | 344 B | 15,582,172 |
| 160 | 0.0701 µs | 0.0958 µs | 0.0704 µs | 424 B | 14,268,599 |
| 320 | 0.0817 µs | 0.0825 µs | 0.0825 µs | 585 B | 12,241,775 |
| 640 | 0.105 µs | 0.131 µs | 0.504 µs | 905 B | 9,535,161 |
| 1280 | 0.158 µs | 0.164 µs | 0.571 µs | 1.5 KiB | 6,318,961 |
| 2560 | 0.247 µs | 0.269 µs | 0.876 µs | 2.8 KiB | 4,050,095 |
| 5120 | 0.431 µs | 0.475 µs | 1.19 µs | 5.3 KiB | 2,318,885 |
| 10240 | 0.815 µs | 0.848 µs | 1.89 µs | 10.7 KiB | 1,226,590 |

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

**Measured: O(1)** (exponent -0.00, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.0568 µs | 0.0772 µs | 0.0581 µs | 248 B | 17,613,636 |
| 40 | 0.0550 µs | 0.0560 µs | 0.0556 µs | 248 B | 18,176,039 |
| 80 | 0.0545 µs | 0.0680 µs | 0.0549 µs | 248 B | 18,362,779 |
| 160 | 0.0545 µs | 0.0555 µs | 0.0551 µs | 248 B | 18,355,811 |
| 320 | 0.0546 µs | 0.0556 µs | 0.0549 µs | 248 B | 18,314,465 |
| 640 | 0.0543 µs | 0.0597 µs | 0.0546 µs | 248 B | 18,420,068 |
| 1280 | 0.0546 µs | 0.0555 µs | 0.0549 µs | 248 B | 18,327,221 |
| 2560 | 0.0543 µs | 0.0571 µs | 0.0550 µs | 248 B | 18,406,555 |
| 5120 | 0.0543 µs | 0.0552 µs | 0.0545 µs | 248 B | 18,427,245 |
| 10240 | 0.0544 µs | 0.0556 µs | 0.0549 µs | 248 B | 18,397,912 |

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

**Measured: O(n)** (exponent 0.66, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.128 µs | 0.147 µs | 0.132 µs | 323 B | 7,800,111 |
| 40 | 0.133 µs | 0.150 µs | 0.134 µs | 308 B | 7,544,576 |
| 80 | 0.172 µs | 0.175 µs | 0.837 µs | 307 B | 5,801,782 |
| 160 | 0.224 µs | 0.230 µs | 0.914 µs | 307 B | 4,464,684 |
| 320 | 0.332 µs | 0.404 µs | 1.13 µs | 307 B | 3,012,987 |
| 640 | 0.554 µs | 0.563 µs | 2.35 µs | 311 B | 1,806,155 |
| 1280 | 0.987 µs | 0.993 µs | 2.57 µs | 311 B | 1,013,181 |
| 2560 | 1.84 µs | 1.87 µs | 4.15 µs | 314 B | 542,433 |
| 5120 | 3.56 µs | 3.63 µs | 7.48 µs | 320 B | 280,865 |
| 10240 | 7.00 µs | 7.10 µs | 14.5 µs | 335 B | 142,896 |

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
| 20 | 0.0551 µs | 0.0578 µs | 0.0572 µs | 249 B | 18,154,066 |
| 40 | 0.0539 µs | 0.0551 µs | 0.0541 µs | 248 B | 18,556,947 |
| 80 | 0.0533 µs | 0.0548 µs | 0.0539 µs | 248 B | 18,755,541 |
| 160 | 0.0532 µs | 0.113 µs | 0.0536 µs | 248 B | 18,804,882 |
| 320 | 0.0538 µs | 0.135 µs | 0.0556 µs | 248 B | 18,573,868 |
| 640 | 0.0531 µs | 0.0538 µs | 0.0531 µs | 248 B | 18,824,176 |
| 1280 | 0.0532 µs | 0.0541 µs | 0.0535 µs | 248 B | 18,810,811 |
| 2560 | 0.0533 µs | 0.0554 µs | 0.0536 µs | 248 B | 18,745,494 |
| 5120 | 0.0532 µs | 0.0539 µs | 0.0536 µs | 248 B | 18,804,690 |
| 10240 | 0.0532 µs | 0.0551 µs | 0.0536 µs | 248 B | 18,796,839 |

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

**Measured: O(log n)** (exponent 0.49, 10 sizes) -- 🟡 close (neighbouring class).

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.251 µs | 0.467 µs | 0.255 µs | 578 B | 3,991,107 |
| 40 | 0.230 µs | 0.277 µs | 0.232 µs | 545 B | 4,357,196 |
| 80 | 0.224 µs | 0.230 µs | 0.226 µs | 585 B | 4,466,528 |
| 160 | 0.272 µs | 0.277 µs | 1.27 µs | 664 B | 3,672,508 |
| 320 | 0.345 µs | 0.351 µs | 0.696 µs | 825 B | 2,901,394 |
| 640 | 0.485 µs | 0.501 µs | 1.96 µs | 1.1 KiB | 2,060,829 |
| 1280 | 0.787 µs | 0.804 µs | 2.44 µs | 1.7 KiB | 1,270,919 |
| 2560 | 1.38 µs | 1.40 µs | 1.40 µs | 3.0 KiB | 722,741 |
| 5120 | 2.51 µs | 2.54 µs | 7.53 µs | 5.5 KiB | 398,964 |
| 10240 | 4.59 µs | 4.85 µs | 9.66 µs | 10.6 KiB | 217,639 |

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

**Measured: O(log n)** (exponent 0.38, 10 sizes) -- 🟡 close (neighbouring class).

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.0745 µs | 0.0950 µs | 0.0769 µs | 289 B | 13,419,355 |
| 40 | 0.0722 µs | 0.0745 µs | 0.0729 µs | 304 B | 13,846,220 |
| 80 | 0.0747 µs | 0.0773 µs | 0.0750 µs | 344 B | 13,382,836 |
| 160 | 0.0802 µs | 0.0814 µs | 0.0806 µs | 424 B | 12,471,549 |
| 320 | 0.0915 µs | 0.0939 µs | 0.0927 µs | 585 B | 10,925,698 |
| 640 | 0.115 µs | 0.117 µs | 0.116 µs | 905 B | 8,695,652 |
| 1280 | 0.169 µs | 0.173 µs | 0.653 µs | 1.5 KiB | 5,908,608 |
| 2560 | 0.261 µs | 0.288 µs | 0.952 µs | 2.8 KiB | 3,836,558 |
| 5120 | 0.442 µs | 0.466 µs | 1.41 µs | 5.3 KiB | 2,263,852 |
| 10240 | 0.839 µs | 0.924 µs | 1.98 µs | 10.7 KiB | 1,192,221 |

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

**Measured: O(n)** (exponent 0.77, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.0791 µs | 0.0878 µs | 0.0802 µs | 272 B | 12,643,836 |
| 40 | 0.0947 µs | 0.0961 µs | 0.460 µs | 272 B | 10,559,192 |
| 80 | 0.137 µs | 0.140 µs | 0.586 µs | 272 B | 7,289,240 |
| 160 | 0.211 µs | 0.276 µs | 0.903 µs | 272 B | 4,742,314 |
| 320 | 0.335 µs | 0.742 µs | 1.10 µs | 272 B | 2,986,652 |
| 640 | 0.596 µs | 0.615 µs | 1.64 µs | 272 B | 1,676,857 |
| 1280 | 1.11 µs | 1.14 µs | 2.56 µs | 273 B | 901,024 |
| 2560 | 2.14 µs | 2.21 µs | 4.66 µs | 273 B | 467,109 |
| 5120 | 4.20 µs | 4.25 µs | 8.76 µs | 274 B | 238,014 |
| 10240 | 8.33 µs | 8.49 µs | 17.3 µs | 275 B | 120,100 |

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

**Measured: O(1)** (exponent -0.03, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.125 µs | 0.153 µs | 0.127 µs | 465 B | 7,980,100 |
| 40 | 0.117 µs | 0.218 µs | 0.160 µs | 280 B | 8,546,308 |
| 80 | 0.175 µs | 0.186 µs | 0.181 µs | 465 B | 5,698,630 |
| 160 | 0.125 µs | 0.184 µs | 0.126 µs | 281 B | 8,030,769 |
| 320 | 0.116 µs | 0.118 µs | 0.117 µs | 280 B | 8,631,007 |
| 640 | 0.116 µs | 0.121 µs | 0.117 µs | 280 B | 8,631,221 |
| 1280 | 0.115 µs | 0.117 µs | 0.542 µs | 280 B | 8,662,696 |
| 2560 | 0.116 µs | 0.118 µs | 0.116 µs | 280 B | 8,653,351 |
| 5120 | 0.115 µs | 0.118 µs | 0.116 µs | 280 B | 8,670,461 |
| 10240 | 0.116 µs | 0.118 µs | 0.464 µs | 280 B | 8,649,773 |

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

**Measured: O(n)** (exponent 0.84, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.0896 µs | 0.341 µs | 0.0959 µs | 434 B | 11,159,520 |
| 40 | 0.0952 µs | 0.112 µs | 0.0977 µs | 305 B | 10,501,328 |
| 80 | 0.139 µs | 0.140 µs | 0.669 µs | 304 B | 7,215,333 |
| 160 | 0.237 µs | 0.240 µs | 1.12 µs | 304 B | 4,214,154 |
| 320 | 0.412 µs | 0.414 µs | 1.45 µs | 304 B | 2,428,152 |
| 640 | 0.775 µs | 0.804 µs | 2.40 µs | 305 B | 1,290,634 |
| 1280 | 1.62 µs | 1.65 µs | 4.00 µs | 305 B | 616,045 |
| 2560 | 3.20 µs | 3.27 µs | 7.37 µs | 305 B | 312,530 |
| 5120 | 6.29 µs | 6.44 µs | 14.7 µs | 307 B | 158,931 |
| 10240 | 12.8 µs | 13.4 µs | 27.3 µs | 309 B | 78,132 |

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

**Measured: O(n)** (exponent 0.95, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.225 µs | 0.399 µs | 0.234 µs | 1.5 KiB | 4,437,247 |
| 40 | 0.370 µs | 0.620 µs | 0.373 µs | 2.7 KiB | 2,699,735 |
| 80 | 0.672 µs | 0.691 µs | 1.79 µs | 5.2 KiB | 1,488,341 |
| 160 | 1.26 µs | 1.33 µs | 3.01 µs | 10.2 KiB | 790,514 |
| 320 | 2.47 µs | 2.71 µs | 5.82 µs | 20.2 KiB | 405,489 |
| 640 | 4.86 µs | 5.17 µs | 10.8 µs | 40.2 KiB | 205,872 |
| 1280 | 9.86 µs | 10.5 µs | 20.3 µs | 80.2 KiB | 101,410 |
| 2560 | 19.1 µs | 20.2 µs | 39.8 µs | 160.2 KiB | 52,311 |
| 5120 | 38.1 µs | 39.1 µs | 76.9 µs | 320.3 KiB | 26,255 |
| 10240 | 76.0 µs | 80.5 µs | 155 µs | 640.3 KiB | 13,155 |

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

**Measured: O(1)** (exponent 0.00, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.118 µs | 0.129 µs | 0.119 µs | 336 B | 8,462,809 |
| 40 | 0.118 µs | 0.122 µs | 0.119 µs | 336 B | 8,456,206 |
| 80 | 0.119 µs | 0.121 µs | 0.120 µs | 336 B | 8,424,662 |
| 160 | 0.119 µs | 0.120 µs | 0.119 µs | 336 B | 8,433,729 |
| 320 | 0.119 µs | 0.120 µs | 0.241 µs | 336 B | 8,423,822 |
| 640 | 0.119 µs | 0.180 µs | 0.119 µs | 336 B | 8,411,800 |
| 1280 | 0.119 µs | 0.120 µs | 0.119 µs | 336 B | 8,432,281 |
| 2560 | 0.119 µs | 0.120 µs | 0.119 µs | 336 B | 8,414,227 |
| 5120 | 0.119 µs | 0.120 µs | 0.119 µs | 336 B | 8,422,398 |
| 10240 | 0.119 µs | 0.124 µs | 0.121 µs | 336 B | 8,374,557 |

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

**Measured: O(1)** (exponent -0.00, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.0482 µs | 0.0551 µs | 0.0500 µs | 304 B | 20,751,620 |
| 40 | 0.0472 µs | 0.0480 µs | 0.0479 µs | 304 B | 21,169,841 |
| 80 | 0.0470 µs | 0.0526 µs | 0.0476 µs | 304 B | 21,279,312 |
| 160 | 0.0470 µs | 0.0476 µs | 0.0473 µs | 304 B | 21,267,043 |
| 320 | 0.0472 µs | 0.0477 µs | 0.0477 µs | 304 B | 21,187,948 |
| 640 | 0.0475 µs | 0.0483 µs | 0.0478 µs | 304 B | 21,041,575 |
| 1280 | 0.0470 µs | 0.0475 µs | 0.0475 µs | 304 B | 21,277,162 |
| 2560 | 0.0470 µs | 0.0476 µs | 0.0477 µs | 304 B | 21,284,493 |
| 5120 | 0.0472 µs | 0.0479 µs | 0.0480 µs | 304 B | 21,183,794 |
| 10240 | 0.0472 µs | 0.0478 µs | 0.0475 µs | 304 B | 21,182,850 |

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

**Measured: O(log n)** (exponent 0.65, 10 sizes) -- 🟡 close (neighbouring class).

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.132 µs | 0.189 µs | 0.167 µs | 317 B | 7,578,150 |
| 40 | 0.141 µs | 0.156 µs | 0.176 µs | 313 B | 7,095,159 |
| 80 | 0.186 µs | 0.196 µs | 0.200 µs | 315 B | 5,373,455 |
| 160 | 0.252 µs | 0.261 µs | 0.269 µs | 316 B | 3,974,927 |
| 320 | 0.378 µs | 0.390 µs | 0.393 µs | 315 B | 2,645,503 |
| 640 | 0.619 µs | 0.674 µs | 0.636 µs | 319 B | 1,614,679 |
| 1280 | 0.948 µs | 1.00 µs | 2.26 µs | 304 B | 1,054,337 |
| 2560 | 1.81 µs | 1.85 µs | 4.24 µs | 305 B | 552,095 |
| 5120 | 3.52 µs | 3.59 µs | 7.09 µs | 305 B | 284,168 |
| 10240 | 6.96 µs | 7.09 µs | 14.2 µs | 307 B | 143,755 |

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

**Measured: O(1)** (exponent -0.01, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.0645 µs | 0.0780 µs | 0.0700 µs | 305 B | 15,511,298 |
| 40 | 0.0580 µs | 0.0677 µs | 0.0585 µs | 304 B | 17,240,711 |
| 80 | 0.0576 µs | 0.0587 µs | 0.0578 µs | 304 B | 17,368,362 |
| 160 | 0.0580 µs | 0.0586 µs | 0.0588 µs | 304 B | 17,251,287 |
| 320 | 0.0575 µs | 0.0586 µs | 0.0578 µs | 304 B | 17,379,860 |
| 640 | 0.0582 µs | 0.0588 µs | 0.0586 µs | 304 B | 17,193,264 |
| 1280 | 0.0581 µs | 0.0589 µs | 0.0587 µs | 304 B | 17,216,643 |
| 2560 | 0.0577 µs | 0.0650 µs | 0.0581 µs | 304 B | 17,336,982 |
| 5120 | 0.0575 µs | 0.0581 µs | 0.0582 µs | 304 B | 17,402,390 |
| 10240 | 0.0578 µs | 0.0586 µs | 0.0585 µs | 304 B | 17,305,946 |

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
| 20 | 0.0501 µs | 0.0534 µs | 0.0512 µs | 305 B | 19,977,500 |
| 40 | 0.0474 µs | 0.0485 µs | 0.0483 µs | 304 B | 21,100,901 |
| 80 | 0.0469 µs | 0.0477 µs | 0.0475 µs | 304 B | 21,333,333 |
| 160 | 0.0467 µs | 0.0475 µs | 0.0469 µs | 304 B | 21,431,731 |
| 320 | 0.0468 µs | 0.0868 µs | 0.0472 µs | 304 B | 21,364,372 |
| 640 | 0.0466 µs | 0.0476 µs | 0.0469 µs | 304 B | 21,450,287 |
| 1280 | 0.0468 µs | 0.0491 µs | 0.0472 µs | 304 B | 21,359,413 |
| 2560 | 0.0468 µs | 0.0483 µs | 0.0471 µs | 304 B | 21,371,938 |
| 5120 | 0.0469 µs | 0.107 µs | 0.0476 µs | 304 B | 21,328,834 |
| 10240 | 0.0474 µs | 0.0483 µs | 0.0480 µs | 304 B | 21,104,923 |

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

**Measured: O(1)** (exponent -0.01, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.164 µs | 0.171 µs | 0.169 µs | 434 B | 6,097,345 |
| 40 | 0.151 µs | 0.155 µs | 0.151 µs | 432 B | 6,632,750 |
| 80 | 0.152 µs | 0.153 µs | 0.152 µs | 432 B | 6,597,938 |
| 160 | 0.152 µs | 0.155 µs | 0.153 µs | 432 B | 6,594,928 |
| 320 | 0.153 µs | 0.177 µs | 0.154 µs | 432 B | 6,529,899 |
| 640 | 0.152 µs | 0.155 µs | 0.609 µs | 432 B | 6,598,949 |
| 1280 | 0.150 µs | 0.152 µs | 0.152 µs | 432 B | 6,652,192 |
| 2560 | 0.151 µs | 0.152 µs | 0.723 µs | 432 B | 6,637,168 |
| 5120 | 0.151 µs | 0.154 µs | 0.724 µs | 432 B | 6,637,168 |
| 10240 | 0.151 µs | 0.153 µs | 0.744 µs | 432 B | 6,644,190 |

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

**Measured: O(log n)** (exponent 0.22, 10 sizes) -- 🟡 close (neighbouring class).

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.0590 µs | 0.0638 µs | 0.0612 µs | 304 B | 16,955,436 |
| 40 | 0.0597 µs | 0.0610 µs | 0.0608 µs | 304 B | 16,748,480 |
| 80 | 0.0594 µs | 0.0602 µs | 0.0600 µs | 304 B | 16,836,151 |
| 160 | 0.0611 µs | 0.0641 µs | 0.0618 µs | 304 B | 16,366,409 |
| 320 | 0.0643 µs | 0.0650 µs | 0.0653 µs | 304 B | 15,557,422 |
| 640 | 0.0713 µs | 0.0722 µs | 0.0720 µs | 304 B | 14,020,218 |
| 1280 | 0.0834 µs | 0.0844 µs | 0.0839 µs | 304 B | 11,992,016 |
| 2560 | 0.116 µs | 0.119 µs | 0.116 µs | 304 B | 8,655,960 |
| 5120 | 0.174 µs | 0.175 µs | 0.792 µs | 304 B | 5,749,421 |
| 10240 | 0.260 µs | 0.270 µs | 1.03 µs | 304 B | 3,843,632 |

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

**Measured: O(1)** (exponent -0.01, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.0501 µs | 0.0523 µs | 0.0506 µs | 305 B | 19,958,315 |
| 40 | 0.0473 µs | 0.0485 µs | 0.0480 µs | 304 B | 21,151,487 |
| 80 | 0.0468 µs | 0.0476 µs | 0.0472 µs | 304 B | 21,368,190 |
| 160 | 0.0467 µs | 0.0478 µs | 0.0470 µs | 304 B | 21,392,659 |
| 320 | 0.0469 µs | 0.0477 µs | 0.0474 µs | 304 B | 21,321,508 |
| 640 | 0.0468 µs | 0.0476 µs | 0.0471 µs | 304 B | 21,356,146 |
| 1280 | 0.0468 µs | 0.0480 µs | 0.0475 µs | 304 B | 21,348,165 |
| 2560 | 0.0467 µs | 0.0475 µs | 0.0471 µs | 304 B | 21,435,528 |
| 5120 | 0.0471 µs | 0.0479 µs | 0.0476 µs | 304 B | 21,212,533 |
| 10240 | 0.0467 µs | 0.0475 µs | 0.0471 µs | 304 B | 21,427,678 |

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

**Measured: O(1)** (exponent -0.00, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.0495 µs | 0.0518 µs | 0.0506 µs | 305 B | 20,196,855 |
| 40 | 0.0481 µs | 0.0488 µs | 0.0487 µs | 304 B | 20,773,322 |
| 80 | 0.0480 µs | 0.0488 µs | 0.0488 µs | 304 B | 20,838,978 |
| 160 | 0.0477 µs | 0.0486 µs | 0.0481 µs | 304 B | 20,958,084 |
| 320 | 0.0478 µs | 0.0484 µs | 0.0481 µs | 304 B | 20,924,551 |
| 640 | 0.0479 µs | 0.114 µs | 0.0484 µs | 304 B | 20,883,578 |
| 1280 | 0.0486 µs | 0.0496 µs | 0.0493 µs | 304 B | 20,571,335 |
| 2560 | 0.0483 µs | 0.0492 µs | 0.0490 µs | 304 B | 20,721,691 |
| 5120 | 0.0478 µs | 0.0492 µs | 0.0490 µs | 304 B | 20,905,669 |
| 10240 | 0.0478 µs | 0.0492 µs | 0.0480 µs | 304 B | 20,904,039 |

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

**Measured: O(log n)** (exponent 0.54, 10 sizes) -- 🟡 close (neighbouring class).

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.102 µs | 0.128 µs | 0.120 µs | 317 B | 9,834,776 |
| 40 | 0.101 µs | 0.110 µs | 0.129 µs | 314 B | 9,920,000 |
| 80 | 0.112 µs | 0.116 µs | 0.147 µs | 313 B | 8,966,245 |
| 160 | 0.145 µs | 0.155 µs | 0.179 µs | 312 B | 6,883,163 |
| 320 | 0.225 µs | 0.241 µs | 0.250 µs | 314 B | 4,438,896 |
| 640 | 0.330 µs | 0.339 µs | 0.353 µs | 313 B | 3,033,547 |
| 1280 | 0.437 µs | 0.448 µs | 1.24 µs | 304 B | 2,288,814 |
| 2560 | 0.783 µs | 0.795 µs | 2.05 µs | 304 B | 1,277,170 |
| 5120 | 1.47 µs | 1.50 µs | 3.36 µs | 305 B | 679,870 |
| 10240 | 2.86 µs | 2.98 µs | 6.22 µs | 305 B | 349,730 |

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

**Measured: O(1)** (exponent -0.00, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.0478 µs | 0.0594 µs | 0.0480 µs | 304 B | 20,942,408 |
| 40 | 0.0472 µs | 0.0480 µs | 0.0479 µs | 304 B | 21,175,370 |
| 80 | 0.0476 µs | 0.0483 µs | 0.0482 µs | 304 B | 20,987,289 |
| 160 | 0.0475 µs | 0.0484 µs | 0.0482 µs | 304 B | 21,046,871 |
| 320 | 0.0472 µs | 0.0480 µs | 0.0476 µs | 304 B | 21,173,556 |
| 640 | 0.0476 µs | 0.0484 µs | 0.0480 µs | 304 B | 21,015,688 |
| 1280 | 0.0473 µs | 0.0480 µs | 0.0476 µs | 304 B | 21,152,733 |
| 2560 | 0.0472 µs | 0.0484 µs | 0.0476 µs | 304 B | 21,169,560 |
| 5120 | 0.0476 µs | 0.0486 µs | 0.0481 µs | 304 B | 21,029,389 |
| 10240 | 0.0477 µs | 0.0483 µs | 0.0481 µs | 304 B | 20,974,790 |

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
| 20 | 0.0474 µs | 0.0594 µs | 0.0480 µs | 304 B | 21,076,913 |
| 40 | 0.0479 µs | 0.0485 µs | 0.0487 µs | 304 B | 20,898,281 |
| 80 | 0.0486 µs | 0.0502 µs | 0.0498 µs | 304 B | 20,587,514 |
| 160 | 0.0474 µs | 0.0751 µs | 0.0480 µs | 304 B | 21,098,827 |
| 320 | 0.0474 µs | 0.0488 µs | 0.0480 µs | 304 B | 21,108,179 |
| 640 | 0.0476 µs | 0.0486 µs | 0.0480 µs | 304 B | 21,007,874 |
| 1280 | 0.0468 µs | 0.0477 µs | 0.0472 µs | 304 B | 21,357,357 |
| 2560 | 0.0479 µs | 0.0483 µs | 0.0482 µs | 304 B | 20,876,647 |
| 5120 | 0.0482 µs | 0.0492 µs | 0.0488 µs | 304 B | 20,751,133 |
| 10240 | 0.0491 µs | 0.0571 µs | 0.0493 µs | 304 B | 20,373,514 |

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
| 20 | 0.0486 µs | 0.0601 µs | 0.0500 µs | 304 B | 20,578,778 |
| 40 | 0.0481 µs | 0.0513 µs | 0.0488 µs | 304 B | 20,792,254 |
| 80 | 0.0475 µs | 0.0483 µs | 0.0479 µs | 304 B | 21,051,431 |
| 160 | 0.0478 µs | 0.0482 µs | 0.0482 µs | 304 B | 20,935,215 |
| 320 | 0.0476 µs | 0.0485 µs | 0.0480 µs | 304 B | 21,006,417 |
| 640 | 0.0475 µs | 0.0483 µs | 0.0478 µs | 304 B | 21,064,622 |
| 1280 | 0.0478 µs | 0.0483 µs | 0.0480 µs | 304 B | 20,934,685 |
| 2560 | 0.0477 µs | 0.0484 µs | 0.0481 µs | 304 B | 20,983,052 |
| 5120 | 0.0477 µs | 0.0486 µs | 0.0480 µs | 304 B | 20,972,422 |
| 10240 | 0.0475 µs | 0.0485 µs | 0.0479 µs | 304 B | 21,066,959 |

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

**Measured: O(1)** (exponent -0.00, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.0482 µs | 0.0549 µs | 0.0487 µs | 304 B | 20,762,646 |
| 40 | 0.0478 µs | 0.0482 µs | 0.0480 µs | 304 B | 20,934,466 |
| 80 | 0.0476 µs | 0.0485 µs | 0.0479 µs | 304 B | 20,997,812 |
| 160 | 0.0479 µs | 0.0486 µs | 0.0485 µs | 304 B | 20,889,228 |
| 320 | 0.0476 µs | 0.0488 µs | 0.0485 µs | 304 B | 20,996,764 |
| 640 | 0.0482 µs | 0.0489 µs | 0.0488 µs | 304 B | 20,741,284 |
| 1280 | 0.0475 µs | 0.0483 µs | 0.0479 µs | 304 B | 21,059,377 |
| 2560 | 0.0475 µs | 0.0493 µs | 0.0480 µs | 304 B | 21,062,192 |
| 5120 | 0.0475 µs | 0.0482 µs | 0.0479 µs | 304 B | 21,043,860 |
| 10240 | 0.0477 µs | 0.0484 µs | 0.0480 µs | 304 B | 20,958,743 |

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
| 20 | 0.0479 µs | 0.0542 µs | 0.0481 µs | 304 B | 20,894,640 |
| 40 | 0.0480 µs | 0.0495 µs | 0.0487 µs | 304 B | 20,816,428 |
| 80 | 0.0475 µs | 0.0491 µs | 0.0481 µs | 304 B | 21,050,602 |
| 160 | 0.0477 µs | 0.0573 µs | 0.0507 µs | 304 B | 20,962,656 |
| 320 | 0.0474 µs | 0.112 µs | 0.0781 µs | 304 B | 21,098,447 |
| 640 | 0.0473 µs | 0.126 µs | 0.0928 µs | 304 B | 21,138,577 |
| 1280 | 0.0474 µs | 0.0480 µs | 0.0485 µs | 304 B | 21,109,376 |
| 2560 | 0.0484 µs | 0.0517 µs | 0.0495 µs | 304 B | 20,642,166 |
| 5120 | 0.0478 µs | 0.0486 µs | 0.0482 µs | 304 B | 20,917,847 |
| 10240 | 0.0475 µs | 0.0481 µs | 0.0478 µs | 304 B | 21,049,129 |

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

**Measured: O(1)** (exponent -0.00, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.0489 µs | 0.0522 µs | 0.0500 µs | 304 B | 20,469,258 |
| 40 | 0.0481 µs | 0.0489 µs | 0.0488 µs | 304 B | 20,809,613 |
| 80 | 0.0481 µs | 0.0488 µs | 0.0485 µs | 304 B | 20,783,373 |
| 160 | 0.0479 µs | 0.0488 µs | 0.0484 µs | 304 B | 20,890,449 |
| 320 | 0.0481 µs | 0.0514 µs | 0.0484 µs | 304 B | 20,800,458 |
| 640 | 0.0483 µs | 0.0486 µs | 0.0485 µs | 304 B | 20,716,587 |
| 1280 | 0.0480 µs | 0.0488 µs | 0.0484 µs | 304 B | 20,822,435 |
| 2560 | 0.0479 µs | 0.0488 µs | 0.0484 µs | 304 B | 20,868,310 |
| 5120 | 0.0481 µs | 0.0488 µs | 0.0486 µs | 304 B | 20,810,253 |
| 10240 | 0.0481 µs | 0.0491 µs | 0.0486 µs | 304 B | 20,785,241 |

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

**Measured: O(1)** (exponent -0.00, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.0474 µs | 0.0535 µs | 0.0480 µs | 304 B | 21,077,481 |
| 40 | 0.0473 µs | 0.0481 µs | 0.0476 µs | 304 B | 21,141,577 |
| 80 | 0.0477 µs | 0.0552 µs | 0.0483 µs | 304 B | 20,962,656 |
| 160 | 0.0471 µs | 0.0481 µs | 0.0475 µs | 304 B | 21,214,319 |
| 320 | 0.0471 µs | 0.0478 µs | 0.0475 µs | 304 B | 21,253,599 |
| 640 | 0.0473 µs | 0.0503 µs | 0.0476 µs | 304 B | 21,152,542 |
| 1280 | 0.0472 µs | 0.0478 µs | 0.0476 µs | 304 B | 21,178,182 |
| 2560 | 0.0472 µs | 0.0476 µs | 0.0475 µs | 304 B | 21,198,759 |
| 5120 | 0.0472 µs | 0.0477 µs | 0.0475 µs | 304 B | 21,191,082 |
| 10240 | 0.0474 µs | 0.0485 µs | 0.0480 µs | 304 B | 21,089,705 |

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

**Measured: O(1)** (exponent -0.00, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.0488 µs | 0.0652 µs | 0.0500 µs | 304 B | 20,512,821 |
| 40 | 0.0486 µs | 0.0496 µs | 0.0495 µs | 304 B | 20,574,894 |
| 80 | 0.0482 µs | 0.0681 µs | 0.0492 µs | 304 B | 20,749,399 |
| 160 | 0.0487 µs | 0.0540 µs | 0.0495 µs | 304 B | 20,535,446 |
| 320 | 0.0500 µs | 0.0614 µs | 0.0507 µs | 305 B | 19,982,533 |
| 640 | 0.0487 µs | 0.0682 µs | 0.0500 µs | 304 B | 20,516,766 |
| 1280 | 0.0485 µs | 0.0495 µs | 0.0490 µs | 304 B | 20,639,175 |
| 2560 | 0.0481 µs | 0.0596 µs | 0.0490 µs | 304 B | 20,797,700 |
| 5120 | 0.0480 µs | 0.0531 µs | 0.0491 µs | 304 B | 20,818,567 |
| 10240 | 0.0482 µs | 0.0503 µs | 0.0491 µs | 304 B | 20,736,571 |

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

**Measured: O(n)** (exponent 0.80, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.0773 µs | 0.0962 µs | 0.0786 µs | 304 B | 12,937,049 |
| 40 | 0.117 µs | 0.119 µs | 0.119 µs | 304 B | 8,523,862 |
| 80 | 0.205 µs | 0.209 µs | 0.726 µs | 304 B | 4,875,000 |
| 160 | 0.250 µs | 0.254 µs | 0.924 µs | 304 B | 3,999,496 |
| 320 | 0.555 µs | 0.573 µs | 1.97 µs | 305 B | 1,800,354 |
| 640 | 1.16 µs | 1.19 µs | 2.79 µs | 305 B | 862,957 |
| 1280 | 1.31 µs | 1.34 µs | 3.14 µs | 305 B | 764,032 |
| 2560 | 3.78 µs | 3.83 µs | 8.46 µs | 306 B | 264,335 |
| 5120 | 8.59 µs | 8.69 µs | 18.4 µs | 307 B | 116,470 |
| 10240 | 7.39 µs | 7.73 µs | 16.7 µs | 307 B | 135,233 |

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
| 20 | 0.0477 µs | 0.0533 µs | 0.0481 µs | 304 B | 20,972,171 |
| 40 | 0.0475 µs | 0.0483 µs | 0.0481 µs | 304 B | 21,065,789 |
| 80 | 0.0487 µs | 0.0507 µs | 0.0500 µs | 304 B | 20,534,759 |
| 160 | 0.0475 µs | 0.0585 µs | 0.0479 µs | 304 B | 21,061,562 |
| 320 | 0.0476 µs | 0.0587 µs | 0.0481 µs | 304 B | 21,006,473 |
| 640 | 0.0474 µs | 0.0487 µs | 0.0479 µs | 304 B | 21,083,077 |
| 1280 | 0.0481 µs | 0.0558 µs | 0.0487 µs | 304 B | 20,803,119 |
| 2560 | 0.0479 µs | 0.0584 µs | 0.0487 µs | 304 B | 20,857,667 |
| 5120 | 0.0482 µs | 0.0491 µs | 0.0486 µs | 304 B | 20,752,381 |
| 10240 | 0.0475 µs | 0.0609 µs | 0.0481 µs | 304 B | 21,051,313 |

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
| 20 | 0.158 µs | 0.181 µs | 0.160 µs | 433 B | 6,342,052 |
| 40 | 0.158 µs | 0.162 µs | 0.159 µs | 433 B | 6,344,227 |
| 80 | 0.153 µs | 0.155 µs | 0.154 µs | 432 B | 6,555,352 |
| 160 | 0.154 µs | 0.157 µs | 0.154 µs | 432 B | 6,514,380 |
| 320 | 0.154 µs | 0.156 µs | 0.154 µs | 432 B | 6,508,619 |
| 640 | 0.154 µs | 0.170 µs | 0.743 µs | 432 B | 6,507,592 |
| 1280 | 0.153 µs | 0.216 µs | 0.154 µs | 432 B | 6,541,877 |
| 2560 | 0.153 µs | 0.156 µs | 0.712 µs | 432 B | 6,537,283 |
| 5120 | 0.153 µs | 0.155 µs | 0.153 µs | 432 B | 6,545,455 |
| 10240 | 0.153 µs | 0.171 µs | 0.735 µs | 432 B | 6,544,246 |

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

**Measured: O(1)** (exponent -0.00, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.0473 µs | 0.0549 µs | 0.0481 µs | 304 B | 21,145,281 |
| 40 | 0.0473 µs | 0.0481 µs | 0.0477 µs | 304 B | 21,157,593 |
| 80 | 0.0469 µs | 0.0475 µs | 0.0475 µs | 304 B | 21,314,236 |
| 160 | 0.0469 µs | 0.0478 µs | 0.0472 µs | 304 B | 21,307,317 |
| 320 | 0.0479 µs | 0.0626 µs | 0.0490 µs | 304 B | 20,861,090 |
| 640 | 0.0469 µs | 0.0476 µs | 0.0472 µs | 304 B | 21,333,333 |
| 1280 | 0.0467 µs | 0.0471 µs | 0.0469 µs | 304 B | 21,400,201 |
| 2560 | 0.0469 µs | 0.0475 µs | 0.0472 µs | 304 B | 21,336,000 |
| 5120 | 0.0469 µs | 0.0480 µs | 0.0471 µs | 304 B | 21,308,723 |
| 10240 | 0.0471 µs | 0.0477 µs | 0.0477 µs | 304 B | 21,228,395 |

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
| 20 | 0.0477 µs | 0.0547 µs | 0.0483 µs | 304 B | 20,977,279 |
| 40 | 0.0480 µs | 0.0490 µs | 0.0488 µs | 304 B | 20,817,680 |
| 80 | 0.0474 µs | 0.0478 µs | 0.0476 µs | 304 B | 21,090,006 |
| 160 | 0.0476 µs | 0.0481 µs | 0.0479 µs | 304 B | 21,013,077 |
| 320 | 0.0476 µs | 0.0485 µs | 0.0482 µs | 304 B | 21,010,713 |
| 640 | 0.0476 µs | 0.0482 µs | 0.0482 µs | 304 B | 21,027,744 |
| 1280 | 0.0477 µs | 0.0483 µs | 0.0485 µs | 304 B | 20,951,623 |
| 2560 | 0.0475 µs | 0.0483 µs | 0.0480 µs | 304 B | 21,055,374 |
| 5120 | 0.0477 µs | 0.0487 µs | 0.0481 µs | 304 B | 20,966,534 |
| 10240 | 0.0475 µs | 0.0479 µs | 0.0480 µs | 304 B | 21,062,192 |

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
| 20 | 0.0481 µs | 0.0658 µs | 0.0489 µs | 304 B | 20,773,582 |
| 40 | 0.0479 µs | 0.0487 µs | 0.0488 µs | 304 B | 20,894,640 |
| 80 | 0.0479 µs | 0.0606 µs | 0.0487 µs | 304 B | 20,857,438 |
| 160 | 0.0486 µs | 0.0618 µs | 0.0500 µs | 304 B | 20,565,553 |
| 320 | 0.0480 µs | 0.0612 µs | 0.0532 µs | 304 B | 20,830,080 |
| 640 | 0.0479 µs | 0.0568 µs | 0.0488 µs | 304 B | 20,869,026 |
| 1280 | 0.0485 µs | 0.0496 µs | 0.0498 µs | 304 B | 20,622,222 |
| 2560 | 0.0481 µs | 0.0617 µs | 0.0491 µs | 304 B | 20,775,760 |
| 5120 | 0.0481 µs | 0.0543 µs | 0.0490 µs | 304 B | 20,780,287 |
| 10240 | 0.0478 µs | 0.0484 µs | 0.0481 µs | 304 B | 20,933,333 |

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

**Measured: O(1)** (exponent -0.00, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.0511 µs | 0.0656 µs | 0.0541 µs | 305 B | 19,565,571 |
| 40 | 0.0493 µs | 0.0505 µs | 0.0500 µs | 304 B | 20,304,569 |
| 80 | 0.0476 µs | 0.0482 µs | 0.0480 µs | 304 B | 20,993,057 |
| 160 | 0.0476 µs | 0.0503 µs | 0.0479 µs | 304 B | 20,990,279 |
| 320 | 0.0477 µs | 0.0482 µs | 0.0482 µs | 304 B | 20,968,859 |
| 640 | 0.0478 µs | 0.0524 µs | 0.0483 µs | 304 B | 20,904,348 |
| 1280 | 0.0491 µs | 0.0499 µs | 0.0495 µs | 304 B | 20,357,804 |
| 2560 | 0.0477 µs | 0.0484 µs | 0.0479 µs | 304 B | 20,967,347 |
| 5120 | 0.0487 µs | 0.0499 µs | 0.0490 µs | 304 B | 20,547,365 |
| 10240 | 0.0487 µs | 0.0632 µs | 0.0490 µs | 304 B | 20,539,249 |

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
| 20 | 0.0505 µs | 0.0531 µs | 0.0519 µs | 305 B | 19,787,611 |
| 40 | 0.0471 µs | 0.0476 µs | 0.0477 µs | 304 B | 21,238,653 |
| 80 | 0.0467 µs | 0.0473 µs | 0.0471 µs | 304 B | 21,395,764 |
| 160 | 0.0468 µs | 0.0473 µs | 0.0470 µs | 304 B | 21,368,889 |
| 320 | 0.0468 µs | 0.0474 µs | 0.0473 µs | 304 B | 21,371,336 |
| 640 | 0.0467 µs | 0.0535 µs | 0.0472 µs | 304 B | 21,392,991 |
| 1280 | 0.0472 µs | 0.0482 µs | 0.0478 µs | 304 B | 21,196,176 |
| 2560 | 0.0469 µs | 0.0473 µs | 0.0470 µs | 304 B | 21,334,442 |
| 5120 | 0.0468 µs | 0.0475 µs | 0.0470 µs | 304 B | 21,361,104 |
| 10240 | 0.0471 µs | 0.0480 µs | 0.0475 µs | 304 B | 21,230,769 |

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

**Measured: O(n)** (exponent 1.07, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.307 µs | 0.350 µs | 0.310 µs | 1.5 KiB | 3,261,462 |
| 40 | 0.580 µs | 0.591 µs | 2.57 µs | 2.8 KiB | 1,722,709 |
| 80 | 1.11 µs | 1.16 µs | 3.33 µs | 5.4 KiB | 902,189 |
| 160 | 2.15 µs | 2.20 µs | 6.14 µs | 10.4 KiB | 464,396 |
| 320 | 4.34 µs | 4.88 µs | 11.7 µs | 20.5 KiB | 230,642 |
| 640 | 8.68 µs | 9.54 µs | 22.0 µs | 42.3 KiB | 115,148 |
| 1280 | 18.6 µs | 21.3 µs | 43.1 µs | 84.7 KiB | 53,623 |
| 2560 | 40.8 µs | 46.7 µs | 88.4 µs | 169.6 KiB | 24,508 |
| 5120 | 107 µs | 121 µs | 224 µs | 330.1 KiB | 9,352 |
| 10240 | 254 µs | 270 µs | 489 µs | 645.7 KiB | 3,934 |

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

**Measured: O(log n)** (exponent 0.51, 10 sizes) -- 🟡 close (neighbouring class).

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.194 µs | 0.255 µs | 0.197 µs | 577 B | 5,149,924 |
| 40 | 0.208 µs | 0.212 µs | 0.209 µs | 601 B | 4,817,619 |
| 80 | 0.206 µs | 0.211 µs | 0.208 µs | 640 B | 4,854,649 |
| 160 | 0.252 µs | 0.258 µs | 0.253 µs | 721 B | 3,969,136 |
| 320 | 0.317 µs | 0.326 µs | 1.47 µs | 881 B | 3,149,869 |
| 640 | 0.481 µs | 0.507 µs | 0.489 µs | 1.2 KiB | 2,078,125 |
| 1280 | 0.766 µs | 0.781 µs | 2.68 µs | 1.8 KiB | 1,305,613 |
| 2560 | 1.33 µs | 1.53 µs | 3.88 µs | 3.0 KiB | 750,532 |
| 5120 | 2.41 µs | 2.46 µs | 6.26 µs | 5.6 KiB | 415,446 |
| 10240 | 4.53 µs | 4.65 µs | 10.8 µs | 10.6 KiB | 220,537 |

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

**Measured: O(1)** (exponent -0.03, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.241 µs | 0.347 µs | 0.278 µs | 602 B | 4,154,166 |
| 40 | 0.158 µs | 0.173 µs | 0.159 µs | 584 B | 6,324,444 |
| 80 | 0.157 µs | 0.161 µs | 0.158 µs | 584 B | 6,368,549 |
| 160 | 0.157 µs | 0.161 µs | 0.158 µs | 584 B | 6,376,083 |
| 320 | 0.157 µs | 0.160 µs | 0.158 µs | 584 B | 6,369,395 |
| 640 | 0.157 µs | 0.159 µs | 0.627 µs | 584 B | 6,382,218 |
| 1280 | 0.157 µs | 0.162 µs | 0.159 µs | 584 B | 6,366,156 |
| 2560 | 0.157 µs | 0.163 µs | 0.768 µs | 584 B | 6,378,612 |
| 5120 | 0.158 µs | 0.162 µs | 0.630 µs | 584 B | 6,318,614 |
| 10240 | 0.158 µs | 0.170 µs | 0.160 µs | 584 B | 6,326,925 |

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

**Measured: O(1)** (exponent 0.00, 10 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 0.156 µs | 0.160 µs | 0.158 µs | 584 B | 6,404,270 |
| 40 | 0.157 µs | 0.159 µs | 0.762 µs | 584 B | 6,370,203 |
| 80 | 0.156 µs | 0.159 µs | 0.157 µs | 584 B | 6,400,586 |
| 160 | 0.155 µs | 0.159 µs | 0.158 µs | 584 B | 6,434,063 |
| 320 | 0.156 µs | 0.167 µs | 0.282 µs | 584 B | 6,413,462 |
| 640 | 0.156 µs | 0.159 µs | 0.229 µs | 584 B | 6,392,961 |
| 1280 | 0.156 µs | 0.159 µs | 0.157 µs | 584 B | 6,402,373 |
| 2560 | 0.158 µs | 0.169 µs | 0.160 µs | 585 B | 6,322,471 |
| 5120 | 0.157 µs | 0.167 µs | 0.158 µs | 584 B | 6,384,140 |
| 10240 | 0.157 µs | 0.159 µs | 0.628 µs | 584 B | 6,382,835 |

## 3. What makes up the end-to-end overhead

Each function's measured cost is multiplied by how many times one end-to-end operation calls it, then compared with the total overhead from section 1. This shows where the cost actually lives, so effort goes to the function that matters. Shares are estimates: they can sum to slightly more or less than 100% because the two measurements were taken separately (the remainder is shown as _unattributed_).

**At 640 variables** (total added: 135 µs)

| Function | Calls / operation | Estimated time | Share of added time | Share of operation |
| --- | --- | --- | --- | --- |
| `validate-env` | 1 | 181 µs | 134% | 100% |
| _unattributed_ |  | 0 | 0.0% |  |

**At 10240 variables** (total added: 679 µs)

| Function | Calls / operation | Estimated time | Share of added time | Share of operation |
| --- | --- | --- | --- | --- |
| `validate-env` | 1 | 1.57 ms | 231% | 105% |
| _unattributed_ |  | 0 | 0.0% |  |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-01T14:25:21.321Z` → `2026-10-01T14:26:14.861Z` (54 s), npm run benchmark
- Machine: Apple M3, 8 logical core(s) (8 physical), 24576 MB RAM, darwin/arm64, Node v24.20.0, local
- Git: `116792252ae9113f67e8a4b1f08a90d30ce82459` on `chore/no-minify-no-dist-urls` (uncommitted changes)
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 variables -- One environment variable declared in a contract and validated at startup. 640 is a large but realistic service: a few dozen contracts of around ten variables each.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

