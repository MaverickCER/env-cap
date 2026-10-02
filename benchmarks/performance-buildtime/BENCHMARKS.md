# env-cap: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 variables** per operation, routing the work through `env-cap` adds **90.9 ms** per operation compared with a bare-minimum baseline (22× baseline), about **$0.189 – $1.83 per million operations** of compute. Overall, it grows O(n) with workload size (measured exponent 0.87).

> Dollar figures are **estimates** from published list prices (see _Cost model_ below) and are for comparing orders of magnitude, not for budgeting to the cent.

| Cost | Typical (640 variables) | Largest (5120 variables) |
| --- | --- | --- |
| Added latency per operation | 90.9 ms | 909 ms |
| Added latency, relative to baseline | 22× baseline | 29× baseline |
| Added CPU time per operation | 163 ms | 1.15 s |
| Added memory per operation (heap delta) | 32.3 MiB | 122.2 MiB |
| Estimated compute cost per 1M operations | $0.189 – $1.83 | $1.89 – $12.96 |
| Single-core throughput ceiling of the overhead alone | 11 ops/s | 1 ops/s |
| Shipped code parsed at every cold start (gzip) | 42.4 KiB | 42.4 KiB |

## 1. End-to-end: the package's total impact

Shows what a pipeline run or a developer pays to regenerate every env-cap artifact (manifest, documentation and usage report) for a project, compared with the bare minimum of just reading every schema file. The baseline is the unavoidable floor -- the files must at least be read -- so the difference is env-cap's parsing, linking and rendering. This is CI and development time, paid on every build, not request-time cost.

- **Baseline (no package):** Walk the project directory and read every schema file as text -- no env-cap.
- **With the package:** `generateEnvArtifacts` discovers, parses and links every schema once and writes the manifest, the documentation and the usage report.

Both sides use empty or minimal functions on purpose, so the difference is the package's own cost -- not the cost of the work an application would plug into it. Real applications add their own work on top; this is the floor the package imposes.

**Variables that could change this result**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| declared variables | swept | The tier axis: how many environment variables are declared across the project (ten per schema file, so the file count grows with it). |
| schema content | fixed at "realistic generated TypeScript: JSON-credential processors, validators and documentEnv calls" | Parsing cost depends on source-text volume and variety; the fixtures are literal TypeScript source, never executed by the tooling. |
| filesystem | fixed at "local SSD through the Node adapter" | A network or virtual filesystem adds latency per file; not covered. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |
| artifacts requested | fixed at "manifest + docs + usage report" | Requesting fewer artifacts costs less; each standalone generator is measured below. |
| cache state | fixed at "no incremental cache" | Every run parses from scratch; the tooling keeps no build cache. |

The baseline is an empty or minimal function, so it costs almost nothing and the _relative_ overhead can look enormous (shown as a multiple of the baseline). Read the absolute columns -- time, CPU and dollars added -- they are what a bill and a latency budget are made of.

| variables | Baseline | With package | Added | Added vs baseline | Added CPU | Est. $ / 1M ops |
| --- | --- | --- | --- | --- | --- | --- |
| 20 | 268 µs | 7.05 ms | 6.78 ms | 26× baseline | 14.5 ms | $0.014 – $0.163 |
| 40 | 467 µs | 10.5 ms | 10.1 ms | 23× baseline | 17.6 ms | $0.021 – $0.198 |
| 80 | 704 µs | 18.0 ms | 17.3 ms | 26× baseline | 36.2 ms | $0.036 – $0.407 |
| 160 | 1.56 ms | 30.7 ms | 29.2 ms | 20× baseline | 67.3 ms | $0.061 – $0.757 |
| 320 | 2.40 ms | 55.6 ms | 53.2 ms | 23× baseline | 112 ms | $0.111 – $1.26 |
| 640 | 4.32 ms | 95.2 ms | 90.9 ms | 22× baseline | 163 ms | $0.189 – $1.83 |
| 1280 | 8.12 ms | 183 ms | 175 ms | 23× baseline | 272 ms | $0.364 – $3.06 |
| 2560 | 16.3 ms | 377 ms | 361 ms | 23× baseline | 511 ms | $0.752 – $5.75 |
| 5120 | 32.0 ms | 941 ms | 909 ms | 29× baseline | 1.15 s | $1.89 – $12.96 |

**How the total grows:** O(n) (linear), exponent 0.87 over 9 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 640 | At 5120 |
| --- | --- | --- | --- | --- | --- |
| `discoverSchemaFiles` | O(n) | O(n) | ✅ matches | 1.96 ms | 13.7 ms |
| `generateEnvManifest` (all-contracts) | O(n) | O(n) | ✅ matches | 33.2 ms | 404 ms |
| `generateEnvManifest` (one-contract-scoped) | O(1) | O(log n) | 🟡 close (neighbouring class) | 4.18 ms | 14.5 ms |
| `generateDocumentation` (minimal-docs) | O(n) | O(n) | ✅ matches | 33.6 ms | 230 ms |
| `generateDocumentation` (heavy-docs) | O(n) | O(n) | ✅ matches | 43.1 ms | 309 ms |
| `generateUsageReport` | O(n) | O(n) | ✅ matches | 61.4 ms | 361 ms |
| `generateEnvArtifacts` | O(n) | O(n) | ✅ matches | 90.3 ms | 905 ms |
| `generateEvidenceModel` | O(n) | O(n) | ✅ matches | 80.1 ms | 544 ms |
| `defineEvidenceProjection (project)` | O(n) | O(n) | ✅ matches | 9.93 ms | 86.3 ms |

### `discoverSchemaFiles`

**Why we benchmark it.** Every build-time command starts by finding the project's schema files, so its cost is paid first by every generator and every CI run.

**What poor performance would mean.** Every pipeline step that touches env-cap starts later, and a super-linear regression would slow monorepos with thousands of files before any real work begins.

**Expected growth: O(n).** It walks the directory tree once and tests each path against the include and exclude patterns, so cost is proportional to the number of files visited.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| declared variables | swept | The tier axis: how many environment variables are declared across the project (ten per schema file, so the file count grows with it). |
| filesystem | fixed at "local SSD through the Node adapter" | A network or virtual filesystem adds latency per file; not covered. |
| directory depth | fixed at "one level of contract folders" | Deeper trees add a directory read per level. |
| unrelated files | fixed at "none" | Real repositories hold many non-schema files that must also be walked; a pure schema tree is the best case. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Once at the start of every artifact generation.

**Measured: O(n)** (exponent 0.77, 9 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 235 µs | 240 µs | 998 µs | 52.0 KiB | 4,247 |
| 40 | 231 µs | 246 µs | 748 µs | 86.1 KiB | 4,325 |
| 80 | 388 µs | 447 µs | 1.15 ms | 159.4 KiB | 2,577 |
| 160 | 611 µs | 962 µs | 1.41 ms | 303.2 KiB | 1,637 |
| 320 | 1.13 ms | 1.26 ms | 2.67 ms | 595.7 KiB | 888 |
| 640 | 1.96 ms | 2.09 ms | 3.50 ms | 1.1 MiB | 510 |
| 1280 | 3.56 ms | 3.67 ms | 5.10 ms | 2.3 MiB | 281 |
| 2560 | 6.91 ms | 7.19 ms | 8.68 ms | 4.5 MiB | 145 |
| 5120 | 13.7 ms | 14.2 ms | 15.4 ms | 9.0 MiB | 73 |

### `generateEnvManifest`

**Why we benchmark it.** Produces the manifest the application imports at runtime; it runs in every build that ships the application.

**What poor performance would mean.** Build time grows with the amount of configuration; a regression delays every deploy that regenerates the manifest.

**Expected growth: O(n).** It discovers the files, parses each with the TypeScript parser once and renders one manifest entry per contract, so cost is proportional to the source text parsed.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| declared variables | swept | The tier axis: how many environment variables are declared across the project (ten per schema file, so the file count grows with it). |
| schema content | fixed at "realistic generated TypeScript: JSON-credential processors, validators and documentEnv calls" | Parsing cost depends on source-text volume and variety; the fixtures are literal TypeScript source, never executed by the tooling. |
| filesystem | fixed at "local SSD through the Node adapter" | A network or virtual filesystem adds latency per file; not covered. |
| scope | variant | All contracts versus a single contract selected with `include`. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**Deliberately not covered**

- **incompatible schemas** -- Files the parser cannot handle take a warning path; the benchmark uses only supported schemas.

#### Variant `all-contracts`

The manifest covers every schema file in the project.

**Measured: O(n)** (exponent 0.89, 9 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.59 ms | 3.55 ms | 9.91 ms | 1.1 MiB | 386 |
| 40 | 4.57 ms | 4.85 ms | 17.7 ms | 2.1 MiB | 219 |
| 80 | 5.98 ms | 6.95 ms | 18.5 ms | 4.0 MiB | 167 |
| 160 | 10.4 ms | 11.2 ms | 33.8 ms | 8.1 MiB | 96 |
| 320 | 17.1 ms | 18.5 ms | 44.2 ms | 17.1 MiB | 59 |
| 640 | 33.2 ms | 33.8 ms | 68.1 ms | 34.4 MiB | 30 |
| 1280 | 67.5 ms | 70.2 ms | 114 ms | 18.5 MiB | 15 |
| 2560 | 166 ms | 227 ms | 235 ms | 32.8 MiB | 6 |
| 5120 | 404 ms | 424 ms | 549 ms | 7.7 MiB | 2 |

#### Variant `one-contract-scoped`

An `include` selects one schema file; discovery still walks the tree but only that file is parsed.

**Expected for this variant: O(1).** Only the one selected file is parsed and rendered, and parsing dominates the cost; the directory walk that still happens grows with the tree but is tiny next to parsing, so the curve is effectively flat.

**Measured: O(log n)** (exponent 0.35, 9 sizes) -- 🟡 close (neighbouring class).

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.98 ms | 4.95 ms | 8.39 ms | 640.8 KiB | 505 |
| 40 | 2.69 ms | 3.09 ms | 9.47 ms | 669.8 KiB | 372 |
| 80 | 2.23 ms | 3.27 ms | 7.55 ms | 715.7 KiB | 448 |
| 160 | 3.19 ms | 3.44 ms | 13.6 ms | 844.8 KiB | 313 |
| 320 | 3.02 ms | 3.63 ms | 10.7 ms | 1.0 MiB | 331 |
| 640 | 4.18 ms | 4.84 ms | 13.2 ms | 1.5 MiB | 239 |
| 1280 | 6.86 ms | 13.4 ms | 13.1 ms | 2.4 MiB | 146 |
| 2560 | 9.98 ms | 11.7 ms | 21.0 ms | 4.1 MiB | 100 |
| 5120 | 14.5 ms | 18.3 ms | 21.5 ms | 7.7 MiB | 69 |

### `generateDocumentation`

**Why we benchmark it.** Renders the environment reference developers and auditors read; it runs wherever documentation is regenerated, often on every merge.

**What poor performance would mean.** Documentation builds slow down in proportion to configuration size and, when owners write long runbook text, to the volume of prose rendered.

**Expected growth: O(n).** It parses each schema once and renders one section per variable, so cost is proportional to the number of variables and the size of their documentation.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| declared variables | swept | The tier axis: how many environment variables are declared across the project (ten per schema file, so the file count grows with it). |
| schema content | fixed at "realistic generated TypeScript: JSON-credential processors, validators and documentEnv calls" | Parsing cost depends on source-text volume and variety; the fixtures are literal TypeScript source, never executed by the tooling. |
| filesystem | fixed at "local SSD through the Node adapter" | A network or virtual filesystem adds latency per file; not covered. |
| documentation volume | variant | One-line descriptions versus long multi-section runbook text per variable. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Once per artifact run, rendering from the shared parse.

#### Variant `minimal-docs`

One short description per variable.

**Measured: O(n)** (exponent 0.74, 9 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 3.79 ms | 4.55 ms | 16.2 ms | 1.4 MiB | 264 |
| 40 | 5.31 ms | 5.45 ms | 18.9 ms | 2.5 MiB | 188 |
| 80 | 8.48 ms | 9.28 ms | 23.4 ms | 4.7 MiB | 118 |
| 160 | 11.8 ms | 23.3 ms | 31.0 ms | 9.3 MiB | 84 |
| 320 | 18.2 ms | 18.8 ms | 41.1 ms | 18.3 MiB | 55 |
| 640 | 33.6 ms | 71.5 ms | 64.0 ms | 35.4 MiB | 30 |
| 1280 | 61.7 ms | 63.3 ms | 105 ms | 29.6 MiB | 16 |
| 2560 | 117 ms | 123 ms | 180 ms | 72.9 MiB | 9 |
| 5120 | 230 ms | 235 ms | 383 ms | 41.1 MiB | 4 |

#### Variant `heavy-docs`

Long descriptions and extra documentation fields per variable (a heavily documented enterprise).

**Measured: O(n)** (exponent 0.79, 9 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 3.84 ms | 4.83 ms | 15.9 ms | 1.6 MiB | 260 |
| 40 | 5.51 ms | 6.73 ms | 20.0 ms | 2.9 MiB | 181 |
| 80 | 9.52 ms | 10.9 ms | 28.0 ms | 5.7 MiB | 105 |
| 160 | 14.2 ms | 16.8 ms | 36.7 ms | 11.2 MiB | 71 |
| 320 | 24.2 ms | 25.1 ms | 54.9 ms | 22.1 MiB | 41 |
| 640 | 43.1 ms | 45.0 ms | 76.6 ms | 43.3 MiB | 23 |
| 1280 | 79.3 ms | 83.4 ms | 136 ms | 44.5 MiB | 13 |
| 2560 | 154 ms | 164 ms | 244 ms | 83.5 MiB | 7 |
| 5120 | 309 ms | 342 ms | 484 ms | 37.9 MiB | 3 |

### `generateUsageReport`

**Why we benchmark it.** Shows which owners and files consume which variables; it runs in compliance and ownership reviews and in pipelines that enforce them.

**What poor performance would mean.** Ownership checks slow down with configuration size, which tempts teams to skip them.

**Expected growth: O(n).** It parses the schemas and scans consuming files once, building one usage record per contract, so cost is proportional to the number of variables.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| declared variables | swept | The tier axis: how many environment variables are declared across the project (ten per schema file, so the file count grows with it). |
| schema content | fixed at "realistic generated TypeScript: JSON-credential processors, validators and documentEnv calls" | Parsing cost depends on source-text volume and variety; the fixtures are literal TypeScript source, never executed by the tooling. |
| filesystem | fixed at "local SSD through the Node adapter" | A network or virtual filesystem adds latency per file; not covered. |
| consuming files | fixed at "none beyond the schemas" | Real projects scan application code for usages; the fixtures contain only schema files, so this is the cheapest case. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Once per artifact run.

**Measured: O(n)** (exponent 0.78, 9 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 4.82 ms | 6.57 ms | 19.5 ms | 1.9 MiB | 208 |
| 40 | 8.33 ms | 8.88 ms | 28.3 ms | 3.6 MiB | 120 |
| 80 | 11.8 ms | 13.0 ms | 30.3 ms | 6.9 MiB | 85 |
| 160 | 19.9 ms | 22.0 ms | 46.2 ms | 13.4 MiB | 50 |
| 320 | 32.8 ms | 35.8 ms | 69.4 ms | 25.2 MiB | 30 |
| 640 | 61.4 ms | 74.5 ms | 108 ms | 47.5 MiB | 16 |
| 1280 | 110 ms | 190 ms | 184 ms | 17.0 MiB | 9 |
| 2560 | 213 ms | 228 ms | 328 ms | 65.4 MiB | 5 |
| 5120 | 361 ms | 461 ms | 521 ms | 78.3 MiB | 3 |

### `generateEnvArtifacts`

**Why we benchmark it.** The combined entry point most pipelines call: it shares one discovery and parse across all three artifacts instead of repeating them.

**What poor performance would mean.** The shared pass is the whole saving over running the generators one by one; if it stopped being shared, every pipeline would pay roughly three times the parsing.

**Expected growth: O(n).** It discovers, parses and links once and renders each artifact from that single pass, so cost is proportional to the amount of configuration.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| declared variables | swept | The tier axis: how many environment variables are declared across the project (ten per schema file, so the file count grows with it). |
| schema content | fixed at "realistic generated TypeScript: JSON-credential processors, validators and documentEnv calls" | Parsing cost depends on source-text volume and variety; the fixtures are literal TypeScript source, never executed by the tooling. |
| filesystem | fixed at "local SSD through the Node adapter" | A network or virtual filesystem adds latency per file; not covered. |
| artifacts requested | fixed at "manifest + docs + usage report" | All three; fewer cost less. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** This is the end-to-end operation itself.

**Measured: O(n)** (exponent 0.88, 9 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 6.88 ms | 8.06 ms | 22.9 ms | 3.3 MiB | 145 |
| 40 | 10.1 ms | 10.3 ms | 26.3 ms | 6.2 MiB | 99 |
| 80 | 16.0 ms | 16.5 ms | 35.3 ms | 12.0 MiB | 62 |
| 160 | 28.2 ms | 29.2 ms | 60.7 ms | 23.7 MiB | 35 |
| 320 | 49.3 ms | 79.2 ms | 92.3 ms | 46.7 MiB | 20 |
| 640 | 90.3 ms | 92.5 ms | 150 ms | 33.2 MiB | 11 |
| 1280 | 179 ms | 186 ms | 268 ms | 31.1 MiB | 6 |
| 2560 | 382 ms | 421 ms | 520 ms | 49.4 MiB | 3 |
| 5120 | 905 ms | 972 ms | 1.13 s | 127.1 MiB | 1 |

### `generateEvidenceModel`

**Why we benchmark it.** Builds the six canonical fact models (contract, ownership, lifecycle, dependency, finding and more) that audits, dashboards and custom projections read.

**What poor performance would mean.** Compliance tooling that rebuilds evidence on every run gets slower with the size of the configuration, and an expensive model discourages using it at all.

**Expected growth: O(n).** It runs discovery and linking once and then derives each fact model from the same parse, so cost is proportional to the amount of configuration.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| declared variables | swept | The tier axis: how many environment variables are declared across the project (ten per schema file, so the file count grows with it). |
| schema content | fixed at "realistic generated TypeScript: JSON-credential processors, validators and documentEnv calls" | Parsing cost depends on source-text volume and variety; the fixtures are literal TypeScript source, never executed by the tooling. |
| filesystem | fixed at "local SSD through the Node adapter" | A network or virtual filesystem adds latency per file; not covered. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**Measured: O(n)** (exponent 0.85, 9 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 5.87 ms | 6.21 ms | 20.3 ms | 2.8 MiB | 170 |
| 40 | 6.70 ms | 9.05 ms | 13.4 ms | 5.3 MiB | 149 |
| 80 | 14.2 ms | 19.9 ms | 33.9 ms | 10.6 MiB | 70 |
| 160 | 20.6 ms | 25.4 ms | 32.4 ms | 17.7 MiB | 49 |
| 320 | 43.7 ms | 44.9 ms | 83.7 ms | 38.3 MiB | 23 |
| 640 | 80.1 ms | 82.9 ms | 135 ms | 18.8 MiB | 12 |
| 1280 | 149 ms | 151 ms | 230 ms | 57.1 MiB | 7 |
| 2560 | 283 ms | 288 ms | 393 ms | 49.8 MiB | 4 |
| 5120 | 544 ms | 545 ms | 751 ms | 106.2 MiB | 2 |

### `defineEvidenceProjection (project)`

**Why we benchmark it.** Turns the evidence model into a consumer-specific view (a report, an export); it runs in every pipeline that publishes one, on top of the model build.

**What poor performance would mean.** Custom reports slow in proportion to the model, and a copy-heavy implementation would make the projection cost more than building the evidence itself.

**Expected growth: O(n).** The projection copies the model once (`structuredClone`) and reads it through a tracking membrane, both proportional to the model's size, which grows with the number of variables.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| declared variables | swept | The tier axis: how many environment variables are declared across the project (ten per schema file, so the file count grows with it). |
| schema content | fixed at "realistic generated TypeScript: JSON-credential processors, validators and documentEnv calls" | Parsing cost depends on source-text volume and variety; the fixtures are literal TypeScript source, never executed by the tooling. |
| projection shape | fixed at "five derived fields across all six fact models" | A projection that reads fewer fields still pays the clone; one that computes more adds proportional work. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**Measured: O(n)** (exponent 0.97, 9 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 405 µs | 538 µs | 1.26 ms | 284.8 KiB | 2,471 |
| 40 | 701 µs | 729 µs | 1.57 ms | 515.1 KiB | 1,426 |
| 80 | 1.36 ms | 1.48 ms | 3.10 ms | 1014.6 KiB | 737 |
| 160 | 2.61 ms | 2.75 ms | 4.37 ms | 1.9 MiB | 384 |
| 320 | 5.05 ms | 5.28 ms | 6.83 ms | 3.8 MiB | 198 |
| 640 | 9.93 ms | 10.2 ms | 11.9 ms | 7.8 MiB | 101 |
| 1280 | 20.2 ms | 20.8 ms | 22.2 ms | 15.6 MiB | 50 |
| 2560 | 43.1 ms | 43.9 ms | 45.4 ms | 30.4 MiB | 23 |
| 5120 | 86.3 ms | 114 ms | 90.5 ms | 61.1 MiB | 12 |

## 3. What makes up the end-to-end overhead

Each function's measured cost is multiplied by how many times one end-to-end operation calls it, then compared with the total overhead from section 1. This shows where the cost actually lives, so effort goes to the function that matters. Shares are estimates: they can sum to slightly more or less than 100% because the two measurements were taken separately (the remainder is shown as _unattributed_).

**At 640 variables** (total added: 90.9 ms)

| Function | Calls / operation | Estimated time | Share of added time | Share of operation |
| --- | --- | --- | --- | --- |
| `generate-artifacts` | 1 | 90.3 ms | 99% | 95% |
| `generate-usage-report` | 1 | 61.4 ms | 68% | 64% |
| `generate-documentation` | 1 | 33.6 ms | 37% | 35% |
| `discover-schema-files` | 1 | 1.96 ms | 2.2% | 2.1% |
| _unattributed_ |  | 0 | 0.0% |  |

**At 5120 variables** (total added: 909 ms)

| Function | Calls / operation | Estimated time | Share of added time | Share of operation |
| --- | --- | --- | --- | --- |
| `generate-artifacts` | 1 | 905 ms | 100% | 96% |
| `generate-usage-report` | 1 | 361 ms | 40% | 38% |
| `generate-documentation` | 1 | 230 ms | 25% | 24% |
| `discover-schema-files` | 1 | 13.7 ms | 1.5% | 1.5% |
| _unattributed_ |  | 0 | 0.0% |  |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-01T14:27:28.222Z` → `2026-10-01T14:28:21.013Z` (53 s), npm run benchmark
- Machine: Apple M3, 8 logical core(s) (8 physical), 24576 MB RAM, darwin/arm64, Node v24.20.0, local
- Git: `116792252ae9113f67e8a4b1f08a90d30ce82459` on `chore/no-minify-no-dist-urls` (uncommitted changes)
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120 variables -- One environment variable declared in a schema file. Schema files hold ten variables each, so 640 variables is 64 files -- a large monorepo's worth of configuration. The ladder stops at 5,120 variables (512 files) because `discoverSchemaFiles` refuses more than 1,000 files as a sanity limit, which 10,240 variables would exceed.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

