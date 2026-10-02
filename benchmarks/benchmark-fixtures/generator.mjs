// Deterministic fixture generation -- a pure function of tier + contract
// index + variable index, zero Math.random()/timestamps anywhere below.
// `fixtureSeed: "deterministic-index-v1"` names this strategy explicitly;
// `GENERATOR_VERSION` bumps only when generation semantics intentionally
// change, so a `fixtureHash` change is always traceable to an explicit cause.
//
// Two independently-generated targets share the tier *shape* (contract
// count, variables-per-contract) but deliberately diverge on variable
// *content*:
//
// - "buildtime": realistic, varied processors/validators (a JSON-credential
//   shape for every size)
//   as literal TypeScript source text -- AST-parsing cost genuinely depends
//   on source-text volume and variety, and build tooling never executes
//   this (ADR 0002), so realism here costs nothing at measurement time.
// - "runtime": identical counts, but every variable gets a trivial identity
//   processor and no validator -- see ../README.md's "Runtime fixture
//   design" section for why. Written as plain `.mjs`, not `.ts`, so no
//   transpilation step sits between "process starts" and "createEnv runs."

import fs from "node:fs/promises"
import path from "node:path"
export const VARIABLES_PER_CONTRACT = 10

/** Contract sizes for exactly `variables` variables: contracts of ten, plus one smaller remainder contract. */
export function uniformContractSizes(variables) {
  const full = Math.floor(variables / VARIABLES_PER_CONTRACT)
  const sizes = Array(full).fill(VARIABLES_PER_CONTRACT)
  if (variables % VARIABLES_PER_CONTRACT > 0) sizes.push(variables % VARIABLES_PER_CONTRACT)
  return sizes
}

export const FIXTURE_SEED = "deterministic-index-v1"
export const GENERATOR_VERSION = 1

const OWNERS = ["team-alpha", "team-bravo", "team-charlie", "platform-team"]
const CATEGORIES = ["billing", "auth", "infra", "growth"]

function stressStyleKey(globalIndex) {
  return `ENVIRONMENT_CAPABILITIES_TEST_VARIABLE_NUMBER_${globalIndex}`
}

function heavyDescription(index) {
  return [
    `## Purpose\n\nThis credential authorizes entry #${index} to call the external-service API on ` +
      `behalf of this deployment. It is issued per-environment and must never be shared across ` +
      `staging and production.`,
    `## Setup\n\n1. Open the vendor dashboard.\n2. Generate a new client credential pair.\n3. Store ` +
      `both the client id and client secret in this deployment's secrets manager.\n4. Redeploy so the ` +
      `new value is picked up at next cold start.`,
    `## Troubleshooting\n\nIf requests using this credential start failing with 401s, check: (a) ` +
      `whether the credential was rotated out from under this deployment, (b) whether the vendor's ` +
      `IP allowlist still includes this environment's egress range, (c) whether the credential's ` +
      `scopes still include everything this integration calls.`,
    `## Migration notes\n\nEntry #${index} was migrated from a shared team-wide credential to a ` +
      `per-entry one as part of the blast-radius reduction effort; do not reintroduce sharing.`,
  ].join("\n\n")
}

function heavyExtraFields(index) {
  return {
    compliance: "SOC2-relevant -- included in the quarterly access review.",
    rotationCadence: "90 days, tracked in the rotation calendar.",
    storageProvider: "Vault (kv-v2), path scoped per-environment.",
    incidentRunbook: `See runbooks/external-service-outage.md, section for entry #${index}.`,
    lastReviewedBy: OWNERS[index % OWNERS.length],
  }
}

function renderStressStyleVariable(globalIndex, docsStyle) {
  const key = stressStyleKey(globalIndex)
  const clientId = `client-${globalIndex}`
  const clientSecret = `secret-${globalIndex}`
  const schemaSource =
    `{\n` +
    `    processor: processors.parseJSON(),\n` +
    `    validator: (value) => {\n` +
    `      const v = value;\n` +
    `      if (!v || typeof v !== "object") return "Expected an object.";\n` +
    `      if (v.clientId !== ${JSON.stringify(clientId)}) return "Unexpected clientId.";\n` +
    `      if (v.clientSecret !== ${JSON.stringify(clientSecret)}) return "Unexpected clientSecret.";\n` +
    `      return true;\n` +
    `    },\n` +
    `  }`

  const description =
    docsStyle === "heavy"
      ? heavyDescription(globalIndex)
      : `Credential for external service integration #${globalIndex}.`
  const docsFields = { description, owner: OWNERS[globalIndex % OWNERS.length] }
  if (docsStyle === "heavy") Object.assign(docsFields, heavyExtraFields(globalIndex))

  return { key, schemaSource, docsFields }
}

function renderDocsFieldsSource(docsFields) {
  const entries = Object.entries(docsFields).map(([k, v]) => `        ${k}: ${JSON.stringify(v)},`)
  return entries.join("\n")
}

function renderBuildtimeContract(contractName, variables) {
  const schemaLines = variables.map((v) => `  ${v.key}: ${v.schemaSource},`).join("\n")
  const docsLines = variables
    .map((v) => `      ${v.key}: {\n${renderDocsFieldsSource(v.docsFields)}\n      },`)
    .join("\n")

  return (
    `import { createEnv, documentEnv } from "env-cap";\n` +
    `import { processors, validators } from "env-cap/helpers";\n\n` +
    `const schema = {\n${schemaLines}\n};\n\n` +
    `export const contract = createEnv(schema, { name: ${JSON.stringify(contractName)}, source: import.meta.url });\n\n` +
    `documentEnv(schema, {\n` +
    `  owner: ${JSON.stringify(OWNERS[0])},\n` +
    `  category: ${JSON.stringify(CATEGORIES[0])},\n` +
    `  variables: {\n${docsLines}\n  },\n` +
    `});\n`
  )
}

/**
 * Writes `<outputDir>/contract-<n>/env.schema.ts` for every contract in
 * a project of `variables` variables. `docsStyle` ("minimal" | "heavy") controls documentation
 * payload size only -- see `documentation-payload`'s benchmark.
 */
export async function generateBuildtimeFixtures({ outputDir, docsStyle = "minimal", variables }) {
  const sizes = uniformContractSizes(variables)
  let globalIndex = 0

  await fs.rm(outputDir, { recursive: true, force: true })

  for (let contractIndex = 0; contractIndex < sizes.length; contractIndex++) {
    const varCount = sizes[contractIndex]
    const contractName = `contract-${String(contractIndex).padStart(4, "0")}`
    const variables = []
    for (let localIndex = 0; localIndex < varCount; localIndex++) {
      variables.push(renderStressStyleVariable(globalIndex, docsStyle))
      globalIndex += 1
    }

    const contractDir = path.join(outputDir, contractName)
    await fs.mkdir(contractDir, { recursive: true })
    await fs.writeFile(
      path.join(contractDir, "env.schema.ts"),
      renderBuildtimeContract(contractName, variables),
      "utf8",
    )
  }

  return { contracts: sizes.length, variables: sizes.reduce((a, b) => a + b, 0) }
}

function renderRuntimeContract(contractName, varCount, globalIndexStart) {
  const lines = []
  for (let i = 0; i < varCount; i++) {
    const key = stressStyleKey(globalIndexStart + i)
    lines.push(`  ${key}: { processor: (value) => value },`)
  }
  return (
    `import { createEnv } from "env-cap";\n\n` +
    `const schema = {\n${lines.join("\n")}\n};\n\n` +
    `export const contract = createEnv(schema, { name: ${JSON.stringify(contractName)}, source: import.meta.url });\n`
  )
}

/**
 * Writes `<outputDir>/contract-<n>/env.contract.mjs` (plain JS, identity
 * processors, no validators, no documentEnv -- see "Runtime fixture design")
 * plus a barrel `index.mjs` re-exporting every contract, so a single
 * `import()` of the barrel triggers every contract module's evaluation --
 * mirroring a real app importing its whole generated manifest at once.
 */
export async function generateRuntimeFixtures({ outputDir, variables }) {
  const sizes = uniformContractSizes(variables)
  let globalIndex = 0

  await fs.rm(outputDir, { recursive: true, force: true })

  const barrelLines = []
  for (let contractIndex = 0; contractIndex < sizes.length; contractIndex++) {
    const varCount = sizes[contractIndex]
    const contractName = `contract-${String(contractIndex).padStart(4, "0")}`
    const contractDir = path.join(outputDir, contractName)
    await fs.mkdir(contractDir, { recursive: true })
    await fs.writeFile(
      path.join(contractDir, "env.contract.mjs"),
      renderRuntimeContract(contractName, varCount, globalIndex),
      "utf8",
    )
    barrelLines.push(
      `export { contract as ${contractName.replace(/-/g, "_")} } from "./${contractName}/env.contract.mjs";`,
    )
    globalIndex += varCount
  }

  await fs.writeFile(path.join(outputDir, "index.mjs"), barrelLines.join("\n") + "\n", "utf8")

  return {
    contracts: sizes.length,
    variables: sizes.reduce((a, b) => a + b, 0),
    indexPath: path.join(outputDir, "index.mjs"),
  }
}
