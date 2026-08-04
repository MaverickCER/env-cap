#!/usr/bin/env node
// Generates schemas/env-cap-report.schema.json directly from src/cli/json.ts's
// exported JsonReportPayload envelope type -- never hand-authored, so the
// schema and the type it describes cannot silently drift apart. Regenerated
// as part of `npm run verify`; test/build/json-schema.test.ts fails the build
// if the committed file is stale relative to a fresh generation. See ADR 0019.

import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createGenerator } from "ts-json-schema-generator"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

// TSDoc `{@link Target}`/`{@link Target|label}` tags are meant for TypeDoc to resolve into
// hyperlinks (see typedoc.json) -- ts-json-schema-generator has no such resolution and would
// otherwise emit the raw `{@link ...}` tag text verbatim into this schema's "description"
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

export function generateReportSchema() {
  const config = {
    path: path.join(root, "src/cli/json.ts"),
    tsconfig: path.join(root, "tsconfig.json"),
    type: "JsonReportPayload",
    expose: "export",
    jsDoc: "extended",
    skipTypeCheck: false,
  }

  const schema = stripLinkTagsDeep(createGenerator(config).createSchema(config.type))
  return {
    $schema: schema.$schema,
    $id: "https://maverickcer.github.io/env-cap/schema/env-cap-report.schema.json",
    title: "env-cap --json report",
    description:
      "Machine-readable envelope emitted by `env-cap --json` (see README's --json section and ADR 0013). " +
      "Generated from src/cli/json.ts's JsonReportPayload type -- never hand-authored.",
    ...schema,
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const schema = generateReportSchema()
  const outPath = path.join(root, "schemas/env-cap-report.schema.json")
  mkdirSync(path.dirname(outPath), { recursive: true })
  writeFileSync(outPath, `${JSON.stringify(schema, null, 2)}\n`, "utf8")
  console.log(`[schema] wrote ${path.relative(root, outPath)}`)
}
