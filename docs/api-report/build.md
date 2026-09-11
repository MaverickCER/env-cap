# build

## Classes

### EnvDocumentationGenerationError

Thrown by [generateDocumentation](#generatedocumentation) on a blocking undocumented-contract/
variable finding (when `onUndocumented: "throw"`), or an output path
(`location`/`envExample.location`) escaping `root`. Nothing is written
when this throws.

#### Remarks

`code` is a stable, Stable-tier discriminant for programmatic handling --
prefer it over `.name`/`instanceof` when a message-independent switch is needed.

#### Extends

- `Error`

#### Constructors

##### Constructor

```ts
new EnvDocumentationGenerationError(issues): EnvDocumentationGenerationError;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `issues` | readonly [`CompatibilityIssue`](#compatibilityissue)[] |

###### Returns

[`EnvDocumentationGenerationError`](#envdocumentationgenerationerror)

###### Overrides

```ts
Error.constructor
```

#### Properties

##### code

```ts
readonly code: "ENV_DOCUMENTATION_GENERATION_FAILED" = "ENV_DOCUMENTATION_GENERATION_FAILED";
```

Stable discriminant for programmatic handling; always `"ENV_DOCUMENTATION_GENERATION_FAILED"`.

##### issues

```ts
readonly issues: readonly CompatibilityIssue[];
```

Every blocking finding, aggregated.

##### message

```ts
message: string;
```

###### Inherited from

```ts
Error.message
```

##### name

```ts
name: string;
```

###### Inherited from

```ts
Error.name
```

##### stack?

```ts
optional stack?: string;
```

###### Inherited from

```ts
Error.stack
```

##### prepareStackTrace?

```ts
static optional prepareStackTrace?: (err, stackTraces) => any;
```

Optional override for formatting stack traces

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `err` | `Error` |
| `stackTraces` | `CallSite`[] |

###### Returns

`any`

###### See

https://v8.dev/docs/stack-trace-api#customizing-stack-traces

###### Inherited from

```ts
Error.prepareStackTrace
```

##### stackTraceLimit

```ts
static stackTraceLimit: number;
```

###### Inherited from

```ts
Error.stackTraceLimit
```

#### Methods

##### captureStackTrace()

```ts
static captureStackTrace(targetObject, constructorOpt?): void;
```

Create .stack property on a target object

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `targetObject` | `object` |
| `constructorOpt?` | `Function` |

###### Returns

`void`

###### Inherited from

```ts
Error.captureStackTrace
```

***

### EnvManifestGenerationError

Thrown by [generateEnvManifest](#generateenvmanifest) on a blocking compatibility/exclusive-group
finding, or an output path escaping `root`.

#### Remarks

Nothing is written when this throws -- generation fails atomically, same as
[runtime.validateEnv](runtime.md#validateenv) fails atomically at runtime.

`code` is a stable, Stable-tier discriminant for programmatic handling --
prefer it over `.name`/`instanceof` when a message-independent switch is needed.

#### Extends

- `Error`

#### Constructors

##### Constructor

```ts
new EnvManifestGenerationError(issues): EnvManifestGenerationError;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `issues` | readonly [`CompatibilityIssue`](#compatibilityissue)[] |

###### Returns

[`EnvManifestGenerationError`](#envmanifestgenerationerror)

###### Overrides

```ts
Error.constructor
```

#### Properties

##### code

```ts
readonly code: "ENV_MANIFEST_GENERATION_FAILED" = "ENV_MANIFEST_GENERATION_FAILED";
```

Stable discriminant for programmatic handling; always `"ENV_MANIFEST_GENERATION_FAILED"`.

##### issues

```ts
readonly issues: readonly CompatibilityIssue[];
```

Every blocking finding, aggregated.

##### message

```ts
message: string;
```

###### Inherited from

```ts
Error.message
```

##### name

```ts
name: string;
```

###### Inherited from

```ts
Error.name
```

##### stack?

```ts
optional stack?: string;
```

###### Inherited from

```ts
Error.stack
```

##### prepareStackTrace?

```ts
static optional prepareStackTrace?: (err, stackTraces) => any;
```

Optional override for formatting stack traces

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `err` | `Error` |
| `stackTraces` | `CallSite`[] |

###### Returns

`any`

###### See

https://v8.dev/docs/stack-trace-api#customizing-stack-traces

###### Inherited from

```ts
Error.prepareStackTrace
```

##### stackTraceLimit

```ts
static stackTraceLimit: number;
```

###### Inherited from

```ts
Error.stackTraceLimit
```

#### Methods

##### captureStackTrace()

```ts
static captureStackTrace(targetObject, constructorOpt?): void;
```

Create .stack property on a target object

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `targetObject` | `object` |
| `constructorOpt?` | `Function` |

###### Returns

`void`

###### Inherited from

```ts
Error.captureStackTrace
```

***

### EnvProjectGenerationError

Thrown by [generateEnvArtifacts](#generateenvartifacts) when any requested pass (manifest/docs/usage)
reports a blocking finding, aggregated across all requested passes into
one error.

#### Remarks

Nothing from any pass is written when this throws -- see
`generate-env-artifacts.ts`'s compute-atomic guarantee (ADR 0011). Write-phase failures
(a real I/O error after all computes already passed) are NOT wrapped in
this type -- they propagate as whatever `fs.writeFile` itself throws,
since by that point some artifacts may already be on disk.

`code` is a stable, Stable-tier discriminant for programmatic handling --
prefer it over `.name`/`instanceof` when a message-independent switch is needed.

#### Extends

- `Error`

#### Constructors

##### Constructor

```ts
new EnvProjectGenerationError(issues): EnvProjectGenerationError;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `issues` | readonly [`CompatibilityIssue`](#compatibilityissue)[] |

###### Returns

[`EnvProjectGenerationError`](#envprojectgenerationerror)

###### Overrides

```ts
Error.constructor
```

#### Properties

##### code

```ts
readonly code: "ENV_PROJECT_GENERATION_FAILED" = "ENV_PROJECT_GENERATION_FAILED";
```

Stable discriminant for programmatic handling; always `"ENV_PROJECT_GENERATION_FAILED"`.

##### issues

```ts
readonly issues: readonly CompatibilityIssue[];
```

Every blocking finding, aggregated across all requested passes.

##### message

```ts
message: string;
```

###### Inherited from

```ts
Error.message
```

##### name

```ts
name: string;
```

###### Inherited from

```ts
Error.name
```

##### stack?

```ts
optional stack?: string;
```

###### Inherited from

```ts
Error.stack
```

##### prepareStackTrace?

```ts
static optional prepareStackTrace?: (err, stackTraces) => any;
```

Optional override for formatting stack traces

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `err` | `Error` |
| `stackTraces` | `CallSite`[] |

###### Returns

`any`

###### See

https://v8.dev/docs/stack-trace-api#customizing-stack-traces

###### Inherited from

```ts
Error.prepareStackTrace
```

##### stackTraceLimit

```ts
static stackTraceLimit: number;
```

###### Inherited from

```ts
Error.stackTraceLimit
```

#### Methods

##### captureStackTrace()

```ts
static captureStackTrace(targetObject, constructorOpt?): void;
```

Create .stack property on a target object

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `targetObject` | `object` |
| `constructorOpt?` | `Function` |

###### Returns

`void`

###### Inherited from

```ts
Error.captureStackTrace
```

***

### EnvUsageAnalysisError

Thrown by [generateUsageReport](#generateusagereport) on a blocking abandoned-contract/
unconsumed-owned-variable finding (when `onOwnershipIssue: "throw"`), or an
output path (`report.location`) escaping `root`.

#### Remarks

Never thrown for `unresolvedConsumers` or `indeterminate` findings -- both are "we don't
know" states, and uncertainty is never promoted to a failure.

`code` is a stable, Stable-tier discriminant for programmatic handling --
prefer it over `.name`/`instanceof` when a message-independent switch is needed.

#### Extends

- `Error`

#### Constructors

##### Constructor

```ts
new EnvUsageAnalysisError(issues): EnvUsageAnalysisError;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `issues` | readonly [`CompatibilityIssue`](#compatibilityissue)[] |

###### Returns

[`EnvUsageAnalysisError`](#envusageanalysiserror)

###### Overrides

```ts
Error.constructor
```

#### Properties

##### code

```ts
readonly code: "ENV_USAGE_ANALYSIS_FAILED" = "ENV_USAGE_ANALYSIS_FAILED";
```

Stable discriminant for programmatic handling; always `"ENV_USAGE_ANALYSIS_FAILED"`.

##### issues

```ts
readonly issues: readonly CompatibilityIssue[];
```

Every blocking finding, aggregated.

##### message

```ts
message: string;
```

###### Inherited from

```ts
Error.message
```

##### name

```ts
name: string;
```

###### Inherited from

```ts
Error.name
```

##### stack?

```ts
optional stack?: string;
```

###### Inherited from

```ts
Error.stack
```

##### prepareStackTrace?

```ts
static optional prepareStackTrace?: (err, stackTraces) => any;
```

Optional override for formatting stack traces

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `err` | `Error` |
| `stackTraces` | `CallSite`[] |

###### Returns

`any`

###### See

https://v8.dev/docs/stack-trace-api#customizing-stack-traces

###### Inherited from

```ts
Error.prepareStackTrace
```

##### stackTraceLimit

```ts
static stackTraceLimit: number;
```

###### Inherited from

```ts
Error.stackTraceLimit
```

#### Methods

##### captureStackTrace()

```ts
static captureStackTrace(targetObject, constructorOpt?): void;
```

Create .stack property on a target object

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `targetObject` | `object` |
| `constructorOpt?` | `Function` |

###### Returns

`void`

###### Inherited from

```ts
Error.captureStackTrace
```

## Interfaces

### AbandonedContractFinding

A contract never imported anywhere in the scanned repository.

#### Properties

##### contractName

```ts
readonly contractName: string;
```

Resolved display name (see [DiscoveredContract.contractName](#contractname-5)).

##### file

```ts
readonly file: string;
```

Root-relative path of the file declaring the contract.

##### owner

```ts
readonly owner: string | undefined;
```

Contract-level default owner, if set.

***

### ArtifactCheckFinding

One artifact's drift status, as found by [checkEnvArtifacts](#checkenvartifacts).

#### Properties

##### artifact

```ts
readonly artifact: "evidence" | "docs" | "envExample" | "manifest" | "usage";
```

Which generated artifact this finding is about.

##### detail?

```ts
readonly optional detail?: string;
```

Human-readable detail, set for `"stale"`/`"missing"` findings.

##### path

```ts
readonly path: string;
```

Absolute path the artifact would be written to.

##### status

```ts
readonly status: "stale" | "missing" | "ok";
```

`"missing"` if the file doesn't exist yet, `"stale"` if it exists but differs from what a real run would produce.

***

### AssertedDynamicAccessFinding

A variable that would otherwise be reported `unconsumedOwnedVariables`/`indeterminate`, but has at least one `"fresh"` developer-declared `dynamicAccess` citation -- the raw static status is always shown alongside the assertion, never replaced by it. See ADR 0037.

#### Properties

##### contractName

```ts
readonly contractName: string;
```

Resolved display name (see [DiscoveredContract.contractName](#contractname-5)).

##### dynamicAccessAssertions

```ts
readonly dynamicAccessAssertions: readonly DynamicAccessAssertion[];
```

Every citation covering this variable, each with its own current freshness.

##### key

```ts
readonly key: string;
```

The environment variable name.

##### wouldBeStatus

```ts
readonly wouldBeStatus: "unconsumed" | "indeterminate";
```

What this variable's status would be without the fresh assertion.

***

### BuildDirent

One directory entry from [BuildFileSystem.readdir](#readdir) -- the subset of Node's `Dirent` `src/build/**` reads.

#### Properties

##### isDirectory

```ts
readonly isDirectory: () => boolean;
```

###### Returns

`boolean`

##### isFile

```ts
readonly isFile: () => boolean;
```

###### Returns

`boolean`

##### name

```ts
readonly name: string;
```

***

### BuildFileSystem

The filesystem capability `env-cap/build` requires from its caller.

`./build` is a **library surface**: it must not acquire filesystem access
implicitly (no `node:fs` import anywhere under `src/` outside `src/cli/`).
Every public options object in `build/index.ts` carries a required `fs`
field of this type, and the caller supplies a concrete adapter -- the
`env-cap` CLI builds one over `node:fs/promises` (`src/cli/filesystem.ts`);
a test builds either that same real adapter or an in-memory fake. See ADR
0040.

"Ambient-fs-free" means specifically: `./build` never reaches for
`node:fs` itself. It still performs real filesystem operations -- the
capability is always handed in.

The shape is modeled on `node:fs/promises`'s own signatures so a thin
adapter is a drop-in value, but uses minimal structural types
([BuildDirent](#builddirent)/[BuildStats](#buildstats)) rather than Node's `Dirent`/
`Stats` -- the capability boundary shouldn't leak Node's type surface just
because the concrete adapter happens to be Node-backed. Only the
operations `src/build/**` actually calls are here.

#### Properties

##### mkdir

```ts
readonly mkdir: (path, options) => Promise<void>;
```

Create a directory and every missing parent. A no-op if it already exists.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `path` | `string` |
| `options` | \{ `recursive`: `true`; \} |
| `options.recursive` | `true` |

###### Returns

`Promise`\<`void`\>

##### readdir

```ts
readonly readdir: (path, options) => Promise<readonly BuildDirent[]>;
```

List a directory's entries with their file-type info.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `path` | `string` |
| `options` | \{ `withFileTypes`: `true`; \} |
| `options.withFileTypes` | `true` |

###### Returns

`Promise`\<readonly [`BuildDirent`](#builddirent)[]\>

##### readFile

```ts
readonly readFile: (path, encoding) => Promise<string>;
```

Read a UTF-8 text file. Rejects if the path doesn't exist or isn't readable.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `path` | `string` |
| `encoding` | `"utf8"` |

###### Returns

`Promise`\<`string`\>

##### realpath

```ts
readonly realpath: (path) => Promise<string>;
```

Resolve a path to its canonical, symlink-free absolute form.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `path` | `string` |

###### Returns

`Promise`\<`string`\>

##### stat

```ts
readonly stat: (path) => Promise<BuildStats>;
```

Stat a path (following symlinks). Rejects if the path doesn't exist.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `path` | `string` |

###### Returns

`Promise`\<[`BuildStats`](#buildstats)\>

##### writeFile

```ts
readonly writeFile: (path, data, encoding) => Promise<void>;
```

Write a UTF-8 text file, creating or truncating it. The parent directory must already exist.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `path` | `string` |
| `data` | `string` |
| `encoding` | `"utf8"` |

###### Returns

`Promise`\<`void`\>

***

### BuildFindingModelInput

Every source a [buildFindingModel](#buildfindingmodel) call can adapt, all optional --
a caller passes whichever of `generateEnvArtifacts()`'s `manifest`/`docs`/
`usage` results it actually requested, exactly like that result's own
top-level fields are each independently optional.

#### Properties

##### abandonedContracts?

```ts
readonly optional abandonedContracts?: readonly AbandonedContractFinding[];
```

From `generateUsageReport()`'s result.

##### artifactCheckFindings?

```ts
readonly optional artifactCheckFindings?: readonly ArtifactCheckFinding[];
```

From `checkEnvArtifacts()`'s result. Only `"stale"`/`"missing"` findings become a `Finding` -- `"ok"` means nothing to report.

##### compatibilityIssues?

```ts
readonly optional compatibilityIssues?: readonly CompatibilityIssue[];
```

From `detectCompatibilityIssues()`.

##### documentation?

```ts
readonly optional documentation?: DocumentationFindings;
```

From `generateDocumentation()`'s result.

##### dynamicAccessCitationProblems?

```ts
readonly optional dynamicAccessCitationProblems?: readonly DynamicAccessCitationProblem[];
```

From `computeManifestChanges()`'s result -- every `dynamicAccess` citation that's gone `"stale"` or `"missing"` since it was last acknowledged. See ADR 0037.

##### exclusiveGroupIssues?

```ts
readonly optional exclusiveGroupIssues?: readonly CompatibilityIssue[];
```

From `detectExclusiveGroupIssues()` -- kept separate from `compatibilityIssues` since it never sets its own `code` yet (ADR 0009), so this adapter synthesizes `"EXCLUSIVE_GROUP_VIOLATION"` for every entry.

##### indeterminateOwnership?

```ts
readonly optional indeterminateOwnership?: readonly IndeterminateOwnershipFinding[];
```

From `generateUsageReport()`'s result.

##### unconsumedOwnedVariables?

```ts
readonly optional unconsumedOwnedVariables?: readonly UnconsumedOwnedVariableFinding[];
```

From `generateUsageReport()`'s result.

##### unresolvedConsumers?

```ts
readonly optional unresolvedConsumers?: readonly UnresolvedConsumerFinding[];
```

From `generateUsageReport()`'s result.

***

### BuildStats

A path's stat info from [BuildFileSystem.stat](#stat) -- the subset of Node's `Stats` `src/build/**` reads.

#### Properties

##### isFile

```ts
readonly isFile: () => boolean;
```

###### Returns

`boolean`

##### size

```ts
readonly size: number;
```

Size in bytes -- read by the package-schema resolver to enforce a size ceiling.

***

### ChangeEvidenceReference

Points at a generated artifact's path -- what `checkEnvArtifacts()`'s drift findings are about, not a declared contract or variable at all.

#### Properties

##### model

```ts
readonly model: "change";
```

##### path

```ts
readonly path: string;
```

Absolute path of the generated artifact.

***

### ChangeModel

#### Properties

##### manifest

```ts
readonly manifest: ManifestChangeReport;
```

The existing manifest change report, unmodified -- see ADR 0021. `addedVariables`/`removedVariables` still list a correlated rename's two halves separately; `renamedVariables` below is an additive, separately-computed view, not a filter over this field.

##### renamedVariables

```ts
readonly renamedVariables: readonly RenamedVariable[];
```

Every `addedVariables`/`removedVariables` pair this run's currently
declared `renamedFrom` values correlate into a single rename, sorted by
contract identity then current key.

###### Remarks

Only ever populated from an *authored* `renamedFrom` -- never guessed
from name similarity (ADR 0010's "provable, not heuristic" ethos).
Variable-level only: Lifecycle Model deliberately has no contract-level
`renamedFrom` (ADR 0029), so there is no `renamedContracts` -- a
contract-level rename has no field to correlate from.

##### schemaVersion

```ts
readonly schemaVersion: 1;
```

***

### CheckEnvArtifactsResult

The result of a completed [checkEnvArtifacts](#checkenvartifacts) run.

#### Properties

##### findings

```ts
readonly findings: readonly ArtifactCheckFinding[];
```

One entry per requested artifact.

##### ok

```ts
readonly ok: boolean;
```

`true` iff every requested artifact is `"ok"`.

***

### CompatibilityIssue

One compatibility problem found between two or more declarations of the same variable, or an exclusive-group violation.

#### Properties

##### code?

```ts
readonly optional code?: CompatibilityIssueCode;
```

Stable, machine-readable identifier for CI filtering / doc-linking /
GitHub Action annotations / IDE integration. `undefined` only for checks
that don't (yet) set one -- see [CompatibilityIssueCode](#compatibilityissuecode-1) for the
full enumerated list of values a check in this file can produce.

##### files

```ts
readonly files: readonly string[];
```

Every file declaring a conflicting definition.

##### reason

```ts
readonly reason: string;
```

Human-readable explanation of the conflict.

##### severity

```ts
readonly severity: "error" | "warning" | "info";
```

`"error"` blocks generation regardless of `onIncompatibility`; `"warning"` blocks only when `onIncompatibility: "throw"`; `"info"` never blocks, under any flag.

##### variable

```ts
readonly variable: string;
```

The environment variable name, or `"(contract) <name>"` for a contract-level (e.g. exclusive-group) issue.

***

### ComputeSourceFingerprintOptions

Options for [computeSourceFingerprint](#computesourcefingerprint).

#### Properties

##### exclude

```ts
readonly exclude: readonly string[];
```

##### fs

```ts
readonly fs: BuildFileSystem;
```

The filesystem capability -- `./build` never imports `node:fs` (ADR 0040).

##### include

```ts
readonly include: readonly string[];
```

##### packages

```ts
readonly packages: readonly string[];
```

##### root

```ts
readonly root: string;
```

***

### ConfigurationReference

The Configuration Reference projection's output shape.

#### Extends

- `Record`\<`string`, `unknown`\>

#### Indexable

```ts
[key: string]: unknown
```

#### Properties

##### disclaimer

```ts
readonly disclaimer: string;
```

The standing "declared, not verified" notice -- see `evidenceDisclaimer()`. Carried in the data, not only in a renderer, so a consumer projecting this to their own format can't accidentally drop it.

##### entries

```ts
readonly entries: readonly ConfigurationReferenceEntry[];
```

Every declared variable across every discovered contract, sorted by contract file, then export name, then key.

***

### ConfigurationReferenceEntry

One variable, flattened across Contract/Ownership/Lifecycle Model into the row a Configuration Reference renders.

#### Properties

##### active

```ts
readonly active: boolean;
```

Whether the declaring contract is active. Inactive contracts are included -- the reference documents everything discovered, same scope the Catalog always had.

##### contractName

```ts
readonly contractName: string;
```

The declaring contract's display name, resolved from Contract Model -- the one model that owns it.

##### description

```ts
readonly description: string | undefined;
```

##### expiresAt

```ts
readonly expiresAt: string | undefined;
```

##### exportName

```ts
readonly exportName: string;
```

##### file

```ts
readonly file: string;
```

Root-relative, POSIX-separated path of the declaring contract.

##### hasDefault

```ts
readonly hasDefault: boolean;
```

##### hasProcessor

```ts
readonly hasProcessor: boolean;
```

##### hasValidator

```ts
readonly hasValidator: boolean;
```

##### key

```ts
readonly key: string;
```

##### owner

```ts
readonly owner: string | undefined;
```

Effective owner: the variable's own, falling back to its contract's.

##### required

```ts
readonly required: boolean | undefined;
```

##### sensitivity

```ts
readonly sensitivity: string | undefined;
```

Effective sensitivity: the variable's own, falling back to its contract's. Any string; see [runtime.VariableDocs.sensitivity](runtime.md#sensitivity-1).

***

### ContractEvidenceReference

Points at a declared contract and, optionally, one of its variables -- the shape every `CompatibilityIssue`/documentation finding can be resolved to. Unlike [ContractRef](#contractref), both identity fields are optional here: a finding can legitimately know only the file (an unresolvable `documentEnv()` link) or neither.

#### Properties

##### exportName

```ts
readonly exportName: string | undefined;
```

The contract's exported binding name, when known.

##### file

```ts
readonly file: string | undefined;
```

Absolute path of the file declaring the contract, when known.

##### model

```ts
readonly model: "contract";
```

##### position

```ts
readonly position: SourcePosition | undefined;
```

Exact file:line:column this finding is about -- the contract's `createEnv()` declaration, its `documentEnv()` declaration, or the specific variable's own declaration, whichever is most relevant to the finding. `undefined` only when no single position is more relevant than another (e.g. an `indeterminate-ownership` finding, which can have multiple candidate sites -- see `IndeterminateOwnershipFinding.dynamicAccessSites` for the full list instead). See ADR 0036.

##### variable

```ts
readonly variable: string | undefined;
```

The environment variable name, when the finding is variable-level rather than contract-level.

***

### ContractModel

#### Properties

##### contracts

```ts
readonly contracts: readonly ContractModelContract[];
```

##### schemaVersion

```ts
readonly schemaVersion: 3;
```

***

### ContractModelContract

One `createEnv()` contract's full statically-discoverable contract, active or not.

#### Extends

- `EnvGovernanceFields`

#### Properties

##### active

```ts
readonly active: boolean;
```

##### auditRequired

```ts
readonly auditRequired: boolean | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.auditRequired
```

##### category

```ts
readonly category: string | undefined;
```

##### contractName

```ts
readonly contractName: string;
```

##### dataResidency

```ts
readonly dataResidency: string | readonly string[] | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.dataResidency
```

##### declaration

```ts
readonly declaration: SourcePosition;
```

Where this contract's `createEnv(...)` call is declared. Always present. See ADR 0036.

##### documentation

```ts
readonly documentation: SourcePosition | undefined;
```

Where this contract's `documentEnv(...)` call is declared, if one exists. See ADR 0036.

##### documented

```ts
readonly documented: boolean;
```

##### exclusiveGroup

```ts
readonly exclusiveGroup: string | undefined;
```

##### expiresAt

```ts
readonly expiresAt: string | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.expiresAt
```

##### exportName

```ts
readonly exportName: string;
```

##### file

```ts
readonly file: string;
```

Root-relative, POSIX-separated -- matches `DiscoveredContractSummary.file`.

##### legalBasis

```ts
readonly legalBasis: string | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.legalBasis
```

##### metadata

```ts
readonly metadata: Readonly<Record<string, unknown>> | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.metadata
```

##### owner

```ts
readonly owner: string | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.owner
```

##### packageOrigin

```ts
readonly packageOrigin: PackageOrigin | undefined;
```

##### purpose

```ts
readonly purpose: string | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.purpose
```

##### retention

```ts
readonly retention: string | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.retention
```

##### sensitivity

```ts
readonly sensitivity: string | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.sensitivity
```

##### variables

```ts
readonly variables: readonly ContractModelVariable[];
```

***

### ContractModelVariable

One variable's full statically-discoverable contract: schema-shaped facts plus linked documentation.

#### See

 - [DependencyModelVariable](#dependencymodelvariable) -- this same declared variable's access status.
 - [OwnershipModelVariable](#ownershipmodelvariable) -- this same declared variable's effective owner.
 - [LifecycleModelVariable](#lifecyclemodelvariable) -- this same declared variable's lifecycle data.
 - `CatalogVariable` (`docs.ts`) -- this same declared variable, reshaped for the generated
docs catalog/JSON. Plain reference, not `{@link}`: `CatalogVariable` is intentionally not part
of the public surface (see `typedoc.json`'s `intentionallyNotExported`).

#### Extends

- `EnvGovernanceFields`

#### Properties

##### auditRequired

```ts
readonly auditRequired: boolean | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.auditRequired
```

##### context

```ts
readonly context: string | undefined;
```

##### dataResidency

```ts
readonly dataResidency: string | readonly string[] | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.dataResidency
```

##### declaration

```ts
readonly declaration: SourcePosition;
```

Where this variable's own schema property is declared. See ADR 0036.

##### defaultValue

```ts
readonly defaultValue: 
  | {
  ok: true;
  value: unknown;
}
  | {
  ok: false;
}
  | undefined;
```

##### description

```ts
readonly description: string | undefined;
```

##### documented

```ts
readonly documented: boolean;
```

##### evidence

```ts
readonly evidence: DiscoveredVariableEvidence | undefined;
```

The `evidence` sub-object from this variable's linked documentation -- re-verified every run, unlike every declared-only field above. See runtime.VariableEvidenceDocs and ADR 0037.

##### expiresAt

```ts
readonly expiresAt: string | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.expiresAt
```

##### hasDefault

```ts
readonly hasDefault: boolean;
```

##### hasProcessor

```ts
readonly hasProcessor: boolean;
```

##### hasValidator

```ts
readonly hasValidator: boolean;
```

##### key

```ts
readonly key: string;
```

##### legalBasis

```ts
readonly legalBasis: string | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.legalBasis
```

##### metadata

```ts
readonly metadata: Readonly<Record<string, unknown>> | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.metadata
```

##### owner

```ts
readonly owner: string | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.owner
```

##### processorReturnType

```ts
readonly processorReturnType: string | undefined;
```

##### processorSource

```ts
readonly processorSource: string | undefined;
```

##### purpose

```ts
readonly purpose: string | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.purpose
```

##### refreshInstructions

```ts
readonly refreshInstructions: string | undefined;
```

##### required

```ts
readonly required: boolean | undefined;
```

##### retention

```ts
readonly retention: string | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.retention
```

##### sensitivity

```ts
readonly sensitivity: string | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.sensitivity
```

##### setupInstructions

```ts
readonly setupInstructions: string | undefined;
```

##### validatorSource

```ts
readonly validatorSource: string | undefined;
```

***

### ContractRef

The one shape every model in this package uses to point at a declared
contract: the file it's declared in, and the binding it's exported as.
Nothing else -- see ADR 0039.

#### Remarks

Deliberately *not* carrying `contractName`. A display name is a rendering
concern, resolved on demand from `ContractModel` (the one model that owns
it) by whichever renderer actually needs prose; duplicating it onto every
reference made it a second, independently-stale copy of a fact that can
change under a `documentEnv()` edit. Deliberately not carrying a
pre-formatted `identity` string either -- `${file}#${exportName}` is
trivially derivable, and a stored copy is one more thing that can disagree
with the two fields it was built from. Code that genuinely needs a map key
builds that string locally, at the point of use.

#### Extended by

- [`ManifestVariableRef`](#manifestvariableref)
- [`OwnershipModelVariableRef`](#ownershipmodelvariableref)

#### Properties

##### exportName

```ts
readonly exportName: string;
```

The binding name the `createEnv()` result is exported as.

##### file

```ts
readonly file: string;
```

Root-relative, POSIX-separated path of the file declaring the contract -- see `displayPath()`.

***

### DependencyModel

#### Properties

##### consumers

```ts
readonly consumers: readonly DependencyModelConsumer[];
```

Inverse of `contracts[].consumingFiles` -- one entry per file that consumes at least one contract, listing which contracts it reads.

##### contracts

```ts
readonly contracts: readonly DependencyModelContract[];
```

##### scannedSurfaces

```ts
readonly scannedSurfaces: readonly ScannedSurface[];
```

Every surface actually scanned for usage -- see ADR 0036. Always has at least one entry (the application root).

##### schemaVersion

```ts
readonly schemaVersion: 2;
```

##### warnings

```ts
readonly warnings: readonly ParseWarning[];
```

***

### DependencyModelConsumer

One consuming file, and every contract it depends on -- the inverse of `DependencyModelContract.consumingFiles`.

#### Properties

##### contracts

```ts
readonly contracts: readonly ContractRef[];
```

##### file

```ts
readonly file: string;
```

Root-relative, POSIX-separated.

***

### DependencyModelContract

#### Properties

##### ambiguousBarrelFiles

```ts
readonly ambiguousBarrelFiles: readonly string[];
```

Files whose import of this contract's name couldn't be verified because it resolved through a file containing an unresolved wildcard re-export.

##### consumingFiles

```ts
readonly consumingFiles: readonly string[];
```

Every file coupled to this contract -- contract-level "who depends on this," not proof any specific variable was read.

##### contractName

```ts
readonly contractName: string;
```

##### dynamicAccessSites

```ts
readonly dynamicAccessSites: readonly SourcePosition[];
```

Every computed (dynamic) property-access site observed anywhere on this contract -- see ADR 0036.

##### exportName

```ts
readonly exportName: string;
```

##### file

```ts
readonly file: string;
```

Root-relative, POSIX-separated -- matches `ContractModelContract.file`.

##### hasDynamicAccess

```ts
readonly hasDynamicAccess: boolean;
```

##### imported

```ts
readonly imported: boolean;
```

##### variables

```ts
readonly variables: readonly DependencyModelVariable[];
```

***

### DependencyModelVariable

One variable's access status within a contract, plus every position it was found
member-accessed at, aggregated across every consuming file.

#### See

[ContractModelVariable](#contractmodelvariable) -- this same declared variable's canonical starting point.

#### Properties

##### dynamicAccessAssertions

```ts
readonly dynamicAccessAssertions: readonly DynamicAccessAssertion[];
```

Every developer-declared `dynamicAccess` citation's current freshness for this variable -- a wholly separate, independent fact from `status` above, never folded into it. Empty when no citation was declared, or when no manifest snapshot baseline was available to check against (the manifest pass wasn't also requested). See ADR 0037.

##### key

```ts
readonly key: string;
```

##### positions

```ts
readonly positions: readonly SourcePosition[];
```

Empty unless `status === "used"`. Previously discarded before reaching any public type -- see ADR 0027 (line only) and ADR 0036 (full position, file included per entry).

##### status

```ts
readonly status: VariableAccessStatus;
```

***

### DiscoveredContract

One `createEnv()` contract, merged with its linked `documentEnv()` documentation (if any). Its governance fields (`owner` .. `metadata`) are EnvGovernanceFields -- contract-level defaults that individual variables may override.

#### Extends

- `EnvGovernanceFields`

#### Properties

##### active

```ts
readonly active: boolean;
```

From the linked `documentEnv()`'s `active` option. Defaults to `true` when omitted or undocumented.

##### auditRequired

```ts
readonly auditRequired: boolean | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.auditRequired
```

##### category

```ts
readonly category: string | undefined;
```

From the linked `documentEnv()` call, if any.

##### contractName

```ts
readonly contractName: string;
```

Resolved display name: linked `documentEnv()`'s `name`, else `createEnv()`'s own `name` option, else `exportName`.

##### dataResidency

```ts
readonly dataResidency: string | readonly string[] | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.dataResidency
```

##### declaration

```ts
readonly declaration: SourcePosition;
```

Where this contract's `createEnv(...)` call is declared. Always present -- every discovered contract has one, by definition. See ADR 0036.

##### deprecated

```ts
readonly deprecated: boolean | undefined;
```

From the linked `documentEnv()` call, if any.

##### deprecatedReason

```ts
readonly deprecatedReason: string | undefined;
```

From the linked `documentEnv()` call, if any.

##### documentation

```ts
readonly documentation: SourcePosition | undefined;
```

Where this contract's `documentEnv(...)` call is declared, if one exists. Undefined for a contract that's never been documented. See ADR 0036.

##### documented

```ts
readonly documented: boolean;
```

Whether *any* `documentEnv()` call is linked to this contract at all.

##### exclusiveGroup

```ts
readonly exclusiveGroup: string | undefined;
```

From the linked `documentEnv()` call, if any -- see [runtime.ContractDocs.exclusiveGroup](runtime.md#exclusivegroup).

##### expiresAt

```ts
readonly expiresAt: string | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.expiresAt
```

##### exportName

```ts
readonly exportName: string;
```

The binding name the `createEnv()` result is exported as.

##### file

```ts
readonly file: string;
```

Absolute path of the file declaring the `createEnv()` call.

##### legalBasis

```ts
readonly legalBasis: string | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.legalBasis
```

##### metadata

```ts
readonly metadata: Readonly<Record<string, unknown>> | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.metadata
```

##### owner

```ts
readonly owner: string | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.owner
```

##### packageOrigin

```ts
readonly packageOrigin: PackageOrigin | undefined;
```

Set when this contract was discovered via an allow-listed package's
 declared schema entry point rather than local discovery -- the bare
 package name `renderManifest()` must import from instead of computing a
 relative path to the (analysis-only) resolved file. See ADR 0014.

##### purpose

```ts
readonly purpose: string | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.purpose
```

##### retention

```ts
readonly retention: string | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.retention
```

##### sensitivity

```ts
readonly sensitivity: string | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.sensitivity
```

##### variables

```ts
readonly variables: readonly DiscoveredVariable[];
```

Every variable declared in the schema, merged with its linked documentation.

***

### DiscoveredContractDocs

The `documentEnv()` contract-level documentation, resolved from static literals at the parse stage. Its governance fields (`owner` .. `metadata`) are EnvGovernanceFields.

#### Extends

- `EnvGovernanceFields`

#### Properties

##### active

```ts
readonly active: boolean;
```

Defaults to `true` when the call's `active` field is absent or not statically resolvable.

##### auditRequired

```ts
readonly auditRequired: boolean | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.auditRequired
```

##### category

```ts
readonly category: string | undefined;
```

Statically-resolved `category`, if set to a string literal.

##### dataResidency

```ts
readonly dataResidency: string | readonly string[] | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.dataResidency
```

##### deprecated

```ts
readonly deprecated: boolean | undefined;
```

Statically-resolved `deprecated`, if set to a boolean literal.

##### deprecatedReason

```ts
readonly deprecatedReason: string | undefined;
```

Statically-resolved `deprecatedReason`, if set to a string literal.

##### exclusiveGroup

```ts
readonly exclusiveGroup: string | undefined;
```

Statically-resolved `exclusiveGroup`, if set to a string literal.

##### expiresAt

```ts
readonly expiresAt: string | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.expiresAt
```

##### legalBasis

```ts
readonly legalBasis: string | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.legalBasis
```

##### metadata

```ts
readonly metadata: Readonly<Record<string, unknown>> | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.metadata
```

##### name

```ts
readonly name: string | undefined;
```

Statically-resolved `name`, if set to a string literal.

##### owner

```ts
readonly owner: string | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.owner
```

##### purpose

```ts
readonly purpose: string | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.purpose
```

##### retention

```ts
readonly retention: string | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.retention
```

##### sensitivity

```ts
readonly sensitivity: string | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.sensitivity
```

##### variables

```ts
readonly variables: ReadonlyMap<string, DiscoveredVariableDocs>;
```

Per-variable documentation, keyed by variable name.

***

### DiscoveredContractSummary

Root-relative projection of a [DiscoveredContract](#discoveredcontract), as returned by [generateEnvManifest](#generateenvmanifest)/[generateDocumentation](#generatedocumentation).

#### Properties

##### active

```ts
readonly active: boolean;
```

Whether this contract was included in the generated manifest (`active` defaults to true).

##### contractName

```ts
readonly contractName: string;
```

Resolved display name (see [DiscoveredContract.contractName](#contractname-5)).

##### documented

```ts
readonly documented: boolean;
```

Whether a `documentEnv()` call is linked to this contract.

##### exportName

```ts
readonly exportName: string;
```

The binding name the `createEnv()` result is exported as.

##### file

```ts
readonly file: string;
```

Root-relative, POSIX-separated file path.

##### variableCount

```ts
readonly variableCount: number;
```

Number of variables declared in this contract's schema.

***

### DiscoveredSchemaVariable

One schema entry's statically-discoverable shape -- presence facts, never evaluated/executed values.

#### Extended by

- [`DiscoveredVariable`](#discoveredvariable)

#### Properties

##### context

```ts
readonly context: string | undefined;
```

The variable's statically-resolved `context`, if set to a non-empty string literal (see ADR 0022). `undefined` when absent, non-literal, or empty.

##### declaration

```ts
readonly declaration: SourcePosition;
```

Where this variable's own schema property (e.g. `SESSION_SECRET: z.string()`) is declared -- distinct from the *contract's* `declaration`/`documentation` (`link.ts`); every variable has exactly one of these, always. See ADR 0036.

##### defaultValue

```ts
readonly defaultValue: 
  | {
  ok: true;
  value: unknown;
}
  | {
  ok: false;
}
  | undefined;
```

The default's statically-evaluated literal value, if `hasDefault` and it was a literal we could evaluate -- `{ ok: false }` when present but not statically resolvable, `undefined` when absent.

###### Union Members

###### Type Literal

```ts
{
  ok: true;
  value: unknown;
}
```

###### ok

```ts
ok: true;
```

Always `true` in this branch.

###### value

```ts
value: unknown;
```

The evaluated literal value.

***

###### Type Literal

```ts
{
  ok: false;
}
```

###### ok

```ts
ok: false;
```

Always `false` in this branch: present but not statically resolvable.

***

`undefined`

##### hasDefault

```ts
readonly hasDefault: boolean;
```

Whether the entry declares a `default`.

##### hasProcessor

```ts
readonly hasProcessor: boolean;
```

Whether the entry declares a `processor`.

##### hasValidator

```ts
readonly hasValidator: boolean;
```

Whether the entry declares a `validator`.

##### key

```ts
readonly key: string;
```

The environment variable name (the schema's object key).

##### processorReturnType

```ts
readonly processorReturnType: string | undefined;
```

Only present when the processor has an explicit `: T` return type annotation -- the one thing we treat as provable.

##### processorSource

```ts
readonly processorSource: string | undefined;
```

The processor function's source text, normalized to single-line, if `hasProcessor`.

##### validatorSource

```ts
readonly validatorSource: string | undefined;
```

The validator function's source text, normalized to single-line, if `hasValidator`.

***

### DiscoveredVariable

One schema variable merged with its linked `documentEnv()` documentation. Its
governance fields (`owner` .. `metadata`) are EnvGovernanceFields --
each an individual-variable override of the contract's own value, from the
linked `documentEnv()` call's matching `variables` entry, or `undefined`.

#### Extends

- [`DiscoveredSchemaVariable`](#discoveredschemavariable).`EnvGovernanceFields`

#### Properties

##### auditRequired

```ts
readonly auditRequired: boolean | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.auditRequired
```

##### context

```ts
readonly context: string | undefined;
```

The variable's statically-resolved `context`, if set to a non-empty string literal (see ADR 0022). `undefined` when absent, non-literal, or empty.

###### Inherited from

[`DiscoveredSchemaVariable`](#discoveredschemavariable).[`context`](#context-1)

##### dataResidency

```ts
readonly dataResidency: string | readonly string[] | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.dataResidency
```

##### declaration

```ts
readonly declaration: SourcePosition;
```

Where this variable's own schema property (e.g. `SESSION_SECRET: z.string()`) is declared -- distinct from the *contract's* `declaration`/`documentation` (`link.ts`); every variable has exactly one of these, always. See ADR 0036.

###### Inherited from

[`DiscoveredSchemaVariable`](#discoveredschemavariable).[`declaration`](#declaration-3)

##### defaultValue

```ts
readonly defaultValue: 
  | {
  ok: true;
  value: unknown;
}
  | {
  ok: false;
}
  | undefined;
```

The default's statically-evaluated literal value, if `hasDefault` and it was a literal we could evaluate -- `{ ok: false }` when present but not statically resolvable, `undefined` when absent.

###### Union Members

###### Type Literal

```ts
{
  ok: true;
  value: unknown;
}
```

###### ok

```ts
ok: true;
```

Always `true` in this branch.

###### value

```ts
value: unknown;
```

The evaluated literal value.

***

###### Type Literal

```ts
{
  ok: false;
}
```

###### ok

```ts
ok: false;
```

Always `false` in this branch: present but not statically resolvable.

***

`undefined`

###### Inherited from

[`DiscoveredSchemaVariable`](#discoveredschemavariable).[`defaultValue`](#defaultvalue-1)

##### deprecated

```ts
readonly deprecated: boolean | undefined;
```

From the linked `documentEnv()` call's matching `variables` entry, if any.

##### deprecatedReason

```ts
readonly deprecatedReason: string | undefined;
```

From the linked `documentEnv()` call's matching `variables` entry, if any.

##### description

```ts
readonly description: string | undefined;
```

From the linked `documentEnv()` call's matching `variables` entry, if any.

##### documented

```ts
readonly documented: boolean;
```

Whether this specific key had a matching entry in the linked `documentEnv()` call, if any.

##### evidence

```ts
readonly evidence: DiscoveredVariableEvidence | undefined;
```

The linked `documentEnv()` entry's `evidence` sub-object -- the re-verified-every-run half of this variable's documentation, deliberately not flattened in alongside the declared-only fields above. See runtime.VariableEvidenceDocs and ADR 0037.

##### expiresAt

```ts
readonly expiresAt: string | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.expiresAt
```

##### hasDefault

```ts
readonly hasDefault: boolean;
```

Whether the entry declares a `default`.

###### Inherited from

[`DiscoveredSchemaVariable`](#discoveredschemavariable).[`hasDefault`](#hasdefault-2)

##### hasProcessor

```ts
readonly hasProcessor: boolean;
```

Whether the entry declares a `processor`.

###### Inherited from

[`DiscoveredSchemaVariable`](#discoveredschemavariable).[`hasProcessor`](#hasprocessor-2)

##### hasValidator

```ts
readonly hasValidator: boolean;
```

Whether the entry declares a `validator`.

###### Inherited from

[`DiscoveredSchemaVariable`](#discoveredschemavariable).[`hasValidator`](#hasvalidator-2)

##### key

```ts
readonly key: string;
```

The environment variable name (the schema's object key).

###### Inherited from

[`DiscoveredSchemaVariable`](#discoveredschemavariable).[`key`](#key-4)

##### legalBasis

```ts
readonly legalBasis: string | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.legalBasis
```

##### metadata

```ts
readonly metadata: Readonly<Record<string, unknown>> | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.metadata
```

##### owner

```ts
readonly owner: string | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.owner
```

##### processorReturnType

```ts
readonly processorReturnType: string | undefined;
```

Only present when the processor has an explicit `: T` return type annotation -- the one thing we treat as provable.

###### Inherited from

[`DiscoveredSchemaVariable`](#discoveredschemavariable).[`processorReturnType`](#processorreturntype-1)

##### processorSource

```ts
readonly processorSource: string | undefined;
```

The processor function's source text, normalized to single-line, if `hasProcessor`.

###### Inherited from

[`DiscoveredSchemaVariable`](#discoveredschemavariable).[`processorSource`](#processorsource-1)

##### purpose

```ts
readonly purpose: string | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.purpose
```

##### refreshInstructions

```ts
readonly refreshInstructions: string | undefined;
```

From the linked `documentEnv()` call's matching `variables` entry, if any.

##### removeBy

```ts
readonly removeBy: string | undefined;
```

From the linked `documentEnv()` call's matching `variables` entry, if any.

##### renamedFrom

```ts
readonly renamedFrom: string | undefined;
```

From the linked `documentEnv()` call's matching `variables` entry, if any -- the previous variable name this one renames, if this declaration is the result of a rename.

##### required

```ts
readonly required: boolean | undefined;
```

From the linked `documentEnv()` call's matching `variables` entry, if any.

##### retention

```ts
readonly retention: string | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.retention
```

##### sensitivity

```ts
readonly sensitivity: string | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.sensitivity
```

##### setupInstructions

```ts
readonly setupInstructions: string | undefined;
```

From the linked `documentEnv()` call's matching `variables` entry, if any.

##### validatorSource

```ts
readonly validatorSource: string | undefined;
```

The validator function's source text, normalized to single-line, if `hasValidator`.

###### Inherited from

[`DiscoveredSchemaVariable`](#discoveredschemavariable).[`validatorSource`](#validatorsource-1)

***

### DiscoveredVariableDocs

One variable's statically-extracted `documentEnv()` documentation, as declared in that call's `variables` entry for this key -- governance fields (`owner` .. `metadata`) are EnvGovernanceFields, resolved from static literals.

#### Extends

- `EnvGovernanceFields`

#### Properties

##### auditRequired

```ts
readonly auditRequired: boolean | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.auditRequired
```

##### dataResidency

```ts
readonly dataResidency: string | readonly string[] | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.dataResidency
```

##### deprecated

```ts
readonly deprecated: boolean | undefined;
```

Statically-resolved `deprecated`, if set to a boolean literal.

##### deprecatedReason

```ts
readonly deprecatedReason: string | undefined;
```

Statically-resolved `deprecatedReason`, if set to a string literal.

##### description

```ts
readonly description: string | undefined;
```

Statically-resolved `description`, if set to a string literal.

##### evidence

```ts
readonly evidence: DiscoveredVariableEvidence | undefined;
```

Statically-extracted `evidence` sub-object -- the re-verified-every-run half of a variable's documentation, kept structurally apart from the declared-only fields above. `undefined` when the declaration has no `evidence` key at all. See runtime.VariableEvidenceDocs and ADR 0037.

##### expiresAt

```ts
readonly expiresAt: string | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.expiresAt
```

##### key

```ts
readonly key: string;
```

The environment variable name this documentation applies to.

##### legalBasis

```ts
readonly legalBasis: string | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.legalBasis
```

##### metadata

```ts
readonly metadata: Readonly<Record<string, unknown>> | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.metadata
```

##### owner

```ts
readonly owner: string | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.owner
```

##### purpose

```ts
readonly purpose: string | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.purpose
```

##### refreshInstructions

```ts
readonly refreshInstructions: string | undefined;
```

Statically-resolved `refreshInstructions`, if set to a string literal.

##### removeBy

```ts
readonly removeBy: string | undefined;
```

Statically-resolved `removeBy`, if set to a string literal.

##### renamedFrom

```ts
readonly renamedFrom: string | undefined;
```

Statically-resolved `renamedFrom`, if set to a string literal.

##### required

```ts
readonly required: boolean | undefined;
```

Statically-resolved `required`, if set to a boolean literal.

##### retention

```ts
readonly retention: string | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.retention
```

##### sensitivity

```ts
readonly sensitivity: string | undefined;
```

###### Inherited from

```ts
EnvGovernanceFields.sensitivity
```

##### setupInstructions

```ts
readonly setupInstructions: string | undefined;
```

Statically-resolved `setupInstructions`, if set to a string literal.

***

### DocumentationFindings

Everything [generateDocumentation](#generatedocumentation) found that isn't fully documented or up to date -- never blocks generation; a team that wants to gate CI on this reads `Finding[]` (the "documentation" family) from the persisted evidence artifact and decides for itself. See ADR 0038.

#### Properties

##### expiringSoon

```ts
readonly expiringSoon: readonly ExpiringEntry[];
```

Variables whose `expiresAt` falls within the configured window.

##### nonstandardSensitivityLevels

```ts
readonly nonstandardSensitivityLevels: readonly NonstandardSensitivityEntry[];
```

Contract- or variable-level `sensitivity` values outside STANDARD\_SENSITIVITY\_LEVELS. Advisory only -- the declared level is always honored verbatim; this exists purely so vocabulary drift across a repo stays visible.

##### staleDocEntries

```ts
readonly staleDocEntries: readonly {
  exportName: string;
  file: string;
  key: string;
}[];
```

Documented variable entries with no matching schema variable (the schema key was removed or renamed).

##### undocumentedContracts

```ts
readonly undocumentedContracts: readonly {
  exportName: string;
  file: string;
}[];
```

Contracts with no linked `documentEnv()` call at all.

##### undocumentedVariables

```ts
readonly undocumentedVariables: readonly {
  exportName: string;
  file: string;
  key: string;
}[];
```

Schema variables with no matching entry in their contract's linked documentation.

##### unresolvedLinks

```ts
readonly unresolvedLinks: readonly {
  file: string;
  reason: string;
}[];
```

`documentEnv()` calls that couldn't be statically linked to a schema.

***

### DynamicAccessAssertion

One developer-declared runtime.VariableDocs.dynamicAccess citation's
current acknowledgment state -- a claim, never an observation. Kept fully
separate from `VariableAccessStatus` (which stays exactly 3-valued and
purely AST-derived) so a developer's assertion can never make env-cap
claim it observed something it didn't. See
`evidence-snapshot.ts`'s `computeDynamicAccessAcknowledgments()` (where
this is computed) and ADR 0037.

#### Extends

- [`SourcePosition`](#sourceposition)

#### Properties

##### acknowledgment

```ts
readonly acknowledgment: "fresh" | "stale" | "missing";
```

`"fresh"` -- the cited file currently exists and either matches the
committed baseline hash or has no baseline yet (a brand-new citation,
nothing to contradict it yet). `"stale"` -- the cited file exists but its
content has changed since the committed baseline. `"missing"` -- the
cited file no longer exists at all. Re-derived from scratch every run;
never cached across runs.

##### column

```ts
readonly column: number;
```

1-indexed column number.

###### Inherited from

[`SourcePosition`](#sourceposition).[`column`](#column-1)

##### contentHash

```ts
readonly contentHash: string | undefined;
```

SHA-256 hex digest of the cited file's content *as observed this run* --
`undefined` iff `acknowledgment === "missing"` (nothing to hash). This is
the one field that makes freshness checking possible without a
snapshot-only shadow type: the live `EvidenceModel.dependency` a caller
gets back and the persisted evidence snapshot a later run reads back as
its baseline are the exact same shape -- this run's `contentHash` becomes
next run's comparison target directly. See `evidence-snapshot.ts` and
ADR 0037.

##### file

```ts
readonly file: string;
```

Root-relative, POSIX-separated.

###### Inherited from

[`SourcePosition`](#sourceposition).[`file`](#file-24)

##### line

```ts
readonly line: number;
```

1-indexed line number.

###### Inherited from

[`SourcePosition`](#sourceposition).[`line`](#line-1)

***

### DynamicAccessCitationProblem

One `dynamicAccess` citation env-cap can no longer vouch for -- the direct input to `finding-model.ts`'s `"STALE_DYNAMIC_ACCESS_CITATION"`/`"MISSING_DYNAMIC_ACCESS_CITATION"` findings. See ADR 0037.

#### Properties

##### acknowledgment

```ts
readonly acknowledgment: "stale" | "missing";
```

##### contractName

```ts
readonly contractName: string;
```

##### exportName

```ts
readonly exportName: string;
```

##### file

```ts
readonly file: string;
```

Root-relative, POSIX-separated.

##### key

```ts
readonly key: string;
```

The variable whose `dynamicAccess` citation this is.

##### position

```ts
readonly position: SourcePosition;
```

Where the citation points -- not the variable's own declaration.

***

### EnvExampleResult

The result of a completed [writeEnvExample](#writeenvexample) call.

#### Properties

##### skippedExistingPath

```ts
readonly skippedExistingPath: string | undefined;
```

Set when a file already existed at the requested location and was left
untouched: with the default `"keep-sibling"`, `writtenPath` is a fresh
timestamped sibling instead; with `"skip"`, this is the only outcome and
`writtenPath` is `undefined`. Always `undefined` with `"overwrite"`.

##### staleVariables

```ts
readonly staleVariables: readonly string[];
```

Variable names (live or already commented-out) in an existing example file that no discovered contract declares anymore.

##### variablesToAdd

```ts
readonly variablesToAdd: readonly string[];
```

Variables the current (active) configuration requires that aren't yet a live entry in an existing example file.

##### variablesToComment

```ts
readonly variablesToComment: readonly string[];
```

Variables live in an existing example file whose feature is no longer active, and that no other active feature still needs -- safe to comment out.

##### writtenPath

```ts
readonly writtenPath: string | undefined;
```

Where the example file actually got written. `undefined` only when
`onExisting: "skip"` left an existing file untouched and nothing was
written.

***

### EvidenceModel

The seventh canonical fact model (ADR 0024): the assembled union of the
other six, plus provenance, the immutable input every
`defineEvidenceProjection()` projector runs over (`env-cap/evidence`,
ADR 0031).

#### Remarks

This type is the one intentional exception to `src/build/`'s zero-
cross-folder-import rule: `src/evidence/` imports it with `import type`
only (fully erased at compile time under `verbatimModuleSyntax`), the same
shape as `helpers`' single sanctioned edge onto `runtime` -- see
`specs/architecture.md`. `src/evidence/` never imports a *value* from
here, only this shape, so it stays isomorphic and Node-free. An actual
`EvidenceModel` instance is produced by [generateEvidenceModel](#generateevidencemodel)
(`env-cap/build`, Node-only), which runs discovery once,
builds all six sub-models, and `deepFreeze()`s the result.

#### Properties

##### change

```ts
readonly change: ChangeModel;
```

##### contract

```ts
readonly contract: ContractModel;
```

##### dependency

```ts
readonly dependency: DependencyModel;
```

##### finding

```ts
readonly finding: FindingModel;
```

##### lifecycle

```ts
readonly lifecycle: LifecycleModel;
```

##### ownership

```ts
readonly ownership: OwnershipModel;
```

##### provenance

```ts
readonly provenance: EvidenceProvenance;
```

##### schemaVersion

```ts
readonly schemaVersion: 1;
```

***

### EvidenceProvenance

Who/when/what produced a given `EvidenceModel` instance. Caller-supplied,
never ambient-detected -- `generateEvidenceModel()` never shells out to
`git` itself, mirroring ADR 0012's live-expiration-callback precedent.

#### Properties

##### commit

```ts
readonly commit: string | undefined;
```

##### generatedAt

```ts
readonly generatedAt: string;
```

##### toolVersion

```ts
readonly toolVersion: string;
```

***

### ExpiringEntry

One contract- or variable-level `expiresAt` falling within the configured "expiring soon" window.

#### Properties

##### daysRemaining

```ts
readonly daysRemaining: number;
```

Days from `now` until expiry; negative when already expired.

##### expiresAt

```ts
readonly expiresAt: string;
```

The raw ISO date string, unparsed.

##### exportName

```ts
readonly exportName: string;
```

The contract's exported binding name.

##### file

```ts
readonly file: string;
```

Absolute path of the file declaring the contract.

##### key

```ts
readonly key: string | undefined;
```

`undefined` for a contract-level `expiresAt`, set for a per-variable one.

***

### ExpiringSoonEntry

One contract- or variable-level `expiresAt` inside the configured window.

#### Properties

##### contractName

```ts
readonly contractName: string;
```

The declaring contract's display name, resolved from Contract Model.

##### daysRemaining

```ts
readonly daysRemaining: number;
```

Days remaining as of the run that produced this evidence; negative when already expired.

##### expired

```ts
readonly expired: boolean;
```

`true` when `daysRemaining` is negative -- the deadline has already passed.

##### expiresAt

```ts
readonly expiresAt: string;
```

The raw ISO date string, exactly as declared -- never reformatted.

##### exportName

```ts
readonly exportName: string;
```

##### file

```ts
readonly file: string;
```

Root-relative, POSIX-separated path of the declaring contract.

##### key

```ts
readonly key: string | undefined;
```

`undefined` for a contract-level expiry, set for a per-variable one.

##### owner

```ts
readonly owner: string | undefined;
```

Effective owner, so a reader knows who to chase without a second lookup.

##### refreshInstructions

```ts
readonly refreshInstructions: string | undefined;
```

How to obtain a replacement value, if the declaration says.

***

### ExpiringSoonReport

The Expiring-Soon projection's output shape.

#### Extends

- `Record`\<`string`, `unknown`\>

#### Indexable

```ts
[key: string]: unknown
```

#### Properties

##### disclaimer

```ts
readonly disclaimer: string;
```

See [ConfigurationReference.disclaimer](#disclaimer).

##### entries

```ts
readonly entries: readonly ExpiringSoonEntry[];
```

Every entry inside the window, soonest-first (already-expired entries lead, most-overdue first).

##### expiredCount

```ts
readonly expiredCount: number;
```

How many of `entries` are already past their `expiresAt`.

***

### FileParseResult

The raw, single-file facts extracted by [parseSchemaFile](#parseschemafile).

#### Properties

##### createEnvCalls

```ts
readonly createEnvCalls: readonly RawCreateEnvCall[];
```

Every `createEnv(...)` call site found at the top level of this file.

##### documentEnvCalls

```ts
readonly documentEnvCalls: readonly RawDocumentEnvCall[];
```

Every `documentEnv(...)` call site found at the top level of this file.

##### exportedConstNames

```ts
readonly exportedConstNames: ReadonlySet<string>;
```

Names of top-level `const` declarations that are exported (a subset of [localConsts](#localconsts)'s keys, plus non-object-literal exports).

##### file

```ts
readonly file: string;
```

Absolute path of the parsed file.

##### imports

```ts
readonly imports: ReadonlyMap<string, ImportBinding>;
```

Local binding name -> where it came from. Only named imports of a relative specifier are tracked (namespace/default/bare-package imports are irrelevant to schema linking).

##### localConsts

```ts
readonly localConsts: ReadonlyMap<string, ObjectLiteralExpression>;
```

Top-level `const NAME = {...}` object-literal declarations, whether exported or not.

##### sourceFile

```ts
readonly sourceFile: SourceFile;
```

The TypeScript AST for this file, reused by callers that need to inspect it further.

##### warnings

```ts
readonly warnings: readonly ParseWarning[];
```

Recoverable issues found while parsing this file.

***

### Finding

One rule violation or derived signal, in the Finding Model's canonical shape.

#### Properties

##### code

```ts
readonly code: FindingCode;
```

Stable, machine-readable identifier -- always set, unlike [CompatibilityIssue.code](#code-4) which stays optional on that narrower, pre-existing type.

##### family

```ts
readonly family: FindingFamily;
```

Which source check produced this finding.

##### location

```ts
readonly location: EvidenceReference;
```

Structured pointer back to what this finding is about.

##### message

```ts
readonly message: string;
```

Human-readable explanation, reusing the source finding's own prose where one exists.

##### severity

```ts
readonly severity: "error" | "warning" | "info";
```

`"error"` for a provable, always-blocking violation (e.g. an
exclusive-group conflict); `"warning"` for everything gated by
`onIncompatibility`/`onUndocumented`/`onOwnershipIssue`'s default "warn"
behavior; `"info"` for an observation that is never actionable enough to
block anything, even under `--strict` -- see `INFO_ONLY_CODES` in
`generate-env-artifacts.ts`.

***

### FindingModel

#### Properties

##### findings

```ts
readonly findings: readonly Finding[];
```

##### schemaVersion

```ts
readonly schemaVersion: 3;
```

***

### GenerateDocumentationOptions

Options for [generateDocumentation](#generatedocumentation).

#### Properties

##### envExample?

```ts
optional envExample?: {
  location: string;
  onExisting?: EnvExampleOnExisting;
};
```

Also emit a `.env.example`-style file, relative to `root`. `onExisting`
controls what happens when a file already exists there -- defaults to
`"keep-sibling"` (never overwrites; see `EnvExampleOnExisting` and
`EnvExampleResult`).

###### location

```ts
location: string;
```

Output path for the `.env.example`-style file, relative to `root`.

###### onExisting?

```ts
optional onExisting?: EnvExampleOnExisting;
```

What to do when a file already exists at `location`. Defaults to `"keep-sibling"`.

##### exclude?

```ts
optional exclude?: string[];
```

Glob patterns for files/directories to prune. Defaults to `defaultExclude()`.

##### expiringWithinDays?

```ts
optional expiringWithinDays?: number;
```

How many days out counts as "expiring soon". Defaults to 30.

##### fs

```ts
fs: BuildFileSystem;
```

The filesystem capability -- `./build` never imports `node:fs` (ADR 0040).

##### include?

```ts
optional include?: string[];
```

Glob patterns for files to scan. Defaults to `defaultInclude()`.

##### liveExpirationDates?

```ts
optional liveExpirationDates?: LiveExpirationDates;
```

Supplies expiration metadata from a live source as a post-discovery
override, invoked exactly once with every discovered variable name after
linking completes and before rendering. See `live-expirations.ts` and
ADR 0012. Omitted: behavior is unchanged from a purely static `expiresAt`.

##### location

```ts
location: string;
```

Output path for the Markdown docs artifact, relative to `root`.

##### packages?

```ts
optional packages?: readonly string[];
```

**Experimental** (see VERSIONING.md) -- see `GenerateEnvManifestOptions.packages`; see ADR 0014.

##### root?

```ts
optional root?: string;
```

Project root schema discovery is relative to. Defaults to `process.cwd()`.

##### tsconfig?

```ts
optional tsconfig?: string | false;
```

**Experimental** (see VERSIONING.md) -- see `GenerateEnvManifestOptions.tsconfig`; see ADR 0023.

***

### GenerateDocumentationResult

The result of a completed [generateDocumentation](#generatedocumentation) run.

#### Properties

##### catalog

```ts
readonly catalog: readonly CatalogContract[];
```

Same descriptive content as the generated Markdown Catalog, reshaped for
 programmatic consumers -- see `buildCatalog()` in `docs.ts`.

##### contracts

```ts
readonly contracts: readonly DiscoveredContractSummary[];
```

Root-relative summary of every discovered contract, active or not.

##### docsPath

```ts
readonly docsPath: string;
```

Absolute path the Markdown docs artifact was written to.

##### documentation

```ts
readonly documentation: DocumentationFindings;
```

Everything found that isn't fully documented or up to date.

##### envExample

```ts
readonly envExample: EnvExampleResult | undefined;
```

Set only when `options.envExample` was passed.

##### parseWarnings

```ts
readonly parseWarnings: readonly ParseWarning[];
```

Parse-time warnings collected across every analyzed file (including allow-listed package resolution).

***

### GenerateEnvArtifactsOptions

Options for [generateEnvArtifacts](#generateenvartifacts).

#### Properties

##### docs?

```ts
optional docs?: 
  | false
  | Omit<GenerateDocumentationOptions, 
  | "fs"
  | "root"
  | "include"
  | "exclude"
  | "packages"
  | "tsconfig"
| "liveExpirationDates">;
```

Docs pass options, or `false` to skip it entirely.

##### evidence?

```ts
optional evidence?: 
  | false
  | {
  location: string;
};
```

Where to write the persisted evidence artifact (the full, literal
`EvidenceModel`, plus a paired `.fingerprint` sidecar -- see
`evidence-cache.ts`), e.g. `docs/env.evidence.json`, relative to `root`.
Independent of `manifest.location` -- requesting this needs no other
pass, and generating a manifest never requires it. `EvidenceModel`
itself is always computed regardless of this option (ADR 0038, "free to
compute, always real") and always returned as `result.evidence`; this
option controls only whether it's also written to disk. Omitted:
nothing is written, `result.evidence` is still populated.

##### exclude?

```ts
optional exclude?: string[];
```

Glob patterns to exclude, shared across every requested pass. Defaults to node_modules/dist/.git.

##### fs

```ts
fs: BuildFileSystem;
```

The filesystem capability, shared across every requested pass -- `./build` never imports `node:fs` (ADR 0040).

##### include?

```ts
optional include?: string[];
```

Shared schema-discovery glob for the contract graph. Defaults to `["**/env.schema.ts"]`.

##### liveExpirationDates?

```ts
optional liveExpirationDates?: LiveExpirationDates;
```

Supplies expiration metadata from a live source (a secrets manager, an
internal inventory API, ...) as a post-discovery override applied only to
the docs pass. Invoked at most once, only when a `docs` pass is actually
requested, with every discovered variable name across all passes' shared
contract graph. See `live-expirations.ts` and ADR 0012. Omitted: behavior
is unchanged from a purely static `expiresAt`.

##### manifest?

```ts
optional manifest?: 
  | false
| Omit<GenerateEnvManifestOptions, "fs" | "root" | "include" | "exclude" | "packages" | "tsconfig">;
```

Manifest pass options, or `false` to skip it entirely.

##### onOwnershipIssue?

```ts
optional onOwnershipIssue?: "warn" | "throw";
```

Escalates every warning-severity `"ownership"`-family finding (abandoned
contracts, unresolved consumers, unconsumed owned variables,
indeterminate ownership, stale/missing `dynamicAccess` citations) into a
blocking error. Defaults to `"warn"` -- see [onUndocumented](#onundocumented).

##### onUndocumented?

```ts
optional onUndocumented?: "warn" | "throw";
```

Escalates every warning-severity `"documentation"`-family finding
(undocumented contracts/variables, stale doc entries, expiring/expired
entries, unresolvable `documentEnv()` links) into a blocking error, so a
run with any of them writes nothing and throws. Defaults to `"warn"` --
ADR 0038's stance, unchanged: documentation gaps never block by default.

###### Remarks

Scoped deliberately narrowly, unlike `manifest.onIncompatibility`, which
gates only the compatibility family. `"info"`-severity findings are never
escalated by either -- see `Finding.severity`.

##### packages?

```ts
optional packages?: readonly string[];
```

**Experimental** (see VERSIONING.md) -- see `GenerateEnvManifestOptions.packages`; shared across every requested pass. See ADR 0014.

##### root?

```ts
optional root?: string;
```

Directory glob patterns are resolved against, shared across every requested pass. Defaults to `process.cwd()`.

##### tsconfig?

```ts
optional tsconfig?: string | false;
```

**Experimental** (see VERSIONING.md) -- see `GenerateEnvManifestOptions.tsconfig`; shared across every requested pass. See ADR 0023.

##### usage?

```ts
optional usage?: 
  | false
| Omit<GenerateUsageReportOptions, "fs" | "root" | "include" | "exclude" | "packages" | "tsconfig">;
```

Usage-report pass options, or `false` to skip it entirely.

***

### GenerateEnvArtifactsResult

The result of a completed [generateEnvArtifacts](#generateenvartifacts) run.

#### Properties

##### docs

```ts
readonly docs: 
  | GenerateDocumentationResult
  | undefined;
```

Set only when `options.docs` wasn't `false`.

##### evidence

```ts
readonly evidence: EvidenceModel;
```

Always populated, regardless of `options.evidence` -- see that option's own doc comment.

##### manifest

```ts
readonly manifest: GenerateEnvManifestResult | undefined;
```

Set only when `options.manifest` wasn't `false`.

##### usage

```ts
readonly usage: GenerateUsageReportResult | undefined;
```

Set only when `options.usage` wasn't `false`.

***

### GenerateEnvManifestOptions

Options for [generateEnvManifest](#generateenvmanifest).

#### Properties

##### exclude?

```ts
optional exclude?: string[];
```

Glob patterns to exclude. Defaults to node_modules/dist/.git.

##### fs

```ts
fs: BuildFileSystem;
```

The filesystem capability -- `./build` never imports `node:fs` (ADR 0040).

##### include?

```ts
optional include?: string[];
```

Glob patterns for schema files. Defaults to `["**/env.schema.ts"]`.

##### location

```ts
location: string;
```

Output path for the generated manifest, relative to `root` (e.g. "src/generated/env.manifest.ts").

##### onIncompatibility?

```ts
optional onIncompatibility?: "warn" | "throw";
```

"warn" (default): only provable incompatibilities (conflicting explicit processor
return type annotations) block generation; everything else is reported as a warning.
"throw": warnings are escalated to hard errors too, for stricter CI gates.

##### packages?

```ts
optional packages?: readonly string[];
```

**Experimental** (see VERSIONING.md) -- explicit allowlist of installed
package names whose declared `"envCap": { "schema": "<path>" }` entry
point should also be discovered, so a contract that ships as its own
separately-published package (no monorepo required) can be included in
the manifest. Opt-in only: a package is never considered unless its
exact name appears here. See ADR 0014.

##### root?

```ts
optional root?: string;
```

Directory glob patterns are resolved against. Defaults to `process.cwd()`.

##### tsconfig?

```ts
optional tsconfig?: string | false;
```

**Experimental** (see VERSIONING.md) -- path to a tsconfig.json (relative to `root`)
whose `compilerOptions.paths`/`baseUrl` resolve aliased import specifiers (e.g.
`"@/lib/env.schema.js"`) encountered during static analysis, so a contract or consumer
reached only through an alias isn't misreported as abandoned/unresolved. Defaults to
`"tsconfig.json"` at `root` -- on automatically, no opt-in required, since (unlike
`packages`) this never crosses a trust/versioning boundary: every resolved file is
already local, already-trusted project source. Pass `false` to disable entirely. See
ADR 0023.

***

### GenerateEnvManifestResult

The result of a completed [generateEnvManifest](#generateenvmanifest) run.

#### Properties

##### contracts

```ts
readonly contracts: readonly DiscoveredContractSummary[];
```

Root-relative summary of every discovered contract, active or not.

##### outputPath

```ts
readonly outputPath: string;
```

Absolute path the manifest file was written to.

##### parseWarnings

```ts
readonly parseWarnings: readonly ParseWarning[];
```

Parse-time warnings collected across every analyzed file (including allow-listed package resolution).

##### warnings

```ts
readonly warnings: readonly CompatibilityIssue[];
```

Non-blocking compatibility/exclusive-group issues (severity `"warning"`).

***

### GenerateEvidenceModelOptions

Options for [generateEvidenceModel](#generateevidencemodel).

#### Extended by

- [`GetEvidenceModelOptions`](#getevidencemodeloptions)

#### Properties

##### commit?

```ts
optional commit?: () => Promise<string | undefined>;
```

Resolves the commit SHA to stamp onto `EvidenceModel.provenance.commit`.
Invoked at most once, after discovery/linking completes. env-cap never
shells out to `git` itself -- see ADR 0012's callback precedent. Omitted:
`commit` is `undefined`.

###### Returns

`Promise`\<`string` \| `undefined`\>

##### exclude?

```ts
optional exclude?: string[];
```

Glob patterns to exclude, shared across every pass. Defaults to node_modules/dist/.git.

##### expiringWithinDays?

```ts
optional expiringWithinDays?: number;
```

Feeds Lifecycle Model's `expiring` list. Defaults to 30.

##### fs

```ts
fs: BuildFileSystem;
```

The filesystem capability -- `./build` never imports `node:fs` (ADR 0040).

##### include?

```ts
optional include?: string[];
```

Schema-discovery glob for the contract graph. Defaults to `["**/env.schema.ts"]`.

##### liveExpirationDates?

```ts
optional liveExpirationDates?: LiveExpirationDates;
```

Supplies expiration metadata from a live source as a post-discovery
override, applied to Lifecycle Model's (and Finding Model's
`expiring-soon` findings') data only -- Contract Model still reflects the
schema's own static `expiresAt`. See `live-expirations.ts` and ADR 0012.

##### packages?

```ts
optional packages?: readonly string[];
```

**Experimental** (see VERSIONING.md) -- see `GenerateEnvManifestOptions.packages`. See ADR 0014.

##### previousSnapshotLocation?

```ts
optional previousSnapshotLocation?: string;
```

Where a previously-persisted evidence artifact lives, relative to
`root` -- read (never written) as the baseline Change Model diffs
against and dynamic-access citation freshness (ADR 0037) compares
content hashes to. Independent of any `.ts` manifest a project may or
may not also generate -- there is no derivation from a manifest's own
location. Omitted: treated as the normal first-run state (everything
reads as added, no citation-freshness baseline to compare against),
never an error.

##### root?

```ts
optional root?: string;
```

Directory glob patterns are resolved against. Defaults to `process.cwd()`.

##### tsconfig?

```ts
optional tsconfig?: string | false;
```

**Experimental** (see VERSIONING.md) -- see `GenerateEnvManifestOptions.tsconfig`. See ADR 0023.

***

### GenerateUsageReportOptions

Options for [generateUsageReport](#generateusagereport).

#### Properties

##### exclude?

```ts
optional exclude?: string[];
```

Glob patterns to exclude, for both schema discovery and the usage scan. Defaults to node_modules/dist/.git.

##### fs

```ts
fs: BuildFileSystem;
```

The filesystem capability -- `./build` never imports `node:fs` (ADR 0040).

##### include?

```ts
optional include?: string[];
```

Schema-discovery glob, for the contract graph -- self-sufficient like the other two generator functions.

##### packages?

```ts
optional packages?: readonly string[];
```

**Experimental** (see VERSIONING.md) -- see `GenerateEnvManifestOptions.packages`; see ADR 0014.

##### report?

```ts
optional report?: {
  location: string;
};
```

Also write the rendered Markdown report to this path, relative to `root`. Omitted: the report is only returned, not written.

###### location

```ts
location: string;
```

Output path for the report, relative to `root`.

##### root?

```ts
optional root?: string;
```

Directory glob patterns are resolved against. Defaults to `process.cwd()`.

##### tsconfig?

```ts
optional tsconfig?: string | false;
```

**Experimental** (see VERSIONING.md) -- see `GenerateEnvManifestOptions.tsconfig`; see ADR 0023.

***

### GenerateUsageReportResult

Public result of [generateUsageReport](#generateusagereport).

#### Remarks

Composed from the building-block types `usage-report.ts` (the renderer) owns, the same way
`GenerateDocumentationResult` composes from `docs.ts`'s `CatalogContract` --
keeps the renderer importable without its orchestrator (see
`RenderUsageReportOptions`'s own doc comment).

#### Extends

- [`RenderUsageReportOptions`](#renderusagereportoptions)

#### Properties

##### abandonedContracts

```ts
readonly abandonedContracts: readonly AbandonedContractFinding[];
```

Contracts never imported anywhere in the scanned repository.

###### Inherited from

[`RenderUsageReportOptions`](#renderusagereportoptions).[`abandonedContracts`](#abandonedcontracts-2)

##### asserted

```ts
readonly asserted: readonly AssertedDynamicAccessFinding[];
```

Variables a developer has re-acknowledged via `dynamicAccess`, freshly -- see ADR 0037.

###### Inherited from

[`RenderUsageReportOptions`](#renderusagereportoptions).[`asserted`](#asserted-1)

##### dependencyOwnership

```ts
readonly dependencyOwnership: readonly OwnershipDependencyEntry[];
```

Every contract's ownership/dependency summary.

###### Inherited from

[`RenderUsageReportOptions`](#renderusagereportoptions).[`dependencyOwnership`](#dependencyownership-1)

##### indeterminate

```ts
readonly indeterminate: readonly IndeterminateOwnershipFinding[];
```

Variables accessed only via dynamic (computed) property access.

###### Inherited from

[`RenderUsageReportOptions`](#renderusagereportoptions).[`indeterminate`](#indeterminate-1)

##### parseWarnings

```ts
readonly parseWarnings: readonly ParseWarning[];
```

Schema-discovery parse warnings plus, since ADR 0014, any `packages`
 resolution failures -- surfaced here too (not just from
 `generateEnvManifest`/`generateDocumentation`) so a team relying only
 on `--ownership` output still learns when a cross-package contract
 failed to resolve.

###### Inherited from

[`RenderUsageReportOptions`](#renderusagereportoptions).[`parseWarnings`](#parsewarnings-3)

##### reportPath

```ts
readonly reportPath: string | undefined;
```

Absolute path the report was written to, or `undefined` if `options.report` wasn't passed.

##### scannedSurfaces

```ts
readonly scannedSurfaces: readonly ScannedSurface[];
```

Every surface actually scanned for usage -- see ADR 0036. Named explicitly next to `unconsumedOwnedVariables` so "no consumer found" is never read as a stronger claim than what was actually searched.

###### Inherited from

[`RenderUsageReportOptions`](#renderusagereportoptions).[`scannedSurfaces`](#scannedsurfaces-2)

##### unconsumedOwnedVariables

```ts
readonly unconsumedOwnedVariables: readonly UnconsumedOwnedVariableFinding[];
```

Owned variables with no consumer found in the scanned repository.

###### Inherited from

[`RenderUsageReportOptions`](#renderusagereportoptions).[`unconsumedOwnedVariables`](#unconsumedownedvariables-2)

##### unresolvedConsumers

```ts
readonly unresolvedConsumers: readonly UnresolvedConsumerFinding[];
```

Advisory only, never gates `onOwnershipIssue` -- a contract only
 reaches here when an ambiguous barrel re-export makes "abandoned" or
 "consumed" both unprovable.

###### Inherited from

[`RenderUsageReportOptions`](#renderusagereportoptions).[`unresolvedConsumers`](#unresolvedconsumers-2)

***

### GetEvidenceModelOptions

Options for [getEvidenceModel](#getevidencemodel) -- every `generateEvidenceModel()` option, plus where the cached artifact lives.

#### Extends

- [`GenerateEvidenceModelOptions`](#generateevidencemodeloptions)

#### Properties

##### commit?

```ts
optional commit?: () => Promise<string | undefined>;
```

Resolves the commit SHA to stamp onto `EvidenceModel.provenance.commit`.
Invoked at most once, after discovery/linking completes. env-cap never
shells out to `git` itself -- see ADR 0012's callback precedent. Omitted:
`commit` is `undefined`.

###### Returns

`Promise`\<`string` \| `undefined`\>

###### Inherited from

[`GenerateEvidenceModelOptions`](#generateevidencemodeloptions).[`commit`](#commit-1)

##### exclude?

```ts
optional exclude?: string[];
```

Glob patterns to exclude, shared across every pass. Defaults to node_modules/dist/.git.

###### Inherited from

[`GenerateEvidenceModelOptions`](#generateevidencemodeloptions).[`exclude`](#exclude-4)

##### expiringWithinDays?

```ts
optional expiringWithinDays?: number;
```

Feeds Lifecycle Model's `expiring` list. Defaults to 30.

###### Inherited from

[`GenerateEvidenceModelOptions`](#generateevidencemodeloptions).[`expiringWithinDays`](#expiringwithindays-1)

##### fs

```ts
fs: BuildFileSystem;
```

The filesystem capability -- `./build` never imports `node:fs` (ADR 0040).

###### Inherited from

[`GenerateEvidenceModelOptions`](#generateevidencemodeloptions).[`fs`](#fs-4)

##### include?

```ts
optional include?: string[];
```

Schema-discovery glob for the contract graph. Defaults to `["**/env.schema.ts"]`.

###### Inherited from

[`GenerateEvidenceModelOptions`](#generateevidencemodeloptions).[`include`](#include-4)

##### liveExpirationDates?

```ts
optional liveExpirationDates?: LiveExpirationDates;
```

Supplies expiration metadata from a live source as a post-discovery
override, applied to Lifecycle Model's (and Finding Model's
`expiring-soon` findings') data only -- Contract Model still reflects the
schema's own static `expiresAt`. See `live-expirations.ts` and ADR 0012.

###### Inherited from

[`GenerateEvidenceModelOptions`](#generateevidencemodeloptions).[`liveExpirationDates`](#liveexpirationdates-2)

##### location

```ts
readonly location: string;
```

Where the cached evidence artifact (and its `.fingerprint` sidecar) live, e.g. `docs/env.evidence.json`, relative to `root`. Required -- there is no honest default env-cap could guess at for where a project keeps this.

##### packages?

```ts
optional packages?: readonly string[];
```

**Experimental** (see VERSIONING.md) -- see `GenerateEnvManifestOptions.packages`. See ADR 0014.

###### Inherited from

[`GenerateEvidenceModelOptions`](#generateevidencemodeloptions).[`packages`](#packages-4)

##### previousSnapshotLocation?

```ts
optional previousSnapshotLocation?: string;
```

Where a previously-persisted evidence artifact lives, relative to
`root` -- read (never written) as the baseline Change Model diffs
against and dynamic-access citation freshness (ADR 0037) compares
content hashes to. Independent of any `.ts` manifest a project may or
may not also generate -- there is no derivation from a manifest's own
location. Omitted: treated as the normal first-run state (everything
reads as added, no citation-freshness baseline to compare against),
never an error.

###### Inherited from

[`GenerateEvidenceModelOptions`](#generateevidencemodeloptions).[`previousSnapshotLocation`](#previoussnapshotlocation)

##### root?

```ts
optional root?: string;
```

Directory glob patterns are resolved against. Defaults to `process.cwd()`.

###### Inherited from

[`GenerateEvidenceModelOptions`](#generateevidencemodeloptions).[`root`](#root-4)

##### tsconfig?

```ts
optional tsconfig?: string | false;
```

**Experimental** (see VERSIONING.md) -- see `GenerateEnvManifestOptions.tsconfig`. See ADR 0023.

###### Inherited from

[`GenerateEvidenceModelOptions`](#generateevidencemodeloptions).[`tsconfig`](#tsconfig-3)

***

### GetEvidenceModelResult

The result of [getEvidenceModel](#getevidencemodel).

#### Properties

##### evidence

```ts
readonly evidence: EvidenceModel;
```

##### missReason

```ts
readonly missReason: string | undefined;
```

Set only when `source === "miss"` -- why the cache wasn't trusted, for a caller that wants to log it.

##### source

```ts
readonly source: "hit" | "miss";
```

`"hit"` -- the committed evidence artifact's fingerprint matched current source; read from disk, no recompute. `"miss"` -- a real `generateEvidenceModel()` call ran.

***

### ImportBinding

One named import binding, tracked only for relative specifiers (see [FileParseResult.imports](#imports)).

#### Properties

##### importedName

```ts
readonly importedName: string;
```

The name as exported by the source module -- accounts for `import { real as local }`.

##### specifier

```ts
readonly specifier: string;
```

The raw module specifier as written in the import (e.g. `"./payments.schema.js"`).

***

### IndeterminateOwnershipFinding

A variable accessed only via dynamic (computed) property access -- usage cannot be determined statically.

#### Properties

##### contractName

```ts
readonly contractName: string;
```

Resolved display name (see [DiscoveredContract.contractName](#contractname-5)).

##### dynamicAccessSites

```ts
readonly dynamicAccessSites: readonly SourcePosition[];
```

Every AST-observed dynamic-access site backing `reason`, structured -- see ADR 0036.

##### key

```ts
readonly key: string;
```

The environment variable name.

##### reason

```ts
readonly reason: string;
```

Human-readable explanation of why usage couldn't be determined.

##### staleOrMissingCitations

```ts
readonly staleOrMissingCitations: readonly DynamicAccessCitationProblem[];
```

See [UnconsumedOwnedVariableFinding.staleOrMissingCitations](#staleormissingcitations-1).

***

### LifecycleModel

#### Properties

##### contracts

```ts
readonly contracts: readonly LifecycleModelContract[];
```

Only contracts with at least one lifecycle-relevant field set, at the contract level or on at least one variable.

##### expiring

```ts
readonly expiring: readonly ExpiringEntry[];
```

Every contract-/variable-level `expiresAt` within the configured window,
soonest-first -- see `computeExpiringEntries()`. `file` is root-relative
and POSIX-separated here, matching `LifecycleModelContract.file`/every
other canonical model -- unlike `ExpiringEntry`'s own doc comment, which
describes its shape in `computeExpiringEntries()`'s other direct
consumers (e.g. `DocumentationFindings.expiringSoon`), where `file`
stays the absolute path `renderDocs()` itself expects.

##### schemaVersion

```ts
readonly schemaVersion: 2;
```

***

### LifecycleModelContract

#### Properties

##### contractName

```ts
readonly contractName: string;
```

##### deprecated

```ts
readonly deprecated: boolean | undefined;
```

##### deprecatedReason

```ts
readonly deprecatedReason: string | undefined;
```

##### expiresAt

```ts
readonly expiresAt: string | undefined;
```

##### exportName

```ts
readonly exportName: string;
```

##### file

```ts
readonly file: string;
```

Root-relative, POSIX-separated -- matches `ContractModelContract.file`.

##### retention

```ts
readonly retention: string | undefined;
```

See [LifecycleModelVariable.retention](#retention-7).

##### variables

```ts
readonly variables: readonly LifecycleModelVariable[];
```

Only variables with at least one lifecycle field set (`expiresAt`, `refreshInstructions`, `deprecated`, `removeBy`, `renamedFrom`, `retention`) -- same "only what's relevant" scope `renderLifecycleReport()` already uses for its rows.

***

### LifecycleModelVariable

One variable's lifecycle data (expiry, deprecation, rename correlation).

#### See

[ContractModelVariable](#contractmodelvariable) -- this same declared variable's canonical starting point.

#### Properties

##### deprecated

```ts
readonly deprecated: boolean | undefined;
```

##### deprecatedReason

```ts
readonly deprecatedReason: string | undefined;
```

##### expiresAt

```ts
readonly expiresAt: string | undefined;
```

##### key

```ts
readonly key: string;
```

##### refreshInstructions

```ts
readonly refreshInstructions: string | undefined;
```

##### removeBy

```ts
readonly removeBy: string | undefined;
```

##### renamedFrom

```ts
readonly renamedFrom: string | undefined;
```

The previous variable name this one renames, if set -- see `ManifestChangeReport`'s rename correlation (ADR 0029/0030).

##### retention

```ts
readonly retention: string | undefined;
```

Descriptive retention policy (e.g. "delete after 90 days") -- a policy statement, never computed or parsed, deliberately independent of `expiresAt`'s actual temporal constraint. See ADR 0035.

***

### LinkResult

The full result of [linkFiles](#linkfiles): every linked contract, plus every category of thing that didn't link cleanly.

#### Properties

##### contracts

```ts
readonly contracts: readonly DiscoveredContract[];
```

Every `createEnv()` contract found, merged with its documentation.

##### staleDocEntries

```ts
readonly staleDocEntries: readonly {
  exportName: string;
  file: string;
  key: string;
}[];
```

Documented variable entries with no matching schema variable (the schema key was removed or renamed).

##### undocumentedContracts

```ts
readonly undocumentedContracts: readonly {
  exportName: string;
  file: string;
}[];
```

Contracts with no linked `documentEnv()` call at all.

##### undocumentedVariables

```ts
readonly undocumentedVariables: readonly {
  exportName: string;
  file: string;
  key: string;
}[];
```

Schema variables with no matching entry in their contract's linked documentation.

##### unresolvedLinks

```ts
readonly unresolvedLinks: readonly UnresolvedLink[];
```

`documentEnv()` calls that couldn't be statically linked to a schema.

##### warnings

```ts
readonly warnings: readonly ParseWarning[];
```

Parse-time warnings collected across every analyzed file.

***

### ManifestChangeReport

The result of diffing two `ContractModel.contracts` arrays -- see
`diffContracts()`. Comprehensive by construction: every own field of
`ContractModelContract`/`ContractModelVariable` (schema facts --
`hasDefault`/`processorSource`/`validatorSource`/... -- alongside
documented metadata) participates, and every discovered contract is
covered, not only active ones. A field-by-field, hand-maintained diff
(this module's previous design) would need updating by hand every time
Contract Model gains a field; the generic differ below can't drift out of
sync with the model it diffs.

#### Properties

##### addedContracts

```ts
readonly addedContracts: readonly ContractRef[];
```

Contracts present now but not in the previous snapshot.

##### addedVariables

```ts
readonly addedVariables: readonly ManifestVariableRef[];
```

Variables present now but not in the previous snapshot.

##### removedContracts

```ts
readonly removedContracts: readonly ContractRef[];
```

Contracts present in the previous snapshot but not now.

##### removedVariables

```ts
readonly removedVariables: readonly ManifestVariableRef[];
```

Variables present in the previous snapshot but not now.

##### updatedContracts

```ts
readonly updatedContracts: readonly ManifestContractUpdate[];
```

Contracts present in both snapshots with at least one changed field.

##### updatedVariables

```ts
readonly updatedVariables: readonly ManifestVariableUpdate[];
```

Variables present in both snapshots with at least one changed field.

***

### ManifestContractUpdate

A contract present in both snapshots, with at least one changed field.

#### Extends

- [`ManifestContractRef`](#manifestcontractref)

#### Properties

##### changes

```ts
readonly changes: readonly ManifestFieldChange[];
```

Every field that changed between the previous and current snapshot.

##### exportName

```ts
readonly exportName: string;
```

The binding name the `createEnv()` result is exported as.

###### Inherited from

```ts
ManifestContractRef.exportName
```

##### file

```ts
readonly file: string;
```

Root-relative, POSIX-separated path of the file declaring the contract -- see `displayPath()`.

###### Inherited from

```ts
ManifestContractRef.file
```

***

### ManifestFieldChange

One field's before/after value in a [ManifestContractUpdate](#manifestcontractupdate) or [ManifestVariableUpdate](#manifestvariableupdate).

#### Properties

##### current

```ts
readonly current: string | undefined;
```

The value in the current run, or `undefined` if the field is now unset.

##### field

```ts
readonly field: string;
```

The changed field's name.

##### previous

```ts
readonly previous: string | undefined;
```

The value from the previous snapshot, or `undefined` if the field was unset.

***

### ManifestVariableRef

Identifies one variable for [ManifestChangeReport](#manifestchangereport) purposes -- its owning contract's identity plus its own key. See [ContractRef](#contractref).

#### Extends

- [`ContractRef`](#contractref)

#### Extended by

- [`ManifestVariableUpdate`](#manifestvariableupdate)

#### Properties

##### exportName

```ts
readonly exportName: string;
```

The binding name the `createEnv()` result is exported as.

###### Inherited from

[`ContractRef`](#contractref).[`exportName`](#exportname-3)

##### file

```ts
readonly file: string;
```

Root-relative, POSIX-separated path of the file declaring the contract -- see `displayPath()`.

###### Inherited from

[`ContractRef`](#contractref).[`file`](#file-4)

##### key

```ts
readonly key: string;
```

The environment variable name.

***

### ManifestVariableUpdate

A variable present in both snapshots, with at least one changed field.

#### Extends

- [`ManifestVariableRef`](#manifestvariableref)

#### Properties

##### changes

```ts
readonly changes: readonly ManifestFieldChange[];
```

Every field that changed between the previous and current snapshot.

##### exportName

```ts
readonly exportName: string;
```

The binding name the `createEnv()` result is exported as.

###### Inherited from

[`ManifestVariableRef`](#manifestvariableref).[`exportName`](#exportname-12)

##### file

```ts
readonly file: string;
```

Root-relative, POSIX-separated path of the file declaring the contract -- see `displayPath()`.

###### Inherited from

[`ManifestVariableRef`](#manifestvariableref).[`file`](#file-16)

##### key

```ts
readonly key: string;
```

The environment variable name.

###### Inherited from

[`ManifestVariableRef`](#manifestvariableref).[`key`](#key-12)

***

### OwnerBearingContract

The minimal shape [groupVariablesByOwner](#groupvariablesbyowner) needs -- structural, not pinned to one model, so the exact same grouping serves `OwnershipModel`'s already-resolved owners and `ContractModel`'s raw ones alike.

#### Properties

##### owner

```ts
readonly owner: string | undefined;
```

##### variables

```ts
readonly variables: readonly unknown[];
```

***

### OwnershipDependencyEntry

One contract's dependency-ownership summary: who owns it, and who depends on it.

#### Properties

##### consumers

```ts
readonly consumers: readonly string[];
```

Files coupled to this contract (imported it, referenced it, or read a
 member from it) -- contract-level "who depends on this," NOT proof any
 specific variable was read. Blast radius if this contract changes is
 `consumers.length`, computed by callers/renderers on demand rather than
 stored redundantly here.

##### contractName

```ts
readonly contractName: string;
```

Resolved display name (see [DiscoveredContract.contractName](#contractname-5)).

##### file

```ts
readonly file: string;
```

Root-relative path of the file declaring the contract.

##### owner

```ts
readonly owner: string | undefined;
```

Contract-level default owner, if set.

##### variableCount

```ts
readonly variableCount: number;
```

Number of variables declared in this contract's schema.

***

### OwnershipEvidenceReference

Points at a contract by name for an ownership/usage finding -- `usage-report.ts`'s finding types don't consistently carry `file`/`exportName` together, only `contractName`.

#### Properties

##### contractName

```ts
readonly contractName: string;
```

##### file

```ts
readonly file: string | undefined;
```

Root-relative path of the file declaring the contract, when the source finding carries one.

##### model

```ts
readonly model: "ownership";
```

##### position

```ts
readonly position: SourcePosition | undefined;
```

See [ContractEvidenceReference.position](#position).

##### variable

```ts
readonly variable: string | undefined;
```

The environment variable name, when the finding is variable-level rather than contract-level.

***

### OwnershipModel

#### Properties

##### contracts

```ts
readonly contracts: readonly OwnershipModelContract[];
```

##### schemaVersion

```ts
readonly schemaVersion: 1;
```

##### unownedContracts

```ts
readonly unownedContracts: readonly ContractRef[];
```

Every contract with no `owner` set at all.

##### unownedVariables

```ts
readonly unownedVariables: readonly OwnershipModelVariableRef[];
```

Every variable whose effective owner (its own, falling back to the contract's) is still `undefined`.

***

### OwnershipModelContract

#### Properties

##### contractName

```ts
readonly contractName: string;
```

##### exportName

```ts
readonly exportName: string;
```

##### file

```ts
readonly file: string;
```

Root-relative, POSIX-separated -- matches `ContractModelContract.file`.

##### owner

```ts
readonly owner: string | undefined;
```

The contract's own default owner -- not "effective" the way a variable's is, since there's no level above a contract to fall back to.

##### variables

```ts
readonly variables: readonly OwnershipModelVariable[];
```

***

### OwnershipModelVariable

One variable's effective owner (its own, falling back to the contract's).

#### See

[ContractModelVariable](#contractmodelvariable) -- this same declared variable's canonical starting point.

#### Properties

##### key

```ts
readonly key: string;
```

##### owner

```ts
readonly owner: string | undefined;
```

The variable's own `owner`, falling back to the contract's -- see `effectiveOwner()`.

***

### OwnershipModelVariableRef

One variable, referenced by its owning contract's identity plus its own key -- see [ContractRef](#contractref).

#### Extends

- [`ContractRef`](#contractref)

#### Properties

##### exportName

```ts
readonly exportName: string;
```

The binding name the `createEnv()` result is exported as.

###### Inherited from

[`ContractRef`](#contractref).[`exportName`](#exportname-3)

##### file

```ts
readonly file: string;
```

Root-relative, POSIX-separated path of the file declaring the contract -- see `displayPath()`.

###### Inherited from

[`ContractRef`](#contractref).[`file`](#file-4)

##### key

```ts
readonly key: string;
```

***

### OwnershipSummary

The Ownership summary projection's output shape.

#### Extends

- `Record`\<`string`, `unknown`\>

#### Indexable

```ts
[key: string]: unknown
```

#### Properties

##### disclaimer

```ts
readonly disclaimer: string;
```

See [ConfigurationReference.disclaimer](#disclaimer).

##### owners

```ts
readonly owners: readonly OwnershipSummaryEntry[];
```

One entry per distinct owner, sorted by owner.

##### unowned

```ts
readonly unowned: readonly string[];
```

Every variable with no effective owner at all, as `${contractName}.${key}`, sorted. Named separately rather than bucketed under a synthetic `"unowned"` owner, so "nobody owns this" can never be mistaken for a real team name.

***

### OwnershipSummaryEntry

One owner and everything attributed to them.

#### Properties

##### contracts

```ts
readonly contracts: readonly string[];
```

Every contract declaring this owner as its contract-level default, by display name, sorted.

##### owner

```ts
readonly owner: string;
```

The owner string exactly as declared.

##### variables

```ts
readonly variables: readonly string[];
```

Every variable this owner is the effective owner of, as `${contractName}.${key}`, sorted.

***

### PackageOrigin

Both the authored and resolved forms are kept -- diagnostics benefit from
 showing exactly what a package author wrote versus what it resolved to.

#### Properties

##### declaredField

```ts
readonly declaredField: string;
```

The `"envCap.schema"` value exactly as the package author wrote it.

##### packageDir

```ts
readonly packageDir: string;
```

Absolute, realpath-canonicalized path to the package's own directory.

##### packageName

```ts
readonly packageName: string;
```

The allow-listed package name that declared this schema.

##### resolvedFile

```ts
readonly resolvedFile: string;
```

Absolute, realpath-canonicalized path to the resolved schema file.

***

### ParseWarning

A recoverable issue found while statically parsing or linking one schema file -- never fatal, always surfaced to the caller as data.

#### Properties

##### file

```ts
readonly file: string;
```

Absolute path of the file the warning applies to.

##### message

```ts
readonly message: string;
```

Human-readable explanation of what was skipped and why.

***

### Reconciliation

The result of [computeReconciliation](#computereconciliation): an existing `.env.example` diffed against the current configuration.

#### Properties

##### staleVariables

```ts
readonly staleVariables: readonly string[];
```

Variable names (live or already commented-out) in an existing example file that no discovered contract declares anymore.

##### variablesToAdd

```ts
readonly variablesToAdd: readonly string[];
```

Variables the current (active) configuration requires that aren't yet a live entry in an existing example file.

##### variablesToComment

```ts
readonly variablesToComment: readonly string[];
```

Variables live in an existing example file whose feature is no longer active, and that no other active feature still needs -- safe to comment out.

***

### RenamedVariable

One `addedVariables`/`removedVariables` pair in `manifest`, correlated into a single rename via the current declaration's `renamedFrom` field (ADR 0029).

#### Properties

##### contractIdentity

```ts
readonly contractIdentity: string;
```

The owning contract's identity (`${file}#${exportName}`) -- a rename never crosses contracts.

##### contractName

```ts
readonly contractName: string;
```

##### currentKey

```ts
readonly currentKey: string;
```

The variable's key after the rename -- matches a `manifest.addedVariables` entry.

##### exportName

```ts
readonly exportName: string;
```

##### file

```ts
readonly file: string;
```

##### previousKey

```ts
readonly previousKey: string;
```

The variable's key before the rename -- matches a `manifest.removedVariables` entry.

***

### RenderDocsOptions

Options for [renderDocs](#renderdocs).

#### Properties

##### expiringWithinDays

```ts
readonly expiringWithinDays: number;
```

How many days out counts as "expiring soon" in the lifecycle report and security review.

##### generatedAt

```ts
readonly generatedAt: Date;
```

Timestamp rendered into the header and used for expiry/days-remaining math.

##### previousContent

```ts
readonly previousContent: string | undefined;
```

Content already at `docs.location`, if any -- used only for the "changes since last report" summary.

##### undocumentedContracts

```ts
readonly undocumentedContracts: readonly UndocumentedContractRef[];
```

Contracts with no linked `documentEnv()` call at all. `file` must be root-relative, POSIX-separated -- matching `contracts`' own `ContractModel` convention, since this is matched against it by identity.

##### undocumentedVariables

```ts
readonly undocumentedVariables: readonly UndocumentedVariableRef[];
```

Schema variables with no matching entry in their contract's linked documentation. `file` must be root-relative, POSIX-separated -- see `undocumentedContracts`.

***

### RenderUsageReportOptions

Everything [renderUsageReport](#renderusagereport) needs to render the Dependency &
 Ownership Report -- deliberately independent of (not derived from)
 `GenerateUsageReportResult` in `generate-usage.js`, the same way
 `RenderDocsOptions` in `docs.ts` doesn't derive from
 `GenerateDocumentationResult`. `generate-usage.ts` composes its own
 public result type from these building blocks instead, keeping this
 renderer module importable without its orchestrator.

#### Extended by

- [`GenerateUsageReportResult`](#generateusagereportresult)

#### Properties

##### abandonedContracts

```ts
readonly abandonedContracts: readonly AbandonedContractFinding[];
```

Contracts never imported anywhere in the scanned repository.

##### asserted

```ts
readonly asserted: readonly AssertedDynamicAccessFinding[];
```

Variables a developer has re-acknowledged via `dynamicAccess`, freshly -- see ADR 0037.

##### dependencyOwnership

```ts
readonly dependencyOwnership: readonly OwnershipDependencyEntry[];
```

Every contract's ownership/dependency summary.

##### indeterminate

```ts
readonly indeterminate: readonly IndeterminateOwnershipFinding[];
```

Variables accessed only via dynamic (computed) property access.

##### parseWarnings

```ts
readonly parseWarnings: readonly ParseWarning[];
```

Schema-discovery parse warnings plus, since ADR 0014, any `packages`
 resolution failures -- surfaced here too (not just from
 `generateEnvManifest`/`generateDocumentation`) so a team relying only
 on `--ownership` output still learns when a cross-package contract
 failed to resolve.

##### scannedSurfaces

```ts
readonly scannedSurfaces: readonly ScannedSurface[];
```

Every surface actually scanned for usage -- see ADR 0036. Named explicitly next to `unconsumedOwnedVariables` so "no consumer found" is never read as a stronger claim than what was actually searched.

##### unconsumedOwnedVariables

```ts
readonly unconsumedOwnedVariables: readonly UnconsumedOwnedVariableFinding[];
```

Owned variables with no consumer found in the scanned repository.

##### unresolvedConsumers

```ts
readonly unresolvedConsumers: readonly UnresolvedConsumerFinding[];
```

Advisory only, never gates `onOwnershipIssue` -- a contract only
 reaches here when an ambiguous barrel re-export makes "abandoned" or
 "consumed" both unprovable.

***

### SarifLog

A minimal SARIF 2.1.0 log -- only the properties this adapter actually populates, not the full spec surface.

#### Properties

##### $schema

```ts
readonly $schema: string;
```

##### runs

```ts
readonly runs: readonly {
  results: readonly SarifResult[];
  tool: {
     driver: {
        informationUri: string;
        name: string;
        rules: readonly {
           id: string;
        }[];
        version: string;
     };
  };
}[];
```

##### version

```ts
readonly version: "2.1.0";
```

***

### ScannedSurface

One named surface `buildDependencyGraph()`'s scan actually covered -- the
 application's own root, plus one entry per allow-listed `packages` (ADR
 0014) name whose source was also scanned. See ADR 0036: a claim like
 "no consumer found" is only ever as strong as what was actually
 searched, and this is what lets a renderer say so explicitly instead of
 implying an unbounded guarantee it can't back up.

#### Properties

##### label

```ts
readonly label: string;
```

`"application"` for the local project root, `"package:<name>"` for an allow-listed package's own source.

##### root

```ts
readonly root: string;
```

Root-relative, POSIX-separated.

***

### SecurityReviewCounters

Every number the security review reports, as structured data instead of only rendered Markdown text.

#### Properties

##### activeVariableDeclarations

```ts
readonly activeVariableDeclarations: number;
```

##### duplicateVariableNameCount

```ts
readonly duplicateVariableNameCount: number;
```

##### expiredCount

```ts
readonly expiredCount: number;
```

##### expiresAtSetCount

```ts
readonly expiresAtSetCount: number;
```

##### expiringSoonCount

```ts
readonly expiringSoonCount: number;
```

##### noOwnerCount

```ts
readonly noOwnerCount: number;
```

##### refreshInstructionsCount

```ts
readonly refreshInstructionsCount: number;
```

##### requiredCount

```ts
readonly requiredCount: number;
```

##### totalContracts

```ts
readonly totalContracts: number;
```

##### totalVariableDeclarations

```ts
readonly totalVariableDeclarations: number;
```

##### undocumentedContractCount

```ts
readonly undocumentedContractCount: number;
```

##### undocumentedVariableCount

```ts
readonly undocumentedVariableCount: number;
```

##### uniqueVariableNames

```ts
readonly uniqueVariableNames: number;
```

***

### SourcePosition

A precise pointer into a source file -- the shared shape every exact-position fact in the
build pipeline (declaration sites, usage sites, dynamic-access sites) uses, so a consumer never
has to reconcile three ad hoc `{ file; line; column }` shapes that happen to mean the same
thing. See ADR 0036.

#### Extended by

- [`DynamicAccessAssertion`](#dynamicaccessassertion)

#### Properties

##### column

```ts
readonly column: number;
```

1-indexed column number.

##### file

```ts
readonly file: string;
```

Root-relative, POSIX-separated.

##### line

```ts
readonly line: number;
```

1-indexed line number.

***

### UnconsumedOwnedVariableFinding

An owned variable with no consumer found in the scanned repository.

#### Properties

##### contractName

```ts
readonly contractName: string;
```

Resolved display name (see [DiscoveredContract.contractName](#contractname-5)).

##### key

```ts
readonly key: string;
```

The unconsumed environment variable name.

##### owner

```ts
readonly owner: string | undefined;
```

The owning contract's default owner, if set.

##### staleOrMissingCitations

```ts
readonly staleOrMissingCitations: readonly DynamicAccessCitationProblem[];
```

Every `dynamicAccess` citation for this variable that's currently
`"stale"` or `"missing"` (empty when none exist -- see ADR 0037).
Empty is the *strongest* "looks genuinely unused" signal: no developer
has ever claimed otherwise. A non-empty list means someone specifically
claimed dynamic access here once and that claim can no longer be
verified -- worth a human check before deleting, not a stronger reason
to trust "unconsumed." Exposed as the raw citations, not a collapsed
`high`/`low` label, matching this codebase's "show the receipt" pattern
(ADR 0036/0037) -- a reader can judge confidence from the actual
evidence rather than trusting a derived summary. See ADR 0038.

***

### UndocumentedContractRef

Identifies a contract with no linked `documentEnv()` call at all. `file`'s absolute-vs-relative convention depends on where a given instance comes from -- see the specific field using this type (`DocumentationFindings.undocumentedContracts` is absolute; `RenderDocsOptions.undocumentedContracts` must be root-relative, matching the `ContractModel`-shaped `contracts` it's compared against).

#### Properties

##### exportName

```ts
readonly exportName: string;
```

The contract's exported binding name.

##### file

```ts
readonly file: string;
```

***

### UndocumentedVariableRef

Identifies a schema variable with no matching entry in its contract's linked documentation. See [UndocumentedContractRef](#undocumentedcontractref)'s own note on `file`.

#### Properties

##### exportName

```ts
readonly exportName: string;
```

The contract's exported binding name.

##### file

```ts
readonly file: string;
```

##### key

```ts
readonly key: string;
```

The undocumented environment variable name.

***

### UnresolvedConsumerFinding

A contract reachable only through an unresolved barrel re-export -- can't be proven abandoned or consumed.

#### Properties

##### contractName

```ts
readonly contractName: string;
```

Resolved display name (see [DiscoveredContract.contractName](#contractname-5)).

##### file

```ts
readonly file: string;
```

Root-relative path of the file declaring the contract.

##### reason

```ts
readonly reason: string;
```

Human-readable explanation of why usage couldn't be resolved.

***

### UnresolvedLink

A `documentEnv()` call that could not be statically linked back to a `createEnv()` schema.

#### Properties

##### file

```ts
readonly file: string;
```

Absolute path of the file containing the unlinkable call.

##### reason

```ts
readonly reason: string;
```

Human-readable explanation of why the link couldn't be resolved.

## Type Aliases

### CompatibilityIssueCode

```ts
type CompatibilityIssueCode = 
  | "PROCESSOR_RETURN_TYPE_CONFLICT"
  | "PROCESSOR_SOURCE_CONFLICT"
  | "VALIDATOR_SOURCE_CONFLICT"
  | "DUPLICATE_VARIABLE_DOCUMENTATION"
  | "DUPLICATE_VARIABLE_SHAPE_ACROSS_CONTRACTS";
```

Every stable `code` a check in this file (or `exclusive-group.ts`) can
emit. Documented as an enumerated union so a consumer filtering/linking on
`code` has a closed list to switch over, rather than an arbitrary string --
see ADR 0024/0026. `exclusive-group.ts`'s check does not (yet) set one; see
that file's own comment for why.

***

### DependencyModelContractRef

```ts
type DependencyModelContractRef = ContractRef;
```

One contract, as referenced from the inverse (`consumers`) index -- see [ContractRef](#contractref) for why no `contractName` is carried here.

***

### EnvExampleOnExisting

```ts
type EnvExampleOnExisting = "keep-sibling" | "overwrite" | "skip";
```

Controls what happens when a `.env.example` already exists at the target
location. `"keep-sibling"` (default): never touch the existing file --
write a timestamped sibling instead, for the developer to diff/merge
manually. `"overwrite"`: replace the existing file with freshly rendered
content directly. `"skip"`: write nothing at all.

***

### EvidenceReference

```ts
type EvidenceReference = 
  | ContractEvidenceReference
  | OwnershipEvidenceReference
  | ChangeEvidenceReference;
```

A structured pointer back to where a `Finding` (or, later, any other
model's derived fact) came from -- never a formatted string. See ADR 0024
and ADR 0026.

#### Remarks

Deliberately only as many `model` variants as something in this codebase
actually needs to reference today (`"contract"`, `"ownership"`,
`"change"`). This is an additive, growable union, not a speculative
six-model union built ahead of a real consumer -- a later phase (e.g. the
Dependency or Lifecycle Model) adds its own variant only once a finding
or projector genuinely needs to point at it.

***

### FindingCode

```ts
type FindingCode = 
  | CompatibilityIssueCode
  | "EXCLUSIVE_GROUP_VIOLATION"
  | "ARTIFACT_STALE"
  | "ARTIFACT_MISSING"
  | "UNDOCUMENTED_CONTRACT"
  | "UNDOCUMENTED_VARIABLE"
  | "STALE_DOC_ENTRY"
  | "EXPIRED"
  | "EXPIRING_SOON"
  | "UNRESOLVED_DOCUMENTENV_LINK"
  | "ABANDONED_CONTRACT"
  | "UNRESOLVED_CONSUMER"
  | "UNCONSUMED_OWNED_VARIABLE"
  | "INDETERMINATE_OWNERSHIP"
  | "MISSING_DYNAMIC_ACCESS_CITATION"
  | "STALE_DYNAMIC_ACCESS_CITATION"
  | "NONSTANDARD_SENSITIVITY_LEVEL";
```

Every stable `code` a [Finding](#finding-1) can carry. A superset of [CompatibilityIssueCode](#compatibilityissuecode-1) plus one code per non-compatibility source family this model adapts.

***

### FindingFamily

```ts
type FindingFamily = "compatibility" | "drift" | "documentation" | "ownership";
```

Which source check produced a [Finding](#finding-1) -- coarser than `code`, for a consumer that only wants to filter by kind (e.g. "show me every documentation gap") without enumerating every individual code.

***

### LiveExpirationDates

```ts
type LiveExpirationDates = (variableNames) => Promise<Readonly<Record<string, string>>>;
```

Supplies expiration metadata from a live source (a secrets manager, an
internal inventory API, ...) as a post-discovery override -- the one
sanctioned escape hatch from static-only `expiresAt`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `variableNames` | readonly `string`[] |

#### Returns

`Promise`\<`Readonly`\<`Record`\<`string`, `string`\>\>\>

#### Remarks

Invoked exactly once per generation run, from the orchestration layer, after AST discovery/
linking completes and before documentation is rendered. Never invoked
during AST parsing or runtime validation -- see ADR 0012 for why a
function embedded in a schema file itself was rejected instead.

***

### ManifestContractRef

```ts
type ManifestContractRef = ContractRef;
```

Identifies one contract for [ManifestChangeReport](#manifestchangereport) purposes -- see [ContractRef](#contractref) for why neither a `contractName` nor a pre-formatted `identity` is carried here.

***

### OwnershipModelContractRef

```ts
type OwnershipModelContractRef = ContractRef;
```

One contract, referenced by identity only -- see [ContractRef](#contractref) for why no `contractName` is carried here. Resolve one from `ContractModel` when a renderer needs display text.

***

### SchemaRef

```ts
type SchemaRef = 
  | {
  kind: "literal";
  node: ts.ObjectLiteralExpression;
}
  | {
  kind: "identifier";
  name: string;
}
  | {
  kind: "unresolvable";
};
```

How a `createEnv`/`documentEnv` call's first argument resolves, before any
cross-file linking is attempted (that's `link.ts`'s job, not this file's --
this module only ever looks at one file's own AST).

#### Union Members

##### Type Literal

```ts
{
  kind: "literal";
  node: ts.ObjectLiteralExpression;
}
```

###### kind

```ts
readonly kind: "literal";
```

Discriminant: the schema argument is an inline object literal.

###### node

```ts
readonly node: ts.ObjectLiteralExpression;
```

The object literal AST node itself.

***

##### Type Literal

```ts
{
  kind: "identifier";
  name: string;
}
```

###### kind

```ts
readonly kind: "identifier";
```

Discriminant: the schema argument is a bare identifier referencing a local `const`.

###### name

```ts
readonly name: string;
```

The referenced identifier's name, not yet resolved to a declaration.

***

##### Type Literal

```ts
{
  kind: "unresolvable";
}
```

###### kind

```ts
readonly kind: "unresolvable";
```

Discriminant: the schema argument isn't statically resolvable (not a literal or identifier).

***

### VariableAccessStatus

```ts
type VariableAccessStatus = "used" | "unconsumed" | "indeterminate";
```

What env-cap's static scan could prove about one variable's consumption:
it was member-accessed somewhere (`"used"`), it was never accessed at all
within the scanned surfaces (`"unconsumed"`), or a computed (dynamic)
property access on the owning contract makes the answer unprovable
(`"indeterminate"`).

#### Remarks

Deliberately narrower than `@maverickcer/data-cap`'s equivalent, which
splits the unprovable case further (an unresolved *consumer* vs. an
indeterminate *field*). That split exists because a data-cap capability
exposes many fields at once, so it has a real "we resolved the consumer,
but can't tell which field it touched" state to name. env-cap's
consumption model is one value per key: a contract member access either
names the key statically (`"used"`) or it doesn't (`"indeterminate"`), and
there is no intermediate case where the consumer is known but the thing
consumed is ambiguous. Adding a fourth state here would be vocabulary
borrowed from a model env-cap doesn't have -- see ADR 0010's
"provable, not heuristic" rule. Developer-declared `dynamicAccess`
citations stay a wholly separate fact and are never folded into this
status (ADR 0037).

## Variables

### CHANGE\_MODEL\_SCHEMA\_VERSION

```ts
const CHANGE_MODEL_SCHEMA_VERSION: 1 = 1;
```

Bump only when a reader could misinterpret the new shape -- same discipline every other canonical model's `schemaVersion` follows.

***

### configurationReference

```ts
const configurationReference: EvidenceProjection<ConfigurationReference>;
```

Configuration Reference: every declared variable, with its effective owner
and sensitivity already resolved, in one flat, sorted list.

#### Remarks

Resolution (variable's own value falling back to its contract's) happens
here rather than being left to each consumer, so two readers of this
projection can never disagree about who owns a variable -- the same reason
`effectiveOwner()` exists on the generator side (ADR 0028).

***

### CONTRACT\_MODEL\_SCHEMA\_VERSION

```ts
const CONTRACT_MODEL_SCHEMA_VERSION: 3 = 3;
```

Bump only when a reader could misinterpret the new shape (a field changes
 type/meaning, or is removed) -- NOT for every additive field. Same
 discipline `evidence-model.ts`'s `EVIDENCE_MODEL_SCHEMA_VERSION` and
 `src/cli/json.ts`'s `JSON_SCHEMA_VERSION` already document.

***

### DEPENDENCY\_MODEL\_SCHEMA\_VERSION

```ts
const DEPENDENCY_MODEL_SCHEMA_VERSION: 2 = 2;
```

Bump only when a reader could misinterpret the new shape -- same discipline every other canonical model's `schemaVersion` follows.

***

### EVIDENCE\_MODEL\_SCHEMA\_VERSION

```ts
const EVIDENCE_MODEL_SCHEMA_VERSION: 1 = 1;
```

Bump only when a reader could misinterpret the new shape of `EvidenceModel`
itself (not any one sub-model's own `<MODEL>_SCHEMA_VERSION`, which is
versioned independently) -- same rule every other canonical model follows.

***

### expiringSoonReport

```ts
const expiringSoonReport: EvidenceProjection<ExpiringSoonReport>;
```

Expiring-Soon report: Lifecycle Model's `expiring` view, joined with
ownership and refresh instructions so a reader can act on a row without
cross-referencing three other models by hand.

#### Remarks

The window itself was applied upstream, when Lifecycle Model was built --
this projection deliberately does not re-filter by a date of its own.
Recomputing "soon" here would make the projection's answer depend on when
it happened to be *read* rather than when the evidence was *generated*,
which is exactly the reproducibility property the Evidence Model exists to
preserve.

***

### FINDING\_MODEL\_SCHEMA\_VERSION

```ts
const FINDING_MODEL_SCHEMA_VERSION: 3 = 3;
```

Bump only when a reader could misinterpret the new shape -- same discipline every other canonical model's `schemaVersion` follows.

***

### LIFECYCLE\_MODEL\_SCHEMA\_VERSION

```ts
const LIFECYCLE_MODEL_SCHEMA_VERSION: 2 = 2;
```

Bump only when a reader could misinterpret the new shape -- same discipline every other canonical model's `schemaVersion` follows.

***

### OWNERSHIP\_MODEL\_SCHEMA\_VERSION

```ts
const OWNERSHIP_MODEL_SCHEMA_VERSION: 1 = 1;
```

Bump only when a reader could misinterpret the new shape -- same discipline every other canonical model's `schemaVersion` follows.

***

### ownershipSummary

```ts
const ownershipSummary: EvidenceProjection<OwnershipSummary>;
```

Ownership summary: the inverse of Ownership Model's per-contract view --
who owns what, rolled up per owner, plus an explicit unowned list.

## Functions

### applyLiveExpirationOverrides()

```ts
function applyLiveExpirationOverrides(contracts, overrides): readonly DiscoveredContract[];
```

Applies `overrides` onto a fresh copy of `contracts` -- every contract and
every variable (and their nested `metadata`/`extra` records) is rebuilt
into a new object, never the original reference, so the returned structure
shares no mutable object identity with `contracts` at any depth.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `contracts` | readonly [`DiscoveredContract`](#discoveredcontract)[] |
| `overrides` | `Readonly`\<`Record`\<`string`, `string`\>\> |

#### Returns

readonly [`DiscoveredContract`](#discoveredcontract)[]

#### Remarks

A key absent from `overrides`, or present but not a `parseIsoDate`-parseable
ISO-8601 string, leaves that variable's static `expiresAt` untouched --
same "warn/skip, never guess" policy the rest of the generator uses for
malformed data. Contract-level `expiresAt` is never touched; only
variable-level `expiresAt` is in scope for override.

***

### buildChangeModel()

```ts
function buildChangeModel(
   manifest, 
   currentContracts, 
   root
): ChangeModel;
```

Wraps an already-computed `ManifestChangeReport` (e.g.
`GenerateEnvManifestResult.changes`) in the Change Model's versioned
shape, and correlates renames using the current run's `renamedFrom`
declarations. `currentContracts` should be the same contracts the
manifest was generated from (active contracts only, matching
`renderManifest()`'s own scope -- same as every other input to this
report family).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `manifest` | [`ManifestChangeReport`](#manifestchangereport) |
| `currentContracts` | readonly [`DiscoveredContract`](#discoveredcontract)[] |
| `root` | `string` |

#### Returns

[`ChangeModel`](#changemodel)

***

### buildContractModel()

```ts
function buildContractModel(contracts, root): ContractModel;
```

Projects every discovered contract (active or not) into the Contract
Model's versioned, JSON-serializable shape.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `contracts` | readonly [`DiscoveredContract`](#discoveredcontract)[] |
| `root` | `string` |

#### Returns

[`ContractModel`](#contractmodel)

#### Remarks

Sorted deterministically (by file, then exportName, then variable key), so
`JSON.stringify` output is stable and diffs cleanly wherever this is
persisted.

***

### buildDependencyModel()

```ts
function buildDependencyModel(
   contracts, 
   scanFiles, 
   readFile, 
   context, 
   root, 
   scannedSurfaces?, 
   dynamicAccessAcknowledgments?
): Promise<DependencyModel>;
```

Runs the dependency-ownership engine (`buildDependencyGraph()`, Private)
and projects its result into the Dependency Model's versioned,
JSON-serializable shape -- including the inverse file-\>contracts index
neither `dependency-graph.ts` nor `usage-report.ts` exposes today.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `contracts` | readonly [`DiscoveredContract`](#discoveredcontract)[] | - |
| `scanFiles` | readonly `string`[] | - |
| `readFile` | (`filePath`) => `Promise`\<`string`\> | - |
| `context` | `ImportResolutionContext` | - |
| `root` | `string` | - |
| `scannedSurfaces?` | readonly [`ScannedSurface`](#scannedsurface)[] | See `buildDependencyGraph()`'s own parameter of the same name -- passed straight through to the published model. |
| `dynamicAccessAcknowledgments?` | `ReadonlyMap`\<`string`, readonly [`DynamicAccessAssertion`](#dynamicaccessassertion)[]\> | See `buildDependencyGraph()`'s own parameter of the same name (ADR 0037) -- passed straight through. |

#### Returns

`Promise`\<[`DependencyModel`](#dependencymodel)\>

***

### buildFindingModel()

```ts
function buildFindingModel(input): FindingModel;
```

Adapts every existing finding family into the Finding Model's unified
shape -- an adapter over data that already exists, not a new source of
truth. Order of the returned array mirrors the order sources are given
above; a consumer wanting a specific order (by severity, by file, ...)
sorts it themselves.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `input` | [`BuildFindingModelInput`](#buildfindingmodelinput) |

#### Returns

[`FindingModel`](#findingmodel)

***

### buildLifecycleModel()

```ts
function buildLifecycleModel(
   contracts, 
   expiringWithinDays, 
   now, 
   root
): LifecycleModel;
```

Projects every discovered contract with at least one lifecycle-relevant
field set into the Lifecycle Model's versioned, JSON-serializable shape,
plus the already-established `expiring` view.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `contracts` | readonly [`DiscoveredContract`](#discoveredcontract)[] |
| `expiringWithinDays` | `number` |
| `now` | `Date` |
| `root` | `string` |

#### Returns

[`LifecycleModel`](#lifecyclemodel)

***

### buildOwnershipModel()

```ts
function buildOwnershipModel(contracts, root): OwnershipModel;
```

Projects every discovered contract (active or not, same scope as
`renderSecurityReview()`'s `noOwnerCount` this model itemizes) into the
Ownership Model's versioned, JSON-serializable shape.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `contracts` | readonly [`DiscoveredContract`](#discoveredcontract)[] |
| `root` | `string` |

#### Returns

[`OwnershipModel`](#ownershipmodel)

***

### buildSarifLog()

```ts
function buildSarifLog(findingModel): SarifLog;
```

Projects Finding Model into a SARIF 2.1.0 log.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `findingModel` | [`FindingModel`](#findingmodel) |

#### Returns

[`SarifLog`](#sariflog)

#### Remarks

`rules` lists every distinct `FindingCode` actually present in this run,
sorted -- not the full `FindingCode` union. A SARIF consumer treats the
rules array as "what this tool reported", and advertising rules that
produced no result makes a clean run look like it has unexplained silent
rules. `results` preserves Finding Model's own order, which a caller wanting
a different one sorts themselves.

***

### checkEnvArtifacts()

```ts
function checkEnvArtifacts(options): Promise<CheckEnvArtifactsResult>;
```

Verifies every requested artifact (`manifest`/`docs`/`envExample`/`usage`)
matches what a real [generateEnvArtifacts](#generateenvartifacts) run would produce, without
writing anything.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`GenerateEnvArtifactsOptions`](#generateenvartifactsoptions) |

#### Returns

`Promise`\<[`CheckEnvArtifactsResult`](#checkenvartifactsresult)\>

#### Remarks

`--check` reports drift, it doesn't paper over a run that would otherwise fail --
see `@throws` below.

#### Throws

On the same blocking findings a real run would throw on.

***

### collectVariableNames()

```ts
function collectVariableNames(contracts): string[];
```

Every unique variable key across every linked contract's `variables`.
Contract-level `expiresAt` is out of scope for override -- the callback is
keyed by variable name, not contract name.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `contracts` | readonly [`DiscoveredContract`](#discoveredcontract)[] |

#### Returns

`string`[]

***

### computeExpiringEntries()

```ts
function computeExpiringEntries(
   contracts, 
   expiringWithinDays, 
   now
): ExpiringEntry[];
```

Computes every contract- or variable-level `expiresAt` within `expiringWithinDays` of `now`, sorted soonest-first.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `contracts` | readonly `ExpiryBearingContract`[] |
| `expiringWithinDays` | `number` |
| `now` | `Date` |

#### Returns

[`ExpiringEntry`](#expiringentry)[]

***

### computeReconciliation()

```ts
function computeReconciliation(contracts, existingContent): Reconciliation;
```

Diffs an existing `.env.example` against the current configuration into
three actionable sets. Pure and filesystem-independent -- `writeEnvExample`
is the only caller that reads the file itself.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `contracts` | readonly [`DiscoveredContract`](#discoveredcontract)[] |
| `existingContent` | `string` |

#### Returns

[`Reconciliation`](#reconciliation)

***

### computeSecurityReviewCounters()

```ts
function computeSecurityReviewCounters(
   contracts, 
   expiringWithinDays, 
   now, 
   undocumentedContractCount, 
   undocumentedVariableCount
): SecurityReviewCounters;
```

Computes every number `renderSecurityReview()` reports, as real data.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `contracts` | readonly [`ContractModelContract`](#contractmodelcontract)[] |
| `expiringWithinDays` | `number` |
| `now` | `Date` |
| `undocumentedContractCount` | `number` |
| `undocumentedVariableCount` | `number` |

#### Returns

[`SecurityReviewCounters`](#securityreviewcounters)

#### Remarks

Previously this arithmetic lived entirely inside the renderer as closure
locals that only ever became interpolated Markdown text -- no exported
type backed any of it, so nothing downstream (the `--json` envelope, a CI
gate, a future Finding Model adapter) could consume it as data. Extracted
so it can be reused wherever these facts are needed, not just prose.

***

### computeSourceFingerprint()

```ts
function computeSourceFingerprint(options): Promise<string>;
```

SHA-256 over the raw bytes of every schema file and every usage-scan-
surface file (the same file sets `assembleProject()`/`computeScanSurface()`
touch), plus env-cap's own installed version -- zero AST parsing or
linking. Still requires the discovery/glob walk itself (fingerprinting has
to know which files matter), but skips everything after it. Deterministic:
file paths are deduplicated and sorted before hashing, so the result never
depends on filesystem enumeration order.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`ComputeSourceFingerprintOptions`](#computesourcefingerprintoptions) |

#### Returns

`Promise`\<`string`\>

#### Remarks

Not a timestamp, and never compared as one -- a fresh mtime doesn't prove
content is unchanged (a checkout, a rebase, or a touch can all bump it
with no real edit), and content is the only thing that actually
invalidates a cached evidence artifact.

***

### deepFreeze()

```ts
function deepFreeze<T>(value): T;
```

Recursively freezes `value` and everything reachable from it (array
elements, plain-object property values), so a mutation anywhere in the
structure throws instead of silently succeeding.

#### Type Parameters

| Type Parameter |
| ------ |
| `T` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `value` | `T` |

#### Returns

`T`

#### Remarks

Generalized from `live-expirations.ts`'s former `DiscoveredContract[]`-
hardcoded `deepFreezeContracts()` (see ADR 0012) into a truly generic
utility, so Evidence Model's own immutability guarantee (a later phase)
can reuse it instead of duplicating the recursion.

Only recurses into arrays and plain objects (`{}` or `Object.create(null)`)
-- a `Map`, `Set`, or class instance is frozen at its own top level but not
walked further. This codebase's fact models are plain JSON-serializable
data, never class instances, so this is deliberately narrow rather than a
general-purpose deep-freeze library. A `WeakSet` guards against infinite
recursion if a cyclic reference is ever passed in.

***

### detectCompatibilityIssues()

```ts
function detectCompatibilityIssues(contracts): CompatibilityIssue[];
```

Flags cases where two contracts declare the same variable name but appear to
disagree about its shape, so a human can confirm they're still meant to be "the same" var.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `contracts` | readonly [`DiscoveredContract`](#discoveredcontract)[] |

#### Returns

[`CompatibilityIssue`](#compatibilityissue)[]

#### Remarks

Duplicate variable names across contracts are not a merge problem -- each
contract independently processes its own copy of the raw value, there is no
runtime merge at all. This is purely a build-time lint.

Only one thing is treated as *provable* without executing code: two
processors with explicit, differing `: T` return type annotations. That is
a hard error. Everything else (differing processor/validator source text
with no annotation, or none at all) is a warning -- we cannot prove
semantic non-equivalence via static analysis alone, and the library never
executes schema code to check further (see literal-eval.ts).

***

### detectDuplicateVariableShapes()

```ts
function detectDuplicateVariableShapes(contracts): CompatibilityIssue[];
```

Flags *differently-named* variables in different contracts that share an
identical type shape -- a soft signal that two features may be
independently modelling the same underlying configuration value under two
names, worth a human glance before they drift apart.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `contracts` | readonly [`DiscoveredContract`](#discoveredcontract)[] |

#### Returns

[`CompatibilityIssue`](#compatibilityissue)[]

#### Remarks

Always `severity: "info"`, and never escalated to blocking by any flag,
including `--strict` -- an identical shape is genuinely common and
frequently correct (two unrelated features can both take a `number` timeout
with a validator, and that is not a defect). This is an observation offered
to a reader, not a rule; making it blockable would make it noise a team has
to suppress rather than a signal they can scan.

Scope, deliberately narrow on every axis:
 - **Different keys only.** Same-key collisions across contracts are
   `detectCompatibilityIssues()`'s own, entirely separate concern above;
   reporting them here too would double-report one problem under two codes.
 - **Different contracts only.** Two same-shaped variables inside one
   contract are that contract's own deliberate design.
 - **Active contracts only.** An inactive contract is wired into nothing,
   so an overlap with it is not a live duplication.
 - **No exclusive-grouped contracts.** Members of an exclusive group are
   interchangeable alternatives by explicit authorial declaration --
   matching shapes there are the *point*, not a smell.
 - **Pairwise, never transitive.** Three mutually-matching variables emit
   three independent findings (A-B, A-C, B-C), never one merged "cluster":
   each pair is its own question a reader answers on its own, and a cluster
   would imply a transitive relationship this check never established.

***

### detectExclusiveGroupIssues()

```ts
function detectExclusiveGroupIssues(contracts): CompatibilityIssue[];
```

Detects two *active* contracts declaring the same `exclusiveGroup` --
e.g. two interchangeable database backends both left enabled at once.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `contracts` | readonly [`DiscoveredContract`](#discoveredcontract)[] |

#### Returns

[`CompatibilityIssue`](#compatibilityissue)[]

#### Remarks

Unlike `detectCompatibilityIssues`, this is never a heuristic warning: an
author explicitly declared these contracts mutually exclusive, so any
violation is always a hard error, regardless of `onIncompatibility`. See
ADR 0009 for why this doesn't follow 0005's warn-by-default policy.

Inactive contracts are ignored entirely here (filtered internally, not by
the caller) so this stays correct even when called directly via the
`/build` export -- an inactive contract can share a group with an active
one with no conflict, since it was never wired into anything.

***

### discoverSchemaFiles()

```ts
function discoverSchemaFiles(options): Promise<string[]>;
```

Finds every schema file matching `include`/`exclude` under `root`, returned
as absolute paths in deterministic (alphabetically sorted) order.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | `DiscoverOptions` |

#### Returns

`Promise`\<`string`[]\>

#### Remarks

No external glob dependency: directories are pruned *during* the walk
(both a hardcoded node_modules/.git skip and the caller's `exclude`
patterns), rather than walked in full and filtered afterward -- walking an
entire node_modules tree just to discard it is not acceptable for a tool
meant to run against real projects.

***

### displayPath()

```ts
function displayPath(root, absolutePath): string;
```

Renders `absolutePath` relative to `root`, POSIX-separated regardless of
platform (matching every other rendered path in this package's Markdown and
JSON output). Falls back to `absolutePath` itself, unchanged, whenever the
result would need to climb outside `root` (a `packages`-discovered file, or
any other path not under root) -- never manufactures a `../` escape, which
reads as a real relative path to a consumer and resolves to nothing useful.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `root` | `string` |
| `absolutePath` | `string` |

#### Returns

`string`

***

### effectiveOwner()

```ts
function effectiveOwner(contract, variable): string | undefined;
```

A variable's owner, falling back to its contract's default when the
variable itself doesn't set one.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `contract` | \{ `owner`: `string` \| `undefined`; \} |
| `contract.owner` | `string` \| `undefined` |
| `variable` | \{ `owner`: `string` \| `undefined`; \} |
| `variable.owner` | `string` \| `undefined` |

#### Returns

`string` \| `undefined`

#### Remarks

The one place this resolution rule should live -- see ADR 0028. Every
caller that needs "who owns this variable" (the docs Catalog/ownership
matrix/security review, and, as of ADR 0028, the usage report's
variable-level ownership findings) must go through this, not
`variable.owner` or `contract.owner` alone, so two call sites can never
again disagree about who owns a variable the way `docs.ts` and
`usage-report.ts` once did.

Structurally typed (not pinned to `DiscoveredContract`/`DiscoveredVariable`)
so the same one resolution rule also serves `ContractModelContract`/
`ContractModelVariable` (`contract-model.ts`) -- both shapes carry the same
field, and this rule must never have two independent implementations.

***

### extractCommentedVariables()

```ts
function extractCommentedVariables(source): string[];
```

Parses `# KEY=value` lines out of an existing `.env`-style file -- variables it already knows about but has turned off.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `source` | `string` |

#### Returns

`string`[]

***

### extractContractDocs()

```ts
function extractContractDocs(
   docsArg, 
   filePath, 
   contextLabel, 
   warnings
): DiscoveredContractDocs;
```

Reads a `documentEnv()` call's second argument (the [runtime.ContractDocs](runtime.md#contractdocs) shape).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `docsArg` | `Expression` \| `undefined` | - |
| `filePath` | `string` | - |
| `contextLabel` | `string` | Used only to build human-readable warning messages. |
| `warnings` | [`ParseWarning`](#parsewarning)[] | Mutated in place: one entry is pushed per unresolvable field. |

#### Returns

[`DiscoveredContractDocs`](#discoveredcontractdocs)

#### Remarks

Anything not a statically-resolvable literal warns and is skipped (falls back to
"not set") rather than guessed at, same policy as schema-entry parsing.

***

### extractDeclaredVariables()

```ts
function extractDeclaredVariables(source): string[];
```

Parses `KEY=value` lines out of an existing `.env`-style file, ignoring comments and blank lines.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `source` | `string` |

#### Returns

`string`[]

***

### extractPreviouslyDocumentedKeys()

```ts
function extractPreviouslyDocumentedKeys(previousContent): Set<string>;
```

Every variable key that appeared as a catalog heading in a previously-generated docs file. Exported for testing.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `previousContent` | `string` |

#### Returns

`Set`\<`string`\>

***

### extractSchemaVariables()

```ts
function extractSchemaVariables(
   schemaLiteral, 
   filePath, 
   contextLabel, 
   warnings, 
   sourceFile
): DiscoveredSchemaVariable[];
```

Extracts one schema object literal's variables (processor/validator/default presence); never
evaluates or executes the schema.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `schemaLiteral` | `ObjectLiteralExpression` | - |
| `filePath` | `string` | - |
| `contextLabel` | `string` | Used only to build human-readable warning messages (e.g. the contract's export name). |
| `warnings` | [`ParseWarning`](#parsewarning)[] | Mutated in place: one entry is pushed per skipped (non-static, invalid-key, or non-literal) property. |
| `sourceFile` | `SourceFile` | - |

#### Returns

[`DiscoveredSchemaVariable`](#discoveredschemavariable)[]

***

### generateDocumentation()

```ts
function generateDocumentation(options): Promise<GenerateDocumentationResult>;
```

Build-time only. Discovers and links `env.schema.ts` files (same static
analysis as [generateEnvManifest](#generateenvmanifest)) and writes the rich Markdown "Catalog" --
every variable, its description, default, processor/validator flags,
owner, and expiry -- the single onboarding reference application
developers use to see what configuration a feature needs and how to set
it up. Optionally also writes a reconciling `.env.example`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`GenerateDocumentationOptions`](#generatedocumentationoptions) |

#### Returns

`Promise`\<[`GenerateDocumentationResult`](#generatedocumentationresult)\>

#### Remarks

Documents every discovered contract, active or not, unlike [generateEnvManifest](#generateenvmanifest).

#### Throws

If `location`/`envExample.location` escape `root`.

***

### generateEnvArtifacts()

```ts
function generateEnvArtifacts(options): Promise<GenerateEnvArtifactsResult>;
```

Orchestrates [generateEnvManifest](#generateenvmanifest)/[generateDocumentation](#generatedocumentation)/
[generateUsageReport](#generateusagereport), plus the persisted evidence artifact, by
composing their shared private compute/write pipeline directly, running
schema discovery+linking exactly once regardless of how many outputs are
requested -- an orchestrator, not a new analysis engine (see ADR 0011).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`GenerateEnvArtifactsOptions`](#generateenvartifactsoptions) |

#### Returns

`Promise`\<[`GenerateEnvArtifactsResult`](#generateenvartifactsresult)\>

#### Remarks

Two distinct atomicity guarantees, not one:
 - **Compute atomicity (guaranteed)**: every requested pass's blocking
   findings are checked, across all passes, before any pass writes
   anything.
 - **Write atomicity (NOT guaranteed, and not attempted)**: once writes
   begin, each `fs.writeFile` is independent. A real I/O failure partway
   through (disk full, permissions changed mid-run) can leave some
   artifacts on disk and not others. Transactional (temp-file + rename)
   writes across all three artifacts were considered and rejected as
   disproportionate machinery for a rare failure mode -- see ADR 0011.

#### Throws

If any requested output location escapes `root`, or if any requested pass reports a blocking finding.

***

### generateEnvManifest()

```ts
function generateEnvManifest(options): Promise<GenerateEnvManifestResult>;
```

Build-time only. Discovers `env.schema.ts` files, statically analyzes them
(never executes them) to link `createEnv()`/`documentEnv()` calls, checks
for provable incompatibilities between duplicate variable declarations,
and writes a deterministic manifest file that re-exports every discovered
active contract.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`GenerateEnvManifestOptions`](#generateenvmanifestoptions) |

#### Returns

`Promise`\<[`GenerateEnvManifestResult`](#generateenvmanifestresult)\>

#### Remarks

Never call this at application startup or import it from
runtime code -- wire it into an npm script, a bundler plugin, or a CI
step instead.

#### Throws

If `location` escapes `root`, or if a blocking compatibility/exclusive-group issue is found.

***

### generateEvidenceModel()

```ts
function generateEvidenceModel(options): Promise<EvidenceModel>;
```

Node-only assembly orchestrator (ADR 0024, ADR 0031): runs schema
discovery and linking once (via `assembleProject()`, shared with
`computeArtifacts()`), then builds all seven canonical fact models by
calling each model's own public builder directly -- this function
introduces no derivation logic of its own, only sequencing and the shared
discovery/linking every builder needs. The result is `deepFreeze()`-d
before being returned.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`GenerateEvidenceModelOptions`](#generateevidencemodeloptions) |

#### Returns

`Promise`\<[`EvidenceModel`](#evidencemodel)\>

#### Remarks

Deliberately never throws on a data-quality finding (a compatibility
issue, an undocumented variable, an abandoned contract, ...) -- every one
of those becomes a `Finding` in the returned model's `finding` field
instead. This is a real difference from `generateEnvManifest()`, which
throws by default: that's a "should I write this artifact" gate, while
Evidence Model assembly is a read-only snapshot whose entire purpose is
representing such issues as data for a consumer's own projection to act
on (see ADR 0024's mission statement). It still throws
`EnvProjectGenerationError` for a genuine configuration error --
`previousSnapshotLocation` escaping `root`.

The dependency-graph scan underlying Dependency Model (via
`buildDependencyModel()`) and the one underlying Finding Model's
ownership-related findings (via `computeUsage()`) each run their own,
independent pass over the repository -- a real, accepted cost of calling
each half's already-tested public building block directly rather than
hand-deriving a second copy of either's logic here. Both are Node-only,
dev/CI-time-only work (never a runtime hot path), so the redundant I/O is
an honest tradeoff, not an oversight.

***

### generateUsageReport()

```ts
function generateUsageReport(options): Promise<GenerateUsageReportResult>;
```

Build-time only. Answers who owns each contract, which features depend on
it, and what the blast radius is if it changes -- the mirror image of
[generateEnvManifest](#generateenvmanifest)'s "safer migrations" story: a schema that was never
wired up, or was abandoned mid-removal, shows up here instead of sitting
unnoticed.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`GenerateUsageReportOptions`](#generateusagereportoptions) |

#### Returns

`Promise`\<[`GenerateUsageReportResult`](#generateusagereportresult)\>

#### Remarks

This is an additional, separate artifact, not a replacement for
[generateDocumentation](#generatedocumentation)'s Catalog -- the two serve different audiences
(see ADR 0010).

#### Throws

If `report.location` escapes `root`.

***

### getEvidenceModel()

```ts
function getEvidenceModel(options): Promise<GetEvidenceModelResult>;
```

Trusts the committed evidence artifact at `options.location` only when its
paired `.fingerprint` sidecar matches a freshly (cheaply) computed
[computeSourceFingerprint](#computesourcefingerprint) -- never on file presence alone, never on
a timestamp. On any mismatch (stale fingerprint, missing/corrupt evidence
file, no fingerprint sidecar at all), falls back to a real
`generateEvidenceModel()` call -- never hard-fails, never silently serves
data that might be stale.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`GetEvidenceModelOptions`](#getevidencemodeloptions) |

#### Returns

`Promise`\<[`GetEvidenceModelResult`](#getevidencemodelresult)\>

#### Remarks

Never writes anything. A cache miss here does not self-heal the cache --
only an explicit write (`generateEnvArtifacts()`'s `evidence` option)
refreshes the committed artifact and its fingerprint together, so "when
was this last regenerated" stays under explicit control, never an
implicit side effect of a read. Two independent callers hitting the same
stale cache both recompute independently; neither one's recompute updates
the file the other reads.

***

### groupVariablesByOwner()

```ts
function groupVariablesByOwner<C>(contracts, ownerOf): ReadonlyMap<string, readonly {
  contract: C;
  variable: VariableOf<C>;
}[]>;
```

Groups every variable under its effective owner (its own, falling back to
its contract's), preserving input order within each owner.

#### Type Parameters

| Type Parameter |
| ------ |
| `C` *extends* [`OwnerBearingContract`](#ownerbearingcontract) |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `contracts` | readonly `C`[] |
| `ownerOf` | (`contract`, `variable`) => `string` \| `undefined` |

#### Returns

`ReadonlyMap`\<`string`, readonly \{
  `contract`: `C`;
  `variable`: `VariableOf`\<`C`\>;
\}[]\>

#### Remarks

The single implementation of "who owns what, rolled up per owner", shared
by the [ownershipSummary](#ownershipsummary-1) projection and `docs.ts`'s own rendered
ownership matrix. Kept as one function precisely so env-cap's generated
Markdown and the projection a consumer reads can never disagree about the
grouping -- the same reason `effectiveOwner()` is the single resolution
rule (ADR 0028). Variables with no effective owner are omitted entirely
rather than bucketed under a synthetic `"unowned"` key, which would read
as a real team name; callers that need them ask for them separately.

`ownerOf` is supplied by the caller so a model whose owners are already
resolved (`OwnershipModel`) and one whose aren't (`ContractModel`) both
work without this function guessing which it was handed.

***

### linkFiles()

```ts
function linkFiles(
   discoveredFiles, 
   readFile, 
   context, 
   packageOrigins?
): Promise<LinkResult>;
```

Parses every discovered file, then resolves and links `createEnv`/
`documentEnv` calls into the merged, docs-enriched contract shape the rest
of the generator (`compatibility.ts`, `exclusive-group.ts`, `manifest.ts`,
`docs.ts`, `env-example.ts`) consumes.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `discoveredFiles` | readonly `string`[] | - |
| `readFile` | (`filePath`) => `Promise`\<`string`\> | - |
| `context` | `ImportResolutionContext` | See `ImportResolutionContext`; drives how a resolved import specifier maps back to a file on disk. |
| `packageOrigins` | `ReadonlyMap`\<`string`, [`PackageOrigin`](#packageorigin-2)\> | - |

#### Returns

`Promise`\<[`LinkResult`](#linkresult)\>

#### Remarks

Cross-file linking is deliberately narrow (see `resolveImportSpecifier`):
a `documentEnv()` call's schema reference resolves either to a `const` in
its own file, to a directly-imported named export of another file's
`const`, or (since ADR 0014) to an allow-listed package's declared schema
entry point. Anything else -- a re-export barrel, a namespace import, an
unlisted bare package specifier -- becomes an `unresolvedLinks` entry
rather than a throw or a guess, exactly like every other static-analysis
boundary in this codebase.

`packageOrigins` (from `resolveAllowlistedPackages()`) tags any discovered
contract whose `file` matches a package-resolved path with that package's
origin -- purely a lookup; `discoveredFiles` must already include those
files (merged in by the caller via `mergeLocalAndPackageFiles()`).

***

### parseSchemaFile()

```ts
function parseSchemaFile(filePath, sourceText): FileParseResult;
```

Structurally parses one file's AST for everything the generator needs:
`createEnv(...)`/`documentEnv(...)` call sites, the local `const`
declarations and imports needed to resolve an identifier passed to either
of them.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `filePath` | `string` |
| `sourceText` | `string` |

#### Returns

[`FileParseResult`](#fileparseresult)

#### Remarks

Never type-checks or executes the file -- see `link.ts` for how
these raw facts get resolved into actual schema/docs data, including
across files.

***

### readToolVersion()

```ts
function readToolVersion(): string;
```

env-cap's own installed version -- stamped onto
`EvidenceModel.provenance.toolVersion` and mixed into
`computeSourceFingerprint()`. `./build` never reads its own manifest from
disk (ADR 0040).

#### Returns

`string`

***

### renderDocs()

```ts
function renderDocs(contracts, options): string;
```

Renders the full docs artifact: header + change summary + table of
contents, then the comprehensive catalog, ownership matrix (if used),
dependency graph, lifecycle report, and a security review.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `contracts` | readonly [`ContractModelContract`](#contractmodelcontract)[] |
| `options` | [`RenderDocsOptions`](#renderdocsoptions) |

#### Returns

`string`

#### Remarks

Documents everything discovered, active or not, same scope as the catalog always
had. Fully regenerated every run -- unlike `.env.example`, nothing here is
meant to be hand-edited, so there's no "never overwrite" behavior.

`contracts` is `ContractModel`'s own shape (`file` root-relative and
POSIX-separated already, per that model's convention) -- there is no
separate `root` parameter to resolve against, unlike this function's
pre-ADR-0038 signature.

***

### renderEnvExample()

```ts
function renderEnvExample(contracts, reconciliationHeader?): string;
```

Renders a deterministic `.env.example`-style file scoped to the *current*
configuration: every unique variable the active contracts require (one
live entry per key, alphabetical; a key declared by more than one active
contract renders once live and the rest commented-out with a pointer),
followed by variables unique to disabled contracts (commented-out, for
visibility -- a key already required by an active contract is not unique
and never repeated here). `reconciliationHeader`, when non-empty, is
spliced in right after the banner (see `computeReconciliation`).

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `contracts` | readonly [`DiscoveredContract`](#discoveredcontract)[] | `undefined` |
| `reconciliationHeader` | readonly `string`[] | `[]` |

#### Returns

`string`

***

### renderManifest()

```ts
function renderManifest(contracts, outputFile): string;
```

Renders the deterministic manifest source: sorted imports (aliased on name
collision) plus a `contracts` array, in the exact banner format schema
authors will recognize as generated. No timestamps, no randomness -- same
input files always produce byte-identical output.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `contracts` | readonly [`DiscoveredContract`](#discoveredcontract)[] |
| `outputFile` | `string` |

#### Returns

`string`

#### Remarks

When at least one discovered variable declares a `context` (ADR 0022),
this also emits `activeContexts` -- every validation context found across
`contracts`, as a plain array named to match [runtime.validateEnvOptions](runtime.md#validateenvoptions)'s
own `activeContexts` field -- so application code can import it alongside
`manifest` and pass it straight through: `validateEnv({ manifest, values, activeContexts })`.
It's every context this manifest has, meant as a starting point to narrow
per process/deployment, not a pre-scoped default -- see the README's
"Validation contexts" section. Omitted entirely (not even an empty array)
when no variable declares a `context` at all, so generated output for
projects that don't use this feature is untouched.

***

### renderUsageReport()

```ts
function renderUsageReport(computed): string;
```

Renders the Dependency & Ownership Report: who owns each variable, which
features consume each contract, and what the blast radius is if it
changes -- structured around exactly those three questions, never generic
"dead code"/"unused symbol" language.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `computed` | [`RenderUsageReportOptions`](#renderusagereportoptions) |

#### Returns

`string`

***

### resolveLiveExpirationDates()

```ts
function resolveLiveExpirationDates(contracts, liveExpirationDates): Promise<readonly DiscoveredContract[]>;
```

Orchestration entry point -- the only place `liveExpirationDates` is ever invoked.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `contracts` | readonly [`DiscoveredContract`](#discoveredcontract)[] |
| `liveExpirationDates` | [`LiveExpirationDates`](#liveexpirationdates-4) \| `undefined` |

#### Returns

`Promise`\<readonly [`DiscoveredContract`](#discoveredcontract)[]\>

#### Remarks

No-ops (returns the exact same array reference, zero invocations)
when `liveExpirationDates` is undefined, which is what guarantees "omitted ->
behavior unchanged." Otherwise collects the unique discovered variable
names, invokes the callback exactly once, applies the result, and
deep-freezes the returned structure so it can never be mutated into
affecting `contracts` (used elsewhere, e.g. by the manifest/usage passes in
the same [generateEnvArtifacts](#generateenvartifacts) run) or anything else downstream.

***

### resolveRelativeImport()

```ts
function resolveRelativeImport(
   importingFile, 
   specifier, 
   fs
): Promise<string | undefined>;
```

Resolves a relative import specifier (as written in source: `"./schema.js"`,
matching this codebase's own convention of `.js`-suffixed relative imports
pointing at `.ts` source files) to an absolute file path, relative to the
file that contains the import.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `importingFile` | `string` |
| `specifier` | `string` |
| `fs` | [`BuildFileSystem`](#buildfilesystem) |

#### Returns

`Promise`\<`string` \| `undefined`\>

The resolved absolute path, or `undefined` when the specifier isn't relative or doesn't resolve to a real file.

#### Remarks

Deliberately narrow: only handles a direct relative specifier resolving to
a real `.ts`/`.tsx` file on disk. Bare/package specifiers, namespace
imports, and anything requiring real module resolution (re-export chains,
`exports` map lookups, etc.) return `undefined` -- the caller treats that
as "couldn't statically link" and warns rather than guesses, the same
philosophy `evaluateLiteral` already uses for non-literal expressions.

***

### writeEnvExample()

```ts
function writeEnvExample(
   contracts, 
   location, 
   fs, 
   options?
): Promise<EnvExampleResult>;
```

Writes a rendered `.env.example` to `location`. Behavior when a file
already exists there is governed by `options.onExisting` (default
`"keep-sibling"`, see `EnvExampleOnExisting`):
 - `"keep-sibling"`: the existing file is left alone; freshly generated
   content is written to a timestamped sibling instead
   (`<location>.<epoch-ms>`), prefixed with a reconciliation header
   comparing it against the existing file (omitted when there's nothing
   to report).
 - `"overwrite"`: the existing file is replaced directly with freshly
   rendered content -- no reconciliation header (the changes it would
   describe are already applied).
 - `"skip"`: nothing is written.
When no file exists yet at `location`, all three modes behave the same:
write fresh content, nothing to reconcile against. `staleVariables`/
`variablesToComment`/`variablesToAdd` are always computed and returned
when a prior file existed, even under `"overwrite"`/`"skip"`, as a
diagnostic -- independent of whether anything was actually written.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `contracts` | readonly [`DiscoveredContract`](#discoveredcontract)[] |
| `location` | `string` |
| `fs` | [`BuildFileSystem`](#buildfilesystem) |
| `options` | \{ `onExisting?`: [`EnvExampleOnExisting`](#envexampleonexisting); \} |
| `options.onExisting?` | [`EnvExampleOnExisting`](#envexampleonexisting) |

#### Returns

`Promise`\<[`EnvExampleResult`](#envexampleresult)\>
