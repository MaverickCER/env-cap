import path from "node:path"
import { generatedBanner } from "./generated-banner.js"
import type { DiscoveredContract } from "./link.js"

/**
 * Every validation context declared by any variable in an *active* contract
 * in `contracts`, sorted and deduplicated. A contract documented
 * `active: false` never contributes, as in the `manifest` array. What {@link renderManifest}
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
 * collision) plus a `contracts` array. The banner marks the file as generated
 * for schema authors. No timestamps, no randomness: same
 * input files always produce byte-identical output.
 *
 * @remarks
 * When at least one discovered variable declares a `context` (ADR 0022),
 * this also emits `activeContexts`: every validation context found across
 * `contracts`, as a plain array. Its name matches {@link runtime.validateEnvOptions}'s
 * own `activeContexts` field, so application code can import it alongside
 * `manifest` and pass it straight through: `validateEnv({ manifest, values, activeContexts })`.
 * It's every context this manifest has, meant as a starting point to narrow
 * per process/deployment, not a pre-scoped default: see the README's
 * "Validation contexts" section. It is omitted, not even an empty array, when
 * no variable declares a `context`. So projects that don't use contexts get
 * unchanged output.
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
      // `usedNames.size` names are taken, so among `size + 1` candidates at least one is free.
      const candidates = Array.from(
        { length: usedNames.size + 1 },
        (_, index) => `${contract.exportName}_${index + 1}`,
      )
      localName = String(candidates.find((candidate) => !usedNames.has(candidate)))
    }
    usedNames.add(localName)
    referenceNames.push(localName)

    // Package-resolved contracts (ADR 0014) import by bare package name. The
    // resolved file serves static analysis only and usually lives inside
    // node_modules. Most consumer builds don't compile that, and it is not a
    // valid runtime import path. Everything else keeps
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
