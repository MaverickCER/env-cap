# env-cap: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 variables** per operation, routing the work through `env-cap` adds **139 ms** per operation compared with a bare-minimum baseline (**20× the baseline**). Overall, it grows O(n) with workload size (measured exponent 0.90). At list prices that is on the order of **~$0.1 – $10 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (640 variables) | Largest (5120 variables) |
| --- | --- | --- |
| Added latency per operation | 139 ms | 1.08 s |
| Added latency, relative to baseline | 20× baseline | 19× baseline |
| Added CPU time per operation | 328 ms | 1.50 s |
| Added memory per operation (heap delta) | 9.4 MiB | 95.4 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.1 – $10 | ~$1 – $10 |
| Single-core throughput ceiling of the overhead alone | 7 ops/s | 1 ops/s |
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
| 20 | 751 µs | 17.1 ms | 16.3 ms | 23× baseline | 48.9 ms | $0.034 – $0.549 |
| 40 | 1.03 ms | 24.3 ms | 23.3 ms | 24× baseline | 76.0 ms | $0.049 – $0.855 |
| 80 | 1.47 ms | 33.8 ms | 32.4 ms | 23× baseline | 120 ms | $0.067 – $1.35 |
| 160 | 2.39 ms | 60.2 ms | 57.8 ms | 25× baseline | 181 ms | $0.120 – $2.04 |
| 320 | 4.40 ms | 95.1 ms | 90.7 ms | 22× baseline | 266 ms | $0.189 – $2.99 |
| 640 | 7.41 ms | 147 ms | 139 ms | 20× baseline | 328 ms | $0.290 – $3.68 |
| 1280 | 15.2 ms | 270 ms | 255 ms | 18× baseline | 540 ms | $0.531 – $6.07 |
| 2560 | 31.2 ms | 513 ms | 482 ms | 16× baseline | 801 ms | $1.00 – $9.00 |
| 5120 | 61.5 ms | 1.14 s | 1.08 s | 19× baseline | 1.50 s | $2.26 – $16.83 |

**How the total grows:** O(n) (linear), exponent 0.90 over 9 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 5120 |
| --- | --- | --- | --- | --- | --- | --- |
| `discoverSchemaFiles` | variable | O(n) | O(n) | ✅ matches | 3.00 ms | 20.7 ms |
| `discoverSchemaFiles` | variables-per-contract | O(1) | n/a | ❔ not enough data | n/a | n/a |
| `generateEnvManifest` (all-contracts) | variable | O(n log n) | O(n) | 🟡 close (neighbouring class) | 79.0 ms | 533 ms |
| `generateEnvManifest` (all-contracts) | variables-per-contract | O(1) | n/a | ❔ not enough data | n/a | n/a |
| `generateEnvManifest` (one-contract-scoped) | variable | O(log n) | O(log n) | ✅ matches | 5.84 ms | 23.6 ms |
| `generateEnvManifest` (one-contract-scoped) | variables-per-contract | O(1) | n/a | ❔ not enough data | n/a | n/a |
| `generateDocumentation` (minimal-docs) | variable | O(n) | O(n) | ✅ matches | 84.1 ms | 377 ms |
| `generateDocumentation` (minimal-docs) | variables-per-contract | O(1) | n/a | ❔ not enough data | n/a | n/a |
| `generateDocumentation` (heavy-docs) | variable | O(n) | O(n) | ✅ matches | 87.3 ms | 454 ms |
| `generateDocumentation` (heavy-docs) | variables-per-contract | O(1) | n/a | ❔ not enough data | n/a | n/a |
| `generateUsageReport` | variable | O(n) | O(n) | ✅ matches | 108 ms | 534 ms |
| `generateUsageReport` | variables-per-contract | O(1) | n/a | ❔ not enough data | n/a | n/a |
| `generateEnvArtifacts` | variable | O(n) | O(n) | ✅ matches | 149 ms | 1.10 s |
| `generateEnvArtifacts` | variables-per-contract | O(1) | n/a | ❔ not enough data | n/a | n/a |
| `checkEnvArtifacts` | variable | O(n) | n/a | ❔ not enough data | n/a | n/a |
| `checkEnvArtifacts` | variables-per-contract | O(1) | n/a | ❔ not enough data | n/a | n/a |
| `computeSourceFingerprint` | variable | O(n) | n/a | ❔ not enough data | n/a | n/a |
| `computeSourceFingerprint` | variables-per-contract | O(1) | n/a | ❔ not enough data | n/a | n/a |
| `generateEvidenceModel` | variable | O(n) | O(n) | ✅ matches | 141 ms | 767 ms |
| `generateEvidenceModel` | variables-per-contract | O(1) | n/a | ❔ not enough data | n/a | n/a |
| `getEvidenceModel` (cache-hit) | variable | O(n) | n/a | ❔ not enough data | n/a | n/a |
| `getEvidenceModel` (cache-miss) | variable | O(n) | n/a | ❔ not enough data | n/a | n/a |
| `parseSchemaFile` | variable | O(n) | n/a | ❔ not enough data | n/a | n/a |
| `linkFiles` | variable | O(n) | n/a | ❔ not enough data | n/a | n/a |
| `buildContractModel` | variable | O(n) | n/a | ❔ not enough data | n/a | n/a |
| `buildOwnershipModel` | variable | O(n) | n/a | ❔ not enough data | n/a | n/a |
| `buildLifecycleModel` | variable | O(n) | n/a | ❔ not enough data | n/a | n/a |
| `computeExpiringEntries` | variable | O(n) | n/a | ❔ not enough data | n/a | n/a |
| `computeSecurityReviewCounters` | variable | O(n) | n/a | ❔ not enough data | n/a | n/a |
| `renderDocs` | variable | O(n) | n/a | ❔ not enough data | n/a | n/a |
| `renderManifest` | variable | O(n) | n/a | ❔ not enough data | n/a | n/a |
| `computeReconciliation` | variable | O(n) | n/a | ❔ not enough data | n/a | n/a |
| `renderEnvExample` | variable | O(n) | n/a | ❔ not enough data | n/a | n/a |
| `groupVariablesByOwner` | variable | O(n) | n/a | ❔ not enough data | n/a | n/a |
| `applyLiveExpirationOverrides` | variable | O(n) | n/a | ❔ not enough data | n/a | n/a |
| `resolveLiveExpirationDates` | variable | O(n) | n/a | ❔ not enough data | n/a | n/a |
| `configurationReference` | variable | O(n) | n/a | ❔ not enough data | n/a | n/a |
| `expiringSoonReport` | variable | O(n) | n/a | ❔ not enough data | n/a | n/a |
| `ownershipSummary` | variable | O(n) | n/a | ❔ not enough data | n/a | n/a |
| `buildSarifLog` | variable | O(n) | n/a | ❔ not enough data | n/a | n/a |
| `defineEvidenceProjection (project)` | variable | O(n) | O(n) | ✅ matches | 12.2 ms | 124 ms |

### `discoverSchemaFiles`

**Why we benchmark it.** Every build-time command starts by finding the project's schema files, so its cost is paid first by every generator and every CI run.

**What poor performance would mean.** Every pipeline step that touches env-cap starts later, and a super-linear regression would slow monorepos with thousands of files before any real work begins.

**Expected growth: O(n).** It walks the directory tree once and tests each path against the include and exclude patterns, so cost is proportional to the number of files visited.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| declared variables | swept | The tier axis: how many environment variables are declared across the project (ten per schema file, so the file count grows with it). |
| variables-per-contract | swept | How many variables each schema file declares (ten in the main sweep). With the total fixed, few large contracts or many small ones cost differently: per-file work (open, parse, link) against per-variable work. |
| filesystem | fixed at "local SSD through the Node adapter" | A network or virtual filesystem adds latency per file; not covered. |
| directory depth | fixed at "one level of contract folders" | Deeper trees add a directory read per level. |
| unrelated files | fixed at "none" | Real repositories hold many non-schema files that must also be walked; a pure schema tree is the best case. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Once at the start of every artifact generation.

**Measured: O(n)** (exponent 0.88, 9 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 370 µs | 389 µs | 996 µs | 53.2 KiB | 2,706 |
| 40 | 322 µs | 327 µs | 646 µs | 87.9 KiB | 3,105 |
| 80 | 635 µs | 833 µs | 1.39 ms | 161.9 KiB | 1,576 |
| 160 | 1.11 ms | 1.64 ms | 2.47 ms | 314.0 KiB | 898 |
| 320 | 1.84 ms | 4.18 ms | 4.00 ms | 608.9 KiB | 544 |
| 640 | 3.00 ms | 4.52 ms | 4.42 ms | 1.2 MiB | 334 |
| 1280 | 5.65 ms | 6.00 ms | 9.33 ms | 2.3 MiB | 177 |
| 2560 | 10.6 ms | 11.6 ms | 15.1 ms | 4.6 MiB | 95 |
| 5120 | 20.7 ms | 22.3 ms | 25.4 ms | 9.2 MiB | 48 |

##### Varying `variables-per-contract`

How many variables each schema file declares (ten in the main sweep). With the total fixed, few large contracts or many small ones cost differently: per-file work (open, parse, link) against per-variable work.

**Expected: O(1).** The walk visits the same total number of schema files and folders however the variables are split across them, so the split does not change the cost.

### `generateEnvManifest`

**Why we benchmark it.** Produces the manifest the application imports at runtime; it runs in every build that ships the application.

**What poor performance would mean.** Build time grows with the amount of configuration; a regression delays every deploy that regenerates the manifest.

**Expected growth: O(n).** It discovers the files, parses each with the TypeScript parser once and renders one manifest entry per contract, so cost is proportional to the source text parsed.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| declared variables | swept | The tier axis: how many environment variables are declared across the project (ten per schema file, so the file count grows with it). |
| variables-per-contract | swept | How many variables each schema file declares (ten in the main sweep). With the total fixed, few large contracts or many small ones cost differently: per-file work (open, parse, link) against per-variable work. |
| schema content | fixed at "realistic generated TypeScript: JSON-credential processors, validators and documentEnv calls" | Parsing cost depends on source-text volume and variety; the fixtures are literal TypeScript source, never executed by the tooling. |
| filesystem | fixed at "local SSD through the Node adapter" | A network or virtual filesystem adds latency per file; not covered. |
| scope | variant | All contracts versus a single contract selected with `include`. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**Deliberately not covered**

- **incompatible schemas** -- Files the parser cannot handle take a warning path; the benchmark uses only supported schemas.

#### Variant `all-contracts`

The manifest covers every schema file in the project.

**Expected for this variant: O(n log n).** Parsing and rendering are linear in the source text, but the model sorts every variable and declaration by key (contract-model.ts, compatibility.ts) so the manifest and the compatibility findings are stable, and that sort adds an n log n term that shows once the whole project is covered.

**Measured: O(n)** (exponent 0.89, 9 sizes) -- 🟡 close (neighbouring class).

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 5.01 ms | 8.86 ms | 12.9 ms | 1.1 MiB | 200 |
| 40 | 7.33 ms | 12.9 ms | 19.2 ms | 2.1 MiB | 136 |
| 80 | 14.2 ms | 18.2 ms | 41.5 ms | 3.6 MiB | 70 |
| 160 | 23.3 ms | 28.2 ms | 61.1 ms | 7.2 MiB | 43 |
| 320 | 41.6 ms | 45.6 ms | 113 ms | 4.3 MiB | 24 |
| 640 | 79.0 ms | 83.8 ms | 199 ms | 8.6 MiB | 13 |
| 1280 | 132 ms | 138 ms | 297 ms | 21.6 MiB | 8 |
| 2560 | 236 ms | 247 ms | 475 ms | 37.7 MiB | 4 |
| 5120 | 533 ms | 544 ms | 879 ms | 73.8 MiB | 2 |

##### Varying `variables-per-contract`

How many variables each schema file declares (ten in the main sweep). With the total fixed, few large contracts or many small ones cost differently: per-file work (open, parse, link) against per-variable work.

**Expected: O(1).** The same total number of variables is parsed and rendered however they are split across files, so the split changes only the small per-file share of the work.

#### Variant `one-contract-scoped`

An `include` selects one schema file; discovery still walks the tree but only that file is parsed.

**Expected for this variant: O(log n).** Only the one selected file is parsed and rendered, but the directory walk that still happens grows with the tree. Across the measured sizes it is a small, sub-linear share of the cost, so the curve rises slowly without being flat.

**Measured: O(log n)** (exponent 0.62, 9 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.55 ms | 3.83 ms | 5.94 ms | 623.3 KiB | 391 |
| 40 | 2.65 ms | 3.71 ms | 7.22 ms | 662.5 KiB | 378 |
| 80 | 3.64 ms | 4.85 ms | 9.05 ms | 724.7 KiB | 275 |
| 160 | 4.58 ms | 5.49 ms | 11.0 ms | 851.7 KiB | 218 |
| 320 | 4.22 ms | 5.05 ms | 9.17 ms | 1.0 MiB | 237 |
| 640 | 5.84 ms | 8.31 ms | 12.6 ms | 1.5 MiB | 171 |
| 1280 | 7.69 ms | 9.93 ms | 11.9 ms | 2.4 MiB | 130 |
| 2560 | 13.7 ms | 14.9 ms | 24.9 ms | 4.2 MiB | 73 |
| 5120 | 23.6 ms | 25.4 ms | 41.8 ms | 7.9 MiB | 42 |

##### Varying `variables-per-contract`

How many variables each schema file declares (ten in the main sweep). With the total fixed, few large contracts or many small ones cost differently: per-file work (open, parse, link) against per-variable work.

**Expected: O(1).** The same total number of variables is parsed and rendered however they are split across files, so the split changes only the small per-file share of the work.

### `generateDocumentation`

**Why we benchmark it.** Renders the environment reference developers and auditors read; it runs wherever documentation is regenerated, often on every merge.

**What poor performance would mean.** Documentation builds slow down in proportion to configuration size and, when owners write long runbook text, to the volume of prose rendered.

**Expected growth: O(n).** It parses each schema once and renders one section per variable, so cost is proportional to the number of variables and the size of their documentation.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| declared variables | swept | The tier axis: how many environment variables are declared across the project (ten per schema file, so the file count grows with it). |
| variables-per-contract | swept | How many variables each schema file declares (ten in the main sweep). With the total fixed, few large contracts or many small ones cost differently: per-file work (open, parse, link) against per-variable work. |
| schema content | fixed at "realistic generated TypeScript: JSON-credential processors, validators and documentEnv calls" | Parsing cost depends on source-text volume and variety; the fixtures are literal TypeScript source, never executed by the tooling. |
| filesystem | fixed at "local SSD through the Node adapter" | A network or virtual filesystem adds latency per file; not covered. |
| documentation volume | variant | One-line descriptions versus long multi-section runbook text per variable. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Not called by the end-to-end operation: generateEnvArtifacts renders the catalog from its shared parse, while this standalone generator parses again.

#### Variant `minimal-docs`

One short description per variable.

**Measured: O(n)** (exponent 0.73, 9 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 4.94 ms | 9.56 ms | 13.6 ms | 1.3 MiB | 202 |
| 40 | 9.52 ms | 11.8 ms | 24.8 ms | 2.5 MiB | 105 |
| 80 | 15.5 ms | 19.2 ms | 42.3 ms | 4.8 MiB | 64 |
| 160 | 24.0 ms | 29.4 ms | 63.3 ms | 8.5 MiB | 42 |
| 320 | 48.5 ms | 54.2 ms | 125 ms | 7.3 MiB | 21 |
| 640 | 84.1 ms | 88.1 ms | 212 ms | 18.3 MiB | 12 |
| 1280 | 129 ms | 133 ms | 302 ms | 30.3 MiB | 8 |
| 2560 | 212 ms | 221 ms | 433 ms | 50.6 MiB | 5 |
| 5120 | 377 ms | 386 ms | 706 ms | 97.5 MiB | 3 |

##### Varying `variables-per-contract`

How many variables each schema file declares (ten in the main sweep). With the total fixed, few large contracts or many small ones cost differently: per-file work (open, parse, link) against per-variable work.

**Expected: O(1).** The same total number of variables is rendered however they are split across files; each file adds one heading and a small table header, a share that shrinks as files grow.

#### Variant `heavy-docs`

Long descriptions and extra documentation fields per variable (a heavily documented enterprise).

**Measured: O(n)** (exponent 0.76, 9 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 6.24 ms | 8.03 ms | 17.6 ms | 1.6 MiB | 160 |
| 40 | 11.1 ms | 13.1 ms | 30.9 ms | 3.0 MiB | 90 |
| 80 | 20.4 ms | 22.6 ms | 59.5 ms | 5.7 MiB | 49 |
| 160 | 24.9 ms | 33.9 ms | 60.0 ms | 10.2 MiB | 40 |
| 320 | 54.4 ms | 59.3 ms | 138 ms | 10.8 MiB | 18 |
| 640 | 87.3 ms | 101 ms | 225 ms | 21.0 MiB | 11 |
| 1280 | 149 ms | 157 ms | 347 ms | 27.6 MiB | 7 |
| 2560 | 251 ms | 252 ms | 507 ms | 66.5 MiB | 4 |
| 5120 | 454 ms | 466 ms | 800 ms | 140.6 MiB | 2 |

##### Varying `variables-per-contract`

How many variables each schema file declares (ten in the main sweep). With the total fixed, few large contracts or many small ones cost differently: per-file work (open, parse, link) against per-variable work.

**Expected: O(1).** The same total number of variables is rendered however they are split across files; each file adds one heading and a small table header, a share that shrinks as files grow.

### `generateUsageReport`

**Why we benchmark it.** Shows which owners and files consume which variables; it runs in compliance and ownership reviews and in pipelines that enforce them.

**What poor performance would mean.** Ownership checks slow down with configuration size, which tempts teams to skip them.

**Expected growth: O(n).** It parses the schemas and scans consuming files once, building one usage record per contract, so cost is proportional to the number of variables.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| declared variables | swept | The tier axis: how many environment variables are declared across the project (ten per schema file, so the file count grows with it). |
| variables-per-contract | swept | How many variables each schema file declares (ten in the main sweep). With the total fixed, few large contracts or many small ones cost differently: per-file work (open, parse, link) against per-variable work. |
| schema content | fixed at "realistic generated TypeScript: JSON-credential processors, validators and documentEnv calls" | Parsing cost depends on source-text volume and variety; the fixtures are literal TypeScript source, never executed by the tooling. |
| filesystem | fixed at "local SSD through the Node adapter" | A network or virtual filesystem adds latency per file; not covered. |
| consuming files | fixed at "none beyond the schemas" | Real projects scan application code for usages; the fixtures contain only schema files, so this is the cheapest case. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Not called by the end-to-end operation: generateEnvArtifacts builds the usage report from its shared parse, while this standalone generator parses again.

**Measured: O(n)** (exponent 0.80, 9 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 7.79 ms | 12.7 ms | 22.7 ms | 1.6 MiB | 128 |
| 40 | 14.5 ms | 17.5 ms | 44.3 ms | 3.5 MiB | 69 |
| 80 | 25.9 ms | 30.3 ms | 74.8 ms | 6.1 MiB | 39 |
| 160 | 33.4 ms | 42.9 ms | 96.5 ms | 11.4 MiB | 30 |
| 320 | 55.9 ms | 93.0 ms | 146 ms | 4.7 MiB | 18 |
| 640 | 108 ms | 111 ms | 274 ms | 17.4 MiB | 9 |
| 1280 | 176 ms | 186 ms | 394 ms | 21.0 MiB | 6 |
| 2560 | 296 ms | 300 ms | 564 ms | 42.7 MiB | 3 |
| 5120 | 534 ms | 558 ms | 957 ms | 76.2 MiB | 2 |

##### Varying `variables-per-contract`

How many variables each schema file declares (ten in the main sweep). With the total fixed, few large contracts or many small ones cost differently: per-file work (open, parse, link) against per-variable work.

**Expected: O(1).** The same total number of variables is reported however they are split across files; only the small per-file share of the work changes.

### `generateEnvArtifacts`

**Why we benchmark it.** The combined entry point most pipelines call: it shares one discovery and parse across all three artifacts instead of repeating them.

**What poor performance would mean.** The shared pass is the whole saving over running the generators one by one; if it stopped being shared, every pipeline would pay roughly three times the parsing.

**Expected growth: O(n).** It discovers, parses and links once and renders each artifact from that single pass, so cost is proportional to the amount of configuration.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| declared variables | swept | The tier axis: how many environment variables are declared across the project (ten per schema file, so the file count grows with it). |
| variables-per-contract | swept | How many variables each schema file declares (ten in the main sweep). With the total fixed, few large contracts or many small ones cost differently: per-file work (open, parse, link) against per-variable work. |
| schema content | fixed at "realistic generated TypeScript: JSON-credential processors, validators and documentEnv calls" | Parsing cost depends on source-text volume and variety; the fixtures are literal TypeScript source, never executed by the tooling. |
| filesystem | fixed at "local SSD through the Node adapter" | A network or virtual filesystem adds latency per file; not covered. |
| artifacts requested | fixed at "manifest + docs + usage report" | All three; fewer cost less. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** This is the end-to-end operation itself.

**Measured: O(n)** (exponent 0.87, 9 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 13.9 ms | 15.0 ms | 46.6 ms | 3.3 MiB | 72 |
| 40 | 22.0 ms | 24.3 ms | 71.4 ms | 5.9 MiB | 45 |
| 80 | 34.9 ms | 42.1 ms | 110 ms | 11.2 MiB | 29 |
| 160 | 60.0 ms | 64.4 ms | 169 ms | 8.3 MiB | 17 |
| 320 | 98.1 ms | 105 ms | 259 ms | 8.0 MiB | 10 |
| 640 | 149 ms | 157 ms | 337 ms | 10.7 MiB | 7 |
| 1280 | 268 ms | 278 ms | 521 ms | 27.0 MiB | 4 |
| 2560 | 509 ms | 523 ms | 857 ms | 19.6 MiB | 2 |
| 5120 | 1.10 s | 1.13 s | 1.52 s | 104.2 MiB | 1 |

##### Varying `variables-per-contract`

How many variables each schema file declares (ten in the main sweep). With the total fixed, few large contracts or many small ones cost differently: per-file work (open, parse, link) against per-variable work.

**Expected: O(1).** The same total number of variables is parsed and rendered three times over however they are split across files; only the small per-file share changes.

### `checkEnvArtifacts`

**Why we benchmark it.** The CI gate that fails when a committed manifest, document or report is stale: it regenerates every requested artifact in memory and compares it with the file on disk.

**What poor performance would mean.** A slower gate on every pull request, which is the most frequent place build-time cost is paid.

**Expected growth: O(n).** It runs one shared discovery, parse and link, renders each requested artifact once and compares each with its file, so cost is proportional to the amount of configuration.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| declared variables | swept | The tier axis: how many environment variables are declared across the project (ten per schema file, so the file count grows with it). |
| variables-per-contract | swept | How many variables each schema file declares (ten in the main sweep). With the total fixed, few large contracts or many small ones cost differently: per-file work (open, parse, link) against per-variable work. |
| schema content | fixed at "realistic generated TypeScript: JSON-credential processors, validators and documentEnv calls" | Parsing cost depends on source-text volume and variety; the fixtures are literal TypeScript source, never executed by the tooling. |
| filesystem | fixed at "local SSD through the Node adapter" | A network or virtual filesystem adds latency per file; not covered. |
| artifact state | fixed at "every artifact is current" | A stale artifact adds a finding to report and no more parsing. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** A CI gate, not part of generating the artifacts.

##### Varying `variables-per-contract`

How many variables each schema file declares (ten in the main sweep). With the total fixed, few large contracts or many small ones cost differently: per-file work (open, parse, link) against per-variable work.

**Expected: O(1).** The same total number of variables is rendered and compared however they are split across files; only the small per-file share changes.

### `computeSourceFingerprint`

**Why we benchmark it.** It decides whether a cached evidence model is still current, so it runs before every cached read and must cost far less than the recompute it avoids.

**What poor performance would mean.** A cache that costs nearly as much as the recompute it saves, which makes every cached read pointless.

**Expected growth: O(n).** It walks the schema files and hashes each one's text once, with no parsing or linking, so cost is proportional to the bytes of source.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| declared variables | swept | The tier axis: how many environment variables are declared across the project (ten per schema file, so the file count grows with it). |
| variables-per-contract | swept | How many variables each schema file declares (ten in the main sweep). With the total fixed, few large contracts or many small ones cost differently: per-file work (open, parse, link) against per-variable work. |
| schema content | fixed at "realistic generated TypeScript: JSON-credential processors, validators and documentEnv calls" | Parsing cost depends on source-text volume and variety; the fixtures are literal TypeScript source, never executed by the tooling. |
| filesystem | fixed at "local SSD through the Node adapter" | A network or virtual filesystem adds latency per file; not covered. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Run before a cached read, not while generating.

##### Varying `variables-per-contract`

How many variables each schema file declares (ten in the main sweep). With the total fixed, few large contracts or many small ones cost differently: per-file work (open, parse, link) against per-variable work.

**Expected: O(1).** The same total bytes of source are hashed however they are split across files; only the per-file read overhead changes.

### `generateEvidenceModel`

**Why we benchmark it.** Builds the six canonical fact models (contract, ownership, lifecycle, dependency, finding and more) that audits, dashboards and custom projections read.

**What poor performance would mean.** Compliance tooling that rebuilds evidence on every run gets slower with the size of the configuration, and an expensive model discourages using it at all.

**Expected growth: O(n).** It runs discovery and linking once and then derives each fact model from the same parse, so cost is proportional to the amount of configuration.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| declared variables | swept | The tier axis: how many environment variables are declared across the project (ten per schema file, so the file count grows with it). |
| variables-per-contract | swept | How many variables each schema file declares (ten in the main sweep). With the total fixed, few large contracts or many small ones cost differently: per-file work (open, parse, link) against per-variable work. |
| schema content | fixed at "realistic generated TypeScript: JSON-credential processors, validators and documentEnv calls" | Parsing cost depends on source-text volume and variety; the fixtures are literal TypeScript source, never executed by the tooling. |
| filesystem | fixed at "local SSD through the Node adapter" | A network or virtual filesystem adds latency per file; not covered. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**Measured: O(n)** (exponent 0.77, 9 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 8.52 ms | 10.9 ms | 23.7 ms | 2.3 MiB | 117 |
| 40 | 13.8 ms | 16.0 ms | 40.0 ms | 4.6 MiB | 72 |
| 80 | 24.1 ms | 28.8 ms | 70.4 ms | 9.0 MiB | 42 |
| 160 | 48.6 ms | 56.8 ms | 160 ms | 4.7 MiB | 21 |
| 320 | 89.2 ms | 95.9 ms | 241 ms | 15.2 MiB | 11 |
| 640 | 141 ms | 146 ms | 326 ms | 14.4 MiB | 7 |
| 1280 | 228 ms | 234 ms | 440 ms | 30.1 MiB | 4 |
| 2560 | 406 ms | 411 ms | 731 ms | 43.7 MiB | 2 |
| 5120 | 767 ms | 770 ms | 1.22 s | 87.6 MiB | 1 |

##### Varying `variables-per-contract`

How many variables each schema file declares (ten in the main sweep). With the total fixed, few large contracts or many small ones cost differently: per-file work (open, parse, link) against per-variable work.

**Expected: O(1).** The same total number of variables is modelled however they are split across files; only the small per-file share changes.

### `getEvidenceModel`

**Why we benchmark it.** The cached way to read the evidence model: it trusts a committed artifact only while the source fingerprint matches, and recomputes otherwise.

**What poor performance would mean.** A miss that costs more than a plain recompute, or a hit that costs nearly as much as one, would make the cache worse than not having it.

**Expected growth: O(n).** A hit fingerprints the source and reads one file; a miss does that and then rebuilds the model, so both grow with the amount of configuration.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| declared variables | swept | The tier axis: how many environment variables are declared across the project (ten per schema file, so the file count grows with it). |
| schema content | fixed at "realistic generated TypeScript: JSON-credential processors, validators and documentEnv calls" | Parsing cost depends on source-text volume and variety; the fixtures are literal TypeScript source, never executed by the tooling. |
| filesystem | fixed at "local SSD through the Node adapter" | A network or virtual filesystem adds latency per file; not covered. |
| cache state | variant | A committed artifact whose fingerprint matches, or none. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** A cached read, not part of generating the artifacts.

#### Variant `cache-hit`

The committed artifact is current: read from disk, no recompute.

**Expected for this variant: O(n).** The source is fingerprinted and the artifact read once, both proportional to the amount of configuration, with no parsing.

#### Variant `cache-miss`

No artifact exists: the model is rebuilt.

### `parseSchemaFile`

**Why we benchmark it.** Every generator parses each schema file with the TypeScript parser, which is the largest single cost of a build-time run.

**What poor performance would mean.** Every build-time command slows in proportion to the source it parses, and a super-linear parse would punish the largest schema files first.

**Expected growth: O(n).** The text is parsed once by the TypeScript parser and the variables read from one syntax tree, so cost is proportional to the length of the source.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| declared variables | swept | The tier axis: how many variables the one schema file declares. |
| schema content | fixed at "realistic generated TypeScript: JSON-credential processors, validators and documentEnv calls" | Parsing cost depends on source-text volume and variety; the fixtures are literal TypeScript source, never executed by the tooling. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Run once per schema file inside every generator; measured here on one file.

### `linkFiles`

**Why we benchmark it.** It turns parsed schema files into linked contracts, following the imports between them, and runs once in every generator.

**What poor performance would mean.** Every build-time command slows in proportion to the number of schema files and the imports between them.

**Expected growth: O(n).** Each file is read and parsed once and each import resolved once, so cost is proportional to the number of files.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| declared variables | swept | The tier axis: how many environment variables are declared across the project (ten per schema file, so the file count grows with it). |
| schema content | fixed at "realistic generated TypeScript: JSON-credential processors, validators and documentEnv calls" | Parsing cost depends on source-text volume and variety; the fixtures are literal TypeScript source, never executed by the tooling. |
| filesystem | fixed at "local SSD through the Node adapter" | A network or virtual filesystem adds latency per file; not covered. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**Deliberately not covered**

- **aliased and package imports** -- Following a tsconfig alias or an allowlisted package adds a resolution per import; the fixtures import nothing.

**In the end-to-end run:** Run once inside every generator; measured on its own.

### `buildContractModel`

**Why we benchmark it.** It derives the contract fact model (every contract, its variables and their documentation) that the other models and every projection build on.

**What poor performance would mean.** Every evidence build slows in proportion to the number of variables.

**Expected growth: O(n).** One entry is built for each contract and each variable, once, so cost is proportional to the number of variables.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| declared variables | swept | The tier axis: how many environment variables are declared across the project (ten per schema file, so the file count grows with it). |
| schema content | fixed at "realistic generated TypeScript: JSON-credential processors, validators and documentEnv calls" | Parsing cost depends on source-text volume and variety; the fixtures are literal TypeScript source, never executed by the tooling. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Not part of the end-to-end operation, which calls the generators; measured on its own.

### `buildOwnershipModel`

**Why we benchmark it.** It derives who owns each contract and variable, the model ownership reviews and the usage report read.

**What poor performance would mean.** Every evidence build slows in proportion to the number of variables.

**Expected growth: O(n).** Each variable's owner is resolved once from its own documentation and its contract's, so cost is proportional to the number of variables.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| declared variables | swept | The tier axis: how many environment variables are declared across the project (ten per schema file, so the file count grows with it). |
| schema content | fixed at "realistic generated TypeScript: JSON-credential processors, validators and documentEnv calls" | Parsing cost depends on source-text volume and variety; the fixtures are literal TypeScript source, never executed by the tooling. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Not part of the end-to-end operation, which calls the generators; measured on its own.

### `buildLifecycleModel`

**Why we benchmark it.** It derives the lifecycle fact model: what expires, what is due for rotation and what is deprecated, which the rotation reminders read.

**What poor performance would mean.** Every evidence build and every scheduled rotation check slows in proportion to the number of variables.

**Expected growth: O(n).** Each variable's dates are read and compared once, so cost is proportional to the number of variables.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| declared variables | swept | The tier axis: how many environment variables are declared across the project (ten per schema file, so the file count grows with it). |
| schema content | fixed at "realistic generated TypeScript: JSON-credential processors, validators and documentEnv calls" | Parsing cost depends on source-text volume and variety; the fixtures are literal TypeScript source, never executed by the tooling. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Not part of the end-to-end operation, which calls the generators; measured on its own.

### `computeExpiringEntries`

**Why we benchmark it.** It lists what expires within a window, once for every reminder and every report that shows expiries.

**What poor performance would mean.** A slower expiry reminder in proportion to the number of variables.

**Expected growth: O(n).** Each variable's expiry date is compared with the window once, so cost is proportional to the number of variables.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| declared variables | swept | The tier axis: how many environment variables are declared across the project (ten per schema file, so the file count grows with it). |
| schema content | fixed at "realistic generated TypeScript: JSON-credential processors, validators and documentEnv calls" | Parsing cost depends on source-text volume and variety; the fixtures are literal TypeScript source, never executed by the tooling. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Not part of the end-to-end operation, which calls the generators; measured on its own.

### `computeSecurityReviewCounters`

**Why we benchmark it.** It counts what a security review looks at (secrets, owners, expiries, undocumented variables), once per documentation render.

**What poor performance would mean.** Slower documentation in proportion to the number of variables.

**Expected growth: O(n).** Each variable is classified once into the counters, so cost is proportional to the number of variables.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| declared variables | swept | The tier axis: how many environment variables are declared across the project (ten per schema file, so the file count grows with it). |
| schema content | fixed at "realistic generated TypeScript: JSON-credential processors, validators and documentEnv calls" | Parsing cost depends on source-text volume and variety; the fixtures are literal TypeScript source, never executed by the tooling. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Not part of the end-to-end operation, which calls the generators; measured on its own.

### `renderDocs`

**Why we benchmark it.** It turns the contract model into the Markdown reference, the largest text env-cap renders.

**What poor performance would mean.** Documentation builds slow in proportion to the number of variables and the prose each carries.

**Expected growth: O(n).** One section is rendered for each contract and variable, once, so cost is proportional to the amount of documentation.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| declared variables | swept | The tier axis: how many environment variables are declared across the project (ten per schema file, so the file count grows with it). |
| schema content | fixed at "realistic generated TypeScript: JSON-credential processors, validators and documentEnv calls" | Parsing cost depends on source-text volume and variety; the fixtures are literal TypeScript source, never executed by the tooling. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Not part of the end-to-end operation, which calls the generators; measured on its own.

### `renderManifest`

**Why we benchmark it.** It renders the TypeScript manifest the application imports, in every build that ships the application.

**What poor performance would mean.** Slower builds in proportion to the number of variables.

**Expected growth: O(n).** One manifest entry is rendered for each variable, so cost is proportional to the number of variables.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| declared variables | swept | The tier axis: how many environment variables are declared across the project (ten per schema file, so the file count grows with it). |
| schema content | fixed at "realistic generated TypeScript: JSON-credential processors, validators and documentEnv calls" | Parsing cost depends on source-text volume and variety; the fixtures are literal TypeScript source, never executed by the tooling. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Not part of the end-to-end operation, which calls the generators; measured on its own.

### `computeReconciliation`

**Why we benchmark it.** It compares the variables the schemas declare with those in an existing `.env.example`, to say what to add and what is stale.

**What poor performance would mean.** A slower `.env.example` update in proportion to the number of variables and the size of the file.

**Expected growth: O(n).** The existing lines are indexed once and each declared variable looked up once, so cost is proportional to both.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| declared variables | swept | The tier axis: how many environment variables are declared across the project (ten per schema file, so the file count grows with it). |
| schema content | fixed at "realistic generated TypeScript: JSON-credential processors, validators and documentEnv calls" | Parsing cost depends on source-text volume and variety; the fixtures are literal TypeScript source, never executed by the tooling. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Not part of the end-to-end operation, which calls the generators; measured on its own.

### `renderEnvExample`

**Why we benchmark it.** It renders the `.env.example` file developers copy, from the same contracts as everything else.

**What poor performance would mean.** A slower `.env.example` update in proportion to the number of variables.

**Expected growth: O(n).** One line is rendered for each variable, so cost is proportional to the number of variables.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| declared variables | swept | The tier axis: how many environment variables are declared across the project (ten per schema file, so the file count grows with it). |
| schema content | fixed at "realistic generated TypeScript: JSON-credential processors, validators and documentEnv calls" | Parsing cost depends on source-text volume and variety; the fixtures are literal TypeScript source, never executed by the tooling. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Not part of the end-to-end operation, which calls the generators; measured on its own.

### `groupVariablesByOwner`

**Why we benchmark it.** It groups every variable under its owner, which the ownership summary and the usage report both print.

**What poor performance would mean.** A slower ownership report in proportion to the number of variables.

**Expected growth: O(n).** Each variable is placed in its owner's group once, so cost is proportional to the number of variables.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| declared variables | swept | The tier axis: how many environment variables are declared across the project (ten per schema file, so the file count grows with it). |
| schema content | fixed at "realistic generated TypeScript: JSON-credential processors, validators and documentEnv calls" | Parsing cost depends on source-text volume and variety; the fixtures are literal TypeScript source, never executed by the tooling. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Not part of the end-to-end operation, which calls the generators; measured on its own.

### `applyLiveExpirationOverrides`

**Why we benchmark it.** It replaces schema expiry dates with live ones (read from a secrets manager), once per run that uses a live source.

**What poor performance would mean.** A slower run for every project that tracks expiry in a live source, in proportion to the number of variables.

**Expected growth: O(n).** Each variable is looked up once in the map of overrides, so cost is proportional to the number of variables.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| declared variables | swept | The tier axis: how many environment variables are declared across the project (ten per schema file, so the file count grows with it). |
| schema content | fixed at "realistic generated TypeScript: JSON-credential processors, validators and documentEnv calls" | Parsing cost depends on source-text volume and variety; the fixtures are literal TypeScript source, never executed by the tooling. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Not part of the end-to-end operation, which calls the generators; measured on its own.

### `resolveLiveExpirationDates`

**Why we benchmark it.** It asks the caller's live source for the expiry of every variable once, then applies the answers.

**What poor performance would mean.** A slower run for every project that uses a live source, in proportion to the number of variables, on top of the lookup the caller pays for.

**Expected growth: O(n).** The variable names are collected once, handed to the caller's function once and the answers applied once, so cost is proportional to the number of variables.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| declared variables | swept | The tier axis: how many environment variables are declared across the project (ten per schema file, so the file count grows with it). |
| schema content | fixed at "realistic generated TypeScript: JSON-credential processors, validators and documentEnv calls" | Parsing cost depends on source-text volume and variety; the fixtures are literal TypeScript source, never executed by the tooling. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Not part of the end-to-end operation, which calls the generators; measured on its own.

### `configurationReference`

**Why we benchmark it.** It projects the evidence model into the flat configuration reference an operations team reads.

**What poor performance would mean.** A slower projection in proportion to the evidence model, which grows with the number of variables.

**Expected growth: O(n).** It reads the models once and builds one entry per variable, so cost is proportional to the number of variables.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| declared variables | swept | The tier axis: how many environment variables are declared across the project (ten per schema file, so the file count grows with it). |
| schema content | fixed at "realistic generated TypeScript: JSON-credential processors, validators and documentEnv calls" | Parsing cost depends on source-text volume and variety; the fixtures are literal TypeScript source, never executed by the tooling. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Not part of the end-to-end operation, which calls the generators; measured on its own.

### `expiringSoonReport`

**Why we benchmark it.** It projects the evidence model into the report of what expires soon, which the rotation reminders send.

**What poor performance would mean.** A slower reminder in proportion to the evidence model.

**Expected growth: O(n).** It reads the lifecycle and contract models once, so cost is proportional to the number of variables.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| declared variables | swept | The tier axis: how many environment variables are declared across the project (ten per schema file, so the file count grows with it). |
| schema content | fixed at "realistic generated TypeScript: JSON-credential processors, validators and documentEnv calls" | Parsing cost depends on source-text volume and variety; the fixtures are literal TypeScript source, never executed by the tooling. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Not part of the end-to-end operation, which calls the generators; measured on its own.

### `ownershipSummary`

**Why we benchmark it.** It projects the evidence model into the per-owner summary a review reads.

**What poor performance would mean.** A slower summary in proportion to the evidence model.

**Expected growth: O(n).** It groups every variable by owner once, so cost is proportional to the number of variables.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| declared variables | swept | The tier axis: how many environment variables are declared across the project (ten per schema file, so the file count grows with it). |
| schema content | fixed at "realistic generated TypeScript: JSON-credential processors, validators and documentEnv calls" | Parsing cost depends on source-text volume and variety; the fixtures are literal TypeScript source, never executed by the tooling. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Not part of the end-to-end operation, which calls the generators; measured on its own.

### `buildSarifLog`

**Why we benchmark it.** It converts the finding model into SARIF for code-scanning dashboards, in every pipeline that uploads findings.

**What poor performance would mean.** A slower upload step in proportion to the number of findings.

**Expected growth: O(n).** One SARIF result is built for each finding, so cost is proportional to the number of findings.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| declared variables | swept | The tier axis here is findings, one for each of this many variables with a problem. |
| finding mix | fixed at "one error, one warning and one info in turn" | Severity only picks the SARIF level. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Not part of the end-to-end operation, which calls the generators; measured on its own.

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

**Measured: O(n)** (exponent 1.07, 9 sizes) -- ✅ matches.

| variables | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 698 µs | 1.09 ms | 2.43 ms | 315.8 KiB | 1,433 |
| 40 | 1.05 ms | 1.44 ms | 2.76 ms | 559.7 KiB | 952 |
| 80 | 1.78 ms | 2.51 ms | 3.60 ms | 1.0 MiB | 561 |
| 160 | 3.27 ms | 4.18 ms | 6.08 ms | 2.0 MiB | 306 |
| 320 | 6.33 ms | 7.07 ms | 10.6 ms | 4.0 MiB | 158 |
| 640 | 12.2 ms | 12.8 ms | 15.9 ms | 8.1 MiB | 82 |
| 1280 | 26.2 ms | 27.1 ms | 32.6 ms | 4.6 MiB | 38 |
| 2560 | 53.2 ms | 55.9 ms | 62.6 ms | 9.8 MiB | 19 |
| 5120 | 124 ms | 129 ms | 170 ms | 41.8 MiB | 8 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 variables** (whole operation: 147 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `generate-artifacts` | 1 | 149 ms | 146 ms | 99% |
| `discover-schema-files` | 1 | 3.00 ms | 3.00 ms | 2.0% |
| `generate-documentation` | 0 | 0 | 0 | 0.0% |
| `generate-usage-report` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 0 | 0.0% |

**At 5120 variables** (whole operation: 1.14 s)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `generate-artifacts` | 1 | 1.10 s | 1.08 s | 94% |
| `discover-schema-files` | 1 | 20.7 ms | 20.7 ms | 1.8% |
| `generate-documentation` | 0 | 0 | 0 | 0.0% |
| `generate-usage-report` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 47.9 ms | 4.2% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-02T00:45:43.860Z` → `2026-10-02T00:46:55.879Z` (72 s), ci
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v22.23.3, GitHub Actions
- Git: `77acd16d0d0b13e9c162061da6d6f7d739436547` on `chore/no-minify-no-dist-urls` (uncommitted changes)
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120 variables -- One environment variable declared in a schema file. Schema files hold ten variables each, so 640 variables is 64 files -- a large monorepo's worth of configuration. The ladder stops at 5,120 variables (512 files) because `discoverSchemaFiles` refuses more than 1,000 files as a sanity limit, which 10,240 variables would exceed.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

