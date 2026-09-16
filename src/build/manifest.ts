import path from "node:path"
import { generatedBanner } from "./generated-banner.js"
import type { DiscoveredContract } from "./link.js"

/**
 * Every validation context declared by any variable in an *active* contract
 * in `contracts` (a variable belonging to a contract documented `active:
 * false` never contributes -- same exclusion the `manifest` array itself
 * already applies), sorted and deduplicated. What {@link renderManifest}
 * surfaces as the generated `activeContexts` export. Exported for reuse by
 * anything that needs the same computation (currently just `renderManifest`
 * itself).
 */
export function discoverValidationContexts(
  contracts: readonly DiscoveredContract[],
): readonly string[] {
  const contexts = new Set<string>()
  for (const contract of contracts) {
    if (!contract.active) continue
    for (const variable of contract.variables) {
      if (variable.context !== undefined) contexts.add(variable.context)
    }
  }
  return [...contexts].sort()
}

/**
 * Renders the deterministic manifest source: sorted imports (aliased on name
 * collision) plus a `contracts` array, in the exact banner format schema
 * authors will recognize as generated. No timestamps, no randomness -- same
 * input files always produce byte-identical output.
 *
 * @remarks
 * When at least one discovered variable declares a `context` (ADR 0022),
 * this also emits `activeContexts` -- every validation context found across
 * `contracts`, as a plain array named to match {@link runtime.validateEnvOptions}'s
 * own `activeContexts` field -- so application code can import it alongside
 * `manifest` and pass it straight through: `validateEnv({ manifest, values, activeContexts })`.
 * It's every context this manifest has, meant as a starting point to narrow
 * per process/deployment, not a pre-scoped default -- see the README's
 * "Validation contexts" section. Omitted entirely (not even an empty array)
 * when no variable declares a `context` at all, so generated output for
 * projects that don't use this feature is untouched.
 */
export function renderManifest(
  contracts: readonly DiscoveredContract[],
  outputFile: string,
): string {
  const sorted = [...contracts].sort((a, b) => a.file.localeCompare(b.file))
  const outputDir = path.dirname(outputFile)
  const usedNames = new Set<string>()

  const importLines: string[] = []
  const referenceNames: string[] = []

  for (const contract of sorted) {
    let localName = contract.exportName
    if (usedNames.has(localName)) {
      // Bounded purely by its own header (`suffix <= maxSuffix`,
      // `suffix++`), never by anything the body does: even if a mutation
      // guts the body to `{}` (Stryker's BlockStatement mutator), the loop
      // still terminates after `maxSuffix` passes, because nothing in the
      // body's execution controls that termination -- unlike a `while
      // (usedNames.has(localName))` loop, whose only path to termination IS
      // a body-side reassignment a single BlockStatement mutation can erase
      // wholesale, producing an infinite loop no assertion-based test can
      // catch (only a hang until Stryker's own mutant timeout). `maxSuffix`
      // is generously above any real collision count: `sorted.length`
      // distinct contracts can produce at most `sorted.length` collisions on
      // one `exportName`.
      const maxSuffix = sorted.length + 16
      let found: string | undefined
      // A second, independent guard for the narrower case where only the
      // header's own advance (`suffix++`) or bound (`suffix <= maxSuffix`)
      // is mutated, not the whole body -- same reasoning as the identical
      // guard already applied to `parseArgs()`'s/`globToRegExp()`'s own
      // loops. This counter climbs every pass regardless of `suffix`'s
      // (possibly-mutated) motion, so it still reaches its bound and throws
      // an ordinary, fast error instead of hanging.
      let passes = 0
      // Narrowing this bound to `<` costs exactly one candidate out of
      // `maxSuffix`'s generous margin (`sorted.length + 16`) -- no real
      // collision count gets anywhere near that margin, so no real test
      // input can observe the difference. Hand-verified: mutating this and
      // running the real suite passes unchanged.
      // Stryker disable next-line EqualityOperator
      for (let suffix = 1; suffix <= maxSuffix; suffix++) {
        // Stryker disable next-line UpdateOperator
        passes++
        // Unreachable by design for any correct input: this guard's whole
        // purpose is to fail fast when a *mutated* build's loop header is
        // broken, so no real test input (which only ever exercises correct
        // code) can reach it.
        // Stryker disable next-line BlockStatement,ConditionalExpression,EqualityOperator
        if (passes > maxSuffix) {
          throw new Error(
            // Stryker disable next-line StringLiteral
            `renderManifest: exceeded ${String(maxSuffix)} attempts choosing a unique local import name for "${contract.exportName}" -- this should never happen and indicates an internal naming bug.`,
          )
        }
        const candidate = `${contract.exportName}_${suffix}`
        if (!usedNames.has(candidate)) {
          found = candidate
          break
        }
      }
      // Unreachable by design for any correct input, the same way the
      // in-loop pass-count guard above is: `maxSuffix` (`sorted.length + 16`)
      // is generously above any real collision count, so `found` is always
      // set before the loop above runs out of attempts. Exists purely so a
      // *mutated* loop (header or body) fails fast instead of silently
      // proceeding with `localName` left at its pre-loop value.
      // Stryker disable next-line ConditionalExpression,BlockStatement
      if (found === undefined) {
        throw new Error(
          // Stryker disable next-line StringLiteral
          `renderManifest: could not find a unique local import name for "${contract.exportName}" within ${String(maxSuffix)} attempts -- this should never happen and indicates an internal naming bug.`,
        )
      }
      localName = found
    }
    usedNames.add(localName)
    referenceNames.push(localName)

    // Package-resolved contracts (ADR 0014) import by bare package name --
    // the resolved file only exists for static analysis and typically lives
    // inside node_modules, which most consumer build configs don't compile
    // and isn't a valid runtime import path anyway. Everything else keeps
    // the existing relative-path behavior unchanged.
    let specifier: string
    if (contract.packageOrigin) {
      specifier = contract.packageOrigin.packageName
    } else {
      const withoutExt = contract.file.replace(/\.tsx?$/, "")
      specifier = path.relative(outputDir, withoutExt).split(path.sep).join("/")
      if (!specifier.startsWith(".")) specifier = `./${specifier}`
    }

    const binding =
      localName === contract.exportName
        ? contract.exportName
        : `${contract.exportName} as ${localName}`
    importLines.push(`import { ${binding} } from "${specifier}";`)
  }

  const activeContexts = discoverValidationContexts(contracts)
  const activeContextsLines =
    activeContexts.length > 0
      ? [
          "// all currently active validation contexts",
          `export const activeContexts = [${activeContexts.map((c) => JSON.stringify(c)).join(", ")}];`,
          "",
        ]
      : []

  const lines = [
    generatedBanner("ts"),
    "",
    ...importLines,
    "",
    ...activeContextsLines,
    "export const manifest = [",
    ...referenceNames.map((name) => `  ${name},`),
    "];",
    "",
  ]

  return lines.join("\n")
}
