import { realpathSync } from "node:fs"
import { pathToFileURL } from "node:url"
import {
  checkEnvArtifacts,
  generateEnvArtifacts,
  type CheckEnvArtifactsResult,
  type ContractModelContract,
  type EnvExampleOnExisting,
  type ManifestChangeReport,
} from "../build/index.js"
import { nodeBuildFileSystem } from "./filesystem.js"
import { runInitCommand } from "./init.js"
import type { JsonRequestedPasses } from "./json.js"
import { serializeFailure, serializeSuccess, writeJson } from "./json.js"

/**
 * Thin, optional CLI wrapper around `generateEnvArtifacts()`. Nothing here is
 * required for library usage -- `generateEnvManifest`/`generateDocumentation`/
 * `generateUsageReport`/`generateEnvArtifacts` are fully usable as plain imports
 * from npm scripts, bundler plugins, or CI steps without this file.
 */

/** Parsed CLI flags -- see `helpText()` below for what each one means. */
export interface ParsedArgs {
  root?: string
  location?: string
  include: string[]
  exclude: string[]
  packages: string[]
  tsconfig?: string | false
  docs?: string
  envExample?: string
  envExampleOnExisting?: EnvExampleOnExisting
  ownership?: string
  evidence?: string
  strict: boolean
  strictDocs: boolean
  strictOwnership: boolean
  expiringWithinDays?: number
  json: boolean
  check: boolean
  help: boolean
}

// Every VALUE_FLAGS/BOOL_FLAGS entry below is a named function declaration,
// not an inline arrow inside the dispatch table object literals -- Stryker
// marks a module-level object literal's own arrow-shorthand properties
// `static: true` (evaluated once at module load), which can produce a false
// "Survived" on a mutant that real tests genuinely reach and would fail
// against, even though `ignoreStatic` only suppresses a static mutant with
// *zero* coverage (this one has real coverage, just misattributed). Named
// function declarations don't have this problem -- their bodies are ordinary
// function-scope code, attributed normally. See the identical fix already
// applied to `check-artifacts.ts`/`reference-projections.ts`'s `defineX({...})`
// schema objects.
function setRoot(a: ParsedArgs, v: string): void {
  a.root = v
}
function setLocation(a: ParsedArgs, v: string): void {
  a.location = v
}
function pushInclude(a: ParsedArgs, v: string): void {
  a.include.push(v)
}
function pushExclude(a: ParsedArgs, v: string): void {
  a.exclude.push(v)
}
function pushPackage(a: ParsedArgs, v: string): void {
  a.packages.push(v)
}
function setTsconfig(a: ParsedArgs, v: string): void {
  a.tsconfig = v
}
function setDocs(a: ParsedArgs, v: string): void {
  a.docs = v
}
function setEnvExample(a: ParsedArgs, v: string): void {
  a.envExample = v
}
function setOwnership(a: ParsedArgs, v: string): void {
  a.ownership = v
}
function setEvidence(a: ParsedArgs, v: string): void {
  a.evidence = v
}
function setEnvExampleOnExisting(a: ParsedArgs, v: string): void {
  const values: readonly EnvExampleOnExisting[] = ["keep-sibling", "overwrite", "skip"]
  if (!values.includes(v as EnvExampleOnExisting)) {
    throw new Error(
      `Unknown value for --env-example-on-existing: "${v}". Expected one of: ${values.join(", ")}.`,
    )
  }
  a.envExampleOnExisting = v as EnvExampleOnExisting
}
function setExpiringWithinDays(a: ParsedArgs, v: string): void {
  const parsed = Number(v)
  if (!Number.isFinite(parsed)) {
    throw new Error(`--expiring-within-days expects a number, got "${v}".`)
  }
  a.expiringWithinDays = parsed
}

/** Flags that consume the following argv token. A table, not a `switch`, so `parseArgs` stays a flat dispatch loop -- one branch per *kind* of flag. */
const VALUE_FLAGS: Readonly<Partial<Record<string, (args: ParsedArgs, value: string) => void>>> = {
  "--root": setRoot,
  "--location": setLocation,
  "--include": pushInclude,
  "--exclude": pushExclude,
  "--package": pushPackage,
  "--tsconfig": setTsconfig,
  "--docs": setDocs,
  "--env-example": setEnvExample,
  "--ownership": setOwnership,
  "--evidence": setEvidence,
  "--env-example-on-existing": setEnvExampleOnExisting,
  "--expiring-within-days": setExpiringWithinDays,
}

function setNoTsconfig(a: ParsedArgs): void {
  a.tsconfig = false
}
function setStrict(a: ParsedArgs): void {
  a.strict = true
}
function setStrictDocs(a: ParsedArgs): void {
  a.strictDocs = true
}
function setStrictOwnership(a: ParsedArgs): void {
  a.strictOwnership = true
}
function setJson(a: ParsedArgs): void {
  a.json = true
}
function setCheck(a: ParsedArgs): void {
  a.check = true
}
function setHelp(a: ParsedArgs): void {
  a.help = true
}

/** Flags that set a boolean and consume nothing further. */
// This object literal itself is `static: true` (built once at module load),
// which Stryker can misattribute a false "Survived" to even though it's
// genuinely, heavily test-covered -- NOT an equivalent mutant. Hand-verified:
// replacing this whole literal with `{}` and running the real suite
// (`vitest run`, whole package) fails 21 tests across 2 files (every test
// exercising `--strict`/`--json`/`--check`/`--help`/etc.), each throwing
// "Unknown argument" instead of setting the flag. Extracting each entry to
// its own named function (see above) already fixed the same class of false
// "Survived" for every individual entry's own body; this fixes the entries,
// the wrapper object literal's own collapse-to-`{}` mutant is a second,
// distinct static-attribution target that the same fix doesn't reach.
// Stryker disable next-line ObjectLiteral
const BOOL_FLAGS: Readonly<Partial<Record<string, (args: ParsedArgs) => void>>> = {
  "--no-tsconfig": setNoTsconfig,
  "--strict": setStrict,
  "--strict-docs": setStrictDocs,
  "--strict-ownership": setStrictOwnership,
  "--json": setJson,
  "--check": setCheck,
  "--help": setHelp,
  "-h": setHelp,
}

/**
 * Parses `process.argv` (already sliced past the `node`/script path) into `ParsedArgs`.
 *
 * @throws {Error} On an unrecognized flag, a flag missing its required value, or an invalid `--env-example-on-existing`/`--expiring-within-days` value.
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    include: [],
    exclude: [],
    packages: [],
    strict: false,
    strictDocs: false,
    strictOwnership: false,
    json: false,
    check: false,
    help: false,
  }

  // A fast-failing pass-count guard, independent of `i` itself: on any real
  // input `i` strictly advances toward `argv.length` every pass (the loop's
  // own `i++`, plus an extra `++i` when a value flag consumes its argument),
  // so no correct input ever needs more passes than `argv.length`. A mutation
  // that reverses the loop's own advance (`i++` -> `i--`) makes `i` walk
  // *away* from `argv.length` instead -- an infinite loop that produces no
  // observably wrong result for an assertion-based test to catch, only a hang
  // until Stryker's own mutant timeout. This counter climbs every pass
  // regardless of `i`'s (possibly-mutated) motion, so it still reaches its
  // bound and throws an ordinary, fast error instead.
  let passes = 0
  // The guard's own arithmetic/direction/comparison below are just as
  // unreachable/inconsequential for any correct `argv` as the guard body
  // itself (see the disable comment on the `if` below): under correct code
  // `passes` never approaches `maxPasses`, so no real test input can observe
  // a change to any of them.
  // Stryker disable next-line ArithmeticOperator
  const maxPasses = argv.length * 2 + 4
  for (let i = 0; i < argv.length; i++) {
    // Stryker disable next-line UpdateOperator
    passes++
    // Unreachable by design for any correct `argv`, the same way the
    // `arg = argv[i] ?? ""` fallback just below is: this guard's whole
    // purpose is to fail fast when a *mutated* build's loop-advance is
    // broken, so no real test input (which only ever exercises correct
    // code) can reach it. A test that reached it would itself require an
    // already-broken build to construct.
    // Stryker disable next-line BlockStatement,ConditionalExpression,EqualityOperator
    if (passes > maxPasses) {
      throw new Error(
        // Stryker disable next-line StringLiteral
        `parseArgs: exceeded ${String(maxPasses)} iterations parsing ${String(argv.length)} argument(s) -- this should never happen for any real argv and indicates an internal parsing bug.`,
      )
    }
    // Provably unreachable for any real `string[]` input: the loop condition
    // `i < argv.length` guarantees `argv[i]` is in-bounds (hence defined)
    // every time this line runs, whether `i` just advanced by the outer
    // `i++` or by a value flag's own `++i` above -- `noUncheckedIndexedAccess`
    // isn't enabled, so TypeScript doesn't force this fallback either; it's
    // pure runtime defense against an out-of-bounds access that can't
    // actually occur. Hand-verified: replacing the fallback string and
    // running the real suite (`vitest run` across all of test/cli/) passes
    // unchanged.
    // Stryker disable next-line StringLiteral
    const arg = argv[i] ?? ""
    const valueFlag = VALUE_FLAGS[arg]
    if (valueFlag) {
      valueFlag(args, nonEmpty(argv[++i], arg))
      continue
    }
    const boolFlag = BOOL_FLAGS[arg]
    if (boolFlag) {
      boolFlag(args)
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  return args
}

/** Requires `value` (the argument immediately following `flag`) to be a non-empty string; throws otherwise. */
function nonEmpty(value: string | undefined, flag: string): string {
  if (!value) throw new Error(`${flag} requires a value.`)
  return value
}

// A function, not a module-level `const` -- Stryker marks a module-level
// template-literal `static: true` (evaluated once at import time), which can
// under-attribute a real, test-covered mutant to a false "Survived" the same
// way the VALUE_FLAGS/BOOL_FLAGS dispatch tables above did. Returning it from
// a function makes the template literal ordinary function-scope code,
// evaluated (and attributed) fresh on each of `main()`'s two call sites.
function helpText(): string {
  return `env-cap - generate a manifest, docs, and/or a dependency ownership report from discovered env.schema.ts contracts

Usage:
  env-cap init
  env-cap [--location <path>] [--docs <path>] [--ownership <path>] [--evidence <path>] [options]

  init                            Scaffold a minimal starting point (one env.schema.ts + a generate script); run \`env-cap init --help\` for details

At least one of --location, --docs, --ownership, or --evidence is required (for a non-init invocation).

Options:
  --root <path>                   Directory to resolve globs from (default: cwd)
  --location <path>                Output path for the generated manifest
  --include <glob>                 Schema-discovery glob (repeatable, default: **/env.schema.ts)
  --exclude <glob>                  Glob pattern to exclude (repeatable)
  --package <name>                  [Experimental, see ADR 0014] Installed package name to also discover a schema from, via its "envCap.schema" package.json field (repeatable)
  --tsconfig <path>                 [Experimental, see ADR 0023] Path to a tsconfig.json (relative to root) whose "paths"/"baseUrl" resolve aliased imports encountered during static analysis (default: auto-detected "tsconfig.json" at root)
  --no-tsconfig                     Disable tsconfig path-alias resolution entirely
  --docs <path>                     Also emit the rich Markdown docs artifact at this path
  --env-example <path>              Also emit a .env.example file at this path (only meaningful alongside --docs)
  --env-example-on-existing <mode>  What to do when --env-example's target already exists: keep-sibling (default, never overwrites -- writes a timestamped sibling instead), overwrite, or skip (write nothing). No effect with --check, which never writes anything regardless.
  --ownership <path>                Also emit the Dependency & Ownership Report at this path
  --evidence <path>                 Also emit the persisted evidence artifact (the full EvidenceModel, plus a paired .fingerprint sidecar) at this path, e.g. docs/env.evidence.json (see ADR 0038). Independent of --location -- needs no other pass.
  --strict                          Escalate compatibility warnings to hard errors (manifest pass only -- ADR 0009's provable exclusive-group/compatibility errors). Does not affect docs/ownership findings; use the two scoped flags below for those.
  --strict-docs                     Escalate every documentation-family warning (undocumented contract/variable, stale doc entry, expiring/expired entry, unresolvable documentEnv() link) to a hard error. Nothing is written when it fires. Info-severity findings are never escalated.
  --strict-ownership                Escalate every ownership-family warning (abandoned contract, unresolved consumer, unconsumed owned variable, indeterminate ownership, stale/missing dynamicAccess citation) to a hard error. Nothing is written when it fires. Info-severity findings are never escalated.
  --expiring-within-days <n>        Window (in days) for the "expiring soon" report (default: 30)
  --json                             Emit a machine-readable JSON report instead of formatted text (see ADR 0013)
  --check                           Verify generated artifacts are up to date without writing anything; exits 1 if any is stale or missing (see ADR 0016)
  --help                            Show this message
`
}

/** @internal Exported for direct unit coverage -- reached through `main()`'s `--evidence` flow in production, but that path alone can't isolate this from `contractNameResolver()`/`writeEvidenceChanges()`'s own logic, nor cheaply exercise every field-change/added/updated/removed shape without a full real generation run per case. */
export function formatFieldChanges(
  changes: ManifestChangeReport["updatedContracts"][number]["changes"],
): string {
  return changes
    .map((c) => `${c.field} (${c.previous ?? "unset"} -> ${c.current ?? "unset"})`)
    .join(", ")
}

/**
 * Mirrors `docs.ts`'s "Changes since last report" section: a fixed
 * Added/Updated/Removed order, each printed only when non-empty, "No
 * changes." when all three are empty -- printed whenever `--evidence` was
 * requested, not only when something actually changed. See ADR 0038 (the
 * persisted evidence artifact -- not the manifest itself, which no longer
 * tracks its own change history; see ADR 0021's now-superseded design).
 */
/**
 * Resolves a `${file}#${exportName}` reference to the contract's display
 * name, from `ContractModel` -- the one model that owns it. A change-report
 * ref carries identity only (see `ContractRef`), so this is the lookup any
 * renderer needing prose performs; a removed contract has no entry in the
 * *current* model at all, which is exactly why this falls back to the export
 * name rather than assuming one exists.
 */
/** @internal Exported for direct unit coverage -- see {@link formatFieldChanges}'s own doc comment for why. */
export function contractNameResolver(
  contracts: readonly ContractModelContract[],
): (ref: { file: string; exportName: string }) => string {
  const byIdentity = new Map(contracts.map((c) => [`${c.file}#${c.exportName}`, c.contractName]))
  return (ref) => byIdentity.get(`${ref.file}#${ref.exportName}`) ?? ref.exportName
}

/** @internal Exported for direct unit coverage -- see {@link formatFieldChanges}'s own doc comment for why. */
export function writeEvidenceChanges(
  changes: ManifestChangeReport,
  contracts: readonly ContractModelContract[],
): void {
  const nameOf = contractNameResolver(contracts)
  const hasAdded = changes.addedContracts.length > 0 || changes.addedVariables.length > 0
  const hasUpdated = changes.updatedContracts.length > 0 || changes.updatedVariables.length > 0
  const hasRemoved = changes.removedContracts.length > 0 || changes.removedVariables.length > 0

  process.stdout.write("\nEvidence changes since the last persisted snapshot:\n")
  if (!hasAdded && !hasUpdated && !hasRemoved) {
    process.stdout.write("  No changes.\n")
    return
  }

  if (hasAdded) {
    process.stdout.write("  Added:\n")
    for (const c of changes.addedContracts)
      process.stdout.write(`    - contract "${nameOf(c)}" (${c.file})\n`)
    for (const v of changes.addedVariables)
      process.stdout.write(`    - ${v.key} in "${nameOf(v)}"\n`)
  }
  if (hasUpdated) {
    process.stdout.write("  Updated:\n")
    for (const c of changes.updatedContracts)
      process.stdout.write(`    - contract "${nameOf(c)}": ${formatFieldChanges(c.changes)}\n`)
    for (const v of changes.updatedVariables)
      process.stdout.write(`    - ${v.key} in "${nameOf(v)}": ${formatFieldChanges(v.changes)}\n`)
  }
  if (hasRemoved) {
    process.stdout.write("  Removed:\n")
    for (const c of changes.removedContracts)
      process.stdout.write(`    - contract "${nameOf(c)}" (${c.file})\n`)
    for (const v of changes.removedVariables)
      process.stdout.write(`    - ${v.key} in "${nameOf(v)}"\n`)
  }
}

/**
 * Which passes this invocation asked for, straight off the parsed flags --
 * never inferred from which results came back populated, which is exactly the
 * ambiguity `requested` exists to remove. See `JsonRequestedPasses`.
 */
/** @internal Exported for direct unit coverage -- see {@link formatFieldChanges}'s own doc comment for why. */
export function requestedPasses(args: ParsedArgs): JsonRequestedPasses {
  return {
    manifest: args.location !== undefined,
    docs: args.docs !== undefined,
    usage: args.ownership !== undefined,
    evidence: args.evidence !== undefined,
  }
}

/**
 * The CLI entry point: parses argv, runs `--check` or a real generate, and writes either
 * human-readable text or (`--json`) a machine-readable report to stdout, setting
 * `process.exitCode` accordingly (see ADR 0013 for the JSON report contract).
 */
/**
 * The full `GenerateEnvArtifactsOptions` object, built once from parsed args --
 * `checkEnvArtifacts` and `generateEnvArtifacts` take the same type, so both
 * call sites use this directly. `evidence` is included: `--check --evidence`
 * verifies the persisted evidence artifact for drift too, exactly as `--check`
 * already does for the manifest/docs/env-example/ownership artifacts.
 */
/** @internal Exported for direct unit coverage -- see {@link formatFieldChanges}'s own doc comment for why. */
export function artifactOptions(args: ParsedArgs) {
  const listOrUndefined = (list: string[]): string[] | undefined =>
    list.length > 0 ? list : undefined
  return {
    // The deliberate injection boundary: the CLI (an executable consumer)
    // hands `env-cap/build` (a library surface) its filesystem capability.
    // See src/cli/filesystem.ts and ADR 0040.
    fs: nodeBuildFileSystem,
    root: args.root,
    include: listOrUndefined(args.include),
    exclude: listOrUndefined(args.exclude),
    packages: listOrUndefined(args.packages),
    tsconfig: args.tsconfig,
    manifest: args.location
      ? {
          location: args.location,
          onIncompatibility: args.strict ? ("throw" as const) : ("warn" as const),
        }
      : (false as const),
    docs: args.docs
      ? {
          location: args.docs,
          expiringWithinDays: args.expiringWithinDays,
          envExample: args.envExample
            ? { location: args.envExample, onExisting: args.envExampleOnExisting }
            : undefined,
        }
      : (false as const),
    usage: args.ownership ? { report: { location: args.ownership } } : (false as const),
    evidence: args.evidence ? { location: args.evidence } : (false as const),
    onUndocumented: args.strictDocs ? ("throw" as const) : ("warn" as const),
    onOwnershipIssue: args.strictOwnership ? ("throw" as const) : ("warn" as const),
  }
}

/** `if (items.length) { write header; write "  - <render(item)>" per item }` -- the summary-list shape `main`'s generate output repeats ~15 times. */
/** @internal Exported for direct unit coverage -- see {@link formatFieldChanges}'s own doc comment for why. */
export function printList<T>(
  items: readonly T[],
  header: string,
  render: (item: T) => string,
): void {
  if (items.length === 0) return
  process.stdout.write(`\n${header}\n`)
  for (const item of items) process.stdout.write(`  - ${render(item)}\n`)
}

/** `--check`: verify every requested artifact for drift, write nothing, exit non-zero on any stale/missing. */
async function runCheckMode(args: ParsedArgs): Promise<void> {
  let checkResult: CheckEnvArtifactsResult
  try {
    checkResult = await checkEnvArtifacts(artifactOptions(args))
  } catch (error) {
    if (!args.json) throw error
    writeJson(serializeFailure(error))
    process.exitCode = 1
    return
  }

  const stale = checkResult.findings.filter((f) => f.status !== "ok").map((f) => f.artifact)
  if (args.json) {
    // Both the `{manifest,docs,usage: undefined}` object and the `false`
    // (`includeEvidence`) argument below are equivalent at this call site:
    // `serializeSuccess()` only ever spreads these into its return payload
    // (`...rest`, `...(includeEvidence ? {evidence} : {})`), and `writeJson`
    // serializes the result through `JSON.stringify`, which drops an
    // `undefined`-valued key exactly like a MISSING key -- so `{}` (every
    // field implicitly undefined) and `{manifest: undefined, ...}` (every
    // field explicitly undefined) serialize identically, and
    // `includeEvidence: true` would only add `evidence: undefined` (`result`
    // here has no `evidence` property to destructure), equally dropped.
    // `requested` is passed explicitly right below, so `serializeSuccess`'s
    // own `rest.manifest !== undefined`-based default (which WOULD
    // distinguish `{}` from explicit `undefined`s) is never reached from
    // this call site either. Hand-verified: mutating both together (`{}`,
    // `true`) and running the real whole-package suite (`vitest run`)
    // passes unchanged.
    // Stryker disable ObjectLiteral,BooleanLiteral
    writeJson(
      serializeSuccess(
        { manifest: undefined, docs: undefined, usage: undefined },
        { ok: checkResult.ok, stale },
        false,
        // `--check` writes nothing, so every result above is undefined by
        // construction -- `requested` is the only thing distinguishing "this run
        // checked the docs artifact" from "it didn't."
        requestedPasses(args),
      ),
    )
    // Stryker restore ObjectLiteral,BooleanLiteral
  } else {
    process.stdout.write("Checking for drift (--check: nothing will be written)...\n\n")
    for (const f of checkResult.findings) {
      process.stdout.write(
        `  ${f.artifact.padEnd(10)} ${f.path.padEnd(50)} ${f.status.toUpperCase()}${f.detail ? ` (${f.detail})` : ""}\n`,
      )
    }
    process.stdout.write(
      checkResult.ok
        ? "\nAll generated artifacts are up to date.\n"
        : `\n${stale.length} artifact(s) are stale or missing. Run without --check to regenerate.\n`,
    )
  }
  process.exitCode = checkResult.ok ? 0 : 1
}

type GenerateResult = Awaited<ReturnType<typeof generateEnvArtifacts>>

/** The human-readable manifest section of a generate run's summary. */
/** @internal Exported for direct unit coverage -- see {@link formatFieldChanges}'s own doc comment for why. */
export function printManifestSummary(manifest: NonNullable<GenerateResult["manifest"]>): void {
  process.stdout.write(`Wrote manifest: ${manifest.outputPath}\n`)
  process.stdout.write(`Discovered ${String(manifest.contracts.length)} contract(s).\n`)
  printList(
    manifest.warnings,
    `${String(manifest.warnings.length)} compatibility warning(s):`,
    (w) => `${w.code ? `[${w.code}] ` : ""}${w.variable}: ${w.reason}`,
  )
  printList(
    manifest.parseWarnings,
    `${String(manifest.parseWarnings.length)} parse warning(s):`,
    (w) => `${w.file}: ${w.message}`,
  )
}

/** The human-readable docs (+ env-example) section of a generate run's summary. */
function printDocsSummary(docs: NonNullable<GenerateResult["docs"]>): void {
  process.stdout.write(`Wrote docs: ${docs.docsPath}\n`)
  const ex = docs.envExample
  if (ex) {
    process.stdout.write(
      ex.skippedExistingPath
        ? `Left existing example untouched: ${ex.skippedExistingPath}\nWrote a fresh copy to compare/merge: ${ex.writtenPath}\n`
        : `Wrote example: ${ex.writtenPath}\n`,
    )
    printList(
      ex.staleVariables,
      `${String(ex.staleVariables.length)} variable(s) in the existing example are no longer used by any contract:`,
      (name) => name,
    )
    printList(
      ex.variablesToComment,
      `${String(ex.variablesToComment.length)} variable(s) in the existing example should be commented out (feature no longer active):`,
      (name) => name,
    )
    printList(
      ex.variablesToAdd,
      `${String(ex.variablesToAdd.length)} variable(s) required by the current configuration are missing from the existing example:`,
      (name) => name,
    )
  }

  const doc = docs.documentation
  printList(
    doc.undocumentedContracts,
    `${String(doc.undocumentedContracts.length)} undocumented contract(s) (no documentEnv() linked):`,
    (c) => `${c.exportName} (${c.file})`,
  )
  printList(
    doc.undocumentedVariables,
    `${String(doc.undocumentedVariables.length)} undocumented variable(s):`,
    (v) => `${v.key} in ${v.exportName} (${v.file})`,
  )
  printList(
    doc.staleDocEntries,
    `${String(doc.staleDocEntries.length)} stale documentEnv() entry/entries (no matching schema variable):`,
    (s) => `${s.key} in ${s.exportName} (${s.file})`,
  )
  printList(
    doc.expiringSoon,
    `${String(doc.expiringSoon.length)} variable(s)/contract(s) expiring soon or already expired:`,
    (e) => {
      const label = e.key ? `${e.key} in ${e.exportName}` : e.exportName
      const status =
        e.daysRemaining < 0
          ? `expired ${String(Math.abs(e.daysRemaining))}d ago`
          : `${String(e.daysRemaining)}d remaining`
      return `${label}: ${e.expiresAt} (${status})`
    },
  )
  printList(
    doc.unresolvedLinks,
    `${String(doc.unresolvedLinks.length)} documentEnv() call(s) could not be statically linked:`,
    (u) => `${u.file}: ${u.reason}`,
  )
}

/** The human-readable dependency-ownership section of a generate run's summary. */
/** @internal Exported for direct unit coverage -- see {@link formatFieldChanges}'s own doc comment for why. */
export function printUsageSummary(usage: NonNullable<GenerateResult["usage"]>): void {
  if (usage.reportPath) {
    process.stdout.write(`Wrote dependency ownership report: ${usage.reportPath}\n`)
  }
  printList(
    usage.abandonedContracts,
    `${String(usage.abandonedContracts.length)} abandoned contract(s) (never imported anywhere):`,
    (f) => `${f.contractName} (${f.file})`,
  )
  printList(
    usage.unresolvedConsumers,
    `${String(usage.unresolvedConsumers.length)} contract(s) with unresolved consumers (barrel re-exports):`,
    (f) => `${f.contractName}: ${f.reason}`,
  )
  printList(
    usage.unconsumedOwnedVariables,
    `${String(usage.unconsumedOwnedVariables.length)} unconsumed owned variable(s):`,
    (f) => `${f.key} in ${f.contractName}`,
  )
  printList(
    usage.indeterminate,
    `${String(usage.indeterminate.length)} indeterminate finding(s) (dynamic access, never guessed at):`,
    (f) => `${f.key} in ${f.contractName}: ${f.reason}`,
  )
  printList(
    usage.parseWarnings,
    `${String(usage.parseWarnings.length)} parse warning(s):`,
    (w) => `${w.file}: ${w.message}`,
  )
}

/** A real generate run: write every requested artifact, then print a summary (or `--json` envelope). */
async function runGenerateMode(args: ParsedArgs): Promise<void> {
  let result: GenerateResult
  try {
    result = await generateEnvArtifacts(artifactOptions(args))
  } catch (error) {
    if (!args.json) throw error // propagates to main().catch() exactly as before
    writeJson(serializeFailure(error))
    process.exitCode = 1
    return
  }

  if (args.json) {
    writeJson(
      serializeSuccess(result, undefined, args.evidence !== undefined, requestedPasses(args)),
    )
    return
  }

  const totalWarnings =
    (result.manifest?.parseWarnings.length ?? 0) +
    (result.docs?.documentation.unresolvedLinks.length ?? 0) +
    (result.usage?.parseWarnings.length ?? 0)
  if (totalWarnings > 0) {
    process.stdout.write(
      `⚠ ${totalWarnings} unresolved/dropped-schema warning(s) found -- details below. Re-run with --json for a machine-readable report.\n\n`,
    )
  }

  if (result.manifest) printManifestSummary(result.manifest)
  if (result.docs) printDocsSummary(result.docs)
  if (result.usage) printUsageSummary(result.usage)

  if (args.evidence) {
    process.stdout.write(`Wrote evidence: ${args.evidence}\n`)
    writeEvidenceChanges(result.evidence.change.manifest, result.evidence.contract.contracts)
  }
}

export async function main(): Promise<void> {
  const argv = process.argv.slice(2)

  // Subcommand dispatch: `init` as the FIRST positional token routes to the
  // scaffolder. Every existing flag-based invocation is untouched -- no flag
  // is reinterpreted as a subcommand, `--help` alone still prints helpText().
  if (argv[0] === "init") {
    process.exitCode = runInitCommand(argv.slice(1))
    return
  }

  const args = parseArgs(argv)

  if (args.help) {
    process.stdout.write(helpText())
    process.exitCode = 0
    return
  }

  if (!args.location && !args.docs && !args.ownership && !args.evidence) {
    if (args.json) {
      writeJson(
        serializeFailure(
          new Error("At least one of --location, --docs, --ownership, or --evidence is required."),
        ),
      )
    } else {
      process.stdout.write(helpText())
    }
    process.exitCode = 1
    return
  }

  await (args.check ? runCheckMode(args) : runGenerateMode(args))
}

// Only auto-run when this file is the process entry point, not when a test
// imports `parseArgs`/`main` directly -- importing this module must never
// have the side effect of running the CLI.
//
// npm installs `bin` entries as symlinks (e.g. `node_modules/.bin/env-cap`
// -> `../env-cap/dist/cli/index.js`). Node resolves
// `import.meta.url` through that symlink to this file's real, on-disk path,
// but leaves `process.argv[1]` as the symlink path it was actually invoked
// with -- so comparing the two directly never matches for a real `npx`/`.bin`
// invocation, and the CLI would silently no-op. Resolving `argv[1]` through
// `realpathSync` first makes the comparison symlink-aware; the try/catch
// falls back to the unresolved path so this can't itself throw for an
// argv[1] that doesn't resolve to a real file.
export function directRunUrl(): string | undefined {
  const entry = process.argv[1]
  if (!entry) return undefined
  try {
    return pathToFileURL(realpathSync(entry)).href
  } catch {
    return pathToFileURL(entry).href
  }
}

const isDirectRun = import.meta.url === directRunUrl()

if (isDirectRun) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  })
}
