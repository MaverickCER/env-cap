import path from "node:path"
import { tsBannerLines } from "./generated-banner.js"
import type { DiscoveredContract } from "./link.js"

/**
 * Renders the deterministic manifest source: sorted imports (aliased on name
 * collision) plus a `contracts` array, in the exact banner format schema
 * authors will recognize as generated. No timestamps, no randomness -- same
 * input files always produce byte-identical output.
 */
export function renderManifest(
  contracts: readonly DiscoveredContract[],
  outputFile: string,
): string {
  const sorted = [...contracts].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
  const outputDir = path.dirname(outputFile)
  const usedNames = new Set<string>()

  const importLines: string[] = []
  const referenceNames: string[] = []

  for (const contract of sorted) {
    let localName = contract.exportName
    let suffix = 1
    while (usedNames.has(localName)) {
      localName = `${contract.exportName}_${suffix}`
      suffix += 1
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

  const lines = [
    ...tsBannerLines(),
    "",
    ...importLines,
    "",
    "export const manifest = [",
    ...referenceNames.map((name) => `  ${name},`),
    "];",
    "",
  ]

  return lines.join("\n")
}
