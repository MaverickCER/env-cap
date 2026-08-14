#!/usr/bin/env node
// Generates schemas/*.schema.json directly from their source types -- never
// hand-authored, so a schema and the type it describes cannot silently drift
// apart. Regenerated as part of `npm run verify`; each schema's own test
// (e.g. test/build/json-schema.test.ts, test/build/contract-model-json-schema.test.ts)
// fails the build if its committed file is stale relative to a fresh
// generation. See ADR 0019 (the original --json envelope schema) and ADR
// 0024/0025 (one target per canonical fact model, added incrementally as
// each model ships).

import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createGenerator } from "ts-json-schema-generator"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

// TSDoc `{@link Target}`/`{@link Target|label}` tags are meant for TypeDoc to resolve into
// hyperlinks (see typedoc.json) -- ts-json-schema-generator has no such resolution and would
// otherwise emit the raw `{@link ...}` tag text verbatim into a schema's "description"
// fields, which are read by external tools/humans with no TSDoc awareness.
function stripLinkTags(value) {
  return value
    .replace(/\{@link\s+([^\s}|]+)(?:\s*\|\s*([^}]+))?\s*\}/g, (_match, target, label) =>
      (label ?? target).trim(),
    )
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([).,;:])/g, "$1")
}

function stripLinkTagsDeep(value) {
  if (typeof value === "string") return stripLinkTags(value)
  if (Array.isArray(value)) return value.map(stripLinkTagsDeep)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, stripLinkTagsDeep(entry)]),
    )
  }
  return value
}

// One entry per published schema. Adding a new fact model's schema means
// adding one entry here -- everything else (generation, writing, freshness
// checking) is shared.
const TARGETS = [
  {
    name: "env-cap-report",
    sourceFile: "src/cli/json.ts",
    type: "JsonReportPayload",
    outputFile: "schemas/env-cap-report.schema.json",
    id: "https://maverickcer.github.io/env-cap/schema/env-cap-report.schema.json",
    title: "env-cap --json report",
    description:
      "Machine-readable envelope emitted by `env-cap --json` (see README's --json section and ADR 0013). " +
      "Generated from src/cli/json.ts's JsonReportPayload type -- never hand-authored.",
  },
  {
    name: "contract-model",
    sourceFile: "src/build/contract-model.ts",
    type: "ContractModel",
    outputFile: "schemas/contract-model.schema.json",
    id: "https://maverickcer.github.io/env-cap/schema/contract-model.schema.json",
    title: "env-cap Contract Model",
    description:
      "Canonical, versioned projection of every declared environment-variable contract, active or not " +
      "(see ADR 0024, ADR 0025). Generated from src/build/contract-model.ts's ContractModel type -- never hand-authored.",
  },
]

export function generateSchema(target) {
  const config = {
    path: path.join(root, target.sourceFile),
    tsconfig: path.join(root, "tsconfig.json"),
    type: target.type,
    expose: "export",
    jsDoc: "extended",
    skipTypeCheck: false,
  }

  const schema = stripLinkTagsDeep(createGenerator(config).createSchema(config.type))
  return {
    $schema: schema.$schema,
    $id: target.id,
    title: target.title,
    description: target.description,
    ...schema,
  }
}

function targetNamed(name) {
  const target = TARGETS.find((t) => t.name === name)
  if (!target) throw new Error(`No schema target named "${name}"`)
  return target
}

export function generateReportSchema() {
  return generateSchema(targetNamed("env-cap-report"))
}

export function generateContractModelSchema() {
  return generateSchema(targetNamed("contract-model"))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const target of TARGETS) {
    const schema = generateSchema(target)
    const outPath = path.join(root, target.outputFile)
    mkdirSync(path.dirname(outPath), { recursive: true })
    writeFileSync(outPath, `${JSON.stringify(schema, null, 2)}\n`, "utf8")
    console.log(`[schema] wrote ${path.relative(root, outPath)}`)
  }
}
