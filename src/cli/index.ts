import { realpathSync } from "node:fs"
import { pathToFileURL } from "node:url"
import {
  checkEnvArtifacts,
  generateEnvArtifacts,
  type CheckEnvArtifactsResult,
  type EnvExampleOnExisting,
  type ManifestChangeReport,
} from "../build/index.js"
import { serializeFailure, serializeSuccess, writeJson } from "./json.js"

const ENV_EXAMPLE_ON_EXISTING_VALUES: readonly EnvExampleOnExisting[] = [
  "keep-sibling",
  "overwrite",
  "skip",
]

/**
 * Thin, optional CLI wrapper around `generateEnvArtifacts()`. Nothing here is
 * required for library usage -- `generateEnvManifest`/`generateDocumentation`/
 * `generateUsageReport`/`generateEnvArtifacts` are fully usable as plain imports
 * from npm scripts, bundler plugins, or CI steps without this file.
 */

/** Parsed CLI flags -- see `HELP_TEXT` below for what each one means. */
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
  strict: boolean
  strictDocs: boolean
  strictOwnership: boolean
  expiringWithinDays?: number
  json: boolean
  check: boolean
  help: boolean
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

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    switch (arg) {
      case "--root":
        args.root = nonEmpty(argv[++i], "--root")
        break
      case "--location":
        args.location = nonEmpty(argv[++i], "--location")
        break
      case "--include":
        args.include.push(nonEmpty(argv[++i], "--include"))
        break
      case "--exclude":
        args.exclude.push(nonEmpty(argv[++i], "--exclude"))
        break
      case "--package":
        args.packages.push(nonEmpty(argv[++i], "--package"))
        break
      case "--tsconfig":
        args.tsconfig = nonEmpty(argv[++i], "--tsconfig")
        break
      case "--no-tsconfig":
        args.tsconfig = false
        break
      case "--docs":
        args.docs = nonEmpty(argv[++i], "--docs")
        break
      case "--env-example":
        args.envExample = nonEmpty(argv[++i], "--env-example")
        break
      case "--env-example-on-existing": {
        const value = nonEmpty(argv[++i], "--env-example-on-existing")
        if (!ENV_EXAMPLE_ON_EXISTING_VALUES.includes(value as EnvExampleOnExisting)) {
          throw new Error(
            `Unknown value for --env-example-on-existing: "${value}". Expected one of: ${ENV_EXAMPLE_ON_EXISTING_VALUES.join(", ")}.`,
          )
        }
        args.envExampleOnExisting = value as EnvExampleOnExisting
        break
      }
      case "--ownership":
        args.ownership = nonEmpty(argv[++i], "--ownership")
        break
      case "--strict":
        args.strict = true
        break
      case "--strict-docs":
        args.strictDocs = true
        break
      case "--strict-ownership":
        args.strictOwnership = true
        break
      case "--json":
        args.json = true
        break
      case "--check":
        args.check = true
        break
      case "--expiring-within-days": {
        const value = nonEmpty(argv[++i], "--expiring-within-days")
        const parsed = Number(value)
        if (!Number.isFinite(parsed))
          throw new Error(`--expiring-within-days expects a number, got "${value}".`)
        args.expiringWithinDays = parsed
        break
      }
      case "--help":
      case "-h":
        args.help = true
        break
      default:
        throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return args
}

/** Requires `value` (the argument immediately following `flag`) to be a non-empty string; throws otherwise. */
function nonEmpty(value: string | undefined, flag: string): string {
  if (!value) throw new Error(`${flag} requires a value.`)
  return value
}

const HELP_TEXT = `env-cap - generate a manifest, docs, and/or a dependency ownership report from discovered env.schema.ts contracts

Usage:
  env-cap [--location <path>] [--docs <path>] [--ownership <path>] [options]

At least one of --location, --docs, or --ownership is required.

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
  --strict                          Escalate compatibility warnings to hard errors
  --strict-docs                     Escalate undocumented contracts/variables to hard errors
  --strict-ownership                Escalate proven abandoned contracts/unconsumed owned variables to hard errors (never escalates unresolved-consumer or indeterminate findings)
  --expiring-within-days <n>        Window (in days) for the "expiring soon" report (default: 30)
  --json                             Emit a machine-readable JSON report instead of formatted text (see ADR 0013)
  --check                           Verify generated artifacts are up to date without writing anything; exits 1 if any is stale or missing (see ADR 0016)
  --help                            Show this message
`

function formatFieldChanges(
  changes: ManifestChangeReport["updatedContracts"][number]["changes"],
): string {
  return changes
    .map((c) => `${c.field} (${c.previous ?? "unset"} -> ${c.current ?? "unset"})`)
    .join(", ")
}

/**
 * Mirrors `docs.ts`'s "Changes since last report" section: a fixed
 * Added/Updated/Removed order, each printed only when non-empty, "No
 * changes." when all three are empty -- printed unconditionally whenever a
 * manifest was generated, not only when something actually changed. See
 * ADR 0021.
 */
function writeManifestChanges(changes: ManifestChangeReport): void {
  const hasAdded = changes.addedContracts.length > 0 || changes.addedVariables.length > 0
  const hasUpdated = changes.updatedContracts.length > 0 || changes.updatedVariables.length > 0
  const hasRemoved = changes.removedContracts.length > 0 || changes.removedVariables.length > 0

  process.stdout.write("\nManifest changes since last execution:\n")
  if (!hasAdded && !hasUpdated && !hasRemoved) {
    process.stdout.write("  No changes.\n")
    return
  }

  if (hasAdded) {
    process.stdout.write("  Added:\n")
    for (const c of changes.addedContracts)
      process.stdout.write(`    - contract "${c.contractName}" (${c.file})\n`)
    for (const v of changes.addedVariables)
      process.stdout.write(`    - ${v.key} in "${v.contractName}"\n`)
  }
  if (hasUpdated) {
    process.stdout.write("  Updated:\n")
    for (const c of changes.updatedContracts)
      process.stdout.write(`    - contract "${c.contractName}": ${formatFieldChanges(c.changes)}\n`)
    for (const v of changes.updatedVariables)
      process.stdout.write(
        `    - ${v.key} in "${v.contractName}": ${formatFieldChanges(v.changes)}\n`,
      )
  }
  if (hasRemoved) {
    process.stdout.write("  Removed:\n")
    for (const c of changes.removedContracts)
      process.stdout.write(`    - contract "${c.contractName}" (${c.file})\n`)
    for (const v of changes.removedVariables)
      process.stdout.write(`    - ${v.key} in "${v.contractName}"\n`)
  }
}

/**
 * The CLI entry point: parses argv, runs `--check` or a real generate, and writes either
 * human-readable text or (`--json`) a machine-readable report to stdout, setting
 * `process.exitCode` accordingly (see ADR 0013 for the JSON report contract).
 */
export async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  if (args.help) {
    process.stdout.write(HELP_TEXT)
    process.exitCode = 0
    return
  }

  if (!args.location && !args.docs && !args.ownership) {
    if (args.json) {
      writeJson(
        serializeFailure(
          new Error("At least one of --location, --docs, or --ownership is required."),
        ),
      )
    } else {
      process.stdout.write(HELP_TEXT)
    }
    process.exitCode = 1
    return
  }

  const include = args.include.length > 0 ? args.include : undefined
  const exclude = args.exclude.length > 0 ? args.exclude : undefined
  const packages = args.packages.length > 0 ? args.packages : undefined

  if (args.check) {
    let checkResult: CheckEnvArtifactsResult
    try {
      checkResult = await checkEnvArtifacts({
        root: args.root,
        include,
        exclude,
        packages,
        tsconfig: args.tsconfig,
        manifest: args.location
          ? { location: args.location, onIncompatibility: args.strict ? "throw" : "warn" }
          : false,
        docs: args.docs
          ? {
              location: args.docs,
              onUndocumented: args.strictDocs ? "throw" : "warn",
              expiringWithinDays: args.expiringWithinDays,
              envExample: args.envExample
                ? { location: args.envExample, onExisting: args.envExampleOnExisting }
                : undefined,
            }
          : false,
        usage: args.ownership
          ? {
              report: { location: args.ownership },
              onOwnershipIssue: args.strictOwnership ? "throw" : "warn",
            }
          : false,
      })
    } catch (error) {
      if (args.json) {
        writeJson(serializeFailure(error))
        process.exitCode = 1
        return
      }
      throw error
    }

    const stale = checkResult.findings.filter((f) => f.status !== "ok").map((f) => f.artifact)
    if (args.json) {
      writeJson(
        serializeSuccess(
          { manifest: undefined, docs: undefined, usage: undefined },
          { ok: checkResult.ok, stale },
        ),
      )
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
    return
  }

  let result: Awaited<ReturnType<typeof generateEnvArtifacts>>
  try {
    result = await generateEnvArtifacts({
      root: args.root,
      include,
      exclude,
      packages,
      tsconfig: args.tsconfig,
      manifest: args.location
        ? { location: args.location, onIncompatibility: args.strict ? "throw" : "warn" }
        : false,
      docs: args.docs
        ? {
            location: args.docs,
            onUndocumented: args.strictDocs ? "throw" : "warn",
            expiringWithinDays: args.expiringWithinDays,
            envExample: args.envExample
              ? { location: args.envExample, onExisting: args.envExampleOnExisting }
              : undefined,
          }
        : false,
      usage: args.ownership
        ? {
            report: { location: args.ownership },
            onOwnershipIssue: args.strictOwnership ? "throw" : "warn",
          }
        : false,
    })
  } catch (error) {
    if (args.json) {
      writeJson(serializeFailure(error))
      process.exitCode = 1
      return
    }
    throw error // unchanged: propagates to main().catch() exactly as today
  }

  if (args.json) {
    writeJson(serializeSuccess(result))
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

  if (result.manifest) {
    process.stdout.write(`Wrote manifest: ${result.manifest.outputPath}\n`)
    process.stdout.write(`Discovered ${result.manifest.contracts.length} contract(s).\n`)
    if (result.manifest.warnings.length > 0) {
      process.stdout.write(`\n${result.manifest.warnings.length} compatibility warning(s):\n`)
      for (const warning of result.manifest.warnings) {
        const codePrefix = warning.code ? `[${warning.code}] ` : ""
        process.stdout.write(`  - ${codePrefix}${warning.variable}: ${warning.reason}\n`)
      }
    }
    if (result.manifest.parseWarnings.length > 0) {
      process.stdout.write(`\n${result.manifest.parseWarnings.length} parse warning(s):\n`)
      for (const warning of result.manifest.parseWarnings) {
        process.stdout.write(`  - ${warning.file}: ${warning.message}\n`)
      }
    }
    writeManifestChanges(result.manifest.changes)
  }

  if (result.docs) {
    process.stdout.write(`Wrote docs: ${result.docs.docsPath}\n`)
    if (result.docs.envExample) {
      const envExample = result.docs.envExample
      if (envExample.skippedExistingPath) {
        process.stdout.write(
          `Left existing example untouched: ${envExample.skippedExistingPath}\n` +
            `Wrote a fresh copy to compare/merge: ${envExample.writtenPath}\n`,
        )
      } else {
        process.stdout.write(`Wrote example: ${envExample.writtenPath}\n`)
      }
      if (envExample.staleVariables.length > 0) {
        process.stdout.write(
          `\n${envExample.staleVariables.length} variable(s) in the existing example are no longer used by any contract:\n`,
        )
        for (const name of envExample.staleVariables) process.stdout.write(`  - ${name}\n`)
      }
      if (envExample.variablesToComment.length > 0) {
        process.stdout.write(
          `\n${envExample.variablesToComment.length} variable(s) in the existing example should be commented out (feature no longer active):\n`,
        )
        for (const name of envExample.variablesToComment) process.stdout.write(`  - ${name}\n`)
      }
      if (envExample.variablesToAdd.length > 0) {
        process.stdout.write(
          `\n${envExample.variablesToAdd.length} variable(s) required by the current configuration are missing from the existing example:\n`,
        )
        for (const name of envExample.variablesToAdd) process.stdout.write(`  - ${name}\n`)
      }
    }

    const doc = result.docs.documentation
    if (doc.undocumentedContracts.length > 0) {
      process.stdout.write(
        `\n${doc.undocumentedContracts.length} undocumented contract(s) (no documentEnv() linked):\n`,
      )
      for (const c of doc.undocumentedContracts)
        process.stdout.write(`  - ${c.exportName} (${c.file})\n`)
    }
    if (doc.undocumentedVariables.length > 0) {
      process.stdout.write(`\n${doc.undocumentedVariables.length} undocumented variable(s):\n`)
      for (const v of doc.undocumentedVariables)
        process.stdout.write(`  - ${v.key} in ${v.exportName} (${v.file})\n`)
    }
    if (doc.staleDocEntries.length > 0) {
      process.stdout.write(
        `\n${doc.staleDocEntries.length} stale documentEnv() entry/entries (no matching schema variable):\n`,
      )
      for (const s of doc.staleDocEntries)
        process.stdout.write(`  - ${s.key} in ${s.exportName} (${s.file})\n`)
    }
    if (doc.expiringSoon.length > 0) {
      process.stdout.write(
        `\n${doc.expiringSoon.length} variable(s)/contract(s) expiring soon or already expired:\n`,
      )
      for (const e of doc.expiringSoon) {
        const label = e.key ? `${e.key} in ${e.exportName}` : e.exportName
        const status =
          e.daysRemaining < 0
            ? `expired ${Math.abs(e.daysRemaining)}d ago`
            : `${e.daysRemaining}d remaining`
        process.stdout.write(`  - ${label}: ${e.expiresAt} (${status})\n`)
      }
    }
    if (doc.unresolvedLinks.length > 0) {
      process.stdout.write(
        `\n${doc.unresolvedLinks.length} documentEnv() call(s) could not be statically linked:\n`,
      )
      for (const u of doc.unresolvedLinks) process.stdout.write(`  - ${u.file}: ${u.reason}\n`)
    }
  }

  if (result.usage) {
    if (result.usage.reportPath)
      process.stdout.write(`Wrote dependency ownership report: ${result.usage.reportPath}\n`)
    if (result.usage.abandonedContracts.length > 0) {
      process.stdout.write(
        `\n${result.usage.abandonedContracts.length} abandoned contract(s) (never imported anywhere):\n`,
      )
      for (const f of result.usage.abandonedContracts)
        process.stdout.write(`  - ${f.contractName} (${f.file})\n`)
    }
    if (result.usage.unresolvedConsumers.length > 0) {
      process.stdout.write(
        `\n${result.usage.unresolvedConsumers.length} contract(s) with unresolved consumers (barrel re-exports):\n`,
      )
      for (const f of result.usage.unresolvedConsumers)
        process.stdout.write(`  - ${f.contractName}: ${f.reason}\n`)
    }
    if (result.usage.unconsumedOwnedVariables.length > 0) {
      process.stdout.write(
        `\n${result.usage.unconsumedOwnedVariables.length} unconsumed owned variable(s):\n`,
      )
      for (const f of result.usage.unconsumedOwnedVariables)
        process.stdout.write(`  - ${f.key} in ${f.contractName}\n`)
    }
    if (result.usage.indeterminate.length > 0) {
      process.stdout.write(
        `\n${result.usage.indeterminate.length} indeterminate finding(s) (dynamic access, never guessed at):\n`,
      )
      for (const f of result.usage.indeterminate)
        process.stdout.write(`  - ${f.key} in ${f.contractName}: ${f.reason}\n`)
    }
    if (result.usage.parseWarnings.length > 0) {
      process.stdout.write(`\n${result.usage.parseWarnings.length} parse warning(s):\n`)
      for (const warning of result.usage.parseWarnings)
        process.stdout.write(`  - ${warning.file}: ${warning.message}\n`)
    }
  }
}

// Only auto-run when this file is the process entry point, not when a test
// imports `parseArgs`/`main` directly -- importing this module must never
// have the side effect of running the CLI.
//
// npm installs `bin` entries as symlinks (e.g. `node_modules/.bin/env-cap`
// -> `../@maverickcer/env-cap/dist/cli/index.js`). Node resolves
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
